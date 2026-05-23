import { beforeEach, describe, expect, it, vi } from 'vitest';
import { receiptNumberService } from '@/services/receiptNumberService';

const { docMock } = vi.hoisted(() => ({
  docMock: vi.fn(() => ({ id: 'receipts' }))
}));

vi.mock('@/services/firebase', () => ({
  db: {}
}));

vi.mock('@/services/firebaseUsageService', () => ({
  firebaseUsageService: {
    trackUsage: vi.fn()
  }
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  runTransaction: vi.fn()
}));

describe('receiptNumberService', () => {
  beforeEach(() => {
    docMock.mockClear();
  });

  it('increments receipt numbers inside the supplied transaction', async () => {
    const transaction = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ lastReceiptNo: 41 })
      }),
      set: vi.fn()
    };

    await expect(receiptNumberService.getNextReceiptNumberInTransaction(transaction as never)).resolves.toBe('RCP-042');
    expect(transaction.get).toHaveBeenCalledWith({ id: 'receipts' });
    expect(transaction.set).toHaveBeenCalledWith({ id: 'receipts' }, { lastReceiptNo: 42 }, { merge: true });
  });
});
