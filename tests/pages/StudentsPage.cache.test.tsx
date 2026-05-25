import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentsPage } from '@/pages/StudentsPage';
import { studentService } from '@/services/studentService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { clearPageCache } from '@/store/pageCacheStore';
import type { Profile, StudentWithFee } from '@/types';

vi.mock('@/components/students/StudentDetails', () => ({
  StudentDetails: () => <div>Student details</div>
}));

vi.mock('@/components/students/StudentForm', () => ({
  StudentForm: () => <div>Student form</div>
}));

vi.mock('@/services/studentService', () => ({
  studentService: {
    getStudentsPage: vi.fn()
  }
}));

const ownerProfile: Profile = {
  id: 'owner-1',
  fullName: 'Owner',
  role: 'owner',
  branchId: null
};

const cachedStudent: StudentWithFee = {
  id: 'student-1',
  branchId: 'branch-1',
  branchName: 'Main Branch',
  fullName: 'Cached Student',
  phone: '9876543210',
  courseType: '4W',
  enrollmentDate: '2026-05-01',
  courseStartDate: '2026-05-02',
  expiryDate: '2026-07-01',
  learningLicenceNo: '',
  drivingLicenceNo: '',
  status: 'ongoing',
  createdAt: '2026-05-01',
  durationDays: 60,
  baseDurationDays: 60,
  baseSessionCount: 30,
  totalAmount: 1000,
  paidAmount: 250,
  balance: 750,
  daysRemaining: 9,
  fee: {
    id: 'fee-1',
    studentId: 'student-1',
    branchId: 'branch-1',
    totalAmount: 1000,
    paidAmount: 250,
    balance: 750,
    installments: []
  }
};

const studentsPageResult = {
  rows: [cachedStudent],
  pageInfo: {
    hasNextPage: false,
    nextCursor: null,
    startItem: 1,
    endItem: 1
  }
};

describe('StudentsPage cached-first loading', () => {
  beforeEach(() => {
    clearPageCache();
    useAuthStore.setState({ user: null, profile: ownerProfile, isLoading: false, authError: null });
    useAppStore.setState({ branchId: null });
    vi.mocked(studentService.getStudentsPage).mockResolvedValue(studentsPageResult);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders cached rows on remount without showing the full loader or refetching', async () => {
    render(<StudentsPage />);

    await screen.findByText('Cached Student');
    expect(studentService.getStudentsPage).toHaveBeenCalledTimes(1);

    cleanup();
    vi.mocked(studentService.getStudentsPage).mockClear();

    render(<StudentsPage />);

    expect(screen.queryByText('Loading students...')).not.toBeInTheDocument();
    expect(screen.getByText('Cached Student')).toBeInTheDocument();
    await waitFor(() => {
      expect(studentService.getStudentsPage).not.toHaveBeenCalled();
    });
  });
});
