import { where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection, getDocument, subscribeCollection } from '@/services/firestoreUtils';
import {
  calculateStudentExpiryDate,
  getCourseStartDate,
  getDaysRemaining,
  isPastDate,
  isWithinNextDays
} from '@/utils/dateUtils';
import { deriveStudentStatus } from '@/utils/studentStatus';
import type {
  Branch,
  DashboardFilters,
  DashboardSummary,
  Expense,
  ExpenseCategory,
  Fee,
  PendingFeeStudent,
  RecentExpense,
  RecentPayment,
  Student,
  ThirtyDayAlertStudent
} from '@/types';

type StudentFeeRow = Student & {
  branchName?: string;
  fee: Fee | null;
};

export type DashboardData = {
  summary: DashboardSummary;
  pendingFees: PendingFeeStudent[];
  thirtyDayAlerts: ThirtyDayAlertStudent[];
  recentPayments: RecentPayment[];
  recentExpenses: RecentExpense[];
};

async function getEffectiveBranchId(filters: DashboardFilters): Promise<string | null> {
  const { profile } = await authService.getCurrentUser();

  if (profile?.role === 'staff') {
    if (!profile.branchId) {
      throw new Error('Your staff profile is not assigned to a branch. Ask the owner to edit your staff profile and select a branch.');
    }

    return profile.branchId;
  }

  if (profile?.role === 'owner') {
    return filters.branchId ?? null;
  }

  if (filters.role === 'staff') {
    if (!filters.userBranchId) {
      throw new Error('Your staff profile is not assigned to a branch. Ask the owner to edit your staff profile and select a branch.');
    }

    return filters.userBranchId;
  }

  return filters.branchId ?? null;
}

function getBranchNameMap(branches: Branch[]): Map<string, string> {
  return new Map(branches.map((branch) => [branch.id, branch.name]));
}

async function getVisibleBranches(branchId: string | null): Promise<Branch[]> {
  if (!branchId) {
    return getCollection<Branch>(collections.branches);
  }

  const branch = await getDocument<Branch>(collections.branches, branchId);
  return branch ? [branch] : [];
}

