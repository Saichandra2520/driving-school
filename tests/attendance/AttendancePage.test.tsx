import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendancePage } from '@/pages/AttendancePage';
import { attendanceService } from '@/services/attendanceService';
import { sessionService } from '@/services/sessionService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { useReferenceDataStore } from '@/store/referenceDataStore';
import type { AttendanceRow, Profile } from '@/types';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 320,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 320
      })),
    measureElement: vi.fn()
  })
}));

vi.mock('@/services/attendanceService', () => ({
  attendanceService: {
    getAttendanceRows: vi.fn(),
    subscribeAttendanceRows: vi.fn(),
    markAttendance: vi.fn()
  }
}));

vi.mock('@/services/sessionService', () => ({
  sessionService: {
    getClassTypes: vi.fn()
  }
}));

vi.mock('@/components/students/AddExtensionModal', () => ({
  AddExtensionModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Add Extension">Extension form</div> : null
}));

const ownerProfile: Profile = {
  id: 'owner-1',
  fullName: 'Owner',
  role: 'owner',
  branchId: null
};

const staffProfile: Profile = {
  id: 'staff-1',
  fullName: 'Staff',
  role: 'staff',
  branchId: 'branch1'
};

const attendanceRows: AttendanceRow[] = [
  row({
    studentId: 'student-1',
    studentName: 'Amit Kumar',
    phone: '9876543210',
    courseType: '2W',
    sessionId: 'session-2w-pending',
    completedSessions: 2,
    allowedSessions: 5,
    remainingSessions: 3,
    nextSessionNo: 3,
    lastClassType: 'Running',
    lastSessionDate: '2026-05-20'
  }),
  row({
    studentId: 'student-2',
    studentName: 'Bhavna Shah',
    phone: '9876543211',
    courseType: '2W',
    sessionId: 'session-2w-marked',
    completedSessions: 3,
    allowedSessions: 5,
    remainingSessions: 2,
    nextSessionNo: 4,
    lastClassType: 'Circle Practice',
    lastSessionDate: '2026-05-21',
    isMarkedOnSelectedDate: true,
    selectedDateSessionCount: 1,
    selectedDateClassTypes: ['Circle Practice']
  }),
  row({
    studentId: 'student-3',
    studentName: 'Charu Mehta',
    phone: '9876543212',
    courseType: '4W',
    sessionId: 'session-4w-completed',
    completedSessions: 5,
    allowedSessions: 5,
    remainingSessions: 0,
    nextSessionNo: null,
    lastClassType: 'Parking',
    lastSessionDate: '2026-05-19',
    isCompleted: true
  }),
  row({
    studentId: 'student-4',
    studentName: 'Deepak Singh',
    phone: '9876543213',
    courseType: '4W',
    sessionId: 'session-4w-pending',
    completedSessions: 1,
    allowedSessions: 5,
    remainingSessions: 4,
    nextSessionNo: 2,
    lastClassType: 'Road Practice',
    lastSessionDate: '2026-05-18'
  })
];

