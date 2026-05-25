import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DownloadTrainingCertificateButton } from '@/components/certificates/DownloadTrainingCertificateButton';
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
import { BASE_TRAINING_SESSION_COUNT, COURSE_PARTS } from '@/constants/courses';
import { courseExtensionService } from '@/services/courseExtensionService';
import { feeService } from '@/services/feeService';
import { getInstallmentReceiptLabel, isPendingInstallment } from '@/services/pendingPaymentService';
import { sessionService } from '@/services/sessionService';
import type { CourseExtension, Fee, Installment, StudentWithFee, TrainingCourseType, TrainingEntitlement } from '@/types';
import { calculateStudentExpiryDate, getCourseStartDate } from '@/utils/dateUtils';
import { formatCourseType, formatCurrency, formatDate } from '@/utils/formatters';
import {
  getTrainingCertificateAttendanceSlots,
  getTrainingCertificateCompletionDate
} from '@/utils/trainingCertificate';

type StudentDetailsProps = {
  student: StudentWithFee;
  allowFeeActions?: boolean;
  onFeeChanged?: () => void;
  onStudentChanged?: () => void;
};

type CertificateRow = {
  courseType: TrainingCourseType;
  courseStartDate: string;
  courseEndDate: string;
  completionDate: string;
  attendance: Array<{
    sessionNo: number;
    date: string;
    classType: string;
    vehicle?: string;
    instructor?: string;
  }>;
};

