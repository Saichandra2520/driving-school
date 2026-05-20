import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/PageLoader';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { exportService } from '@/services/exportService';
import { reportService } from '@/services/reportService';
import { settingsService } from '@/services/settingsService';
import { useAuthStore } from '@/store/authStore';
import type {
  Branch,
  ExpenseReport,
  FeeCollectionReport,
  PendingFeeReport,
  ReportFilters,
  StudentReport
} from '@/types';
import {
  formatCourseType,
  formatCurrency,
  formatDate,
  formatExpenseCategory,
  formatStudentStatus
} from '@/utils/formatters';

type ReportTab = 'feeCollection' | 'pendingFee' | 'expenses' | 'students';

const currentDate = new Date();
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

export function ReportsPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const [activeTab, setActiveTab] = useState<ReportTab>('feeCollection');
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [branchId, setBranchId] = useState<string>('all');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [feeReport, setFeeReport] = useState<FeeCollectionReport | null>(null);
  const [pendingFeeReport, setPendingFeeReport] = useState<PendingFeeReport | null>(null);
  const [expenseReport, setExpenseReport] = useState<ExpenseReport | null>(null);
  const [studentReport, setStudentReport] = useState<StudentReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');

  const filters = useMemo<ReportFilters>(
    () => ({
      month,
      year,
      branchId
    }),
    [branchId, month, year]
  );

  const yearOptions = useMemo(() => {
    const currentYear = currentDate.getFullYear();
    return Array.from({ length: 6 }, (_, index) => currentYear - index);
  }, []);

  const loadReports = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [feeCollection, pendingFees, expenses, students] = await Promise.all([
        reportService.getFeeCollectionReport(filters),
        reportService.getPendingFeeReport(filters),
        reportService.getExpenseReport(filters),
        reportService.getStudentReport(filters)
      ]);
      setFeeReport(feeCollection);
      setPendingFeeReport(pendingFees);
      setExpenseReport(expenses);
      setStudentReport(students);
    } catch {
      setErrorMessage('Unable to load report. Please check your connection and try again.');
      setFeeReport(null);
      setPendingFeeReport(null);
      setExpenseReport(null);
      setStudentReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (profile?.role !== 'owner') return;

    let isMounted = true;
    const loadBranches = async (): Promise<void> => {
      try {
        const data = await settingsService.getBranches();
        if (isMounted) setBranches([...data].sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        if (isMounted) setErrorMessage('Unable to load report. Please check your connection and try again.');
      }
    };

    void loadBranches();

    return () => {
      isMounted = false;
    };
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.role === 'owner') {
      void loadReports();
    }
  }, [loadReports, profile?.role]);

  if (profile?.role !== 'owner') {
    return <Alert variant="destructive">Access denied. Owner only.</Alert>;
  }

  const showPdfPlaceholder = (): void => setExportMessage('PDF export will be added later.');
  const handleCsvExport = (tab: ReportTab): void => {
    setExportMessage('');

    try {
      const exported =
        tab === 'feeCollection' && feeReport
          ? exportService.exportFeeCollectionReportCsv(feeReport, month, year)
          : tab === 'pendingFee' && pendingFeeReport
            ? exportService.exportPendingFeeReportCsv(pendingFeeReport, month, year)
            : tab === 'expenses' && expenseReport
              ? exportService.exportExpenseReportCsv(expenseReport, month, year)
              : tab === 'students' && studentReport
                ? exportService.exportStudentReportCsv(studentReport, month, year)
                : false;

      setExportMessage(exported ? 'CSV exported successfully.' : 'No data available to export.');
    } catch {
      setExportMessage('Unable to export CSV.');
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader title="Reports" description="Monthly fee, pending balance, expense, and student reports." />

      {exportMessage ? <Alert>{exportMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <Select value={String(month)} onChange={(event) => setMonth(Number(event.target.value))}>
            {months.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={String(year)} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="all">All Branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <PageLoader label="Loading report..." />
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="feeCollection" activeValue={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
              Fee Collection Report
            </TabsTrigger>
            <TabsTrigger value="pendingFee" activeValue={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
              Pending Fee Report
            </TabsTrigger>
            <TabsTrigger value="expenses" activeValue={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
              Expense Report
            </TabsTrigger>
            <TabsTrigger value="students" activeValue={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
              Student Report
            </TabsTrigger>
          </TabsList>

          {activeTab === 'feeCollection' && feeReport ? (
            <TabsContent>
              <FeeCollectionReportView
                report={feeReport}
                onCsv={() => handleCsvExport('feeCollection')}
                onPdf={showPdfPlaceholder}
              />
            </TabsContent>
          ) : null}

          {activeTab === 'pendingFee' && pendingFeeReport ? (
            <TabsContent>
              <PendingFeeReportView
                report={pendingFeeReport}
                onCsv={() => handleCsvExport('pendingFee')}
                onPdf={showPdfPlaceholder}
              />
            </TabsContent>
          ) : null}

          {activeTab === 'expenses' && expenseReport ? (
            <TabsContent>
              <ExpenseReportView
                report={expenseReport}
                onCsv={() => handleCsvExport('expenses')}
                onPdf={showPdfPlaceholder}
              />
            </TabsContent>
          ) : null}

          {activeTab === 'students' && studentReport ? (
            <TabsContent>
              <StudentReportView
                report={studentReport}
                onCsv={() => handleCsvExport('students')}
                onPdf={showPdfPlaceholder}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </section>
  );
}

function ReportActions({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => void }): JSX.Element {
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={onCsv}>
        Export CSV
      </Button>
      <Button type="button" variant="outline" onClick={onPdf}>
        Export PDF
      </Button>
    </div>
  );
}

function ReportHeader({
  title,
  onCsv,
  onPdf
}: {
  title: string;
  onCsv: () => void;
  onPdf: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ReportActions onCsv={onCsv} onPdf={onPdf} />
    </div>
  );
}

function SummaryGrid({ items }: { items: Array<{ label: string; value: string }> }): JSX.Element {
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-lg font-semibold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FeeCollectionReportView({
  report,
  onCsv,
  onPdf
}: {
  report: FeeCollectionReport;
  onCsv: () => void;
  onPdf: () => void;
}): JSX.Element {
  return (
    <>
      <ReportHeader title="Fee Collection Report" onCsv={onCsv} onPdf={onPdf} />
      <SummaryGrid
        items={[
          { label: 'Total Collected', value: formatCurrency(report.totalCollected) },
          { label: 'Number of Installments', value: String(report.installmentCount) },
          { label: 'Average Installment Amount', value: formatCurrency(report.averagePaymentAmount) },
          { label: 'Highest Payment', value: formatCurrency(report.highestPayment) },
          { label: 'Lowest Payment', value: formatCurrency(report.lowestPayment) }
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fee Collections</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <EmptyState title="No fee collections found for selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Receipt No</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={`${row.studentId}-${row.receiptNo}`}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell className="font-medium">{row.receiptNo}</TableCell>
                      <TableCell>{row.branchName ?? '-'}</TableCell>
                      <TableCell>{row.studentName}</TableCell>
                      <TableCell>{row.phone}</TableCell>
                      <TableCell>{formatCourseType(row.courseType)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="max-w-[320px] truncate">{row.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PendingFeeReportView({
  report,
  onCsv,
  onPdf
}: {
  report: PendingFeeReport;
  onCsv: () => void;
  onPdf: () => void;
}): JSX.Element {
  return (
    <>
      <ReportHeader title="Pending Fee Report" onCsv={onCsv} onPdf={onPdf} />
      <SummaryGrid
        items={[
          { label: 'Total Pending Balance', value: formatCurrency(report.totalPendingBalance) },
          { label: 'Students With Balance', value: String(report.studentsWithBalanceCount) },
          { label: 'Highest Balance', value: formatCurrency(report.highestBalance) },
          { label: 'Average Balance', value: formatCurrency(report.averageBalance) }
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending Fee Students</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <EmptyState title="No pending fee students found." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Total Fee</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>{row.branchName ?? '-'}</TableCell>
                      <TableCell className="font-medium">{row.studentName}</TableCell>
                      <TableCell>{row.phone}</TableCell>
                      <TableCell>{formatCourseType(row.courseType)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.paidAmount)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.balance)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'ongoing' ? 'success' : row.status === 'passed' ? 'secondary' : 'muted'}>
                          {formatStudentStatus(row.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ExpenseReportView({
  report,
  onCsv,
  onPdf
}: {
  report: ExpenseReport;
  onCsv: () => void;
  onPdf: () => void;
}): JSX.Element {
  return (
    <>
      <ReportHeader title="Expense Report" onCsv={onCsv} onPdf={onPdf} />
      <SummaryGrid
        items={[
          { label: 'Total Expenses', value: formatCurrency(report.totalExpenses) },
          { label: 'Fuel', value: formatCurrency(report.fuelTotal) },
          { label: 'Maintenance', value: formatCurrency(report.maintenanceTotal) },
          { label: 'Salary', value: formatCurrency(report.salaryTotal) },
          { label: 'Rent + Electricity', value: formatCurrency(report.rentElectricityTotal) },
          { label: 'Challans', value: formatCurrency(report.challanTotal) },
          { label: 'Other', value: formatCurrency(report.otherTotal) }
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <EmptyState title="No expenses found for selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{row.branchName ?? '-'}</TableCell>
                      <TableCell>{formatExpenseCategory(row.category)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                      <TableCell>{row.staffName ?? '-'}</TableCell>
                      <TableCell>{row.studentName ?? '-'}</TableCell>
                      <TableCell className="max-w-[320px] truncate">{row.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StudentReportView({
  report,
  onCsv,
  onPdf
}: {
  report: StudentReport;
  onCsv: () => void;
  onPdf: () => void;
}): JSX.Element {
  return (
    <>
      <ReportHeader title="Student Report" onCsv={onCsv} onPdf={onPdf} />
      <SummaryGrid
        items={[
          { label: 'New Admissions', value: String(report.newAdmissionsCount) },
          { label: 'Ongoing Students', value: String(report.ongoingCount) },
          { label: 'Passed Students', value: String(report.passedCount) },
          { label: 'Dropped Students', value: String(report.droppedCount) },
          { label: '30 Days Completed', value: String(report.thirtyDaysCompletedCount) },
          { label: 'Both Course Students', value: String(report.bothCourseStudentsCount) }
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Student Admissions</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <EmptyState title="No students found for selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Enrollment Date</TableHead>
                    <TableHead>30-Day Completion Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Learning Licence No</TableHead>
                    <TableHead>Driving Licence No</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>{row.branchName ?? '-'}</TableCell>
                      <TableCell className="font-medium">{row.fullName}</TableCell>
                      <TableCell>{row.phone}</TableCell>
                      <TableCell>{formatCourseType(row.courseType)}</TableCell>
                      <TableCell>{formatDate(row.enrollmentDate)}</TableCell>
                      <TableCell>{formatDate(row.completionDate)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'ongoing' ? 'success' : row.status === 'passed' ? 'secondary' : 'muted'}>
                          {formatStudentStatus(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.learningLicenceNo || '-'}</TableCell>
                      <TableCell>{row.drivingLicenceNo || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