async function getVisibleData(branchId: string | null): Promise<{
  branches: Branch[];
  students: StudentFeeRow[];
  fees: Fee[];
  expenses: Expense[];
}> {
  const [branches, studentsRaw, feesRaw, expenses] = await Promise.all([
    getVisibleBranches(branchId),
    getCollection<Student>(collections.students, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
    getCollection<Fee>(collections.fees, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
    getCollection<Expense>(collections.expenses, [...(branchId ? [where('branchId', '==', branchId)] : [])])
  ]);
  const branchNames = getBranchNameMap(branches);
  const feesByStudent = new Map(feesRaw.map((fee) => [fee.studentId, normalizeFee(fee)]));
  const students = studentsRaw.map((student) => ({
    ...student,
    status: deriveStudentStatus(student),
    durationDays: student.durationDays ?? 30,
    courseStartDate: getCourseStartDate(student),
    branchName: branchNames.get(student.branchId),
    fee: feesByStudent.get(student.id) ?? null
  }));

  return { branches, students, fees: [...feesByStudent.values()], expenses };
}

function normalizeFee(fee: Fee): Fee {
  const installments = Array.isArray(fee.installments) ? fee.installments : [];
  const paidAmount = installments.length
    ? installments.reduce((total, installment) => total + Number(installment.amount), 0)
    : Number(fee.paidAmount ?? 0);
  const totalAmount = Number(fee.totalAmount ?? 0);

  return {
    ...fee,
    installments,
    totalAmount,
    paidAmount,
    balance: Number.isFinite(Number(fee.balance)) ? Number(fee.balance) : Math.max(totalAmount - paidAmount, 0)
  };
}

function getTimestampValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return '';
}

function expenseTotal(expenses: Expense[], categories: ExpenseCategory[]): number {
  const categorySet = new Set(categories);
  return expenses.reduce(
    (total, expense) => total + (categorySet.has(expense.category) ? Number(expense.amount ?? 0) : 0),
    0
  );
}

function buildVisibleData(
  branchId: string | null,
  branchesRaw: Branch[],
  studentsRaw: Student[],
  feesRaw: Fee[],
  expensesRaw: Expense[]
): {
  branches: Branch[];
  students: StudentFeeRow[];
  fees: Fee[];
  expenses: Expense[];
} {
  const branches = branchId ? branchesRaw.filter((branch) => branch.id === branchId) : branchesRaw;
  const branchNames = getBranchNameMap(branches);
  const fees = feesRaw.map(normalizeFee);
  const feesByStudent = new Map(fees.map((fee) => [fee.studentId, fee]));
  const students = studentsRaw.map((student) => ({
    ...student,
    status: deriveStudentStatus(student),
    durationDays: student.durationDays ?? 30,
    courseStartDate: getCourseStartDate(student),
    branchName: branchNames.get(student.branchId),
    fee: feesByStudent.get(student.id) ?? null
  }));

  return { branches, students, fees, expenses: expensesRaw };
}

function computeDashboardData(data: {
  branches: Branch[];
  students: StudentFeeRow[];
  fees: Fee[];
  expenses: Expense[];
}): DashboardData {
  const { branches, students, fees, expenses } = data;
  const today = new Date().toISOString().slice(0, 10);
  const branchNames = getBranchNameMap(branches);
  const totalFeeCollected = fees.reduce((total, fee) => total + Number(fee.paidAmount ?? 0), 0);
  const todayCollections = fees.reduce(
    (total, fee) =>
      total + fee.installments.reduce((feeTotal, installment) => feeTotal + (installment.date === today ? Number(installment.amount ?? 0) : 0), 0),
    0
  );
  const pendingFeeBalance = fees.reduce((total, fee) => total + Number(fee.balance ?? 0), 0);
  const totalExpenses = expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
  const todayExpenses = expenses.reduce(
    (total, expense) => total + ((expense.date ?? expense.expenseDate) === today ? Number(expense.amount ?? 0) : 0),
    0
  );
  const studentsById = new Map(students.map((student) => [student.id, student]));

  return {
    summary: {
      totalStudents: students.length,
      aboutToStartStudents: students.filter((student) => student.status === 'about_to_start').length,
      ongoingStudents: students.filter((student) => student.status === 'ongoing' || student.status === 'extended').length,
      passedStudents: students.filter((student) => student.status === 'passed').length,
      totalFeeCollected,
      todayCollections,
      pendingFeeBalance,
      totalExpenses,
      todayExpenses,
      fuelTotal: expenseTotal(expenses, ['fuel']),
      maintenanceTotal: expenseTotal(expenses, ['maintenance']),
      salaryTotal: expenseTotal(expenses, ['salary']),
      rentElectricityTotal: expenseTotal(expenses, ['room_rent', 'electricity']),
      challanTotal: expenseTotal(expenses, ['learning_challan', 'driving_test_challan']),
      otherTotal: expenseTotal(expenses, ['other']),
      netAmount: totalFeeCollected - totalExpenses
    },
    pendingFees: students
      .map((student) => ({
        studentId: student.id,
        fullName: student.fullName,
        phone: student.phone,
        branchId: student.branchId,
        branchName: student.branchName,
        courseType: student.courseType,
        totalAmount: Number(student.fee?.totalAmount ?? 0),
        paidAmount: Number(student.fee?.paidAmount ?? 0),
        balance: Number(student.fee?.balance ?? 0)
      }))
      .filter((student) => student.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10),
    thirtyDayAlerts: students
      .filter((student) => student.status === 'ongoing' || student.status === 'extended')
      .map((student) => {
        const courseStartDate = getCourseStartDate(student);
        const completionDate = calculateStudentExpiryDate(courseStartDate, student.durationDays ?? 30);
        const daysRemaining = getDaysRemaining(completionDate);
        return {
          studentId: student.id,
          fullName: student.fullName,
          phone: student.phone,
          branchId: student.branchId,
          branchName: student.branchName,
          courseType: student.courseType,
          enrollmentDate: student.enrollmentDate,
          courseStartDate,
          completionDate,
          daysRemaining,
          alertType: isPastDate(completionDate) ? 'completed' : 'near_completion'
        } satisfies ThirtyDayAlertStudent;
      })
      .filter((student) => student.alertType === 'completed' || isWithinNextDays(student.completionDate, 5))
      .sort((a, b) => a.daysRemaining - b.daysRemaining),
    recentPayments: fees
      .flatMap((fee) => {
        const student = studentsById.get(fee.studentId);
        if (!student) return [];

        return fee.installments.map((installment) => ({
          studentId: fee.studentId,
          studentName: student.fullName,
          branchId: fee.branchId,
          branchName: branchNames.get(fee.branchId),
          receiptNo: installment.receiptNo,
          amount: Number(installment.amount ?? 0),
          date: installment.date,
          isEdited: Boolean(installment.updatedAt),
          updatedAt: getTimestampValue(installment.updatedAt)
        }));
      })
      .sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date))
      .slice(0, 5),
    recentExpenses: expenses
      .map((expense) => ({
        id: expense.id,
        branchId: expense.branchId,
        branchName: branchNames.get(expense.branchId),
        category: expense.category,
        amount: Number(expense.amount ?? 0),
        date: expense.date ?? expense.expenseDate,
        notes: expense.notes
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
  };
}

export const dashboardService = {
  async getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummary> {
    const branchId = await getEffectiveBranchId(filters);
    return computeDashboardData(await getVisibleData(branchId)).summary;
  },

  async getPendingFeeStudents(filters: DashboardFilters): Promise<PendingFeeStudent[]> {
    const branchId = await getEffectiveBranchId(filters);
    return computeDashboardData(await getVisibleData(branchId)).pendingFees;
  },

  async getThirtyDayAlerts(filters: DashboardFilters): Promise<ThirtyDayAlertStudent[]> {
    const branchId = await getEffectiveBranchId(filters);
    return computeDashboardData(await getVisibleData(branchId)).thirtyDayAlerts;
  },

  async getRecentPayments(filters: DashboardFilters): Promise<RecentPayment[]> {
    const branchId = await getEffectiveBranchId(filters);
    return computeDashboardData(await getVisibleData(branchId)).recentPayments;
  },

  async getRecentExpenses(filters: DashboardFilters): Promise<RecentExpense[]> {
    const branchId = await getEffectiveBranchId(filters);
    return computeDashboardData(await getVisibleData(branchId)).recentExpenses;
  },

  subscribeDashboardData(
    filters: DashboardFilters,
    onNext: (data: DashboardData) => void,
    onError?: (error: Error) => void
  ): () => void {
    let isActive = true;
    let cleanup = (): void => undefined;
    let latestBranches: Branch[] = [];
    let latestStudents: Student[] = [];
    let latestFees: Fee[] = [];
    let latestExpenses: Expense[] = [];
    let branchesLoaded = false;
    let studentsLoaded = false;
    let feesLoaded = false;
    let expensesLoaded = false;

    const emit = (branchId: string | null): void => {
      if (!isActive || !branchesLoaded || !studentsLoaded || !feesLoaded || !expensesLoaded) return;
      onNext(computeDashboardData(buildVisibleData(branchId, latestBranches, latestStudents, latestFees, latestExpenses)));
    };

    void getEffectiveBranchId(filters).then((branchId) => {
      if (!isActive) return;

      const branchScoped = branchId ? [where('branchId', '==', branchId)] : [];
      const scopeKey = `branch=${branchId ?? 'all'}`;
      const unsubscribers = [
        subscribeCollection<Branch>(
          collections.branches,
          [],
          ({ rows }) => {
            branchesLoaded = true;
            latestBranches = rows;
            emit(branchId);
          },
          onError,
          'branches:all'
        ),
        subscribeCollection<Student>(
          collections.students,
          branchScoped,
          ({ rows }) => {
            studentsLoaded = true;
            latestStudents = rows;
            emit(branchId);
          },
          onError,
          `students:dashboard:${scopeKey}`
        ),
        subscribeCollection<Fee>(
          collections.fees,
          branchScoped,
          ({ rows }) => {
            feesLoaded = true;
            latestFees = rows;
            emit(branchId);
          },
          onError,
          `fees:dashboard:${scopeKey}`
        ),
        subscribeCollection<Expense>(
          collections.expenses,
          branchScoped,
          ({ rows }) => {
            expensesLoaded = true;
            latestExpenses = rows;
            emit(branchId);
          },
          onError,
          `expenses:dashboard:${scopeKey}`
        )
      ];

      cleanup = (): void => unsubscribers.forEach((unsubscribe) => unsubscribe());
    });

    return () => {
      isActive = false;
      cleanup();
    };
  }
};
