import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, Save } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dashboardService } from '@/services/dashboardService';
import { feeService } from '@/services/feeService';
import { studentService } from '@/services/studentService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';
import type { DashboardFilters, Fee, RecentPayment, StudentWithFee } from '@/types';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { formatCourseType, formatCurrency, formatDate, formatPhoneNumber } from '@/utils/formatters';

const today = new Date().toISOString().slice(0, 10);

export function PaymentsPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const isOnline = useSyncStore((state) => state.isOnline);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<StudentWithFee[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithFee | null>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [lastReceiptNo, setLastReceiptNo] = useState('');
  const [receiptStudent, setReceiptStudent] = useState<StudentWithFee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const activeBranchId = profile?.role === 'staff' ? profile.branchId : selectedBranchId;
  const dashboardFilters = useMemo<DashboardFilters | null>(() => {
    if (!profile) return null;
    return {
      role: profile.role,
      userBranchId: profile.branchId,
      branchId: profile.role === 'owner' ? selectedBranchId : profile.branchId
    };
  }, [profile, selectedBranchId]);

  const loadData = useCallback(async (): Promise<void> => {
    setErrorMessage('');
    try {
      const payments = dashboardFilters ? await dashboardService.getRecentPayments(dashboardFilters) : [];
      setRecentPayments(payments);
    } catch (error) {
      console.error('Failed to load payments:', error);
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load payments. Please check your connection and try again.'));
      setRecentPayments([]);
    }
  }, [dashboardFilters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage('');

    const unsubscribe = studentService.subscribeStudents(
      { branchId: activeBranchId, search },
      (studentRows) => {
        setStudents(
          studentRows.filter((student) => (student.status === 'ongoing' || student.status === 'extended') && student.balance > 0)
        );
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load payment students:', error);
        setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load payments. Please check your connection and try again.'));
        setStudents([]);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [activeBranchId, search]);

  const handleSelectStudent = (student: StudentWithFee): void => {
    setSelectedStudent(student);
    setAmount(student.balance > 0 ? String(student.balance) : '');
    setLastReceiptNo('');
    setReceiptStudent(null);
    setMessage('');
    setErrorMessage('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setLastReceiptNo('');
    setReceiptStudent(null);

    const parsedAmount = Number(amount);
    if (!isOnline) return setErrorMessage('Internet is required to record payments and generate receipt numbers.');
    if (!selectedStudent) return setErrorMessage('Select a student first.');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setErrorMessage('Amount must be greater than 0.');
    if (parsedAmount > selectedStudent.balance) return setErrorMessage('Amount cannot exceed balance.');
    if (!paymentDate) return setErrorMessage('Payment date is required.');

    setIsSaving(true);
    try {
      const fee = await feeService.addInstallment(selectedStudent.id, {
        amount: parsedAmount,
        date: paymentDate,
        notes
      });
      const receiptNo = getSavedReceiptNo(fee, parsedAmount, paymentDate);
      const refreshedStudent = await studentService.getStudentById(selectedStudent.id);
      setSelectedStudent(refreshedStudent);
      setStudents((current) => current.map((student) => (student.id === refreshedStudent?.id ? refreshedStudent : student)).filter((student) => student.balance > 0));
      setRecentPayments(dashboardFilters ? await dashboardService.getRecentPayments(dashboardFilters) : []);
      setAmount('');
      setNotes('');
      setLastReceiptNo(receiptNo);
      setReceiptStudent(refreshedStudent ?? selectedStudent);
      setMessage(receiptNo ? `Payment saved successfully. Receipt No: ${receiptNo}` : 'Payment saved successfully.');
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
      {!isOnline ? <Alert variant="warning">Payments need internet because receipt numbers are generated online.</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Select Student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, LL no, DL no" />
            {isLoading ? (
              <PageLoader label="Loading payments..." />
            ) : students.length === 0 ? (
              <EmptyState title="No students with pending balance found." />
            ) : (
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => handleSelectStudent(student)}
                    className={`w-full rounded-md border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 ${selectedStudent?.id === student.id ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{student.fullName}</p>
                        <p className="text-sm text-muted-foreground">{formatPhoneNumber(student.phone)} · {formatCourseType(student.courseType)}</p>
                      </div>
                      <p className="font-semibold text-danger">{formatCurrency(student.balance)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard label="Total Fee" value={formatCurrency(selectedStudent?.totalAmount ?? 0)} />
            <StatCard label="Paid" value={formatCurrency(selectedStudent?.paidAmount ?? 0)} tone="good" />
            <StatCard label="Balance" value={formatCurrency(selectedStudent?.balance ?? 0)} tone={(selectedStudent?.balance ?? 0) > 0 ? 'danger' : 'good'} />
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Record Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                {receiptStudent && lastReceiptNo ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold text-success">Receipt ready: {lastReceiptNo}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Download the PDF receipt and open WhatsApp with the payment text immediately.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <DownloadReceiptButton
                          studentId={receiptStudent.id}
                          receiptNo={lastReceiptNo}
                          variant="outline"
                          size="default"
                          label="Download PDF"
                          onError={setErrorMessage}
                        />
                        <ShareReceiptPdfButton
                          studentId={receiptStudent.id}
                          receiptNo={lastReceiptNo}
                          variant="outline"
                          size="default"
                          label="Share PDF + Text"
                          onError={setErrorMessage}
                        />
                        <WhatsAppReceiptButton
                          studentId={receiptStudent.id}
                          receiptNo={lastReceiptNo}
                          variant="default"
                          size="default"
                          label="Send WhatsApp Text"
                          onError={setErrorMessage}
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      If direct PDF sharing is unavailable, the PDF downloads and WhatsApp opens with the receipt text. Attach the downloaded PDF in WhatsApp.
                    </p>
                  </div>
                ) : null}

                <FilterBar className="md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">Amount *</Label>
                    <Input id="payment-amount" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!selectedStudent || isSaving || !isOnline} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-date">Payment Date *</Label>
                    <Input id="payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} disabled={!selectedStudent || isSaving || !isOnline} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="payment-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
                    <Textarea id="payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!selectedStudent || isSaving || !isOnline} />
                  </div>
                </FilterBar>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {receiptStudent && lastReceiptNo ? (
                      <>
                        <DownloadReceiptButton studentId={receiptStudent.id} receiptNo={lastReceiptNo} variant="outline" onError={setErrorMessage} />
                        <ShareReceiptPdfButton studentId={receiptStudent.id} receiptNo={lastReceiptNo} variant="outline" onError={setErrorMessage} />
                        <WhatsAppReceiptButton studentId={receiptStudent.id} receiptNo={lastReceiptNo} variant="outline" onError={setErrorMessage} />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        <Download className="mr-1 inline h-4 w-4" aria-hidden="true" />
                        <MessageCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />
                        Receipt actions appear after saving.
                      </p>
                    )}
                  </div>
                  <Button type="submit" disabled={!selectedStudent || isSaving || !isOnline}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving...' : 'Save Payment'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPayments.length === 0 ? (
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
                  {recentPayments.map((payment) => (
                    <TableRow key={`${payment.studentId}-${payment.receiptNo}`} className="h-12">
                      <TableCell>{formatDate(payment.date)}</TableCell>
                      <TableCell className="font-medium">{payment.receiptNo}</TableCell>
                      <TableCell>{payment.studentName}</TableCell>
                      <TableCell>{payment.branchName ?? '-'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(payment.amount)}</TableCell>
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

function getSavedReceiptNo(fee: Fee, amount: number, date: string): string {
  const matching = [...fee.installments].reverse().find((installment) => installment.date === date && Number(installment.amount) === amount);
  return matching?.receiptNo ?? fee.installments[fee.installments.length - 1]?.receiptNo ?? '';
}
