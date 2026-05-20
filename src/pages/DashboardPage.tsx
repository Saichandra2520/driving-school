import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, CreditCard, Eye, Plus, ReceiptText, RefreshCw } from 'lucide-react';
import { ActionCard } from '@/components/common/ActionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/PageLoader';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StudentDetails } from '@/components/students/StudentDetails';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dashboardService } from '@/services/dashboardService';
import { studentService } from '@/services/studentService';
import { useAlertStore } from '@/store/alertStore';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import type {
  AlertFilters,
  DashboardFilters,
  DashboardSummary,
  PendingFeeStudent,
  RecentExpense,
  RecentPayment,
  StudentWithFee,
  ThirtyDayAlertStudent
} from '@/types';
import {
  formatCourseType,
  formatCurrency,
  formatDate,
  formatExpenseCategory
} from '@/utils/formatters';
import { getFriendlyErrorMessage } from '@/utils/errors';

type DashboardData = {
  summary: DashboardSummary;
  pendingFees: PendingFeeStudent[];
  thirtyDayAlerts: ThirtyDayAlertStudent[];
  recentPayments: RecentPayment[];
  recentExpenses: RecentExpense[];
};

const emptySummary: DashboardSummary = {
  totalStudents: 0,
  ongoingStudents: 0,
  passedStudents: 0,
  droppedStudents: 0,
  totalFeeCollected: 0,
  todayCollections: 0,
  pendingFeeBalance: 0,
  totalExpenses: 0,
  todayExpenses: 0,
  fuelTotal: 0,
  maintenanceTotal: 0,
  salaryTotal: 0,
  rentElectricityTotal: 0,
  challanTotal: 0,
  otherTotal: 0,
  netAmount: 0
};

