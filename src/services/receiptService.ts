import { where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import type { Branch, Fee, Installment, ReceiptData, Student } from '@/types';

function recalculateFee(fee: Fee): Fee {
  const installments = Array.isArray(fee.installments) ? fee.installments : [];
  const paidAmount = installments.reduce((total, installment) => total + Number(installment.amount ?? 0), 0);
  const totalAmount = Number(fee.totalAmount ?? 0);

  return {
    ...fee,
    installments,
    totalAmount,
    paidAmount,
    balance: totalAmount - paidAmount
  };
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function assertCanAccessStudent(student: Student): Promise<void> {
  const { profile } = await authService.getCurrentUser();

  if (profile?.role === 'staff' && profile.branchId !== student.branchId) {
    throw new Error('You do not have permission to access this receipt.');
  }
}

export const receiptService = {
  getInstallmentByReceiptNo(fee: Fee, receiptNo: string): Installment | null {
    return fee.installments.find((installment) => installment.receiptNo === receiptNo) ?? null;
  },

  async getReceiptData(studentId: string, receiptNo: string): Promise<ReceiptData> {
    const [student, fees] = await Promise.all([
      getDocument<Student>(collections.students, studentId),
      getCollection<Fee>(collections.fees, [where('studentId', '==', studentId)])
    ]);

    if (!student) throw new Error('Receipt data not found.');
    await assertCanAccessStudent(student);

    const fee = fees[0] ? recalculateFee(fees[0]) : null;
    if (!fee) throw new Error('Receipt data not found.');

    const installment = receiptService.getInstallmentByReceiptNo(fee, receiptNo);
    if (!installment) throw new Error('Receipt data not found.');

    const branch = await getDocument<Branch>(collections.branches, student.branchId);
    if (!branch) throw new Error('Receipt data not found.');

    return {
      receiptNo: installment.receiptNo,
      paymentDate: installment.date,
      amount: Number(installment.amount ?? 0),
      notes: installment.notes,
      student: {
        id: student.id,
        fullName: student.fullName,
        phone: student.phone,
        courseType: student.courseType,
        learningLicenceNo: student.learningLicenceNo,
        llIssueDate: student.llIssueDate,
        llExpiryDate: student.llExpiryDate,
        drivingLicenceNo: student.drivingLicenceNo,
        enrollmentDate: student.enrollmentDate,
        courseStartDate: student.courseStartDate ?? student.enrollmentDate
      },
      branch: {
        id: branch.id,
        name: branch.name,
        location: branch.location ?? undefined
      },
      fee: {
        totalAmount: fee.totalAmount,
        paidAmount: fee.paidAmount,
        balance: fee.balance
      },
      generatedAt: new Date().toISOString()
    };
  },

  generateReceiptFileName(receiptData: ReceiptData): string {
    return `receipt-${safeFilePart(receiptData.receiptNo)}-${safeFilePart(receiptData.student.fullName)}.pdf`;
  }
};
