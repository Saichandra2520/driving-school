import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Eye,
  RefreshCw,
  TrendingUp,
  UsersRound,
  WalletCards
} from 'lucide-react';
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
import { settingsService } from '@/services/settingsService';
import { studentService } from '@/services/studentService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { cacheTags, createPageCacheKey, invalidatePageCache } from '@/store/pageCacheStore';
import type {
  DashboardFilters,
  ExpenseCategory,
  MonthlyTransaction,
  PendingFeeStudent,
  Branch,
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
  const [selectedStudent, setSelectedStudent] = useState<StudentWithFee | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isStudentLoading, setIsStudentLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);

  const filters = useMemo<DashboardFilters | null>(() => {
    if (!profile) return null;

    return {
      role: profile.role,
      userBranchId: profile.branchId,
      branchId: profile.role === 'owner' ? selectedBranchId : profile.branchId
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
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load dashboard. Please check your connection and try again.'));
    } finally {
      setIsManualRefreshing(false);
    }
  }, [filters, setCachedDashboard]);

  useEffect(() => {
    if (!dashboardError) return;

    console.error('Failed to load dashboard:', dashboardError);
    setErrorMessage(getFriendlyErrorMessage(dashboardError, 'Unable to load dashboard. Please check your connection and try again.'));
  }, [dashboardError]);

  useEffect(() => {
    const activeBranchId = filters?.branchId;

    if (!activeBranchId) {
      setActiveBranch(null);
      return;
    }

    let isActive = true;
    void settingsService.getBranchById(activeBranchId)
      .then((branch) => {
        if (isActive) setActiveBranch(branch);
      })
      .catch((error) => {
        console.error(`Failed to load dashboard branch ${activeBranchId}:`, error);
        if (isActive) setActiveBranch(null);
      });

    return () => {
      isActive = false;
    };
  }, [filters?.branchId]);

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
      ? `Showing: ${activeBranch?.name ?? 'Selected Branch'}`
      : 'Showing: All Branches'
    : `Showing: ${activeBranch?.name ?? 'Assigned Branch'}`;

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
        <PageHeader
          eyebrow="Dashboard"
          title={`${greeting}, ${profile?.fullName || 'there'}`}
          description={branchContext}
          actions={
            <Button type="button" variant="outline" onClick={() => void loadDashboard()} disabled={isLoading || isManualRefreshing}>
              <RefreshCw className={isManualRefreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} aria-hidden="true" />
              {isManualRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          }
        />
      </div>

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      {isLoading ? (
        <PageLoader label="Loading dashboard..." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active Students"
              value={String(summary.ongoingStudents)}
              helper={`${summary.aboutToStartStudents} about to start, ${summary.passedStudents} passed`}
              icon={<UsersRound className="h-4 w-4" aria-hidden="true" />}
            />
            <StatCard
              label="Pending Fees"
              value={formatCurrency(summary.pendingFeeBalance)}
              helper={`${dashboard.pendingFees.length} students need follow-up`}
              tone={summary.pendingFeeBalance > 0 ? 'danger' : 'good'}
              icon={<WalletCards className="h-4 w-4" aria-hidden="true" />}
            />
            <StatCard
              label="This Month In"
              value={formatCurrency(summary.monthlyCollections)}
              helper={`${formatCurrency(summary.todayCollections)} collected today`}
              tone="good"
              icon={<ArrowDownLeft className="h-4 w-4" aria-hidden="true" />}
            />
            <StatCard
              label="This Month Net"
              value={formatCurrency(summary.monthlyNetAmount)}
              helper={`${formatCurrency(summary.monthlyExpenses)} expenses this month`}
              tone={summary.monthlyNetAmount >= 0 ? 'good' : 'danger'}
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <DashboardMetric
              icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
              label="Total Fee Collected"
              value={formatCurrency(summary.totalFeeCollected)}
              detail={`${formatCurrency(summary.todayCollections)} today`}
              tone="good"
            />
            <DashboardMetric
              icon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
              label="Total Expenses"
              value={formatCurrency(summary.totalExpenses)}
              detail={`${formatCurrency(summary.todayExpenses)} today`}
              tone="danger"
            />
          </div>

          <div className="space-y-5">
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

function DashboardMetric({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'warning' | 'danger';
}): JSX.Element {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
            tone === 'good' ? 'border-green-200 bg-green-50 text-success' : '',
            tone === 'warning' ? 'border-amber-200 bg-amber-50 text-warning' : '',
            tone === 'danger' ? 'border-red-200 bg-red-50 text-danger' : ''
          ].join(' ')}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold text-main-text">{value}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyTransactionsTable({ transactions }: { transactions: MonthlyTransaction[] }): JSX.Element {
  const columns = splitIntoColumns(transactions);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4 border-b bg-muted/20 p-4">
        <div>
          <CardTitle className="text-lg">Monthly Transactions</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Payments and expenses recorded this month.</p>
        </div>
        <Badge variant="slate">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {transactions.length} entries
        </Badge>
      </CardHeader>
      <CardContent className="p-4">
        {transactions.length === 0 ? (
          <EmptyState title="No transactions this month." description="Payments and expenses will appear here after they are recorded." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {columns.filter((column) => column.length > 0).map((column, columnIndex) => (
              <div key={columnIndex} className="overflow-hidden rounded-md border">
                {column.map((transaction) => (
                  <div
                    key={`${transaction.type}-${transaction.id}`}
                    className="flex items-start justify-between gap-4 border-b p-3 last:border-b-0 hover:bg-blue-50/60"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={transaction.type === 'payment' ? 'success' : 'danger'}>
                          {transaction.type === 'payment' ? 'Payment' : 'Expense'}
                        </Badge>
                        <span className="text-xs font-medium text-muted-foreground">{formatDate(transaction.date)}</span>
                        <span className="text-xs text-muted-foreground">{transaction.branchName ?? '-'}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-main-text">
                          {transaction.type === 'expense' ? formatExpenseCategory(transaction.title as ExpenseCategory) : transaction.title}
                        </p>
                        {transaction.detail ? <p className="truncate text-xs text-muted-foreground">{transaction.detail}</p> : null}
                      </div>
                    </div>
                    <p className={transaction.type === 'payment' ? 'shrink-0 whitespace-nowrap font-semibold text-success' : 'shrink-0 whitespace-nowrap font-semibold text-danger'}>
                      {transaction.type === 'payment' ? '+' : '-'}{formatCurrency(transaction.amount)}
                    </p>
                  </div>
                ))}
              </div>
            ))}
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
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4 border-b bg-muted/20 p-4">
        <div>
          <CardTitle className="text-lg">Pending Fees</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Students with remaining course balances.</p>
        </div>
        <Badge variant={students.length > 0 ? 'danger' : 'success'}>{students.length} pending</Badge>
      </CardHeader>
      <CardContent className="p-4">
        {students.length === 0 ? (
          <EmptyState title="No pending fee students." description="All visible student fee balances are currently settled." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
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
                    <TableCell className="min-w-44 font-medium">{student.fullName}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p>{student.phone}</p>
                        <p className="text-xs text-muted-foreground">{formatCourseType(student.courseType)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{student.branchName ?? '-'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold text-danger">{formatCurrency(student.balance)}</TableCell>
                    <TableCell className="text-right">
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

function splitIntoColumns<T>(items: T[]): [T[], T[]] {
  const midpoint = Math.ceil(items.length / 2);
  return [items.slice(0, midpoint), items.slice(midpoint)];
}