describe('AttendancePage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(attendanceService.getAttendanceRows).mockResolvedValue(attendanceRows);
    vi.mocked(attendanceService.subscribeAttendanceRows).mockImplementation((_filters, onNext) => {
      onNext(attendanceRows);
      return vi.fn();
    });
    vi.mocked(attendanceService.markAttendance).mockResolvedValue(undefined);
    vi.mocked(sessionService.getClassTypes).mockImplementation(async (_branchId, courseType) =>
      courseType === '2W' ? ['Running', 'Circle Practice'] : ['Road Practice', 'Parking']
    );

    useAuthStore.setState({ user: null, profile: ownerProfile, isLoading: false });
    useAppStore.setState({ branchId: 'branch1' });
    useReferenceDataStore.setState({ classTypes: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it('blocks owners until a branch is selected', () => {
    useAppStore.setState({ branchId: null });

    render(<AttendancePage />);

    expect(screen.getByText('Select a branch to mark attendance.')).toBeInTheDocument();
    expect(attendanceService.subscribeAttendanceRows).not.toHaveBeenCalled();
  });

  it('blocks staff users without an assigned branch', () => {
    useAuthStore.setState({
      user: null,
      profile: { ...staffProfile, branchId: null },
      isLoading: false
    });

    render(<AttendancePage />);

    expect(screen.getByText('Your staff profile is not assigned to a branch.')).toBeInTheDocument();
    expect(attendanceService.subscribeAttendanceRows).not.toHaveBeenCalled();
  });

  it('loads attendance rows and shows summary state', async () => {
    render(<AttendancePage />);

    expect(await screen.findByText('Amit Kumar')).toBeInTheDocument();
    expect(screen.getByText('Bhavna Shah')).toBeInTheDocument();
    expect(screen.getByText('Charu Mehta')).toBeInTheDocument();
    expect(screen.getByText('Deepak Singh')).toBeInTheDocument();
    expect(screen.getByText('Total Visible')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quick Mark/i })).not.toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
  });

  it('marks a pending row with default row values after expanding it', async () => {
    render(<AttendancePage />);

    await screen.findByText('Amit Kumar');
    fireEvent.click(screen.getByText('Amit Kumar'));
    fireEvent.click(getButtonByText('Mark Present'));

    await waitFor(() => {
      expect(attendanceService.markAttendance).toHaveBeenCalledWith(
        'session-2w-pending',
        expect.objectContaining({
          date: expect.any(String),
          classType: 'Running'
        }),
        5
      );
    });
    expect(await screen.findByText('Attendance marked successfully.')).toBeInTheDocument();
  });

  it('opens duplicate confirmation and marks anyway for same-date attendance', async () => {
    const user = userEvent.setup();
    render(<AttendancePage />);

    await screen.findByText('Bhavna Shah');
    fireEvent.click(screen.getByText('Bhavna Shah'));
    fireEvent.click(getButtonByText('Mark Present'));

    expect(await screen.findByText('Duplicate Attendance Date')).toBeInTheDocument();
    expect(attendanceService.markAttendance).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Mark Anyway' }));

    await waitFor(() => {
      expect(attendanceService.markAttendance).toHaveBeenCalledWith(
        'session-2w-marked',
        expect.objectContaining({ classType: 'Running' }),
        5
      );
    });
  });

  it('does not mark duplicate attendance when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    render(<AttendancePage />);

    await screen.findByText('Bhavna Shah');
    fireEvent.click(screen.getByText('Bhavna Shah'));
    fireEvent.click(getButtonByText('Mark Present'));
    await screen.findByText('Duplicate Attendance Date');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Duplicate Attendance Date')).not.toBeInTheDocument();
    expect(attendanceService.markAttendance).not.toHaveBeenCalled();
  });

  it('bulk marks selected rows from the same course', async () => {
    const user = userEvent.setup();
    render(<AttendancePage />);

    await screen.findByText('Amit Kumar');
    await user.click(screen.getByLabelText('Select Amit Kumar'));
    await user.click(screen.getByLabelText('Select Bhavna Shah'));

    expect(screen.getByText('Bulk Attendance (2)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark Selected' }));
    await user.click(await screen.findByRole('button', { name: 'Mark Anyway' }));

    await waitFor(() => {
      expect(attendanceService.markAttendance).toHaveBeenCalledTimes(2);
    });
    expect(attendanceService.markAttendance).toHaveBeenCalledWith(
      'session-2w-pending',
      expect.objectContaining({ classType: 'Running' }),
      5
    );
    expect(attendanceService.markAttendance).toHaveBeenCalledWith(
      'session-2w-marked',
      expect.objectContaining({ classType: 'Running' }),
      5
    );
  });

  it('prevents bulk selection across mixed course types', async () => {
    const user = userEvent.setup();
    render(<AttendancePage />);

    await screen.findByText('Amit Kumar');
    await user.click(screen.getByLabelText('Select Amit Kumar'));
    await user.click(screen.getByLabelText('Select Deepak Singh'));

    expect(screen.getByText('Bulk attendance can include only one course at a time.')).toBeInTheDocument();
    expect(screen.getByText('Bulk Attendance (1)')).toBeInTheDocument();
  });

  it('disables selection and marking for completed rows', async () => {
    render(<AttendancePage />);

    await screen.findByText('Charu Mehta');
    fireEvent.click(screen.getByText('Charu Mehta'));

    expect(screen.getByLabelText('Select Charu Mehta')).toBeDisabled();
    expect(getButtonByText('Completed')).toBeDisabled();
  });

  it('shows a retry state when attendance rows fail to load', async () => {
    vi.mocked(attendanceService.subscribeAttendanceRows).mockImplementation((_filters, _onNext, onError) => {
      onError?.(new Error('Network unavailable'));
      return vi.fn();
    });

    render(<AttendancePage />);

    expect(await screen.findByText('Unable to load attendance.')).toBeInTheDocument();
    expect(screen.getByText('Unable to connect. Please check your internet connection.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(attendanceService.getAttendanceRows).toHaveBeenCalled();
  });

  it('filters visible rows using the search input', async () => {
    const user = userEvent.setup();
    render(<AttendancePage />);

    await screen.findByText('Amit Kumar');
    await user.type(screen.getByPlaceholderText('Search by student name or phone'), 'Deepak');

    await waitFor(() => {
      expect(attendanceService.subscribeAttendanceRows).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Deepak' }),
        expect.any(Function),
        expect.any(Function)
      );
    });
  });
});

function row(overrides: Partial<AttendanceRow>): AttendanceRow {
  return {
    studentId: 'student-id',
    studentName: 'Student Name',
    phone: '9999999999',
    branchId: 'branch1',
    branchName: 'Main Branch',
    courseType: '2W',
    sessionId: 'session-id',
    completedSessions: 0,
    allowedSessions: 5,
    allowedDays: 60,
    courseStartDate: '2026-04-01',
    courseCompletionDate: '2026-05-31',
    remainingSessions: 5,
    nextSessionNo: 1,
    lastClassType: undefined,
    lastSessionDate: undefined,
    isMarkedOnSelectedDate: false,
    selectedDateSessionCount: 0,
    selectedDateClassTypes: [],
    isCompleted: false,
    ...overrides
  };
}

function getButtonByText(text: string, index = 0): HTMLButtonElement {
  const buttons = screen
    .getAllByText(text)
    .map((element) => element.closest('button'))
    .filter((element): element is HTMLButtonElement => element !== null);

  const button = buttons[index];
  if (!button) {
    throw new Error(`Unable to find button with text "${text}" at index ${index}.`);
  }

  return button;
}
