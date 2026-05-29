import { doc, runTransaction, where, type Transaction } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import { db } from '@/services/firebase';
import { firebaseUsageService } from '@/services/firebaseUsageService';
import { pendingPaymentService } from '@/services/pendingPaymentService';
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

function isCourseExtensionInstallment(installment: Installment): boolean {
  return (
    installment.source === 'course_extension' ||
    Boolean(installment.courseExtensionId) ||
    (installment.notes ?? '').trim().toLowerCase().startsWith('course extension -')
  );
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
  return getFeeByStudentIdRaw(studentId).then((fee) => fee.id);
}

async function getFeeByStudentIdRaw(studentId: string): Promise<Fee> {
  const fees = await getCollection<Fee>(collections.fees, [where('studentId', '==', studentId)]);
  const fee = fees[0];
  if (!fee) throw new Error('Unable to load fee details.');
  return recalculateFee({ ...fee, branchId: fee.branchId ?? '' });
}

async function getFeeInTransaction(transaction: Transaction, feeId: string): Promise<Fee> {
  const feeRef = doc(db, collections.fees, feeId);
  const feeSnapshot = await transaction.get(feeRef);
  firebaseUsageService.trackUsage('reads');
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

async function saveInstallmentOnline(
  studentId: string,
  payload: AddInstallmentPayload,
  options: { branchId?: string; clientPaymentId?: string; createdAt?: string } = {}
): Promise<Fee> {
  const feeId = await getFeeReferenceByStudentId(studentId);

  return runTransaction(db, async (transaction) => {
    const fee = await getFeeInTransaction(transaction, feeId);
    const currentFee = recalculateFee(fee);
    const existing = options.clientPaymentId
      ? currentFee.installments.find((installment) => installment.clientPaymentId === options.clientPaymentId)
      : null;

    if (existing) return currentFee;

    if (payload.amount > currentFee.balance) {
      throw new Error('Amount cannot exceed balance.');
    }

    const receiptNo = await receiptNumberService.getNextReceiptNumberInTransaction(transaction);
    const installment: Installment = {
      receiptNo,
      amount: payload.amount,
      date: payload.date,
      notes: payload.notes?.trim() || '',
      createdAt: options.createdAt ?? new Date().toISOString()
    };
    if (options.clientPaymentId) {
      installment.clientPaymentId = options.clientPaymentId;
    }

    const nextInstallments = [...currentFee.installments, installment];
    const paidAmount = nextInstallments.reduce((total, item) => total + Number(item.amount), 0);
    const balance = Number(currentFee.totalAmount) - paidAmount;
    const branchId = currentFee.branchId || options.branchId || '';

    transaction.update(doc(db, collections.fees, fee.id), {
      branchId,
      installments: nextInstallments,
      paidAmount,
      balance
    });
    firebaseUsageService.trackUsage('writes');

    return {
      ...currentFee,
      branchId,
      installments: nextInstallments,
      paidAmount,
      balance
    };
  }).catch((error) => {
    if (error instanceof Error) throw error;
    throw new Error('Unable to add installment.');
  });
}

export const feeService = {
  async getFeeByStudentId(studentId: string): Promise<Fee | null> {
    await assertCanManageStudent(studentId);
    const fees = await getCollection<Fee>(collections.fees, [where('studentId', '==', studentId)]);
    return fees[0] ? pendingPaymentService.applyPendingPaymentsToFee(recalculateFee(fees[0]), studentId) : null;
  },

  async addInstallment(studentId: string, payload: AddInstallmentPayload): Promise<Fee> {
    assertValidAmount(payload.amount);
    if (!payload.date) throw new Error('Payment date is required.');

    const student = await assertCanManageStudent(studentId);

    if (!useSyncStore.getState().isOnline) {
      const baseFee = await getFeeByStudentIdRaw(studentId);
      const currentFee = pendingPaymentService.applyPendingPaymentsToFee(baseFee, studentId) ?? baseFee;
      if (payload.amount > currentFee.balance) {
        throw new Error('Amount cannot exceed balance.');
      }

      pendingPaymentService.add({
        studentId,
        branchId: student.branchId,
        amount: payload.amount,
        date: payload.date,
        notes: payload.notes
      });

      return pendingPaymentService.applyPendingPaymentsToFee(baseFee, studentId) ?? baseFee;
    }

    const pendingForStudent = pendingPaymentService.getByStudent(studentId);
    if (pendingForStudent.length > 0) {
      const result = await feeService.syncPendingPayments({ studentId });
      if (result.failed > 0) {
        throw new Error('Pending offline payments must sync before recording another payment for this student.');
      }
    }

    return saveInstallmentOnline(studentId, payload, { branchId: student.branchId });
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
      if (isCourseExtensionInstallment(existing)) {
        throw new Error('Course extension receipts cannot be edited from fee installments.');
      }

      const nextInstallments = currentFee.installments.map((installment) =>
        installment.receiptNo === receiptNo
          ? {
              ...installment,
              amount: payload.amount,
              date: payload.date,
              notes: payload.notes?.trim() || '',
              updatedAt: new Date().toISOString()
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
      firebaseUsageService.trackUsage('writes');

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
      const existing = currentFee.installments.find((installment) => installment.receiptNo === receiptNo);
      if (!existing) throw new Error('Installment not found.');
      if (isCourseExtensionInstallment(existing)) {
        throw new Error('Course extension receipts cannot be deleted from fee installments.');
      }
      const nextInstallments = currentFee.installments.filter((installment) => installment.receiptNo !== receiptNo);
      const paidAmount = nextInstallments.reduce((total, item) => total + Number(item.amount), 0);
      const balance = Number(currentFee.totalAmount) - paidAmount;

      transaction.update(doc(db, collections.fees, fee.id), {
        installments: nextInstallments,
        paidAmount,
        balance
      });
      firebaseUsageService.trackUsage('writes');

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

  async syncPendingPayments(filters: { studentId?: string; branchId?: string | null } = {}): Promise<{ synced: number; failed: number }> {
    if (!useSyncStore.getState().isOnline) return { synced: 0, failed: 0 };

    const payments = pendingPaymentService.getAll().filter((payment) => {
      if (filters.studentId && payment.studentId !== filters.studentId) return false;
      if (filters.branchId && payment.branchId !== filters.branchId) return false;
      return true;
    });
    let synced = 0;
    let failed = 0;

    for (const payment of payments) {
      pendingPaymentService.markSyncing(payment.id);

      try {
        const student = await assertCanManageStudent(payment.studentId);
        await saveInstallmentOnline(
          payment.studentId,
          {
            amount: payment.amount,
            date: payment.date,
            notes: payment.notes
          },
          {
            branchId: student.branchId,
            clientPaymentId: payment.id,
            createdAt: payment.createdAt
          }
        );
        pendingPaymentService.remove(payment.id);
        synced += 1;
      } catch (error) {
        pendingPaymentService.markFailed(
          payment.id,
          error instanceof Error ? error.message : 'Unable to sync pending payment.'
        );
        failed += 1;
      }
    }

    return { synced, failed };
  },

  recalculateFee
};
