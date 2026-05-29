import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionService } from '@/services/sessionService';
import { getCollection, getDocument } from '@/services/firestoreUtils';

const {
  getDocsMock,
  runTransactionMock,
  transactionGetMock,
  transactionUpdateMock,
  updateDocMock,
  whereMock
} = vi.hoisted(() => ({
  getDocsMock: vi.fn(),
  runTransactionMock: vi.fn(),
  transactionGetMock: vi.fn(),
  transactionUpdateMock: vi.fn(),
  updateDocMock: vi.fn(),
  whereMock: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))
}));

const student = {
  id: 'student-1',
  branchId: 'branch-1',
  fullName: 'Amit Kumar',
  phone: '9876543210',
  courseType: '4W',
  enrollmentDate: '2026-05-01',
  courseStartDate: '2026-05-01',
  learningLicenceNo: '',
  drivingLicenceNo: '',
  status: 'ongoing'
};

const session = {
  id: 'session-1',
  studentId: 'student-1',
  branchId: 'branch-1',
  courseType: '4W',
  slots: [
    { slotNo: 1, date: null, classType: '', vehicle: '', instructor: '', notes: '' }
  ]
};

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn().mockResolvedValue({
      user: null,
      profile: { id: 'staff-1', fullName: 'Staff', role: 'staff', branchId: 'branch-1' }
    })
  }
}));

vi.mock('@/services/courseExtensionService', () => ({
  calculateTrainingEntitlement: vi.fn(() => ({ allowedSessions: 30, allowedDays: 60 })),
  courseExtensionService: {
    getEntitlementForStudent: vi.fn(async () => ({ allowedSessions: 30, allowedDays: 60 }))
  }
}));

vi.mock('@/services/firebase', () => ({
  db: {}
}));

vi.mock('@/services/firebaseUsageService', () => ({
  firebaseUsageService: {
    trackUsage: vi.fn()
  }
}));

vi.mock('@/services/firestoreUtils', () => ({
  collections: {
    students: 'students',
    sessions: 'sessions',
    courseExtensions: 'courseExtensions',
    classTypes: 'classTypes'
  },
  getCollection: vi.fn(),
  getDocument: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: (_db: unknown, collectionName: string) => ({ collectionName }),
  doc: (_db: unknown, collectionName: string, id?: string) => ({ collectionName, id }),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (collectionRef: { collectionName: string }, ...constraints: unknown[]) => ({
    collectionName: collectionRef.collectionName,
    constraints
  }),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  serverTimestamp: () => 'server-timestamp',
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  where: (...args: unknown[]) => whereMock(...args)
}));

describe('sessionService staff branch queries', () => {
  beforeEach(() => {
    vi.mocked(getDocument).mockImplementation(async (collectionName: string) => {
      if (collectionName === 'sessions') return session as never;
      if (collectionName === 'students') return student as never;
      return null;
    });
    vi.mocked(getCollection).mockResolvedValue([]);
    getDocsMock.mockResolvedValue({
      docs: [
        {
          id: 'session-1',
          data: () => session
        }
      ]
    });
    transactionGetMock.mockResolvedValue({
      id: 'session-1',
      exists: () => true,
      data: () => session
    });
    runTransactionMock.mockImplementation(async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        get: transactionGetMock,
        update: transactionUpdateMock
      })
    );
    updateDocMock.mockReset();
    whereMock.mockClear();
  });

  it('uses branch-scoped completion checks after staff marks attendance', async () => {
    await sessionService.quickMarkNextSessionFast('session-1', {
      date: '2026-05-23',
      classType: 'Road Practice'
    });

    expect(getDocsMock).toHaveBeenCalledWith(expect.objectContaining({
      collectionName: 'sessions',
      constraints: expect.arrayContaining([
        expect.objectContaining({ field: 'studentId', value: 'student-1' }),
        expect.objectContaining({ field: 'branchId', value: 'branch-1' })
      ])
    }));
    expect(getCollection).toHaveBeenCalledWith('courseExtensions', expect.arrayContaining([
      expect.objectContaining({ field: 'studentId', value: 'student-1' }),
      expect.objectContaining({ field: 'branchId', value: 'branch-1' })
    ]));
  });
});
