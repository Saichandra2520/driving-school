import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Clock3, CreditCard, ReceiptText, Save, Search, WalletCards } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard } from '@/components/common/StatCard';
import { DownloadReceiptButton } from '@/components/receipts/DownloadReceiptButton';
import { ShareReceiptPdfButton } from '@/components/receipts/ShareReceiptPdfButton';
import { WhatsAppReceiptButton } from '@/components/receipts/WhatsAppReceiptButton';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCachedAsync, useCachedSubscription } from '@/hooks/useCachedData';
import { dashboardService } from '@/services/dashboardService';
import { feeService } from '@/services/feeService';
import { getInstallmentReceiptLabel, isPendingInstallment, pendingPaymentService } from '@/services/pendingPaymentService';
import { studentService } from '@/services/studentService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { cacheTags, createPageCacheKey, invalidatePageCache } from '@/store/pageCacheStore';
import { useSyncStore } from '@/store/syncStore';
import type { DashboardFilters, Fee, Installment, RecentPayment, StudentWithFee } from '@/types';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { INDIAN_CURRENCY_SYMBOL, formatCourseType, formatCurrency, formatDate, formatPhoneNumber } from '@/utils/formatters';

function getTodayDateInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

export function PaymentsPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const isOnline = useSyncStore((state) => state.isOnline);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<StudentWithFee[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithFee | null>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [pendingPayments, setPendingPayments] = useState(pendingPaymentService.getAll());
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayDateInputValue);
  const [notes, setNotes] = useState('');
  const [lastReceiptNo, setLastReceiptNo] = useState('');
  const [receiptStudent, setReceiptStudent] = useState<StudentWithFee | null>(null);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const activeBranchId = profile?.role === 'staff' ? profile.branchId : selectedBranchId;
  const hasPendingPaymentStudents = students.length > 0;
  const hasPaymentWorkspace = hasPendingPaymentStudents || Boolean(selectedStudent);
  const canRecordPayment = Boolean(selectedStudent && selectedStudent.balance > 0);
  const dashboardFilters = useMemo<DashboardFilters | null>(() => {
    if (!profile) return null;
    return {
      role: profile.role,
      userBranchId: profile.branchId,
      branchId: profile.role === 'owner' ? selectedBranchId : profile.branchId
    };
  }, [profile, selectedBranchId]);
  const paymentStudentsCacheKey = useMemo(
    () =>
      createPageCacheKey('payments-students', {
        branchId: activeBranchId ?? 'all',
        search,
        userId: profile?.id ?? 'anonymous'
      }),
    [activeBranchId, profile?.id, search]
  );
  const recentPaymentsCacheKey = useMemo(
    () =>
      createPageCacheKey('payments-recent', {
        branchId: dashboardFilters?.branchId ?? 'all',
        role: dashboardFilters?.role ?? 'none',
        userId: profile?.id ?? 'anonymous'
      }),
    [dashboardFilters?.branchId, dashboardFilters?.role, profile?.id]
  );
  const paymentsCacheTags = useMemo(
    () => [
      cacheTags.payments,
      cacheTags.students,
      cacheTags.fees,
      cacheTags.branch(activeBranchId ?? 'all'),
      cacheTags.user(profile?.id)
    ],
    [activeBranchId, profile?.id]
  );
  const recentPaymentsTags = useMemo(
    () => [
      cacheTags.payments,
      cacheTags.fees,
      cacheTags.dashboard,
      cacheTags.branch(dashboardFilters?.branchId ?? 'all'),
      cacheTags.user(profile?.id)
    ],
    [dashboardFilters?.branchId, profile?.id]
  );

  const subscribePaymentStudents = useCallback(
    (onNext: (rows: StudentWithFee[]) => void, onError: (error: Error) => void) =>
      studentService.subscribeStudents(
        { branchId: activeBranchId, search },
        (studentRows) => {
          const filteredRows = studentRows.filter((student) => (student.status === 'about_to_start' || student.status === 'ongoing' || student.status === 'extended') && student.balance > 0);
          onNext(filteredRows);
        },
        onError
      ),
    [activeBranchId, search]
  );
  const fetchRecentPayments = useCallback(
    () => (dashboardFilters ? dashboardService.getRecentPayments(dashboardFilters) : Promise.resolve([])),
    [dashboardFilters]
  );
  const {
    data: cachedPaymentStudents,
    error: paymentStudentsError,
    isLoading,
    isRefreshing,
    setCachedData: setCachedPaymentStudents
  } = useCachedSubscription<StudentWithFee[]>({
    cacheKey: paymentStudentsCacheKey,
    subscribe: subscribePaymentStudents,
    tags: paymentsCacheTags
  });
  const {
    data: cachedRecentPayments,
    error: recentPaymentsError,
    setCachedData: setCachedRecentPayments
  } = useCachedAsync<RecentPayment[]>({
    cacheKey: recentPaymentsCacheKey,
    enabled: Boolean(dashboardFilters),
    fetcher: fetchRecentPayments,
    tags: recentPaymentsTags
  });

  useEffect(() => {
    setStudents(cachedPaymentStudents ?? []);
    setSelectedStudent((current) => current ? (cachedPaymentStudents ?? []).find((student) => student.id === current.id) ?? current : current);
  }, [cachedPaymentStudents]);

  useEffect(() => {
    setRecentPayments(cachedRecentPayments ?? []);
  }, [cachedRecentPayments]);

  useEffect(() => {
    const error = paymentStudentsError ?? recentPaymentsError;
    if (!error) return;

    console.error('Failed to load payments:', error);
    setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load payments. Please check your connection and try again.'));
  }, [paymentStudentsError, recentPaymentsError]);

  useEffect(() => {
    const loadPending = (): void => setPendingPayments(pendingPaymentService.getAll());
    const unsubscribe = pendingPaymentService.subscribe(loadPending);
    loadPending();
    return unsubscribe;
  }, []);

  const handleSelectStudent = (student: StudentWithFee): void => {
    setSelectedStudent(student);
    setAmount(student.balance > 0 ? String(student.balance) : '');
    setLastReceiptNo('');
    setReceiptStudent(null);
    setIsReceiptDialogOpen(false);
    setMessage('');
    setErrorMessage('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setLastReceiptNo('');
    setReceiptStudent(null);
    setIsReceiptDialogOpen(false);

    const parsedAmount = Number(amount);
    if (!selectedStudent) return setErrorMessage('Select a student first.');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setErrorMessage('Amount must be greater than 0.');
    if (parsedAmount > selectedStudent.balance) return setErrorMessage('Amount cannot exceed balance.');
    if (!paymentDate) return setErrorMessage('Payment date is required.');
    if (paymentDate > getTodayDateInputValue()) return setErrorMessage('Payment date cannot be in the future.');

    setIsSaving(true);
    try {
      const fee = await feeService.addInstallment(selectedStudent.id, {
        amount: parsedAmount,
        date: paymentDate,
        notes
      });
      const savedInstallment = getSavedInstallment(fee, parsedAmount, paymentDate);
      const receiptNo = savedInstallment?.receiptNo ?? '';
      const refreshedStudent = await studentService.getStudentById(selectedStudent.id);
      invalidatePageCache([
        cacheTags.students,
        cacheTags.fees,
        cacheTags.payments,
        cacheTags.dashboard,
        cacheTags.reports,
        cacheTags.branch(activeBranchId ?? 'all'),
        cacheTags.user(profile?.id)
      ]);
      setSelectedStudent(refreshedStudent);
      const nextStudents = students.map((student) => (student.id === refreshedStudent?.id ? refreshedStudent : student)).filter((student) => student.balance > 0);
      setStudents(nextStudents);
      setCachedPaymentStudents(nextStudents);
      setCachedRecentPayments(dashboardFilters ? await dashboardService.getRecentPayments(dashboardFilters) : []);
      setAmount('');
      setNotes('');
      if (savedInstallment && isPendingInstallment(savedInstallment)) {
        setLastReceiptNo('');
        setReceiptStudent(null);
        setMessage('Payment saved offline. Receipt will be generated after sync.');
      } else {
        setLastReceiptNo(receiptNo);
        setReceiptStudent(refreshedStudent ?? selectedStudent);
        setIsReceiptDialogOpen(Boolean(receiptNo));
        setMessage('Payment saved successfully.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader title="Payments" description="Record fee installments and send receipts quickly." />

      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      {!isOnline ? <Alert variant="warning">Offline payments are saved locally as pending receipts and sync automatically when internet returns.</Alert> : null}

      <ReceiptReadyDialog
        open={isReceiptDialogOpen && Boolean(receiptStudent && lastReceiptNo)}
        student={receiptStudent}
        receiptNo={lastReceiptNo}
        onOpenChange={setIsReceiptDialogOpen}
        onError={setErrorMessage}
      />

      <div className={hasPaymentWorkspace ? 'grid gap-5 xl:grid-cols-[minmax(340px,430px)_1fr]' : 'grid gap-5'}>
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b bg-slate-50/80 p-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-primary" aria-hidden="true" />
              Select Student
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SearchInput className="h-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, LL no, DL no" />
            {isLoading ? (
              <PageLoader label="Loading payments..." />
            ) : students.length === 0 ? (
              <EmptyState title="No students with pending balance found." />
            ) : (
              <div className={`max-h-[560px] space-y-2 overflow-y-auto pr-1 ${isRefreshing ? 'opacity-60' : ''}`}>
                {students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => handleSelectStudent(student)}
                    className={`w-full rounded-lg border p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-blue-50/60 ${selectedStudent?.id === student.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'bg-surface'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-main-text">{student.fullName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{formatPhoneNumber(student.phone)}</p>
                        <Badge variant="info" className="mt-2">{formatCourseType(student.courseType)}</Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</p>
                        <p className="mt-1 whitespace-nowrap text-base font-semibold text-danger">{formatCurrency(student.balance)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {hasPaymentWorkspace ? (
        <div className="space-y-5">
          {selectedStudent ? (
            <>
              <Card className="overflow-hidden shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected Student</p>
                      <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-main-text">{selectedStudent.fullName}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{formatPhoneNumber(selectedStudent.phone)} - {formatCourseType(selectedStudent.courseType)}</p>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-danger">Balance Due</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-danger">{formatCurrency(selectedStudent.balance)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="grid gap-3 md:grid-cols-3">
                <StatCard label="Total Fee" value={formatCurrency(selectedStudent.totalAmount)} icon={<WalletCards className="h-4 w-4" aria-hidden="true" />} />
                <StatCard label="Paid" value={formatCurrency(selectedStudent.paidAmount)} tone="good" icon={<Banknote className="h-4 w-4" aria-hidden="true" />} />
                <StatCard label="Balance" value={formatCurrency(selectedStudent.balance)} tone={selectedStudent.balance > 0 ? 'danger' : 'good'} icon={<CreditCard className="h-4 w-4" aria-hidden="true" />} />
              </div>
            </>
          ) : (
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <EmptyState title="Select a student to record payment." />
              </CardContent>
            </Card>
          )}

          {canRecordPayment ? (
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-slate-50/80 p-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Save className="h-5 w-5 text-primary" aria-hidden="true" />
                Record Installment Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <FilterBar className="md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="payment-amount">Amount ({INDIAN_CURRENCY_SYMBOL}) *</Label>
                    <Input className="h-11 text-base font-medium" id="payment-amount" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!selectedStudent || isSaving} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="payment-date">Payment Date *</Label>
                    <Input
                      className="h-11"
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      max={getTodayDateInputValue()}
                      onChange={(event) => setPaymentDate(event.target.value)}
                      disabled={!selectedStudent || isSaving}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="payment-notes">Notes <span className="font-normal normal-case tracking-normal text-muted-foreground">(optional)</span></Label>
                    <Textarea id="payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!selectedStudent || isSaving} />
                  </div>
                </FilterBar>
                <div className="flex justify-end">
                  <Button type="submit" className="w-full sm:w-auto" disabled={!selectedStudent || isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving...' : 'Save Payment'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          ) : null}

          {selectedStudent ? <StudentInstallmentsCard studentId={selectedStudent.id} installments={selectedStudent.fee?.installments ?? []} onError={setErrorMessage} /> : null}
        </div>
        ) : null}
      </div>

      <PendingPaymentsCard payments={pendingPayments.filter((payment) => !activeBranchId || payment.branchId === activeBranchId)} />

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-slate-50/80 p-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ReceiptText className="h-5 w-5 text-primary" aria-hidden="true" />
            Recent Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {recentPayments.length === 0 ? (
            <EmptyState title="No recent payments." />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-surface">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Receipt No</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.map((payment) => (
                    <TableRow key={`${payment.studentId}-${payment.receiptNo}`} className="h-12">
                      <TableCell>{formatDate(payment.date)}</TableCell>
                      <TableCell className="font-semibold text-main-text">{payment.receiptNo}</TableCell>
                      <TableCell className="font-medium text-main-text">{payment.studentName}</TableCell>
                      <TableCell>{payment.branchName ?? '-'}</TableCell>
                      <TableCell className="text-right font-semibold text-success">{formatCurrency(payment.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function getSavedInstallment(fee: Fee, amount: number, date: string): Installment | null {
  const matching = [...fee.installments].reverse().find((installment) => installment.date === date && Number(installment.amount) === amount);
  return matching ?? fee.installments[fee.installments.length - 1] ?? null;
}

function ReceiptReadyDialog({
  open,
  student,
  receiptNo,
  onOpenChange,
  onError
}: {
  open: boolean;
  student: StudentWithFee | null;
  receiptNo: string;
  onOpenChange: (open: boolean) => void;
  onError: (message: string) => void;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {student && receiptNo ? (
        <DialogContent onClose={() => onOpenChange(false)} className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-success" aria-hidden="true" />
              Receipt Ready
            </DialogTitle>
            <DialogDescription>Receipt No: {receiptNo}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="font-semibold text-success">{student.fullName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Download the PDF receipt or send the payment receipt through WhatsApp.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <DownloadReceiptButton
                studentId={student.id}
                receiptNo={receiptNo}
                variant="outline"
                size="default"
                label="Download PDF"
                onError={onError}
              />
              <ShareReceiptPdfButton
                studentId={student.id}
                receiptNo={receiptNo}
                variant="outline"
                size="default"
                label="Share PDF + Text"
                onError={onError}
              />
              <WhatsAppReceiptButton
                studentId={student.id}
                receiptNo={receiptNo}
                variant="default"
                size="default"
                label="Send WhatsApp Text"
                onError={onError}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              If direct PDF sharing is unavailable, the PDF downloads and WhatsApp opens with the receipt text.
            </p>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function StudentInstallmentsCard({
  studentId,
  installments,
  onError
}: {
  studentId: string;
  installments: Installment[];
  onError: (message: string) => void;
}): JSX.Element {
  const sortedInstallments = [...installments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="border-b bg-slate-50/80 p-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ReceiptText className="h-5 w-5 text-primary" aria-hidden="true" />
          Installment Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {sortedInstallments.length === 0 ? (
          <EmptyState title="No installments paid yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-surface">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[150px] text-right">Receipt PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedInstallments.map((installment) => {
                  const pending = isPendingInstallment(installment);

                  return (
                    <TableRow key={installment.clientPaymentId ?? installment.receiptNo}>
                      <TableCell className="font-semibold text-main-text">
                        <div className="flex flex-col items-start gap-1">
                          <span>{getInstallmentReceiptLabel(installment)}</span>
                          {pending ? <Badge variant={installment.syncError ? 'danger' : 'warning'}>{installment.syncError ? 'Sync error' : 'Sync pending'}</Badge> : null}
                          {pending && installment.syncError ? <p className="text-xs font-normal text-danger">{installment.syncError}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(installment.date)}</TableCell>
                      <TableCell className="text-right font-semibold text-success">{formatCurrency(Number(installment.amount))}</TableCell>
                      <TableCell className="text-right">
                        {!pending && installment.receiptNo ? (
                          <DownloadReceiptButton
                            studentId={studentId}
                            receiptNo={installment.receiptNo}
                            variant="outline"
                            size="sm"
                            label="Download"
                            loadingLabel="Preparing..."
                            onError={onError}
                          />
                        ) : (
                          <Badge variant="warning">Sync pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingPaymentsCard({ payments }: { payments: ReturnType<typeof pendingPaymentService.getAll> }): JSX.Element | null {
  if (payments.length === 0) return null;

  return (
    <Card className="overflow-hidden border-amber-200 shadow-sm">
      <CardHeader className="border-b border-amber-200 bg-amber-50/80 p-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock3 className="h-5 w-5 text-warning" aria-hidden="true" />
          Pending Receipt Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDate(payment.date)}</TableCell>
                  <TableCell>
                    <Badge variant={payment.error ? 'danger' : 'warning'}>{payment.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-warning">{formatCurrency(payment.amount)}</TableCell>
                  <TableCell className={payment.error ? 'text-danger' : 'text-muted-foreground'}>{payment.error ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
