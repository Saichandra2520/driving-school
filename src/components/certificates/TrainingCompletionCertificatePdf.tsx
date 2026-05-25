import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { TrainingCourseType } from '@/types';
import { formatCourseType, formatDate } from '@/utils/formatters';
import { formatPdfInrCurrency } from '@/utils/pdfFormatters';

type CertificateAttendanceRow = {
  sessionNo: number;
  date: string;
  classType: string;
  vehicle?: string;
  instructor?: string;
};

export type TrainingCertificateData = {
  studentName: string;
  phone: string;
  learningLicenceNo?: string;
  courseType: TrainingCourseType;
  branchName: string;
  courseStartDate: string;
  courseEndDate: string;
  completionDate: string;
  completedSessions: number;
  payment: {
    totalAmount: number;
    paidAmount: number;
    balance: number;
    status: string;
  };
  attendance: CertificateAttendanceRow[];
  generatedAt: string;
};

type TrainingCompletionCertificatePdfProps = {
  data: TrainingCertificateData;
};

const styles = StyleSheet.create({
  page: {
    padding: 42,
    fontSize: 11,
    color: '#111',
    fontFamily: 'Helvetica'
  },
  border: {
    border: '2 solid #111',
    padding: 28,
    minHeight: '100%'
  },
  header: {
    textAlign: 'center',
    borderBottom: '1 solid #111',
    paddingBottom: 18,
    marginBottom: 28
  },
  schoolName: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 6
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginTop: 14,
    textTransform: 'uppercase'
  },
  body: {
    textAlign: 'center',
    lineHeight: 1.7,
    marginBottom: 26
  },
  studentName: {
    fontSize: 22,
    fontWeight: 700,
    marginVertical: 10
  },
  details: {
    marginTop: 8,
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 8,
    marginBottom: 8,
    borderBottom: '1 solid #ccc',
    paddingBottom: 4
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #ddd',
    paddingVertical: 7
  },
  label: {
    width: '38%',
    color: '#444'
  },
  value: {
    width: '62%',
    fontWeight: 700
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 44
  },
  signature: {
    width: '42%',
    borderTop: '1 solid #111',
    paddingTop: 7,
    textAlign: 'center'
  },
  footer: {
    marginTop: 28,
    paddingTop: 12,
    borderTop: '1 solid #ccc',
    textAlign: 'center',
    color: '#444',
    fontSize: 9
  },
  table: {
    border: '1 solid #999',
    marginTop: 8
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottom: '1 solid #999'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e5e5',
    minHeight: 20
  },
  tableCell: {
    padding: 5,
    fontSize: 8,
    borderRight: '1 solid #e5e5e5'
  },
  tableCellHeader: {
    padding: 5,
    fontSize: 8,
    fontWeight: 700,
    borderRight: '1 solid #ccc'
  },
  sessionCol: {
    width: '12%'
  },
  dateCol: {
    width: '18%'
  },
  classCol: {
    width: '34%'
  },
  vehicleCol: {
    width: '18%'
  },
  instructorCol: {
    width: '18%'
  }
});

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function AttendanceTable({ rows }: { rows: CertificateAttendanceRow[] }): JSX.Element {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellHeader, styles.sessionCol]}>No</Text>
        <Text style={[styles.tableCellHeader, styles.dateCol]}>Date</Text>
        <Text style={[styles.tableCellHeader, styles.classCol]}>Class Type</Text>
        <Text style={[styles.tableCellHeader, styles.vehicleCol]}>Vehicle</Text>
        <Text style={[styles.tableCellHeader, styles.instructorCol]}>Instructor</Text>
      </View>
      {rows.map((row) => (
        <View key={`${row.sessionNo}-${row.date}`} style={styles.tableRow} wrap={false}>
          <Text style={[styles.tableCell, styles.sessionCol]}>{row.sessionNo}</Text>
          <Text style={[styles.tableCell, styles.dateCol]}>{formatDate(row.date)}</Text>
          <Text style={[styles.tableCell, styles.classCol]}>{row.classType}</Text>
          <Text style={[styles.tableCell, styles.vehicleCol]}>{row.vehicle || '-'}</Text>
          <Text style={[styles.tableCell, styles.instructorCol]}>{row.instructor || '-'}</Text>
        </View>
      ))}
    </View>
  );
}

export function TrainingCompletionCertificatePdf({ data }: TrainingCompletionCertificatePdfProps): JSX.Element {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.border}>
          <View style={styles.header}>
            <Text style={styles.schoolName}>{data.branchName}</Text>
            <Text style={styles.title}>Training Completion Certificate</Text>
          </View>

          <View style={styles.body}>
            <Text>This is to certify that</Text>
            <Text style={styles.studentName}>{data.studentName}</Text>
            <Text>
              has successfully completed {data.completedSessions} driving training sessions for the{' '}
              {formatCourseType(data.courseType)} course.
            </Text>
          </View>

          <View style={styles.details}>
            <Field label="Driving School Name" value={data.branchName} />
            <Field label="Course" value={formatCourseType(data.courseType)} />
            <Field label="Course Start Date" value={formatDate(data.courseStartDate)} />
            <Field label="Course End Date" value={formatDate(data.courseEndDate)} />
            <Field label="Training Completion Date" value={formatDate(data.completionDate)} />
            <Field label="Completed Sessions" value={String(data.completedSessions)} />
            <Field label="Phone" value={data.phone} />
            <Field label="Learning Licence No" value={data.learningLicenceNo || '-'} />
            <Field label="Generated Date" value={formatDate(data.generatedAt.slice(0, 10))} />
          </View>

          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.details}>
            <Field label="Total Fee" value={formatPdfInrCurrency(data.payment.totalAmount)} />
            <Field label="Total Paid" value={formatPdfInrCurrency(data.payment.paidAmount)} />
            <Field label="Balance" value={formatPdfInrCurrency(data.payment.balance)} />
            <Field label="Payment Status" value={data.payment.status} />
          </View>

          <View style={styles.signatureRow}>
            <Text style={styles.signature}>Student Signature</Text>
            <Text style={styles.signature}>Authorized Signature</Text>
          </View>

          <View style={styles.footer}>
            <Text>This certificate is generated from recorded training attendance.</Text>
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.border}>
          <View style={styles.header}>
            <Text style={styles.schoolName}>{data.branchName}</Text>
            <Text style={styles.title}>Attendance Details</Text>
          </View>
          <Field label="Student Name" value={data.studentName} />
          <Field label="Course" value={formatCourseType(data.courseType)} />
          <Field label="Course Start Date" value={formatDate(data.courseStartDate)} />
          <Field label="Course End Date" value={formatDate(data.courseEndDate)} />
          <AttendanceTable rows={data.attendance} />
        </View>
      </Page>
    </Document>
  );
}
