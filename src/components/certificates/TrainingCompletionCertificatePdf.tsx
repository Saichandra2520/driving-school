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
    padding: 20,
    fontSize: 9,
    color: '#111',
    fontFamily: 'Helvetica',
    flexDirection: 'column'
  },
  border: {
    border: '2 solid #111',
    padding: 15,
    flexGrow: 1
  },
  header: {
    textAlign: 'center',
    borderBottom: '1 solid #111',
    paddingBottom: 8,
    marginBottom: 10
  },
  schoolName: {
    fontSize: 17,
    fontWeight: 700,
    marginBottom: 3
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    marginTop: 6,
    textTransform: 'uppercase'
  },
  body: {
    textAlign: 'center',
    lineHeight: 1.25,
    marginBottom: 8
  },
  studentName: {
    fontSize: 18,
    fontWeight: 700,
    marginVertical: 4
  },
  details: {
    marginBottom: 6
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6
  },
  detailColumn: {
    width: '48%'
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginTop: 3,
    marginBottom: 4,
    borderBottom: '1 solid #ccc',
    paddingBottom: 3
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #ddd',
    paddingVertical: 3
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
    justifyContent: 'flex-end',
    marginTop: 8
  },
  signature: {
    width: '42%',
    borderTop: '1 solid #111',
    paddingTop: 5,
    textAlign: 'center'
  },
  footer: {
    marginTop: 8,
    paddingTop: 5,
    borderTop: '1 solid #ccc',
    textAlign: 'center',
    color: '#444',
    fontSize: 8
  },
  table: {
    border: '1 solid #999',
    marginTop: 4
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottom: '1 solid #999'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e5e5',
    minHeight: 15
  },
  tableCell: {
    padding: 2,
    fontSize: 7,
    borderRight: '1 solid #e5e5e5'
  },
  tableCellHeader: {
    padding: 2,
    fontSize: 7,
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

          <View style={styles.detailGrid}>
            <View style={styles.detailColumn}>
              <Text style={styles.sectionTitle}>Student & Course Details</Text>
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
            </View>

            <View style={styles.detailColumn}>
              <Text style={styles.sectionTitle}>Payment Details</Text>
              <View style={styles.details}>
                <Field label="Total Fee" value={formatPdfInrCurrency(data.payment.totalAmount)} />
                <Field label="Total Paid" value={formatPdfInrCurrency(data.payment.paidAmount)} />
                <Field label="Balance" value={formatPdfInrCurrency(data.payment.balance)} />
                <Field label="Payment Status" value={data.payment.status} />
              </View>

              <View style={styles.signatureRow}>
                <Text style={styles.signature}>Authorised Signature</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Attendance Details</Text>
          <AttendanceTable rows={data.attendance} />

          <View style={styles.footer}>
            <Text>This certificate is generated from recorded training attendance.</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
