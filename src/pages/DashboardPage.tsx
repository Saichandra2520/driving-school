import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
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
import { useCachedSubscription } from '@/hooks/useCachedData';
import { dashboardService, type DashboardData } from '@/services/dashboardService';
import { studentService } from '@/services/studentService';
import { useAlertStore } from '@/store/alertStore';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { cacheTags, createPageCacheKey, invalidatePageCache } from '@/store/pageCacheStore';
import type {
  AlertFilters,
  DashboardFilters,
  ExpenseCategory,
  MonthlyTransaction,
  PendingFeeStudent,
  StudentWithFee
} from '@/types';
import {
  formatCourseType,
  formatCurrency,
  formatDate,
  formatExpenseCategory
} from '@/utils/formatters';
import { getFriendlyErrorMessage } from '@/utils/errors';

const emptySummary = {
  totalStudents: 0,
  aboutToStartStudents: 0,
  ongoingStudents: 0,
  passedStudents: 0,
  totalFeeCollected: 0,
  todayCollections: 0,
  monthlyCollections: 0,
  pendingFeeBalance: 0,
  totalExpenses: 0,
  todayExpenses: 0,
  monthlyExpenses: 0,
  fuelTotal: 0,
  maintenanceTotal: 0,
  salaryTotal: 0,
  rentElectricityTotal: 0,
  challanTotal: 0,
  otherTotal: 0,
  netAmount: 0,
  monthlyNetAmount: 0
};

const emptyDashboard: DashboardData = {
  summary: emptySummary,
  pendingFees: [],
  thirtyDayAlerts: [],
  monthlyTransactions: [],
  recentPayments: [],
  recentExpenses: []
};

export function DashboardPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const alerts = useAlertStore((state) => state.alerts);
  const fetchAlerts = useAlertStore((state) => state.fetchAlerts);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithFee | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
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
  const dashboardCacheKey = useMemo(
    () =>
      createPageCacheKey('dashboard', {
        branchId: filters?.branchId ?? 'all',
        role: filters?.role ?? 'none',
        userBranchId: filters?.userBranchId ?? 'none',
        userId: profile?.id ?? 'anonymous'
      }),
    [filters?.branchId, filters?.role, filters?.userBranchId, profile?.id]
  );
  const dashboardCacheTags = useMemo(
    () => [
      cacheTags.dashboard,
      cacheTags.students,
      cacheTags.fees,
      cacheTags.expenses,
      cacheTags.branch(filters?.branchId ?? 'all'),
      cacheTags.user(profile?.id)
    ],
    [filters?.branchId, profile?.id]
  );
  const subscribeDashboard = useCallback(
    (onNext: (data: DashboardData) => void, onError: (error: Error) => void) => {
      if (!filters) return () => undefined;
      return dashboardService.subscribeDashboardData(filters, onNext, onError);
    },
    [filters]
  );
  const {
    data: cachedDashboard,
    error: dashboardError,
    isLoading,
    setCachedData: setCachedDashboard
  } = useCachedSubscription<DashboardData>({
    cacheKey: dashboardCacheKey,
    enabled: Boolean(filters),
    subscribe: subscribeDashboard,
    tags: dashboardCacheTags
  });
  const dashboard = cachedDashboard ?? emptyDashboard;

  const loadDashboard = useCallback(async (): Promise<void> => {
    if (!filters) return;

    setIsManualRefreshing(true);
    setErrorMessage('');

    try {
      setCachedDashboard(await dashboardService.getDashboardData(filters));
      if (alertFilters) {
        await fetchAlerts(alertFilters);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load dashboard. Please check your connection and try again.'));
    } finally {
      setIsManualRefreshing(false);
    }
  }, [alertFilters, fetchAlerts, filters, setCachedDashboard]);

  useEffect(() => {
    if (!dashboardError) return;

    console.error('Failed to load dashboard:', dashboardError);
    setErrorMessage(getFriendlyErrorMessage(dashboardError, 'Unable to load dashboard. Please check your connection and try again.'));
  }, [dashboardError]);

  useEffect(() => {
    if (alertFilters) void fetchAlerts(alertFilters);
  }, [alertFilters, fetchAlerts]);

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
    invalidatePageCache([
      cacheTags.students,
      cacheTags.fees,
      cacheTags.dashboard,
      cacheTags.payments,
      cacheTags.reports,
      cacheTags.branch(filters?.branchId ?? 'all'),
      cacheTags.user(profile?.id)
    ]);
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
  const openAlertCount = alerts.length;

  return (
    <section className="space-y-5">
      <PageHeader
        title={`${greeting}, ${profile?.fullName || 'there'}`}
        description={branchContext}
        actions={
        <Button type="button" variant="outline" onClick={() => void loadDashboard()} disabled={isLoading || isManualRefreshing}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {isManualRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
        }
      />

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      {isLoading ? (
        <PageLoader label="Loading dashboard..." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active Students" value={String(summary.ongoingStudents)} helper={`${summary.aboutToStartStudents} about to start, ${summary.passedStudents} passed`} />
            <StatCard label="Pending Fees" value={formatCurrency(summary.pendingFeeBalance)} tone={summary.pendingFeeBalance > 0 ? 'danger' : 'good'} />
            <StatCard label="This Month In" value={formatCurrency(summary.monthlyCollections)} helper="Fee collections" tone="good" />
            <StatCard label="This Month Net" value={formatCurrency(summary.monthlyNetAmount)} helper={`${formatCurrency(summary.monthlyExpenses)} expenses, ${openAlertCount} alerts`} tone={summary.monthlyNetAmount >= 0 ? 'good' : 'danger'} />
          </div>

          <div className="grid gap-5">
            <MonthlyTransactionsTable transactions={dashboard.monthlyTransactions} />
            <PendingFeeStudentsTable
              students={dashboard.pendingFees}
              onViewStudent={(studentId) => void handleViewStudent(studentId)}
              isStudentLoading={isStudentLoading}
            />
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

function MonthlyTransactionsTable({ transactions }: { transactions: MonthlyTransaction[] }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Monthly Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <EmptyState title="No transactions this month." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={`${transaction.type}-${transaction.id}`}>
                    <TableCell>{formatDate(transaction.date)}</TableCell>
                    <TableCell>
                      <Badge variant={transaction.type === 'payment' ? 'success' : 'danger'}>
                        {transaction.type === 'payment' ? 'Payment' : 'Expense'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">
                          {transaction.type === 'expense' ? formatExpenseCategory(transaction.title as ExpenseCategory) : transaction.title}
                        </p>
                        {transaction.detail ? <p className="text-xs text-muted-foreground">{transaction.detail}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>{transaction.branchName ?? '-'}</TableCell>
                    <TableCell className={transaction.type === 'payment' ? 'text-right font-medium text-success' : 'text-right font-medium text-danger'}>
                      {transaction.type === 'payment' ? '+' : '-'}{formatCurrency(transaction.amount)}
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.studentId}>
                    <TableCell className="font-medium">{student.fullName}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p>{student.phone}</p>
                        <p className="text-xs text-muted-foreground">{formatCourseType(student.courseType)}</p>
                      </div>
                    </TableCell>
                    <TableCell>{student.branchName ?? '-'}</TableCell>
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
