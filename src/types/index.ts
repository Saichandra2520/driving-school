import type { User } from 'firebase/auth';

export type UserRole = 'owner' | 'staff';

export interface Branch {
  id: string;
  name: string;
  nameKey?: string;
  location?: string | null;
  createdAt?: string;
}

export type Profile = {
  id: string;
  fullName: string | null;
  role: UserRole;
  branchId: string | null;
};

export type AuthState = {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  authError: string | null;
};

export type FirebaseUsageMetricKey = 'reads' | 'writes' | 'deletes';

export type FirebaseUsageMetric = {
  used: number;
  limit: number;
  percentUsed: number;
};

export type FirebaseUsageMetrics = {
  quotaDayStart: string;
  quotaDayEnd: string;
  generatedAt: string;
  freshnessNote: string;
  metrics: Record<FirebaseUsageMetricKey, FirebaseUsageMetric>;
};

export type CourseType = '2W' | '4W' | 'HV' | 'both';
export type TrainingCourseType = '2W' | '4W' | 'HV';
export type DrivingTestCourseType = TrainingCourseType;
export type DrivingTestResult = 'pending' | 'pass' | 'fail';
export type DrivingTestStatus = 'not_started' | 'pending' | 'passed' | 'failed';
export type StudentStatus = 'about_to_start' | 'ongoing' | 'passed' | 'extended';

export interface StaffProfile {
  id: string;
  fullName: string | null;
  phone?: string | null;
  email?: string | null;
  role: 'staff';
  branchId: string;
  drivingLicenceNo?: string | null;
  createdAt: string;
  branch?: Branch | null;
}

export interface Student {
  id: string;
  fullName: string;
  phone: string;
  enrollmentDate: string;
  courseStartDate?: string | null;
  courseType: CourseType;
  learningLicenceNo?: string;
  llIssueDate?: string | null;
  llExpiryDate?: string | null;
  drivingLicenceNo?: string;
  dlIssueDate?: string | null;
  dlExpiryDate?: string | null;
  status: StudentStatus;
  branchId: string;
  createdAt: any;
  durationDays: number;
  baseSessionCount?: number;
  baseDurationDays?: number;
  completedAt?: string | null;
  searchTokens?: string[];
}

