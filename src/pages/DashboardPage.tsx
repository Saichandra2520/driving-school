import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, CreditCard, Eye, FileWarning, Plus, ReceiptText, RefreshCw } from 'lucide-react';
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
  PendingFeeStudent,
  StudentWithFee,
  ThirtyDayAlertStudent
} from '@/types';
import {
  formatCourseType,
  formatCurrency,
  formatDate
} from '@/utils/formatters';
import { getFriendlyErrorMessage } from '@/utils/errors';

const emptySummary = {
  totalStudents: 0,
  aboutToStartStudents: 0,
  ongoingStudents: 0,
  passedStudents: 0,
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
      const [summary, pendingFees, thirtyDayAlerts, recentPayments, recentExpenses] = await Promise.all([
        dashboardService.getDashboardSummary(filters),
        dashboardService.getPendingFeeStudents(filters),
        dashboardService.getThirtyDayAlerts(filters),
        dashboardService.getRecentPayments(filters),
        dashboardService.getRecentExpenses(filters)
      ]);

      setCachedDashboard({ summary, pendingFees, thirtyDayAlerts, recentPayments, recentExpenses });
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <StatCard label="Active Students" value={String(summary.ongoingStudents)} helper={`${summary.aboutToStartStudents} about to start, ${summary.passedStudents} passed`} />
            <StatCard label="Pending Fees" value={formatCurrency(summary.pendingFeeBalance)} tone={summary.pendingFeeBalance > 0 ? 'danger' : 'good'} />
            <StatCard label="Today's Collections" value={formatCurrency(summary.todayCollections)} helper="Payments dated today" tone="good" />
            <StatCard label="Today's Expenses" value={formatCurrency(summary.todayExpenses)} helper="Expenses dated today" tone="danger" />
            <StatCard label="Open Alerts" value={String(alertCounts.total)} helper={`${alertCounts.pendingFee} fee, ${alertCounts.drivingTestPending} test`} tone={alertCounts.total > 0 ? 'warning' : 'default'} />
            <StatCard label="Net Amount" value={formatCurrency(summary.netAmount)} tone={summary.netAmount >= 0 ? 'good' : 'danger'} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Needs Attention</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <AttentionItem
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Pending fee students"
                  value={dashboard.pendingFees.length}
                  tone={dashboard.pendingFees.length > 0 ? 'danger' : 'good'}
                />
                <AttentionItem
                  icon={<ClipboardCheck className="h-4 w-4" />}
                  label="Training due"
                  value={dashboard.thirtyDayAlerts.length}
                  tone={dashboard.thirtyDayAlerts.length > 0 ? 'warning' : 'good'}
                />
                <AttentionItem
                  icon={<FileWarning className="h-4 w-4" />}
                  label="Licence expiry"
                  value={alertCounts.licenceExpiry}
                  tone={alertCounts.licenceExpiry > 0 ? 'warning' : 'good'}
                />
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <ActionCard title="Add Student" description="Create admission" icon={<Plus className="h-5 w-5" />} onClick={() => navigate('/students')} />
              <ActionCard title="Mark Attendance" description="Open today's list" icon={<ClipboardCheck className="h-5 w-5" />} onClick={() => navigate('/attendance')} />
              <ActionCard title="Record Payment" description="Save receipt" icon={<CreditCard className="h-5 w-5" />} onClick={() => navigate('/payments')} />
              <ActionCard title="Add Expense" description="Record spending" icon={<ReceiptText className="h-5 w-5" />} onClick={() => navigate('/expenses')} />
            </div>
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

function AttentionItem({
  icon,
  label,
  value,
  tone
}: {
  icon: JSX.Element;
  label: string;
  value: number;
  tone: 'good' | 'warning' | 'danger';
}): JSX.Element {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span
          className={
            tone === 'danger'
              ? 'text-danger'
              : tone === 'warning'
                ? 'text-warning'
                : 'text-success'
          }
        >
          {value > 0 ? icon : <CheckCircle2 className="h-4 w-4" />}
        </span>
        <p className="text-sm">{label}</p>
      </div>
      <p
        className={
          tone === 'danger'
            ? 'mt-2 text-2xl font-semibold text-danger'
            : tone === 'warning'
              ? 'mt-2 text-2xl font-semibold text-warning'
              : 'mt-2 text-2xl font-semibold text-success'
        }
      >
        {value}
      </p>
    </div>
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
        <CardTitle className="text-lg">Training Completion Alerts</CardTitle>
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
                  <TableHead>Course Start Date</TableHead>
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
                    <TableCell>{formatDate(student.courseStartDate)}</TableCell>
                    <TableCell>{formatDate(student.completionDate)}</TableCell>
                    <TableCell>{formatDays(student.daysRemaining)}</TableCell>
                    <TableCell>
                      <Badge variant={student.alertType === 'completed' ? 'warning' : 'secondary'}>
                        {student.alertType === 'completed' ? 'Training Completed' : 'Near Completion'}
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
