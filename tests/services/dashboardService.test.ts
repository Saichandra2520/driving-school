import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardService } from '@/services/dashboardService';
import { authService } from '@/services/authService';
import { getCollection, getDocument } from '@/services/firestoreUtils';
import type { Branch, Expense, Fee, Student } from '@/types';

const branch: Branch = { id: 'branch-1', name: 'Main Branch' };
const student: Student = {
  id: 'student-1',
  branchId: 'branch-1',
  fullName: 'Amit Kumar',
  phone: '9876543210',
  courseType: '4W',
  enrollmentDate: '2026-05-01',
  courseStartDate: '2026-05-01',
  learningLicenceNo: '',
  drivingLicenceNo: '',
  status: 'ongoing',
  createdAt: '2026-05-01'
};
const legacyFee: Fee = {
  id: 'fee-1',
  studentId: 'student-1',
  branchId: '',
  totalAmount: 1000,
  paidAmount: 250,
  balance: 750,
  installments: [{ receiptNo: 'RCP-001', amount: 250, date: '2026-05-23', createdAt: '2026-05-23T10:00:00.000Z' }]
};

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn()
  }
}));

vi.mock('@/services/firebaseUsageService', () => ({
  firebaseUsageService: {
    trackUsage: vi.fn()
  }
}));

vi.mock('@/services/firestoreUtils', () => ({
  collections: {
    branches: 'branches',
    students: 'students',
    fees: 'fees',
    expenses: 'expenses'
  },
  getCollection: vi.fn(),
  getDocument: vi.fn(),
  subscribeCollection: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))
}));

describe('dashboardService', () => {
  beforeEach(() => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      user: null,
      profile: { id: 'staff-1', fullName: 'Staff', role: 'staff', branchId: 'branch-1' }
    });
    vi.mocked(getDocument).mockImplementation(async (collectionName: string, id: string) => {
      if (collectionName === 'branches' && id === 'branch-1') return branch as never;
      return null;
    });
    vi.mocked(getCollection).mockImplementation(async (collectionName: string, constraints: Array<{ field?: string; op?: string; value?: unknown }> = []) => {
      if (collectionName === 'students') return [student] as never;
      if (collectionName === 'fees') {
        const studentIds = constraints.find((constraint) => constraint.field === 'studentId' && constraint.op === 'in')?.value;
        return Array.isArray(studentIds) && studentIds.includes('student-1') ? [legacyFee] as never : [] as never;
      }
      if (collectionName === 'expenses') return [] as Expense[] as never;
      return [] as never;
    });
  });

  it('includes recent payments for staff branch students when older fees are missing branchId', async () => {
    const payments = await dashboardService.getRecentPayments({
      role: 'staff',
      userBranchId: 'branch-1',
      branchId: 'branch-1'
    });

    expect(payments).toEqual([
      expect.objectContaining({
        studentId: 'student-1',
        studentName: 'Amit Kumar',
        receiptNo: 'RCP-001',
        amount: 250
      })
    ]);
    expect(getDocument).toHaveBeenCalledWith('branches', 'branch-1');
    expect(getCollection).toHaveBeenCalledWith('fees', [expect.objectContaining({ field: 'studentId', op: 'in' })]);
  });
});
