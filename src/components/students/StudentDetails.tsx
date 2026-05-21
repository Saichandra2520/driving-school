import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DrivingTestCard } from '@/components/drivingTests/DrivingTestCard';
import { AddInstallmentModal } from '@/components/fees/AddInstallmentModal';
import { EditInstallmentModal } from '@/components/fees/EditInstallmentModal';
import { DownloadReceiptButton } from '@/components/receipts/DownloadReceiptButton';
import { WhatsAppReceiptButton } from '@/components/receipts/WhatsAppReceiptButton';
import { TrainingCard } from '@/components/sessions/TrainingCard';
import { AddExtensionModal } from '@/components/students/AddExtensionModal';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { courseExtensionService } from '@/services/courseExtensionService';
import { feeService } from '@/services/feeService';
import type { CourseExtension, Fee, Installment, StudentWithFee, TrainingEntitlement } from '@/types';
import { formatCourseType, formatCurrency, formatDate } from '@/utils/formatters';

type StudentDetailsProps = {
  student: StudentWithFee;
  onFeeChanged?: () => void;
  onStudentChanged?: () => void;
};

export function StudentDetails({ student, onFeeChanged, onStudentChanged }: StudentDetailsProps): JSX.Element {
  const [fee, setFee] = useState<Fee | null>(student.fee);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Installment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Installment | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [extensions, setExtensions] = useState<CourseExtension[]>(student.extensions ?? []);
  const [entitlement, setEntitlement] = useState<TrainingEntitlement | null>(student.trainingEntitlement ?? null);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const hasTwoWheeler = student.courseType === '2W' || student.courseType === 'both';
  const hasFourWheeler = student.courseType === '4W' || student.courseType === 'both';
  const isThirtyDaysCompleted = (student.status === 'ongoing' || student.status === 'extended') && student.daysRemaining < 0;

  const loadExtensions = async (): Promise<void> => {
    try {
      const rows = await courseExtensionService.getExtensionsByStudent(student.id);
      setExtensions(rows);
      setEntitlement(courseExtensionService ? await courseExtensionService.getEntitlementForStudent(student) : null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load course extensions.');
    }
  };

  useEffect(() => {
    void loadExtensions();
  }, [student.id]);

  const feeSummary = useMemo(() => {
    const totalAmount = Number(fee?.totalAmount ?? student.totalAmount);
    const paidAmount = Number(fee?.paidAmount ?? student.paidAmount);
    const balance = Number(fee?.balance ?? student.balance);
    const paymentStatus = balance === 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';

    return {
      totalAmount,
      paidAmount,
      balance,
      paymentStatus,
      installments: fee?.installments ?? []
    };
  }, [fee, student.balance, student.paidAmount, student.totalAmount]);

  const handleFeeSaved = (nextFee: Fee, nextMessage: string): void => {
    setFee(nextFee);
    setMessage(nextMessage);
    setErrorMessage('');
    setAddOpen(false);
    setEditTarget(null);
    onFeeChanged?.();
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setMessage('');
    setErrorMessage('');

    try {
      const nextFee = await feeService.deleteInstallment(student.id, deleteTarget.receiptNo);
      setFee(nextFee);
      setMessage('Installment deleted successfully.');
      setDeleteTarget(null);
      onFeeChanged?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete installment.');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <div className="rounded-md border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{student.fullName}</h2>
            <p className="text-sm text-muted-foreground">{student.phone} · {student.branchName ?? 'Branch not found'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{formatCourseType(student.courseType)}</Badge>
            <StatusBadge status={student.status} />
            <StatusBadge status={feeSummary.paymentStatus === 'Paid' ? 'paid' : feeSummary.paymentStatus === 'Partial' ? 'partial' : 'pending'} />
            {isThirtyDaysCompleted ? <StatusBadge status="thirty_days_completed" /> : null}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          {['overview', 'fees', 'extensions', 'attendance', 'driving-test', 'licence'].map((tab) => (
            <TabsTrigger key={tab} value={tab} activeValue={activeTab} onValueChange={setActiveTab}>
              {tab === 'driving-test' ? 'Driving Test' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>

        {activeTab === 'overview' ? (
          <TabsContent>
            <Section title="Basic Info">
              <Info label="Full Name" value={student.fullName} />
              <Info label="Phone" value={student.phone} />
              <Info label="Branch" value={student.branchName ?? '-'} />
              <Info label="Course" value={formatCourseType(student.courseType)} />
            </Section>
            <Section title="Timeline">
              <Info label="Enrollment Date" value={formatDate(student.enrollmentDate)} />
              <Info label="Course Start Date" value={formatDate(student.courseStartDate)} />
              <Info label="Base Completion Date" value={formatDate(student.expiryDate)} />
              <Info label="Base Days Remaining" value={student.daysRemaining >= 0 ? String(student.daysRemaining) : 'Completed'} />
              <Info label="Allowed Sessions" value={String(entitlement?.allowedSessions ?? student.baseSessionCount ?? 30)} />
              <Info label="Extra Sessions" value={String(entitlement?.extraSessions ?? 0)} />
            </Section>
            <Section title="Quick Summary">
              <Info label="Total Fee" value={formatCurrency(feeSummary.totalAmount)} />
              <Info label="Paid" value={formatCurrency(feeSummary.paidAmount)} />
              <Info label="Balance" value={formatCurrency(feeSummary.balance)} />
              <Info label="Payment Status" value={feeSummary.paymentStatus} />
            </Section>
          </TabsContent>
        ) : null}

        {activeTab === 'extensions' ? (
          <TabsContent>
            <ExtensionsTab
              extensions={extensions}
              entitlement={entitlement}
              onAdd={() => setExtensionModalOpen(true)}
            />
          </TabsContent>
        ) : null}

        {activeTab === 'fees' ? (
          <TabsContent>
            <FeeTab
              feeSummary={feeSummary}
              student={student}
              onAdd={() => setAddOpen(true)}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onError={setErrorMessage}
            />
          </TabsContent>
        ) : null}

        {activeTab === 'attendance' ? (
          <TabsContent>
            {hasTwoWheeler ? <TrainingCard studentId={student.id} branchId={student.branchId} courseType="2W" /> : null}
            {hasFourWheeler ? <TrainingCard studentId={student.id} branchId={student.branchId} courseType="4W" /> : null}
          </TabsContent>
        ) : null}

        {activeTab === 'driving-test' ? (
          <TabsContent>
            {hasTwoWheeler ? <DrivingTestCard studentId={student.id} branchId={student.branchId} courseType="2W" /> : null}
            {hasFourWheeler ? <DrivingTestCard studentId={student.id} branchId={student.branchId} courseType="4W" /> : null}
          </TabsContent>
        ) : null}

        {activeTab === 'licence' ? (
          <TabsContent>
            <Section title="Licence Details">
              <Info label="Learning Licence No" value={student.learningLicenceNo || '-'} />
              <Info label="LL Issue Date" value={student.llIssueDate ? formatDate(student.llIssueDate) : '-'} />
              <Info label="LL Expiry Date" value={student.llExpiryDate ? formatDate(student.llExpiryDate) : '-'} />
              <Info label="Driving Licence No" value={student.drivingLicenceNo || '-'} />
              <Info label="DL Issue Date" value={student.dlIssueDate ? formatDate(student.dlIssueDate) : '-'} />
              <Info label="DL Expiry Date" value={student.dlExpiryDate ? formatDate(student.dlExpiryDate) : '-'} />
            </Section>
          </TabsContent>
        ) : null}
      </Tabs>

      <AddInstallmentModal
        open={addOpen}
        student={student}
        balance={feeSummary.balance}
        onClose={() => setAddOpen(false)}
        onSaved={handleFeeSaved}
      />
      <EditInstallmentModal
        open={editTarget !== null}
        student={student}
        installment={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={handleFeeSaved}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Installment"
        description="Are you sure you want to delete this installment? This action cannot be undone."
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
      <AddExtensionModal
        open={extensionModalOpen}
        student={student}
        onClose={() => setExtensionModalOpen(false)}
        onSaved={(nextMessage) => {
          setExtensionModalOpen(false);
          setMessage(nextMessage);
          setErrorMessage('');
          void loadExtensions();
          void feeService.getFeeByStudentId(student.id).then((nextFee) => {
            if (nextFee) setFee(nextFee);
          });
          onFeeChanged?.();
          onStudentChanged?.();
        }}
      />
    </div>
  );
}

function ExtensionsTab({
  extensions,
  entitlement,
  onAdd
}: {
  extensions: CourseExtension[];
  entitlement: TrainingEntitlement | null;
  onAdd: () => void;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Course Extensions</CardTitle>
        <Button type="button" onClick={onAdd}>
          Add Extension
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Info label="Base Sessions" value={String(entitlement?.baseSessions ?? 30)} />
          <Info label="Extra Sessions" value={String(entitlement?.extraSessions ?? 0)} />
          <Info label="Allowed Sessions" value={String(entitlement?.allowedSessions ?? 30)} />
          <Info label="Extension Amount" value={formatCurrency(entitlement?.extensionAmount ?? 0)} />
        </div>

        {extensions.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No course extensions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Extra Sessions</TableHead>
                  <TableHead className="text-right">Extra Days</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extensions.map((extension) => (
                  <TableRow key={extension.id}>
                    <TableCell>{formatDate(extension.paymentDate)}</TableCell>
                    <TableCell>{formatCourseType(extension.courseType)}</TableCell>
                    <TableCell className="text-right">{extension.extraSessions}</TableCell>
                    <TableCell className="text-right">{extension.extraDays}</TableCell>
                    <TableCell className="text-right">{formatCurrency(extension.amount)}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{extension.notes || '-'}</TableCell>
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

function FeeTab({
  feeSummary,
  student,
  onAdd,
  onEdit,
  onDelete,
  onError
}: {
  feeSummary: {
    totalAmount: number;
    paidAmount: number;
    balance: number;
    paymentStatus: string;
    installments: Installment[];
  };
  student: StudentWithFee;
  onAdd: () => void;
  onEdit: (installment: Installment) => void;
  onDelete: (installment: Installment) => void;
  onError: (message: string) => void;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Fee Summary</CardTitle>
        <Button type="button" onClick={onAdd} disabled={feeSummary.balance <= 0}>
          Add Installment
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Info label="Total Fee" value={formatCurrency(feeSummary.totalAmount)} />
          <Info label="Paid Amount" value={formatCurrency(feeSummary.paidAmount)} />
          <Info label="Balance Amount" value={formatCurrency(feeSummary.balance)} />
          <Info label="Payment Status" value={feeSummary.paymentStatus} />
        </div>

        {feeSummary.installments.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No installments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[360px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeSummary.installments.map((installment) => (
                  <TableRow key={installment.receiptNo} className="h-12">
                    <TableCell className="font-medium">{installment.receiptNo}</TableCell>
                    <TableCell>{formatDate(installment.date)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(installment.amount))}</TableCell>
                    <TableCell>{installment.notes || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <DownloadReceiptButton studentId={student.id} receiptNo={installment.receiptNo} variant="outline" onError={onError} />
                        <WhatsAppReceiptButton studentId={student.id} receiptNo={installment.receiptNo} variant="outline" onError={onError} />
                        <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(installment)}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(installment)}>
                          Delete
                        </Button>
                      </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
