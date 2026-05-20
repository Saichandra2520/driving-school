import { addDoc, collection, doc, increment, orderBy, query, runTransaction, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { collections, createdAt, getCollection } from '@/services/firestoreUtils';
import type { Fee, Payment } from '@/types';

export const paymentService = {
  async recordPayment(
    studentId: string,
    branchId: string,
    amount: number,
    paymentDate: string,
    notes?: string
  ): Promise<string> {
    if (amount <= 0) throw new Error('Payment amount must be greater than 0.');

    const fees = await getCollection<Fee>(collections.fees, [where('studentId', '==', studentId)]);
    const fee = fees[0];

    if (!fee) throw new Error('Fee record was not found for this student.');

    const balance = Number(fee.totalAmount) - Number(fee.paidAmount);
    if (amount > balance) throw new Error('Payment amount cannot exceed the remaining balance.');

    const paymentRef = await addDoc(collection(db, collections.payments), {
      studentId,
      branchId,
      amount,
      paymentDate,
      notes: notes?.trim() || null,
      createdAt: createdAt()
    });

    await runTransaction(db, async (transaction) => {
      transaction.update(doc(db, collections.fees, fee.id), {
        paidAmount: increment(amount)
      });
    });

    return paymentRef.id;
  },

  async getPaymentsByStudent(studentId: string): Promise<Payment[]> {
    return getCollection<Payment>(collections.payments, [
      where('studentId', '==', studentId),
      orderBy('paymentDate', 'desc'),
      orderBy('createdAt', 'desc')
    ]);
  }
};
