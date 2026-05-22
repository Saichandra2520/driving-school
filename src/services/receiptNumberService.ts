import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { firebaseUsageService } from '@/services/firebaseUsageService';
import { collections } from '@/services/firestoreUtils';

function formatReceiptNumber(nextNo: number): string {
  return `RCP-${String(nextNo).padStart(3, '0')}`;
}

export const receiptNumberService = {
  async getNextReceiptNumber(): Promise<string> {
    try {
      return await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, collections.counters, 'receipts');
        const counterSnapshot = await transaction.get(counterRef);
        firebaseUsageService.trackUsage('reads');
        const nextNo = counterSnapshot.exists()
          ? Number(counterSnapshot.data().lastReceiptNo ?? 0) + 1
          : 1;

        transaction.set(counterRef, { lastReceiptNo: nextNo }, { merge: true });
        firebaseUsageService.trackUsage('writes');

        return formatReceiptNumber(nextNo);
      });
    } catch {
      throw new Error('Unable to generate receipt number.');
    }
  }
};
