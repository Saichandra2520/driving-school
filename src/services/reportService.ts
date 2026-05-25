import { where } from 'firebase/firestore';
import { COURSE_COMPLETION_DAYS } from '@/constants/courses';
import { authService } from '@/services/authService';
import { collections, getCollection } from '@/services/firestoreUtils';
import { calculateStudentExpiryDate, getCourseStartDate, isDateInMonthYear, isPastDate } from '@/utils/dateUtils';
import { deriveStudentStatus } from '@/utils/studentStatus';
import type {
  Branch,
  Expense,
  ExpenseCategory,
  ExpenseReport,
  ExpenseReportRow,
  Fee,
  FeeCollectionReport,
  FeeCollectionReportRow,
  PendingFeeReport,
  PendingFeeReportRow,
  Profile,
  ReportFilters,
  Student,
  StudentReport,
  StudentReportRow
} from '@/types';

function effectiveBranchId(filters: ReportFilters): string | undefined {
  return filters.branchId && filters.branchId !== 'all' ? filters.branchId : undefined;
}

async function assertOwner(): Promise<void> {
  const { profile } = await authService.getCurrentUser();
  if (profile?.role !== 'owner') {
    throw new Error('Access denied. Owner only.');
  }
}

function normalizeFee(fee: Fee): Fee {
  const installments = Array.isArray(fee.installments) ? fee.installments : [];
  const paidAmount = installments.length
    ? installments.reduce((total, installment) => total + Number(installment.amount ?? 0), 0)
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

function nameMap<T extends { id: string }>(rows: T[], label: (row: T) => string | undefined | null): Map<string, string> {
  return new Map(rows.map((row) => [row.id, label(row) || '-']));
}

function totalByCategory(rows: ExpenseReportRow[], categories: ExpenseCategory[]): number {
  const categorySet = new Set(categories);
  return rows.reduce((total, row) => total + (categorySet.has(row.category) ? row.amount : 0), 0);
}

async function getBaseData(branchId?: string): Promise<{
  branches: Branch[];
  students: Student[];
  fees: Fee[];
}> {
  const [branches, students, feesRaw] = await Promise.all([
    getCollection<Branch>(collections.branches),
    getCollection<Student>(collections.students, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
    getCollection<Fee>(collections.fees, [...(branchId ? [where('branchId', '==', branchId)] : [])])
  ]);

  return {
    branches,
    students: students.map((student) => ({ ...student, status: deriveStudentStatus(student) })),
    fees: feesRaw.map(normalizeFee)
  };
}

export const reportService = {
  async getFeeCollectionReport(filters: ReportFilters): Promise<FeeCollectionReport> {
    await assertOwner();
    const branchId = effectiveBranchId(filters);
    const { branches, students, fees } = await getBaseData(branchId);
    const branchesById = nameMap(branches, (branch) => branch.name);
    const studentsById = new Map(students.map((student) => [student.id, student]));

    const rows: FeeCollectionReportRow[] = fees
      .flatMap((fee) => {
        const student = studentsById.get(fee.studentId);
        if (!student) return [];

        return fee.installments
          .filter((installment) => isDateInMonthYear(installment.date, filters.month, filters.year))
          .map((installment) => ({
            receiptNo: installment.receiptNo,
            date: installment.date,
            branchId: fee.branchId,
            branchName: branchesById.get(fee.branchId),
            studentId: fee.studentId,
            studentName: student.fullName,
            phone: student.phone,
            courseType: student.courseType,
            amount: Number(installment.amount ?? 0),
            notes: installment.notes
          }));
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const amounts = rows.map((row) => row.amount);
    const totalCollected = amounts.reduce((total, amount) => total + amount, 0);

    return {
      totalCollected,
      installmentCount: rows.length,
      averagePaymentAmount: rows.length ? totalCollected / rows.length : 0,
      highestPayment: amounts.length ? Math.max(...amounts) : 0,
      lowestPayment: amounts.length ? Math.min(...amounts) : 0,
      rows
    };
  },

  async getPendingFeeReport(filters: ReportFilters): Promise<PendingFeeReport> {
    await assertOwner();
    const branchId = effectiveBranchId(filters);
    const { branches, students, fees } = await getBaseData(branchId);
    const branchesById = nameMap(branches, (branch) => branch.name);
    const studentsById = new Map(students.map((student) => [student.id, student]));

    const rows: PendingFeeReportRow[] = fees
      .flatMap((fee) => {
        const student = studentsById.get(fee.studentId);
        if (!student) return [];

        return [{
          branchId: fee.branchId,
          branchName: branchesById.get(fee.branchId),
          studentId: fee.studentId,
          studentName: student.fullName,
          phone: student.phone,
          courseType: student.courseType,
          status: student.status,
          totalAmount: Number(fee.totalAmount ?? 0),
          paidAmount: Number(fee.paidAmount ?? 0),
          balance: Number(fee.balance ?? 0)
        } satisfies PendingFeeReportRow];
      })
      .filter((row) => row.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const totalPendingBalance = rows.reduce((total, row) => total + row.balance, 0);

    return {
      totalPendingBalance,
      studentsWithBalanceCount: rows.length,
      highestBalance: rows.length ? rows[0].balance : 0,
      averageBalance: rows.length ? totalPendingBalance / rows.length : 0,
      rows
    };
  },

  async getExpenseReport(filters: ReportFilters): Promise<ExpenseReport> {
    await assertOwner();
    const branchId = effectiveBranchId(filters);
    const [branches, staffProfiles, students, expensesRaw] = await Promise.all([
      getCollection<Branch>(collections.branches),
      getCollection<Profile>(collections.users),
      getCollection<Student>(collections.students),
      getCollection<Expense>(collections.expenses, [...(branchId ? [where('branchId', '==', branchId)] : [])])
    ]);
    const branchesById = nameMap(branches, (branch) => branch.name);
    const staffById = nameMap(staffProfiles, (profile) => profile.fullName);
    const studentsById = nameMap(
      students.map((student) => ({ ...student, status: deriveStudentStatus(student) })),
      (student) => student.fullName
    );

    const rows: ExpenseReportRow[] = expensesRaw
      .map((expense) => ({ ...expense, date: expense.date ?? expense.expenseDate }))
      .filter((expense) => isDateInMonthYear(expense.date, filters.month, filters.year))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((expense) => ({
        id: expense.id,
        date: expense.date,
        branchId: expense.branchId,
        branchName: branchesById.get(expense.branchId),
        category: expense.category,
        amount: Number(expense.amount ?? 0),
        staffId: expense.staffId,
        staffName: expense.staffId ? staffById.get(expense.staffId) : undefined,
        studentId: expense.studentId,
        studentName: expense.studentId ? studentsById.get(expense.studentId) : undefined,
        notes: expense.notes
      }));

    return {
      totalExpenses: rows.reduce((total, row) => total + row.amount, 0),
      fuelTotal: totalByCategory(rows, ['fuel']),
      maintenanceTotal: totalByCategory(rows, ['maintenance']),
      salaryTotal: totalByCategory(rows, ['salary']),
      rentElectricityTotal: totalByCategory(rows, ['room_rent', 'electricity']),
      challanTotal: totalByCategory(rows, ['learning_challan', 'driving_test_challan']),
      otherTotal: totalByCategory(rows, ['other']),
      rows
    };
  },

  async getStudentReport(filters: ReportFilters): Promise<StudentReport> {
    await assertOwner();
    const branchId = effectiveBranchId(filters);
    const [branches, students] = await Promise.all([
      getCollection<Branch>(collections.branches),
      getCollection<Student>(collections.students, [...(branchId ? [where('branchId', '==', branchId)] : [])])
    ]);
    const branchesById = nameMap(branches, (branch) => branch.name);
    const derivedStudents = students.map((student) => ({ ...student, status: deriveStudentStatus(student) }));

    const rows: StudentReportRow[] = derivedStudents
      .filter((student) => isDateInMonthYear(student.enrollmentDate, filters.month, filters.year))
      .sort((a, b) => b.enrollmentDate.localeCompare(a.enrollmentDate))
      .map((student) => {
        const courseStartDate = getCourseStartDate(student);

        return {
          studentId: student.id,
          branchId: student.branchId,
          branchName: branchesById.get(student.branchId),
          fullName: student.fullName,
          phone: student.phone,
          courseType: student.courseType,
          enrollmentDate: student.enrollmentDate,
          courseStartDate,
          completionDate: calculateStudentExpiryDate(courseStartDate, COURSE_COMPLETION_DAYS),
          status: student.status,
          learningLicenceNo: student.learningLicenceNo,
          llIssueDate: student.llIssueDate,
          llExpiryDate: student.llExpiryDate,
          drivingLicenceNo: student.drivingLicenceNo
        };
      });

    return {
      newAdmissionsCount: rows.length,
      aboutToStartCount: derivedStudents.filter((student) => student.status === 'about_to_start').length,
      ongoingCount: derivedStudents.filter((student) => student.status === 'ongoing' || student.status === 'extended').length,
      passedCount: derivedStudents.filter((student) => student.status === 'passed').length,
      thirtyDaysCompletedCount: derivedStudents.filter(
        (student) =>
          (student.status === 'ongoing' || student.status === 'extended') &&
          isPastDate(calculateStudentExpiryDate(getCourseStartDate(student), COURSE_COMPLETION_DAYS))
      ).length,
      bothCourseStudentsCount: students.filter((student) => student.courseType === 'both').length,
      heavyVehicleStudentsCount: students.filter((student) => student.courseType === 'HV').length,
      rows
    };
  }
};
