import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReceiptData } from '@/types';
import { formatCourseType, formatDate } from '@/utils/formatters';
import { formatPdfInrCurrency } from '@/utils/pdfFormatters';

type PaymentReceiptPdfProps = {
  data: ReceiptData;
};

const DRIVING_SCHOOL_NAME = 'Mary Driving School';

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    color: '#111',
    fontFamily: 'Helvetica'
  },
  header: {
    borderBottom: '1 solid #111',
    paddingBottom: 14,
    marginBottom: 18,
    textAlign: 'center'
  },
  schoolName: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4
  },
  branchName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 12,
    textTransform: 'uppercase'
  },
  section: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
    borderBottom: '1 solid #ccc',
    paddingBottom: 4
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #eee',
    paddingVertical: 5
  },
  label: {
    width: '38%',
    color: '#444'
  },
  value: {
    width: '62%',
    fontWeight: 700
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 18
  },
  column: {
    flex: 1
  },
  noteBox: {
    marginTop: 18,
    padding: 10,
    border: '1 solid #999',
    backgroundColor: '#f7f7f7'
  },
  noteTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6
  },
  noteText: {
    marginBottom: 4,
    lineHeight: 1.4
  },
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTop: '1 solid #111',
    textAlign: 'center',
    color: '#333'
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

export function PaymentReceiptPdf({ data }: PaymentReceiptPdfProps): JSX.Element {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{DRIVING_SCHOOL_NAME}</Text>
          <Text style={styles.branchName}>{data.branch.name}</Text>
          <Text>{data.branch.location || '-'}</Text>
          <Text style={styles.title}>Payment Receipt</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Receipt Details</Text>
          <Field label="Driving School Name" value={DRIVING_SCHOOL_NAME} />
          <Field label="Branch" value={data.branch.name} />
          <Field label="Receipt No" value={data.receiptNo} />
          <Field label="Payment Date" value={formatDate(data.paymentDate)} />
          <Field label="Generated Date" value={formatDate(data.generatedAt.slice(0, 10))} />
        </View>

        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Student Details</Text>
              <Field label="Student Name" value={data.student.fullName} />
              <Field label="Phone" value={data.student.phone} />
              <Field label="Course Type" value={formatCourseType(data.student.courseType)} />
              <Field label="Enrollment Date" value={formatDate(data.student.enrollmentDate)} />
              <Field
                label="Course Start Date"
                value={formatDate(data.student.courseStartDate || data.student.enrollmentDate)}
              />
              <Field label="Learning Licence No" value={data.student.learningLicenceNo || '-'} />
              <Field label="Driving Licence No" value={data.student.drivingLicenceNo || '-'} />
            </View>
          </View>

          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Details</Text>
              <Field label="Amount Paid" value={formatPdfInrCurrency(data.amount)} />
              <Field label="Notes" value={data.notes || '-'} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Fee Summary</Text>
              <Field label="Total Fee" value={formatPdfInrCurrency(data.fee.totalAmount)} />
              <Field label="Total Paid" value={formatPdfInrCurrency(data.fee.paidAmount)} />
              <Field label="Balance" value={formatPdfInrCurrency(data.fee.balance)} />
            </View>
          </View>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Important Terms</Text>
          <Text style={styles.noteText}>
            1. The 30-session driving course must be completed within 60 days from the course start date.
          </Text>
          <Text style={styles.noteText}>
            2. The amount paid is non-refundable under any circumstances.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text>Thank you.</Text>
          <Text>This is a computer-generated receipt.</Text>
        </View>
      </Page>
    </Document>
  );
}