const emptyDashboard: DashboardData = {
  summary: emptySummary,
  pendingFees: [],
  thirtyDayAlerts: [],
  recentPayments: [],
  recentExpenses: []
};

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const profile = useAuthStore((state) => state.profile);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const alerts = useAlertStore((state) => state.alerts);
  const fetchAlerts = useAlertStore((state) => state.fetchAlerts);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithFee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStudentLoading, setIsStudentLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const filters = useMemo<DashboardFilters | null>(() => {
    if (!profile) return null;

    return {
      role: profile.role,
      userBranchId: profile.branchId,
      branchId: profile.role === 'owner' ? selectedBranchId : profile.branchId
    };
  }, [profile, selectedBranchId]);

  const alertFilters = useMemo<AlertFilters | null>(() => {
    if (!profile) return null;

    return {
      role: profile.role,
      userBranchId: profile.branchId ?? undefined,
      branchId: profile.role === 'owner' ? selectedBranchId ?? 'all' : profile.branchId ?? undefined
    };
  }, [profile, selectedBranchId]);

  const loadDashboard = useCallback(async (): Promise<void> => {
    if (!filters) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const [summary, pendingFees, thirtyDayAlerts, recentPayments, recentExpenses] = await Promise.all([
        dashboardService.getDashboardSummary(filters),
        dashboardService.getPendingFeeStudents(filters),
        dashboardService.getThirtyDayAlerts(filters),
        dashboardService.getRecentPayments(filters),
        dashboardService.getRecentExpenses(filters)
      ]);

      setDashboard({ summary, pendingFees, thirtyDayAlerts, recentPayments, recentExpenses });
      if (alertFilters) {
        await fetchAlerts(alertFilters);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load dashboard. Please check your connection and try again.'));
      setDashboard(emptyDashboard);
    } finally {
      setIsLoading(false);
    }
  }, [alertFilters, fetchAlerts, filters]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleViewStudent = async (studentId: string): Promise<void> => {
    setIsStudentLoading(true);
    setErrorMessage('');

    try {
      const student = await studentService.getStudentById(studentId);
      if (!student) throw new Error('Student not found.');
      setSelectedStudent(student);
    } catch {
      setErrorMessage('Unable to open student details. Please try again.');
    } finally {
      setIsStudentLoading(false);
    }
  };

  const handleDetailsChanged = async (): Promise<void> => {
    await loadDashboard();
    if (selectedStudent) {
      const student = await studentService.getStudentById(selectedStudent.id);
      setSelectedStudent(student);
    }
  };

  const summary = dashboard.summary;
  const greeting = getGreeting();
  const branchContext = profile?.role === 'owner'
    ? selectedBranchId
      ? 'Showing: Selected Branch'
      : 'Showing: All Branches'
    : 'Showing: Assigned Branch';
  const alertCounts = useMemo(
    () => ({
      total: alerts.length,
      completed: alerts.filter((alert) => alert.type === 'thirty_days_completed').length,
      pendingFee: alerts.filter((alert) => alert.type === 'pending_fee').length,
      licenceExpiry: alerts.filter((alert) => alert.type === 'licence_expiry').length,
      drivingTestPending: alerts.filter((alert) => alert.type === 'driving_test_pending').length
    }),
    [alerts]
  );

  return (
    <section className="space-y-5">
      <PageHeader
        title={`${greeting}, ${profile?.fullName || 'there'}`}
        description={branchContext}
        actions={
        <Button type="button" variant="outline" onClick={() => void loadDashboard()} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
        }
      />

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      {isLoading ? (
        <PageLoader label="Loading dashboard..." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <StatCard label="Total Students" value={String(summary.totalStudents)} helper={`${summary.ongoingStudents} ongoing`} />
            <StatCard label="Pending Fees" value={formatCurrency(summary.pendingFeeBalance)} tone={summary.pendingFeeBalance > 0 ? 'danger' : 'good'} />
            <StatCard label="Today's Collections" value={formatCurrency(summary.todayCollections)} helper="Payments dated today" tone="good" />
            <StatCard label="Today's Expenses" value={formatCurrency(summary.todayExpenses)} helper="Expenses dated today" tone="danger" />
            <StatCard label="30-Day Alerts" value={String(alertCounts.completed)} tone={alertCounts.completed > 0 ? 'warning' : 'default'} />
            <StatCard label="Net Amount" value={formatCurrency(summary.netAmount)} tone={summary.netAmount >= 0 ? 'good' : 'danger'} />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ActionCard title="Add Student" description="Create a new admission record" icon={<Plus className="h-5 w-5" />} onClick={() => navigate('/students')} />
            <ActionCard title="Mark Attendance" description="Open today's training list" icon={<ClipboardCheck className="h-5 w-5" />} onClick={() => navigate('/attendance')} />
            <ActionCard title="Record Payment" description="Save an installment and receipt" icon={<CreditCard className="h-5 w-5" />} onClick={() => navigate('/payments')} />
            <ActionCard title="Add Expense" description="Record fuel, salary, rent, or challan" icon={<ReceiptText className="h-5 w-5" />} onClick={() => navigate('/expenses')} />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <ExpenseCard label="Fuel" amount={summary.fuelTotal} />
            <ExpenseCard label="Maintenance" amount={summary.maintenanceTotal} />
            <ExpenseCard label="Salary" amount={summary.salaryTotal} />
            <ExpenseCard label="Rent + Electricity" amount={summary.rentElectricityTotal} />
            <ExpenseCard label="Challans" amount={summary.challanTotal} />
            <ExpenseCard label="Other" amount={summary.otherTotal} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <PendingFeeStudentsTable
              students={dashboard.pendingFees}
              onViewStudent={(studentId) => void handleViewStudent(studentId)}
              isStudentLoading={isStudentLoading}
            />
            <ThirtyDayAlertsTable
              students={dashboard.thirtyDayAlerts}
              onViewStudent={(studentId) => void handleViewStudent(studentId)}
              isStudentLoading={isStudentLoading}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <RecentPaymentsTable payments={dashboard.recentPayments} />
            <RecentExpensesTable expenses={dashboard.recentExpenses} />
          </div>
        </>
      )}

      <Dialog open={selectedStudent !== null} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        {selectedStudent ? (
          <DialogContent className="max-w-3xl" onClose={() => setSelectedStudent(null)}>
            <DialogHeader>
              <DialogTitle>{selectedStudent.fullName}</DialogTitle>
              <DialogDescription>Student admission, licence, training, and fee summary.</DialogDescription>
            </DialogHeader>
            <StudentDetails
              student={selectedStudent}
              onFeeChanged={() => void handleDetailsChanged()}
              onStudentChanged={() => void handleDetailsChanged()}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default'
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}): JSX.Element {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={
            tone === 'positive'
              ? 'mt-1 text-xl font-semibold text-success'
              : tone === 'negative'
                ? 'mt-1 text-xl font-semibold text-danger'
                : 'mt-1 text-xl font-semibold'
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ExpenseCard({ label, amount }: { label: string; amount: number }): JSX.Element {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-base font-semibold">{formatCurrency(amount)}</p>
      </CardContent>
    </Card>
  );
}

function PendingFeeStudentsTable({
  students,
  onViewStudent,
  isStudentLoading
}: {
  students: PendingFeeStudent[];
  onViewStudent: (studentId: string) => void;
  isStudentLoading: boolean;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pending Fee Students</CardTitle>
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <EmptyState title="No pending fee students." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Total Fee</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell className="font-medium">{student.fullName}</TableCell>
                    <TableCell>{student.phone}</TableCell>
                    <TableCell>{student.branchName ?? '-'}</TableCell>
                    <TableCell>{formatCourseType(student.courseType)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(student.totalAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(student.paidAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(student.balance)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onViewStudent(student.studentId)}
                        disabled={isStudentLoading}
                      >
                        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                        View Student
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThirtyDayAlertsTable({
  students,
  onViewStudent,
  isStudentLoading
}: {
  students: ThirtyDayAlertStudent[];
  onViewStudent: (studentId: string) => void;
  isStudentLoading: boolean;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">30-Day Training Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <EmptyState title="No training completion alerts." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Enrollment Date</TableHead>
                  <TableHead>Completion Date</TableHead>
                  <TableHead>Days Left / Overdue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell className="font-medium">{student.fullName}</TableCell>
                    <TableCell>{student.phone}</TableCell>
                    <TableCell>{student.branchName ?? '-'}</TableCell>
                    <TableCell>{formatCourseType(student.courseType)}</TableCell>
                    <TableCell>{formatDate(student.enrollmentDate)}</TableCell>
                    <TableCell>{formatDate(student.completionDate)}</TableCell>
                    <TableCell>{formatDays(student.daysRemaining)}</TableCell>
                    <TableCell>
                      <Badge variant={student.alertType === 'completed' ? 'warning' : 'secondary'}>
                        {student.alertType === 'completed' ? '30 Days Completed' : 'Near Completion'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onViewStudent(student.studentId)}
                        disabled={isStudentLoading}
                      >
                        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                        View Student
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentPaymentsTable({ payments }: { payments: RecentPayment[] }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <EmptyState title="No recent payments." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={`${payment.studentId}-${payment.receiptNo}`}>
                    <TableCell>{formatDate(payment.date)}</TableCell>
                    <TableCell className="font-medium">{payment.receiptNo}</TableCell>
                    <TableCell>{payment.studentName}</TableCell>
                    <TableCell>{payment.branchName ?? '-'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentExpensesTable({ expenses }: { expenses: RecentExpense[] }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Expenses</CardTitle>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState title="No recent expenses." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>{formatDate(expense.date)}</TableCell>
                    <TableCell>{formatExpenseCategory(expense.category)}</TableCell>
                    <TableCell>{expense.branchName ?? '-'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                    <TableCell>{expense.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDays(daysRemaining: number): string {
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} days overdue`;
  if (daysRemaining === 0) return 'Today';
  return `${daysRemaining} days left`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