export interface Installment {
  receiptNo: string;
  amount: number;
  date: string;
  notes?: string;
  source?: 'fee' | 'course_extension';
  courseExtensionId?: string;
  clientPaymentId?: string;
  receiptStatus?: 'pending' | 'finalized';
  syncError?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Fee {
  id: string;
  studentId: string;
  branchId: string;
  totalAmount: number;
  installments: Installment[];
  paidAmount: number;
  balance: number;
  createdAt?: string;
}

export interface PendingPayment {
  id: string;
  studentId: string;
  branchId: string;
  amount: number;
  date: string;
  notes?: string;
  status: 'pending' | 'syncing' | 'failed';
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AddInstallmentPayload {
  amount: number;
  date: string;
  notes?: string;
}

export interface UpdateInstallmentPayload {
  amount: number;
  date: string;
  notes?: string;
}

export interface SessionSlot {
  slotNo: number;
  date: string | null;
  classType: string;
  vehicle?: string;
  instructor?: string;
  notes?: string;
}

export interface TrainingSession {
  id: string;
  studentId: string;
  branchId: string;
  courseType: TrainingCourseType;
  slots: SessionSlot[];
  createdAt?: any;
  updatedAt?: any;
}

export type Session = TrainingSession;

export interface UpdateSessionSlotPayload {
  date: string;
  classType: string;
  vehicle?: string;
  instructor?: string;
  notes?: string;
}

export interface AttendanceFilters {
  branchId?: string | 'all';
  role: 'owner' | 'staff';
  userBranchId?: string;
  courseType?: 'all' | TrainingCourseType;
  search?: string;
  selectedDate?: string;
  view?: 'all' | 'pending' | 'marked' | 'completed' | 'extension_needed';
}

export interface AttendanceRow {
  studentId: string;
  studentName: string;
  phone: string;
  branchId: string;
  branchName?: string;
  courseType: TrainingCourseType;
  sessionId: string;
  completedSessions: number;
  allowedSessions: number;
  remainingSessions: number;
  nextSessionNo: number | null;
  lastClassType?: string;
  lastSessionDate?: string;
  isMarkedOnSelectedDate: boolean;
  selectedDateSessionCount: number;
  selectedDateClassTypes: string[];
  isCompleted: boolean;
}

export interface MarkAttendancePayload {
  date: string;
  classType: string;
  vehicle?: string;
  instructor?: string;
  notes?: string;
}

export interface DrivingTestAttempt {
  attemptNo: number;
  date: string | null;
  result: DrivingTestResult;
  notes?: string;
}

export interface DrivingTest {
  id: string;
  studentId: string;
  branchId: string;
  courseType: DrivingTestCourseType;
  attempts: DrivingTestAttempt[];
  createdAt?: any;
  updatedAt?: any;
}

export type TestAttempt = DrivingTestAttempt;

export interface UpdateDrivingTestAttemptPayload {
  date: string | null;
  result: DrivingTestResult;
  notes?: string;
}

export interface ClassTypes {
  id: string;
  branchId: string;
  courseType: TrainingCourseType;
  classes: string[];
}

export type CourseExtension = {
  id: string;
  studentId: string;
  branchId: string;
  courseType: CourseType;
  extraSessions: number;
  extraDays: number;
  amount: number;
  receiptNo?: string | null;
  paymentDate: string;
  notes?: string;
  createdAt?: string;
};

export type CreateCourseExtensionPayload = {
  studentId: string;
  branchId: string;
  courseType: CourseType;
  extraSessions: number;
  extraDays: number;
  amount: number;
  paymentDate: string;
  notes?: string;
};

export type TrainingEntitlement = {
  baseSessions: number;
  baseDays: number;
  extraSessions: number;
  extraDays: number;
  allowedSessions: number;
  allowedDays: number;
  extensionAmount: number;
};

export type StudentWithFee = Student & {
  branchName?: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  expiryDate: string;
  daysRemaining: number;
  courseStartDate: string;
  fee: Fee | null;
  trainingEntitlement?: TrainingEntitlement;
  extensions?: CourseExtension[];
};

export type CreateStudentPayload = {
  fullName: string;
  phone: string;
  enrollmentDate: string;
  courseStartDate?: string | null;
  courseType: CourseType;
  learningLicenceNo?: string;
  llIssueDate?: string | null;
  llExpiryDate?: string | null;
  drivingLicenceNo?: string;
  dlIssueDate?: string | null;
  dlExpiryDate?: string | null;
  branchId: string;
  totalAmount: number;
};

export type UpdateStudentPayload = {
  fullName?: string;
  phone?: string;
  enrollmentDate?: string;
  courseStartDate?: string | null;
  courseType?: CourseType;
  status?: StudentStatus;
  learningLicenceNo?: string;
  llIssueDate?: string | null;
  llExpiryDate?: string | null;
  drivingLicenceNo?: string;
  dlIssueDate?: string | null;
  dlExpiryDate?: string | null;
  branchId?: string;
  totalAmount?: number;
};

export type CreateBranchPayload = {
  name: string;
  location?: string | null;
};

export type UpdateBranchPayload = CreateBranchPayload;

export type CreateStaffProfilePayload = {
  id: string;
  fullName: string;
  phone: string;
  branchId: string;
};

export type UpdateStaffProfilePayload = {
  fullName: string;
  phone: string;
  branchId: string;
};

export type StaffAccount = StaffProfile & {
  email?: string | null;
};

export type CreateStaffUserPayload = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  branchId: string;
};

export type ResetStaffPasswordPayload = {
  userId: string;
  newPassword: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ExpenseCategory =
  | 'fuel'
  | 'maintenance'
  | 'salary'
  | 'electricity'
  | 'room_rent'
  | 'learning_challan'
  | 'driving_test_challan'
  | 'other';

export interface Expense {
  id: string;
  branchId: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  expenseDate: string;
  staffId?: string;
  studentId?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  branch?: Branch | null;
  staffName?: string;
  studentName?: string;
}

export type CreateExpensePayload = {
  branchId: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  staffId?: string;
  studentId?: string;
  notes?: string;
};

export interface UpdateExpensePayload {
  branchId?: string;
  category?: ExpenseCategory;
  amount?: number;
  date?: string;
  staffId?: string;
  studentId?: string;
  notes?: string;
}

export type ExpenseFilters = {
  branchId?: string | null;
  fromDate?: string;
  toDate?: string;
  category?: ExpenseCategory | 'all';
};

export type ExpenseSummary = {
  totalExpenses: number;
  fuelTotal: number;
  maintenanceTotal: number;
  salaryTotal: number;
  electricityTotal: number;
  roomRentTotal: number;
  learningChallanTotal: number;
  drivingTestChallanTotal: number;
  challanTotal: number;
  rentElectricityTotal: number;
  otherTotal: number;
};

export type DashboardFilters = {
  branchId?: string | null;
  role: UserRole;
  userBranchId?: string | null;
};

export type DashboardSummary = {
  totalStudents: number;
  aboutToStartStudents: number;
  ongoingStudents: number;
  passedStudents: number;
  totalFeeCollected: number;
  todayCollections: number;
  pendingFeeBalance: number;
  totalExpenses: number;
  todayExpenses: number;
  fuelTotal: number;
  maintenanceTotal: number;
  salaryTotal: number;
  rentElectricityTotal: number;
  challanTotal: number;
  otherTotal: number;
  netAmount: number;
};

export type StudentNearExpiry = {
  id: string;
  fullName: string;
  phone: string;
  courseType: CourseType;
  enrollmentDate: string;
  courseStartDate: string;
  expiryDate: string;
  daysRemaining: number;
  status: StudentStatus;
};

export type PendingFeeStudent = {
  studentId: string;
  fullName: string;
  phone: string;
  branchId: string;
  branchName?: string;
  courseType: CourseType;
  totalAmount: number;
  paidAmount: number;
  balance: number;
};

export interface ThirtyDayAlertStudent {
  studentId: string;
  fullName: string;
  phone: string;
  branchId: string;
  branchName?: string;
  courseType: CourseType;
  enrollmentDate: string;
  courseStartDate: string;
  completionDate: string;
  daysRemaining: number;
  alertType: 'near_completion' | 'completed';
}

export interface RecentPayment {
  studentId: string;
  studentName: string;
  branchId: string;
  branchName?: string;
  receiptNo: string;
  amount: number;
  date: string;
  isEdited?: boolean;
  updatedAt?: string;
}

export interface RecentExpense {
  id: string;
  branchId: string;
  branchName?: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes?: string;
}

export interface ReportFilters {
  month: number;
  year: number;
  branchId?: string | 'all';
}

export type BranchSummaryRow = {
  branchId: string;
  branchName: string;
  total: number;
  count: number;
};

export interface FeeCollectionReportRow {
  receiptNo: string;
  date: string;
  branchId: string;
  branchName?: string;
  studentId: string;
  studentName: string;
  phone: string;
  courseType: CourseType;
  amount: number;
  notes?: string;
}

export interface FeeCollectionReport {
  totalCollected: number;
  installmentCount: number;
  averagePaymentAmount: number;
  highestPayment: number;
  lowestPayment: number;
  rows: FeeCollectionReportRow[];
}

export interface PendingFeeReportRow {
  branchId: string;
  branchName?: string;
  studentId: string;
  studentName: string;
  phone: string;
  courseType: CourseType;
  status: StudentStatus;
  totalAmount: number;
  paidAmount: number;
  balance: number;
}

export interface PendingFeeReport {
  totalPendingBalance: number;
  studentsWithBalanceCount: number;
  highestBalance: number;
  averageBalance: number;
  rows: PendingFeeReportRow[];
}

export interface ExpenseReportRow {
  id: string;
  date: string;
  branchId: string;
  branchName?: string;
  category: ExpenseCategory;
  amount: number;
  staffId?: string;
  staffName?: string;
  studentId?: string;
  studentName?: string;
  notes?: string;
}

export interface ExpenseReport {
  totalExpenses: number;
  fuelTotal: number;
  maintenanceTotal: number;
  salaryTotal: number;
  rentElectricityTotal: number;
  challanTotal: number;
  otherTotal: number;
  rows: ExpenseReportRow[];
}

export interface StudentReportRow {
  studentId: string;
  branchId: string;
  branchName?: string;
  fullName: string;
  phone: string;
  courseType: CourseType;
  enrollmentDate: string;
  courseStartDate: string;
  completionDate: string;
  status: StudentStatus;
  learningLicenceNo?: string;
  llIssueDate?: string | null;
  llExpiryDate?: string | null;
  drivingLicenceNo?: string;
}

export interface StudentReport {
  newAdmissionsCount: number;
  aboutToStartCount: number;
  ongoingCount: number;
  passedCount: number;
  thirtyDaysCompletedCount: number;
  bothCourseStudentsCount: number;
  heavyVehicleStudentsCount: number;
  rows: StudentReportRow[];
}

export interface ReceiptData {
  receiptNo: string;
  paymentDate: string;
  amount: number;
  notes?: string;
  student: {
    id: string;
    fullName: string;
    phone: string;
      courseType: CourseType;
      learningLicenceNo?: string;
      llIssueDate?: string | null;
      llExpiryDate?: string | null;
      drivingLicenceNo?: string;
    enrollmentDate: string;
    courseStartDate?: string | null;
  };
  branch: {
    id: string;
    name: string;
    location?: string;
  };
  fee: {
    totalAmount: number;
    paidAmount: number;
    balance: number;
  };
  generatedAt: string;
}

export interface CsvColumn<T = any> {
  header: string;
  accessor: keyof T | ((row: T) => any);
}

export interface BackupScope {
  branchId?: string | 'all';
}

export interface FullBackupData {
  app: string;
  version: string;
  exportedAt: string;
  scope: BackupScope;
  data: {
    branches: any[];
    users: any[];
    students: any[];
    fees: any[];
    sessions: any[];
    drivingTests: any[];
    expenses: any[];
    courseExtensions: any[];
    classTypes: any[];
    counters: any[];
  };
}

export type AlertType =
  | 'thirty_days_completed'
  | 'near_completion'
  | 'pending_fee'
  | 'licence_expiry'
  | 'driving_test_pending';

export type AlertSeverity = 'info' | 'warning' | 'danger';

export interface AppAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  studentId: string;
  studentName: string;
  phone: string;
  branchId: string;
  branchName?: string;
  message: string;
  actionLabel?: string;
  createdFromDate?: string;
  amount?: number;
}

export interface AlertFilters {
  branchId?: string | 'all';
  role: 'owner' | 'staff';
  userBranchId?: string;
}
