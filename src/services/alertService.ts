import { where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import { calculateStudentExpiryDate, getCourseStartDate, isPastDate, isWithinNextDays } from '@/utils/dateUtils';
import { formatCurrency } from '@/utils/formatters';
import { deriveStudentStatus } from '@/utils/studentStatus';
import type { AlertFilters, AppAlert, Branch, DrivingTest, Fee, Student } from '@/types';

type AlertData = {
  branches: Branch[];
  students: Student[];
  fees: Fee[];
  drivingTests: DrivingTest[];
};

function branchNameMap(branches: Branch[]): Map<string, string> {
  return new Map(branches.map((branch) => [branch.id, branch.name]));
}

async function getVisibleBranches(branchId?: string): Promise<Branch[]> {
  if (!branchId) {
    return getCollection<Branch>(collections.branches);
  }

  const branch = await getDocument<Branch>(collections.branches, branchId);
  return branch ? [branch] : [];
}

async function getEffectiveBranchId(filters: AlertFilters): Promise<string | undefined> {
  const { profile } = await authService.getCurrentUser();

  if (profile?.role === 'staff') {
    if (!profile.branchId) {
      throw new Error('Your staff profile is not assigned to a branch.');
    }

    return profile.branchId ?? undefined;
  }

  if (profile?.role === 'owner') {
    return filters.branchId && filters.branchId !== 'all' ? filters.branchId : undefined;
  }

  if (filters.role === 'staff') {
    if (!filters.userBranchId) {
      throw new Error('Your staff profile is not assigned to a branch.');
    }

    return filters.userBranchId;
  }

  return filters.branchId && filters.branchId !== 'all' ? filters.branchId : undefined;
}

async function getAlertData(filters: AlertFilters): Promise<AlertData> {
  const branchId = await getEffectiveBranchId(filters);
  const [branches, students, fees, drivingTests] = await Promise.all([
    getVisibleBranches(branchId),
    getCollection<Student>(collections.students, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
    getCollection<Fee>(collections.fees, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
    getCollection<DrivingTest>(collections.drivingTests, [...(branchId ? [where('branchId', '==', branchId)] : [])])
  ]);

  return {
    branches,
    students: students.map((student) => ({ ...student, status: deriveStudentStatus(student) })),
    fees,
    drivingTests
  };
}

function baseAlert(student: Student, branches: Map<string, string>): Pick<AppAlert, 'studentId' | 'studentName' | 'phone' | 'branchId' | 'branchName' | 'actionLabel'> {
  return {
    studentId: student.id,
    studentName: student.fullName,
    phone: student.phone,
    branchId: student.branchId,
    branchName: branches.get(student.branchId),
    actionLabel: 'View Student'
  };
}

function hasPassedDrivingTest(tests: DrivingTest[]): boolean {
  return tests.some((test) => test.attempts?.some((attempt) => attempt.result === 'pass'));
}

function isActiveTrainingStudent(student: Student): boolean {
  return student.status === 'ongoing' || student.status === 'extended';
}

export const alertService = {
  async getThirtyDayCompletedAlerts(filters: AlertFilters): Promise<AppAlert[]> {
    const { branches, students } = await getAlertData(filters);
    const branchesById = branchNameMap(branches);

    return students
      .filter(isActiveTrainingStudent)
      .map((student) => ({
        student,
        completionDate: calculateStudentExpiryDate(getCourseStartDate(student), student.durationDays ?? 30)
      }))
      .filter(({ completionDate }) => isPastDate(completionDate))
      .map(({ student, completionDate }) => ({
        id: `thirty-days-completed-${student.id}`,
        type: 'thirty_days_completed',
        severity: 'danger',
        ...baseAlert(student, branchesById),
        message: `Training period completed for ${student.fullName}.`,
        createdFromDate: completionDate
      }));
  },

  async getNearCompletionAlerts(filters: AlertFilters): Promise<AppAlert[]> {
    const { branches, students } = await getAlertData(filters);
    const branchesById = branchNameMap(branches);

    return students
      .filter(isActiveTrainingStudent)
      .map((student) => ({
        student,
        completionDate: calculateStudentExpiryDate(getCourseStartDate(student), student.durationDays ?? 30)
      }))
      .filter(({ completionDate }) => isWithinNextDays(completionDate, 5))
      .map(({ student, completionDate }) => ({
        id: `near-completion-${student.id}`,
        type: 'near_completion',
        severity: 'warning',
        ...baseAlert(student, branchesById),
        message: `${student.fullName}'s training period is ending soon.`,
        createdFromDate: completionDate
      }));
  },

  async getPendingFeeAlerts(filters: AlertFilters): Promise<AppAlert[]> {
    const { branches, students, fees } = await getAlertData(filters);
    const branchesById = branchNameMap(branches);
    const studentsById = new Map(students.map((student) => [student.id, student]));

    return fees
      .filter((fee) => Number(fee.balance ?? 0) > 0)
      .flatMap((fee) => {
        const student = studentsById.get(fee.studentId);
        if (!student) return [];
        const balance = Number(fee.balance ?? 0);

        return [{
          id: `pending-fee-${student.id}`,
          type: 'pending_fee',
          severity: 'warning',
          ...baseAlert(student, branchesById),
          message: `${student.fullName} has pending fee balance of ${formatCurrency(balance)}.`,
          amount: balance
        } satisfies AppAlert];
      });
  },

  async getLicenceExpiryAlerts(filters: AlertFilters): Promise<AppAlert[]> {
    const { branches, students } = await getAlertData(filters);
    const branchesById = branchNameMap(branches);

    return students
      .filter((student) => Boolean(student.dlExpiryDate) && isWithinNextDays(student.dlExpiryDate as string, 30))
      .map((student) => ({
        id: `licence-expiry-${student.id}`,
        type: 'licence_expiry',
        severity: 'danger',
        ...baseAlert(student, branchesById),
        message: `${student.fullName}'s driving licence is expiring soon.`,
        createdFromDate: student.dlExpiryDate ?? undefined
      }));
  },

  async getDrivingTestPendingAlerts(filters: AlertFilters): Promise<AppAlert[]> {
    const { branches, students, drivingTests } = await getAlertData(filters);
    const branchesById = branchNameMap(branches);
    const testsByStudent = new Map<string, DrivingTest[]>();

    drivingTests.forEach((test) => {
      testsByStudent.set(test.studentId, [...(testsByStudent.get(test.studentId) ?? []), test]);
    });

    return students
      .filter(isActiveTrainingStudent)
      .map((student) => ({
        student,
        completionDate: calculateStudentExpiryDate(getCourseStartDate(student), student.durationDays ?? 30)
      }))
      .filter(({ student, completionDate }) => isPastDate(completionDate) && !hasPassedDrivingTest(testsByStudent.get(student.id) ?? []))
      .map(({ student, completionDate }) => ({
        id: `driving-test-pending-${student.id}`,
        type: 'driving_test_pending',
        severity: 'warning',
        ...baseAlert(student, branchesById),
        message: `${student.fullName}'s driving test is pending.`,
        createdFromDate: completionDate
      }));
  },

  async getAlerts(filters: AlertFilters): Promise<AppAlert[]> {
    const [completed, nearCompletion, pendingFees, licenceExpiry, testPending] = await Promise.all([
      alertService.getThirtyDayCompletedAlerts(filters),
      alertService.getNearCompletionAlerts(filters),
      alertService.getPendingFeeAlerts(filters),
      alertService.getLicenceExpiryAlerts(filters),
      alertService.getDrivingTestPendingAlerts(filters)
    ]);

    return [...completed, ...licenceExpiry, ...testPending, ...nearCompletion, ...pendingFees];
  }
};
