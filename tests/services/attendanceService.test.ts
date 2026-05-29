import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attendanceService } from '@/services/attendanceService';
import { authService } from '@/services/authService';
import { getDocument, subscribeCollection } from '@/services/firestoreUtils';
import type { Branch, CourseExtension, Student, TrainingSession } from '@/types';

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

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn()
  }
}));

vi.mock('@/services/courseExtensionService', () => ({
  calculateTrainingEntitlement: vi.fn(() => ({ allowedSessions: 30, allowedDays: 60 }))
}));

vi.mock('@/services/firestoreUtils', () => ({
  collections: {
    branches: 'branches',
    students: 'students',
    sessions: 'sessions',
    courseExtensions: 'courseExtensions'
  },
  getCollection: vi.fn(),
  getDocument: vi.fn(),
  subscribeCollection: vi.fn()
}));

vi.mock('@/services/sessionService', () => ({
  getLastCompletedSession: vi.fn(() => null),
  getNextEmptySlot: vi.fn(() => null),
  sessionService: {
    createEmptySessionCard: vi.fn(),
    quickMarkNextSessionFast: vi.fn()
  }
}));

vi.mock('firebase/firestore', () => ({
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))
}));

describe('attendanceService', () => {
  beforeEach(() => {
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      user: null,
      profile: { id: 'staff-1', fullName: 'Staff', role: 'staff', branchId: 'branch-1' }
    });
    vi.mocked(getDocument).mockImplementation(async (collectionName: string, id: string) => {
      if (collectionName === 'branches' && id === 'branch-1') return branch as never;
      return null;
    });
    vi.mocked(subscribeCollection).mockImplementation((collectionName: string, _constraints, onNext) => {
      const rows =
        collectionName === 'students'
          ? [student]
          : collectionName === 'sessions'
            ? [] as TrainingSession[]
            : collectionName === 'courseExtensions'
              ? [] as CourseExtension[]
              : [];
      onNext({ rows, metadata: { fromCache: false, hasPendingWrites: false } });
      return vi.fn();
    });
  });

  it('loads only the assigned branch document for staff attendance and emits ongoing students', async () => {
    const onNext = vi.fn();

    attendanceService.subscribeAttendanceRows(
      {
        role: 'staff',
        userBranchId: 'branch-1',
        branchId: 'branch-1',
        courseType: 'all',
        selectedDate: '2026-05-23'
      },
      onNext
    );

    await expect.poll(() => onNext.mock.calls.length).toBe(1);

    expect(getDocument).toHaveBeenCalledWith('branches', 'branch-1');
    expect(subscribeCollection).not.toHaveBeenCalledWith(
      'branches',
      expect.any(Array),
      expect.any(Function),
      expect.anything(),
      'branches:all'
    );
    expect(onNext.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        studentId: 'student-1',
        studentName: 'Amit Kumar',
        branchName: 'Main Branch',
        isCompleted: false
      })
    ]);
  });
});
