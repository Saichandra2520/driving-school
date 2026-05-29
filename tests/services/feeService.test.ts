import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feeService } from '@/services/feeService';
import { useSyncStore } from '@/store/syncStore';

const {
  docMock,
  getCollectionMock,
  getDocumentMock,
  getNextReceiptNumberInTransactionMock,
  transactionGetMock,
  transactionUpdateMock,
  runTransactionMock,
  whereMock
} = vi.hoisted(() => ({
  docMock: vi.fn((...path: unknown[]) => ({ path })),
  getCollectionMock: vi.fn(),
  getDocumentMock: vi.fn(),
  getNextReceiptNumberInTransactionMock: vi.fn(),
  transactionGetMock: vi.fn(),
  transactionUpdateMock: vi.fn(),
  runTransactionMock: vi.fn(),
  whereMock: vi.fn((field: string, operator: string, value: unknown) => ({ field, operator, value }))
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  where: (...args: unknown[]) => whereMock(...args)
}));

vi.mock('@/services/firebase', () => ({
  db: {}
}));

vi.mock('@/services/firebaseUsageService', () => ({
  firebaseUsageService: {
    trackUsage: vi.fn()
  }
}));

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn().mockResolvedValue({
      user: { uid: 'owner-1' },
      profile: { id: 'owner-1', role: 'owner', branchId: null, fullName: 'Owner' }
    })
  }
}));

vi.mock('@/services/firestoreUtils', () => ({
  collections: {
    branches: 'branches',
    users: 'users',
    students: 'students',
    fees: 'fees',
    expenses: 'expenses',
    courseExtensions: 'courseExtensions',
    sessions: 'sessions',
    drivingTests: 'drivingTests',
    classTypes: 'classTypes',
    counters: 'counters'
  },
  getCollection: (...args: unknown[]) => getCollectionMock(...args),
  getDocument: (...args: unknown[]) => getDocumentMock(...args)
}));

vi.mock('@/services/receiptNumberService', () => ({
  receiptNumberService: {
    getNextReceiptNumberInTransaction: (...args: unknown[]) => getNextReceiptNumberInTransactionMock(...args)
  }
}));

const feeDocumentData = {
  studentId: 'student-1',
  branchId: 'branch-1',
  totalAmount: 1000,
  installments: [],
  paidAmount: 0,
  balance: 1000
};

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    return value.some((item) => hasUndefined(item));
  }

  return Object.values(value).some((item) => hasUndefined(item));
}

describe('feeService', () => {
  beforeEach(() => {
    useSyncStore.getState().setOnlineStatus(true);
    window.localStorage.clear();

    getCollectionMock.mockResolvedValue([{ id: 'fee-1', ...feeDocumentData }]);
    getDocumentMock.mockResolvedValue({ id: 'student-1', branchId: 'branch-1' });
    getNextReceiptNumberInTransactionMock.mockResolvedValue('RCP-001');
    transactionGetMock.mockResolvedValue({
      id: 'fee-1',
      exists: () => true,
      data: () => feeDocumentData
    });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        get: transactionGetMock,
        update: transactionUpdateMock
      })
    );
  });

  it('omits undefined optional installment fields from the Firestore update payload', async () => {
    await feeService.addInstallment('student-1', {
      amount: 250,
      date: '2026-05-23'
    });

    expect(transactionUpdateMock).toHaveBeenCalledTimes(1);
    const updatePayload = transactionUpdateMock.mock.calls[0][1] as {
      installments: Array<Record<string, unknown>>;
    };

    expect(updatePayload.installments[0]).not.toHaveProperty('clientPaymentId');
    expect(hasUndefined(updatePayload)).toBe(false);
  });

  it('repairs missing fee branchId from the student branch when adding an installment', async () => {
    transactionGetMock.mockResolvedValue({
      id: 'fee-1',
      exists: () => true,
      data: () => ({ ...feeDocumentData, branchId: '' })
    });

    await feeService.addInstallment('student-1', {
      amount: 250,
      date: '2026-05-23'
    });

    expect(transactionUpdateMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      branchId: 'branch-1'
    }));
  });
});