export function StudentDetails({ student, allowFeeActions = true, onFeeChanged, onStudentChanged }: StudentDetailsProps): JSX.Element {
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
  const [certificateRows, setCertificateRows] = useState<CertificateRow[]>([]);
  const courseParts = COURSE_PARTS[student.courseType];
  const isBaseTrainingCompleted = (student.status === 'ongoing' || student.status === 'extended') && student.daysRemaining < 0;
  const tabs = certificateRows.length > 0
    ? ['overview', 'fees', 'extensions', 'attendance', 'certificate', 'driving-test', 'licence']
    : ['overview', 'fees', 'extensions', 'attendance', 'driving-test', 'licence'];

  const loadExtensions = async (): Promise<void> => {
    try {
      const rows = await courseExtensionService.getExtensionsByStudent(student.id);
      setExtensions(rows);
      setEntitlement(courseExtensionService ? await courseExtensionService.getEntitlementForStudent(student) : null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load course extensions.');
    }
  };

  const loadCertificates = async (): Promise<void> => {
    try {
      const courseStartDate = getCourseStartDate(student);
      const rows = await Promise.all(
        courseParts.map(async (courseType): Promise<CertificateRow | null> => {
          const courseEntitlement = await courseExtensionService.getEntitlementByStudentId(student.id, courseType);
          const session = await sessionService.getSessionByStudentAndCourse(student.id, courseType, courseEntitlement.allowedSessions);
          if (!session) return null;

          const completionDate = getTrainingCertificateCompletionDate(session.slots);
          if (!completionDate) return null;

          return {
            courseType,
            courseStartDate,
            courseEndDate: calculateStudentExpiryDate(courseStartDate, courseEntitlement.allowedDays),
            completionDate,
            attendance: getTrainingCertificateAttendanceSlots(session.slots).map((slot) => ({
              sessionNo: slot.slotNo,
              date: slot.date as string,
              classType: slot.classType,
              vehicle: slot.vehicle,
              instructor: slot.instructor
            }))
          };
        })
      );

      setCertificateRows(rows.filter((row): row is CertificateRow => row !== null));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load training certificates.');
    }
  };

  useEffect(() => {
    void loadExtensions();
    void loadCertificates();
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
  const extensionReceiptNos = useMemo(
    () => new Set(extensions.map((extension) => extension.receiptNo).filter((receiptNo): receiptNo is string => Boolean(receiptNo))),
    [extensions]
  );

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
      if (isPendingInstallment(deleteTarget)) {
        throw new Error('Pending offline payments cannot be deleted until they sync.');
      }
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
            {isBaseTrainingCompleted ? <StatusBadge status="thirty_days_completed" /> : null}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map((tab) => (
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
              <Info label="Allowed Sessions" value={String(entitlement?.allowedSessions ?? student.baseSessionCount ?? BASE_TRAINING_SESSION_COUNT)} />
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
              allowFeeActions={allowFeeActions}
              onAdd={() => setAddOpen(true)}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onError={setErrorMessage}
              extensionReceiptNos={extensionReceiptNos}
            />
          </TabsContent>
        ) : null}

        {activeTab === 'attendance' ? (
          <TabsContent>
            {courseParts.map((courseType) => (
              <TrainingCard
                key={courseType}
                studentId={student.id}
                branchId={student.branchId}
                courseType={courseType}
                courseStartDate={student.courseStartDate}
              />
            ))}
          </TabsContent>
        ) : null}

        {activeTab === 'certificate' && certificateRows.length > 0 ? (
          <TabsContent>
            <CertificateTab
              rows={certificateRows}
              student={student}
              feeSummary={feeSummary}
              onError={setErrorMessage}
            />
          </TabsContent>
        ) : null}

        {activeTab === 'driving-test' ? (
          <TabsContent>
            {courseParts.map((courseType) => (
              <DrivingTestCard key={courseType} studentId={student.id} branchId={student.branchId} courseType={courseType} />
            ))}
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

      {allowFeeActions ? (
        <>
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
        </>
      ) : null}
      <AddExtensionModal
        open={extensionModalOpen}
        student={student}
        onClose={() => setExtensionModalOpen(false)}
        onSaved={(nextMessage) => {
          setExtensionModalOpen(false);
          setMessage(nextMessage);
          setErrorMessage('');
          void loadExtensions();
          void loadCertificates();
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
          <Info label="Base Sessions" value={String(entitlement?.baseSessions ?? BASE_TRAINING_SESSION_COUNT)} />
          <Info label="Extra Sessions" value={String(entitlement?.extraSessions ?? 0)} />
          <Info label="Allowed Sessions" value={String(entitlement?.allowedSessions ?? BASE_TRAINING_SESSION_COUNT)} />
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

function CertificateTab({
  rows,
  student,
  feeSummary,
  onError
}: {
  rows: CertificateRow[];
  student: StudentWithFee;
  feeSummary: {
    totalAmount: number;
    paidAmount: number;
    balance: number;
    paymentStatus: string;
  };
  onError: (message: string) => void;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Training Certificates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.courseType} className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{formatCourseType(row.courseType)} Certificate</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Completed on {formatDate(row.completionDate)} · {row.attendance.length} sessions
              </p>
            </div>
            <DownloadTrainingCertificateButton
              data={{
                studentName: student.fullName,
                phone: student.phone,
                learningLicenceNo: student.learningLicenceNo,
                courseType: row.courseType,
                branchName: student.branchName ?? student.branchId,
                courseStartDate: row.courseStartDate,
                courseEndDate: row.courseEndDate,
                completionDate: row.completionDate,
                completedSessions: BASE_TRAINING_SESSION_COUNT,
                payment: {
                  totalAmount: feeSummary.totalAmount,
                  paidAmount: feeSummary.paidAmount,
                  balance: feeSummary.balance,
                  status: feeSummary.paymentStatus
                },
                attendance: row.attendance,
                generatedAt: new Date().toISOString()
              }}
              onError={onError}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FeeTab({
  feeSummary,
  student,
  allowFeeActions,
  onAdd,
  onEdit,
  onDelete,
  onError,
  extensionReceiptNos
}: {
  feeSummary: {
    totalAmount: number;
    paidAmount: number;
    balance: number;
    paymentStatus: string;
    installments: Installment[];
  };
  student: StudentWithFee;
  allowFeeActions: boolean;
  onAdd: () => void;
  onEdit: (installment: Installment) => void;
  onDelete: (installment: Installment) => void;
  onError: (message: string) => void;
  extensionReceiptNos: Set<string>;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Fee Summary</CardTitle>
        {allowFeeActions ? (
          <Button type="button" onClick={onAdd} disabled={feeSummary.balance <= 0}>
            Add Installment
          </Button>
        ) : null}
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
                  <TableHead className={allowFeeActions ? 'w-[360px]' : 'w-[220px]'}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeSummary.installments.map((installment) => {
                  const isPendingPayment = isPendingInstallment(installment);
                  const isExtensionPayment =
                    extensionReceiptNos.has(installment.receiptNo) ||
                    installment.source === 'course_extension' ||
                    Boolean(installment.courseExtensionId) ||
                    (installment.notes ?? '').trim().toLowerCase().startsWith('course extension -');

                  return (
                    <TableRow key={installment.clientPaymentId ?? installment.receiptNo} className="h-12">
                      <TableCell className="font-medium">
                        {getInstallmentReceiptLabel(installment)}
                        {isPendingPayment && installment.syncError ? <p className="text-xs font-normal text-danger">{installment.syncError}</p> : null}
                      </TableCell>
                      <TableCell>{formatDate(installment.date)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(installment.amount))}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{installment.notes || '-'}</span>
                          {isPendingPayment ? <Badge variant="secondary">Sync pending</Badge> : null}
                          {isExtensionPayment ? <Badge variant="secondary">Extension</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {!isPendingPayment ? (
                            <>
                              <DownloadReceiptButton studentId={student.id} receiptNo={installment.receiptNo} variant="outline" onError={onError} />
                              <WhatsAppReceiptButton studentId={student.id} receiptNo={installment.receiptNo} variant="outline" onError={onError} />
                            </>
                          ) : null}
                          {allowFeeActions && !isExtensionPayment && !isPendingPayment ? (
                            <>
                              <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(installment)}>
                                Edit
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(installment)}>
                                Delete
                              </Button>
                            </>
                          ) : null}
                        </div>
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
