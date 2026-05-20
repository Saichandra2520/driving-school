import { where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import {
  calculateStudentExpiryDate,
  getDaysRemaining,
  isPastDate,
  isWithinNextDays
} from '@/utils/dateUtils';
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
    durationDays: student.durationDays ?? 30,
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

function expenseTotal(expenses: Expense[], categories: ExpenseCategory[]): number {
  const categorySet = new Set(categories);
  return expenses.reduce(
    (total, expense) => total + (categorySet.has(expense.category) ? Number(expense.amount ?? 0) : 0),
    0
  );
}

export const dashboardService = {
  async getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummary> {
    const branchId = await getEffectiveBranchId(filters);
    const { students, fees, expenses } = await getVisibleData(branchId);
    const today = new Date().toISOString().slice(0, 10);
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
    const fuelTotal = expenseTotal(expenses, ['fuel']);
    const maintenanceTotal = expenseTotal(expenses, ['maintenance']);
    const salaryTotal = expenseTotal(expenses, ['salary']);
    const rentElectricityTotal = expenseTotal(expenses, ['room_rent', 'electricity']);
    const challanTotal = expenseTotal(expenses, ['learning_challan', 'driving_test_challan']);
    const otherTotal = expenseTotal(expenses, ['other']);

    return {
      totalStudents: students.length,
      ongoingStudents: students.filter((student) => student.status === 'ongoing' || student.status === 'extended').length,
      passedStudents: students.filter((student) => student.status === 'passed').length,
      droppedStudents: students.filter((student) => student.status === 'dropped').length,
      totalFeeCollected,
      todayCollections,
      pendingFeeBalance,
      totalExpenses,
      todayExpenses,
      fuelTotal,
      maintenanceTotal,
      salaryTotal,
      rentElectricityTotal,
      challanTotal,
      otherTotal,
      netAmount: totalFeeCollected - totalExpenses
    };
  },

  async getPendingFeeStudents(filters: DashboardFilters): Promise<PendingFeeStudent[]> {
    const branchId = await getEffectiveBranchId(filters);
    const { students } = await getVisibleData(branchId);

    return students
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
      .slice(0, 10);
  },

  async getThirtyDayAlerts(filters: DashboardFilters): Promise<ThirtyDayAlertStudent[]> {
    const branchId = await getEffectiveBranchId(filters);
    const { students } = await getVisibleData(branchId);

    return students
      .filter((student) => student.status === 'ongoing')
      .map((student) => {
        const completionDate = calculateStudentExpiryDate(student.enrollmentDate, student.durationDays ?? 30);
        const daysRemaining = getDaysRemaining(completionDate);
        return {
          studentId: student.id,
          fullName: student.fullName,
          phone: student.phone,
          branchId: student.branchId,
          branchName: student.branchName,
          courseType: student.courseType,
          enrollmentDate: student.enrollmentDate,
          completionDate,
          daysRemaining,
          alertType: isPastDate(completionDate) ? 'completed' : 'near_completion'
        } satisfies ThirtyDayAlertStudent;
      })
      .filter((student) => student.alertType === 'completed' || isWithinNextDays(student.completionDate, 5))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  },

  async getRecentPayments(filters: DashboardFilters): Promise<RecentPayment[]> {
    const branchId = await getEffectiveBranchId(filters);
    const { branches, students, fees } = await getVisibleData(branchId);
    const branchNames = getBranchNameMap(branches);
    const studentsById = new Map(students.map((student) => [student.id, student]));

    return fees
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
          date: installment.date
        }));
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  },

  async getRecentExpenses(filters: DashboardFilters): Promise<RecentExpense[]> {
    const branchId = await getEffectiveBranchId(filters);
    const { branches, expenses } = await getVisibleData(branchId);
    const branchNames = getBranchNameMap(branches);

    return expenses
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
      .slice(0, 5);
  }
};
