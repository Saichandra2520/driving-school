import { where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection } from '@/services/firestoreUtils';
import { calculateStudentExpiryDate } from '@/utils/dateUtils';
import { arrayToCsv, downloadCsvFile } from '@/utils/csv';
import { formatCourseType, formatExpenseCategory, formatStudentStatus } from '@/utils/formatters';
import type {
  BackupScope,
  Branch,
  Expense,
  ExpenseReport,
  Fee,
  FeeCollectionReport,
  PendingFeeReport,
  Profile,
  StaffProfile,
  Student,
  StudentReport
} from '@/types';

type StaffExportRow = Profile &
  Partial<StaffProfile> & {
    email?: string;
  };

function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}

function reportSuffix(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}-${year}`;
}

function effectiveBranchId(scope?: BackupScope): string | undefined {
  return scope?.branchId && scope.branchId !== 'all' ? scope.branchId : undefined;
}

async function assertOwner(): Promise<void> {
  const { profile } = await authService.getCurrentUser();
  if (profile?.role !== 'owner') {
    throw new Error('Access denied. Owner only.');
  }
}

function branchName(branches: Branch[], branchId: string): string {
  return branches.find((branch) => branch.id === branchId)?.name ?? branchId;
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

export const exportService = {
  exportFeeCollectionReportCsv(report: FeeCollectionReport, month: number, year: number): boolean {
    if (report.rows.length === 0) return false;

    const csv = arrayToCsv(report.rows, [
      { header: 'Date', accessor: 'date' },
      { header: 'Receipt No', accessor: 'receiptNo' },
      { header: 'Branch', accessor: (row) => row.branchName ?? row.branchId },
      { header: 'Student Name', accessor: 'studentName' },
      { header: 'Phone', accessor: 'phone' },
      { header: 'Course', accessor: (row) => formatCourseType(row.courseType) },
      { header: 'Amount', accessor: 'amount' },
      { header: 'Notes', accessor: (row) => row.notes ?? '' }
    ]);
    downloadCsvFile(csv, `fee-collection-report-${reportSuffix(month, year)}.csv`);
    return true;
  },

  exportPendingFeeReportCsv(report: PendingFeeReport, month: number, year: number): boolean {
    if (report.rows.length === 0) return false;

    const csv = arrayToCsv(report.rows, [
      { header: 'Branch', accessor: (row) => row.branchName ?? row.branchId },
      { header: 'Student Name', accessor: 'studentName' },
      { header: 'Phone', accessor: 'phone' },
      { header: 'Course', accessor: (row) => formatCourseType(row.courseType) },
      { header: 'Status', accessor: (row) => formatStudentStatus(row.status) },
      { header: 'Total Fee', accessor: 'totalAmount' },
      { header: 'Paid Amount', accessor: 'paidAmount' },
      { header: 'Balance', accessor: 'balance' }
    ]);
    downloadCsvFile(csv, `pending-fee-report-${reportSuffix(month, year)}.csv`);
    return true;
  },

  exportExpenseReportCsv(report: ExpenseReport, month: number, year: number): boolean {
    if (report.rows.length === 0) return false;

    const csv = arrayToCsv(report.rows, [
      { header: 'Date', accessor: 'date' },
      { header: 'Branch', accessor: (row) => row.branchName ?? row.branchId },
      { header: 'Category', accessor: (row) => formatExpenseCategory(row.category) },
      { header: 'Amount', accessor: 'amount' },
      { header: 'Staff', accessor: (row) => row.staffName ?? '' },
      { header: 'Student', accessor: (row) => row.studentName ?? '' },
      { header: 'Notes', accessor: (row) => row.notes ?? '' }
    ]);
    downloadCsvFile(csv, `expense-report-${reportSuffix(month, year)}.csv`);
    return true;
  },

  exportStudentReportCsv(report: StudentReport, month: number, year: number): boolean {
    if (report.rows.length === 0) return false;

    const csv = arrayToCsv(report.rows, [
      { header: 'Branch', accessor: (row) => row.branchName ?? row.branchId },
      { header: 'Student Name', accessor: 'fullName' },
      { header: 'Phone', accessor: 'phone' },
      { header: 'Course', accessor: (row) => formatCourseType(row.courseType) },
      { header: 'Enrollment Date', accessor: 'enrollmentDate' },
      { header: '30-Day Completion Date', accessor: 'completionDate' },
      { header: 'Status', accessor: (row) => formatStudentStatus(row.status) },
      { header: 'Learning Licence No', accessor: (row) => row.learningLicenceNo ?? '' },
      { header: 'Driving Licence No', accessor: (row) => row.drivingLicenceNo ?? '' }
    ]);
    downloadCsvFile(csv, `student-report-${reportSuffix(month, year)}.csv`);
    return true;
  },

  async exportStudentsCsv(scope: BackupScope = { branchId: 'all' }): Promise<boolean> {
    await assertOwner();
    const branchId = effectiveBranchId(scope);
    const [branches, students, feesRaw] = await Promise.all([
      getCollection<Branch>(collections.branches),
      getCollection<Student>(collections.students, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
      getCollection<Fee>(collections.fees, [...(branchId ? [where('branchId', '==', branchId)] : [])])
    ]);
    if (students.length === 0) return false;

    const feesByStudent = new Map(feesRaw.map((fee) => [fee.studentId, normalizeFee(fee)]));
    const rows = students.map((student) => {
      const fee = feesByStudent.get(student.id);
      const completionDate = calculateStudentExpiryDate(student.enrollmentDate, student.durationDays ?? 30);

      return {
        branch: branchName(branches, student.branchId),
        studentName: student.fullName,
        phone: student.phone,
        course: formatCourseType(student.courseType),
        enrollmentDate: student.enrollmentDate,
        completionDate,
        status: formatStudentStatus(student.status),
        learningLicenceNo: student.learningLicenceNo ?? '',
        drivingLicenceNo: student.drivingLicenceNo ?? '',
        dlIssueDate: student.dlIssueDate ?? '',
        dlExpiryDate: student.dlExpiryDate ?? '',
        totalFee: Number(fee?.totalAmount ?? 0),
        paidAmount: Number(fee?.paidAmount ?? 0),
        balance: Number(fee?.balance ?? 0)
      };
    });

    const csv = arrayToCsv(rows, [
      { header: 'Branch', accessor: 'branch' },
      { header: 'Student Name', accessor: 'studentName' },
      { header: 'Phone', accessor: 'phone' },
      { header: 'Course', accessor: 'course' },
      { header: 'Enrollment Date', accessor: 'enrollmentDate' },
      { header: '30-Day Completion Date', accessor: 'completionDate' },
      { header: 'Status', accessor: 'status' },
      { header: 'Learning Licence No', accessor: 'learningLicenceNo' },
      { header: 'Driving Licence No', accessor: 'drivingLicenceNo' },
      { header: 'DL Issue Date', accessor: 'dlIssueDate' },
      { header: 'DL Expiry Date', accessor: 'dlExpiryDate' },
      { header: 'Total Fee', accessor: 'totalFee' },
      { header: 'Paid Amount', accessor: 'paidAmount' },
      { header: 'Balance', accessor: 'balance' }
    ]);
    downloadCsvFile(csv, `students-export-${todayForFilename()}.csv`);
    return true;
  },

  async exportExpensesCsv(scope: BackupScope = { branchId: 'all' }): Promise<boolean> {
    await assertOwner();
    const branchId = effectiveBranchId(scope);
    const [branches, expenses, staffProfiles, students] = await Promise.all([
      getCollection<Branch>(collections.branches),
      getCollection<Expense>(collections.expenses, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
      getCollection<Profile>(collections.users),
      getCollection<Student>(collections.students)
    ]);
    if (expenses.length === 0) return false;

    const staffById = new Map(staffProfiles.map((staff) => [staff.id, staff.fullName ?? '']));
    const studentsById = new Map(students.map((student) => [student.id, student.fullName]));
    const rows = expenses
      .map((expense) => ({ ...expense, date: expense.date ?? expense.expenseDate }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((expense) => ({
        branch: branchName(branches, expense.branchId),
        date: expense.date,
        category: formatExpenseCategory(expense.category),
        amount: Number(expense.amount ?? 0),
        staff: expense.staffId ? staffById.get(expense.staffId) ?? '' : '',
        student: expense.studentId ? studentsById.get(expense.studentId) ?? '' : '',
        notes: expense.notes ?? ''
      }));

    const csv = arrayToCsv(rows, [
      { header: 'Branch', accessor: 'branch' },
      { header: 'Date', accessor: 'date' },
      { header: 'Category', accessor: 'category' },
      { header: 'Amount', accessor: 'amount' },
      { header: 'Staff', accessor: 'staff' },
      { header: 'Student', accessor: 'student' },
      { header: 'Notes', accessor: 'notes' }
    ]);
    downloadCsvFile(csv, `expenses-export-${todayForFilename()}.csv`);
    return true;
  },

  async exportStaffCsv(scope: BackupScope = { branchId: 'all' }): Promise<boolean> {
    await assertOwner();
    const branchId = effectiveBranchId(scope);
    const [branches, users] = await Promise.all([
      getCollection<Branch>(collections.branches),
      getCollection<StaffExportRow>(collections.users)
    ]);
    const staff = users
      .filter((user) => user.role === 'staff')
      .filter((user) => !branchId || user.branchId === branchId)
      .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
    if (staff.length === 0) return false;

    const rows = staff.map((user) => ({
      branch: user.branchId ? branchName(branches, user.branchId) : '',
      staffName: user.fullName ?? '',
      phone: user.phone ?? '',
      email: user.email ?? '',
      drivingLicenceNo: user.drivingLicenceNo ?? '',
      role: user.role,
      createdAt: user.createdAt ?? ''
    }));

    const csv = arrayToCsv(rows, [
      { header: 'Branch', accessor: 'branch' },
      { header: 'Staff Name', accessor: 'staffName' },
      { header: 'Phone', accessor: 'phone' },
      { header: 'Email', accessor: 'email' },
      { header: 'Driving Licence No', accessor: 'drivingLicenceNo' },
      { header: 'Role', accessor: 'role' },
      { header: 'Created At', accessor: 'createdAt' }
    ]);
    downloadCsvFile(csv, `staff-export-${todayForFilename()}.csv`);
    return true;
  }
};
