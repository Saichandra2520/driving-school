import { FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { settingsService } from '@/services/settingsService';
import { studentService } from '@/services/studentService';
import { useAuthStore } from '@/store/authStore';
import type {
  Branch,
  CourseType,
  CreateStudentPayload,
  StudentWithFee,
  UpdateStudentPayload
} from '@/types';

type StudentFormProps = {
  defaultBranchId?: string | null;
  student?: StudentWithFee | null;
  onCancel: () => void;
  onSaved: () => void;
};

const today = new Date().toISOString().slice(0, 10);

export function StudentForm({ defaultBranchId, student, onCancel, onSaved }: StudentFormProps): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const isStaff = profile?.role === 'staff';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [fullName, setFullName] = useState(student?.fullName ?? '');
  const [phone, setPhone] = useState(student?.phone ?? '');
  const [branchId, setBranchId] = useState(student?.branchId ?? defaultBranchId ?? profile?.branchId ?? '');
  const [courseType, setCourseType] = useState<CourseType>(student?.courseType ?? '4W');
  const [enrollmentDate, setEnrollmentDate] = useState(student?.enrollmentDate ?? today);
  const [courseStartDate, setCourseStartDate] = useState(
    student?.courseStartDate && student.courseStartDate !== student.enrollmentDate ? student.courseStartDate : ''
  );
  const [learningLicenceNo, setLearningLicenceNo] = useState(student?.learningLicenceNo ?? '');
  const [drivingLicenceNo, setDrivingLicenceNo] = useState(student?.drivingLicenceNo ?? '');
  const [dlIssueDate, setDlIssueDate] = useState(student?.dlIssueDate ?? '');
  const [dlExpiryDate, setDlExpiryDate] = useState(student?.dlExpiryDate ?? '');
  const [totalAmount, setTotalAmount] = useState(String(student?.totalAmount ?? ''));
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadBranches = async (): Promise<void> => {
      try {
        if (profile?.role === 'staff' && profile.branchId) {
          const branch = await settingsService.getBranchById(profile.branchId);
          if (isMounted) {
            setBranches([branch ?? { id: profile.branchId, name: 'Assigned Branch', location: null }]);
          }
          return;
        }

        const data = await settingsService.getBranches();
        if (isMounted) {
          setBranches(data.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Unable to load branches.');
        }
      }
    };

    void loadBranches();

    return () => {
      isMounted = false;
    };
  }, [profile?.branchId, profile?.role]);

  const validate = (): string | null => {
    const parsedTotal = Number(totalAmount);

    if (!fullName.trim()) return 'Full name is required.';
    if (!phone.trim()) return 'Phone is required.';
    if (phone.replace(/\D/g, '').length < 10) return 'Phone number must have at least 10 digits.';
    if (!branchId) return 'Branch is required.';
    if (!courseType) return 'Course type is required.';
    if (!enrollmentDate) return 'Enrollment date is required.';
    if (courseStartDate && courseStartDate < enrollmentDate) return 'Course start date cannot be before enrollment date.';
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) return 'Total fee must be greater than 0.';
    if (dlIssueDate && dlExpiryDate && dlExpiryDate < dlIssueDate) {
      return 'Driving licence expiry date cannot be before issue date.';
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const commonPayload = {
        fullName,
        phone,
        enrollmentDate,
        courseStartDate: courseStartDate || null,
        courseType,
        learningLicenceNo,
        drivingLicenceNo,
        dlIssueDate: dlIssueDate || null,
        dlExpiryDate: dlExpiryDate || null,
        branchId,
        totalAmount: Number(totalAmount)
      };

      if (student) {
        await studentService.updateStudent(student.id, commonPayload satisfies UpdateStudentPayload);
      } else {
        await studentService.createStudent(commonPayload satisfies CreateStudentPayload);
      }

      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save student.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <FormSection title="Admission Details" className="sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Full Name *" htmlFor="full-name">
          <Input id="full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </Field>

        <Field label="Phone *" htmlFor="phone">
          <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </Field>

        <Field label="Branch *" htmlFor="branch">
          <Select
            id="branch"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            disabled={isStaff}
          >
            <option value="">Select branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Course Type *" htmlFor="course-type">
          <Select
            id="course-type"
            value={courseType}
            onChange={(event) => setCourseType(event.target.value as CourseType)}
          >
            <option value="2W">2W</option>
            <option value="4W">4W</option>
            <option value="both">Both</option>
          </Select>
        </Field>

        <Field label="Enrollment Date *" htmlFor="enrollment-date">
          <Input
            id="enrollment-date"
            type="date"
            value={enrollmentDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              setEnrollmentDate(nextDate);
            }}
          />
        </Field>

        <Field label="Course Start Date" htmlFor="course-start-date">
          <Input
            id="course-start-date"
            type="date"
            value={courseStartDate}
            onChange={(event) => setCourseStartDate(event.target.value)}
          />
        </Field>

        <Field label="Total Fee *" htmlFor="total-fee">
          <Input
            id="total-fee"
            type="number"
            min="1"
            value={totalAmount}
            onChange={(event) => setTotalAmount(event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Licence Details">
        <Field label="Learning Licence No" htmlFor="learning-licence">
          <Input
            id="learning-licence"
            value={learningLicenceNo}
            onChange={(event) => setLearningLicenceNo(event.target.value)}
          />
        </Field>

        <Field label="Driving Licence No" htmlFor="driving-licence">
          <Input
            id="driving-licence"
            value={drivingLicenceNo}
            onChange={(event) => setDrivingLicenceNo(event.target.value)}
          />
        </Field>

        <Field label="DL Issue Date" htmlFor="dl-issue-date">
          <Input
            id="dl-issue-date"
            type="date"
            value={dlIssueDate ?? ''}
            onChange={(event) => setDlIssueDate(event.target.value)}
          />
        </Field>

        <Field label="DL Expiry Date" htmlFor="dl-expiry-date">
          <Input
            id="dl-expiry-date"
            type="date"
            value={dlExpiryDate ?? ''}
            onChange={(event) => setDlExpiryDate(event.target.value)}
          />
        </Field>
      </FormSection>

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t bg-white px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Student'}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  title,
  className,
  children
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-md border bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-main-text">{title}</h3>
      <div className={`grid gap-4 ${className ?? 'sm:grid-cols-2'}`}>{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
