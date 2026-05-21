import { doc, runTransaction, where, type Transaction } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import { db } from '@/services/firebase';
import { receiptNumberService } from '@/services/receiptNumberService';
import { useSyncStore } from '@/store/syncStore';
import type {
  AddInstallmentPayload,
  Fee,
  Installment,
  Student,
  UpdateInstallmentPayload
} from '@/types';

function normalizedInstallments(fee: Fee): Installment[] {
  return Array.isArray(fee.installments) ? fee.installments : [];
}

function assertValidAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0.');
  }
}

function assertOnlineForReceipt(): void {
  if (!useSyncStore.getState().isOnline) {
    throw new Error('Internet is required to record payments and generate receipt numbers.');
  }
}

async function assertCanManageStudent(studentId: string): Promise<Student> {
  const [{ profile }, student] = await Promise.all([
    authService.getCurrentUser(),
    getDocument<Student>(collections.students, studentId)
  ]);

  if (!student) throw new Error('Student not found.');
  if (profile?.role === 'staff' && profile.branchId !== student.branchId) {
    throw new Error('You do not have access to this student.');
  }

  return student;
}

async function getFeeReferenceByStudentId(studentId: string): Promise<string> {
  const fees = await getCollection<Fee>(collections.fees, [where('studentId', '==', studentId)]);
  const fee = fees[0];
  if (!fee) throw new Error('Unable to load fee details.');
  return fee.id;
}

async function getFeeInTransaction(transaction: Transaction, feeId: string): Promise<Fee> {
  const feeRef = doc(db, collections.fees, feeId);
  const feeSnapshot = await transaction.get(feeRef);
  if (!feeSnapshot.exists()) throw new Error('Unable to load fee details.');
  const data = feeSnapshot.data() as Omit<Fee, 'id'>;
  return {
    id: feeSnapshot.id,
    ...data,
    branchId: data.branchId ?? '',
    installments: Array.isArray(data.installments) ? data.installments : [],
    paidAmount: Number(data.paidAmount ?? 0),
    balance: Number(data.balance ?? Number(data.totalAmount ?? 0) - Number(data.paidAmount ?? 0))
  } as Fee;
}

export function recalculateFee(fee: Fee): Fee {
  const installments = normalizedInstallments(fee);
  const paidAmount = installments.reduce((total, installment) => total + Number(installment.amount), 0);
  return {
    ...fee,
    installments,
    paidAmount,
    balance: Number(fee.totalAmount) - paidAmount
  };
}

export const feeService = {
  async getFeeByStudentId(studentId: string): Promise<Fee | null> {
    await assertCanManageStudent(studentId);
    const fees = await getCollection<Fee>(collections.fees, [where('studentId', '==', studentId)]);
    return fees[0] ? recalculateFee(fees[0]) : null;
  },

  async addInstallment(studentId: string, payload: AddInstallmentPayload): Promise<Fee> {
    assertOnlineForReceipt();
    assertValidAmount(payload.amount);
    if (!payload.date) throw new Error('Payment date is required.');

    await assertCanManageStudent(studentId);

    const receiptNo = await receiptNumberService.getNextReceiptNumber();
    const feeId = await getFeeReferenceByStudentId(studentId);

    return runTransaction(db, async (transaction) => {
      const fee = await getFeeInTransaction(transaction, feeId);

      const currentFee = recalculateFee(fee);
      if (payload.amount > currentFee.balance) {
        throw new Error('Amount cannot exceed balance.');
      }

      const installment: Installment = {
        receiptNo,
        amount: payload.amount,
        date: payload.date,
        notes: payload.notes?.trim() || '',
        createdAt: new Date().toISOString()
      };
      const nextInstallments = [...currentFee.installments, installment];
      const paidAmount = nextInstallments.reduce((total, item) => total + Number(item.amount), 0);
      const balance = Number(currentFee.totalAmount) - paidAmount;

      transaction.update(doc(db, collections.fees, fee.id), {
        installments: nextInstallments,
        paidAmount,
        balance
      });

      return {
        ...currentFee,
        installments: nextInstallments,
        paidAmount,
        balance
      };
    }).catch((error) => {
      if (error instanceof Error) throw error;
      throw new Error('Unable to add installment.');
    });
  },

  async updateInstallment(
    studentId: string,
    receiptNo: string,
    payload: UpdateInstallmentPayload
  ): Promise<Fee> {
    assertOnlineForReceipt();
    assertValidAmount(payload.amount);
    if (!payload.date) throw new Error('Payment date is required.');

    await assertCanManageStudent(studentId);
    const feeId = await getFeeReferenceByStudentId(studentId);

    return runTransaction(db, async (transaction) => {
      const fee = await getFeeInTransaction(transaction, feeId);

      const currentFee = recalculateFee(fee);
      const existing = currentFee.installments.find((installment) => installment.receiptNo === receiptNo);
      if (!existing) throw new Error('Installment not found.');

      const nextInstallments = currentFee.installments.map((installment) =>
        installment.receiptNo === receiptNo
          ? {
              ...installment,
              amount: payload.amount,
              date: payload.date,
              notes: payload.notes?.trim() || ''
            }
          : installment
      );
      const paidAmount = nextInstallments.reduce((total, item) => total + Number(item.amount), 0);
      if (paidAmount > Number(currentFee.totalAmount)) {
        throw new Error('Amount cannot exceed balance.');
      }

      const balance = Number(currentFee.totalAmount) - paidAmount;
      transaction.update(doc(db, collections.fees, fee.id), {
        installments: nextInstallments,
        paidAmount,
        balance
      });

      return {
        ...currentFee,
        installments: nextInstallments,
        paidAmount,
        balance
      };
    }).catch((error) => {
      if (error instanceof Error) throw error;
      throw new Error('Unable to update installment.');
    });
  },

  async deleteInstallment(studentId: string, receiptNo: string): Promise<Fee> {
    assertOnlineForReceipt();
    await assertCanManageStudent(studentId);
    const feeId = await getFeeReferenceByStudentId(studentId);

    return runTransaction(db, async (transaction) => {
      const fee = await getFeeInTransaction(transaction, feeId);

      const currentFee = recalculateFee(fee);
      const nextInstallments = currentFee.installments.filter((installment) => installment.receiptNo !== receiptNo);
      const paidAmount = nextInstallments.reduce((total, item) => total + Number(item.amount), 0);
      const balance = Number(currentFee.totalAmount) - paidAmount;

      transaction.update(doc(db, collections.fees, fee.id), {
        installments: nextInstallments,
        paidAmount,
        balance
      });

      return {
        ...currentFee,
        installments: nextInstallments,
        paidAmount,
        balance
      };
    }).catch((error) => {
      if (error instanceof Error) throw error;
      throw new Error('Unable to delete installment.');
    });
  },

  recalculateFee
};
