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
  StudentStatus,
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
  const [learningLicenceNo, setLearningLicenceNo] = useState(student?.learningLicenceNo ?? '');
  const [drivingLicenceNo, setDrivingLicenceNo] = useState(student?.drivingLicenceNo ?? '');
  const [dlIssueDate, setDlIssueDate] = useState(student?.dlIssueDate ?? '');
  const [dlExpiryDate, setDlExpiryDate] = useState(student?.dlExpiryDate ?? '');
  const [status, setStatus] = useState<StudentStatus>(student?.status ?? 'ongoing');
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
    if (!status) return 'Status is required.';
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
        courseType,
        learningLicenceNo,
        drivingLicenceNo,
        dlIssueDate: dlIssueDate || null,
        dlExpiryDate: dlExpiryDate || null,
        status,
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
    <form className="max-h-[72vh] space-y-5 overflow-y-auto pr-1" onSubmit={handleSubmit}>
      <FormSection title="Basic Details">
        <div className="space-y-2">
          <Label htmlFor="full-name">Full Name *</Label>
          <Input id="full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch">Branch *</Label>
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
        </div>
      </FormSection>

      <FormSection title="Course Details">
        <div className="space-y-2">
          <Label htmlFor="course-type">Course Type *</Label>
          <Select
            id="course-type"
            value={courseType}
            onChange={(event) => setCourseType(event.target.value as CourseType)}
          >
            <option value="2W">2W</option>
            <option value="4W">4W</option>
            <option value="both">Both</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="enrollment-date">Enrollment Date *</Label>
          <Input
            id="enrollment-date"
            type="date"
            value={enrollmentDate}
            onChange={(event) => setEnrollmentDate(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status *</Label>
          <Select id="status" value={status} onChange={(event) => setStatus(event.target.value as StudentStatus)}>
            <option value="ongoing">Ongoing</option>
            <option value="passed">Passed</option>
            <option value="extended">Extended</option>
            <option value="dropped">Dropped</option>
          </Select>
        </div>
      </FormSection>

      <FormSection title="Licence Details">
        <div className="space-y-2">
          <Label htmlFor="learning-licence">Learning Licence No <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="learning-licence"
            value={learningLicenceNo}
            onChange={(event) => setLearningLicenceNo(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="driving-licence">Driving Licence No <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="driving-licence"
            value={drivingLicenceNo}
            onChange={(event) => setDrivingLicenceNo(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dl-issue-date">DL Issue Date <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="dl-issue-date"
            type="date"
            value={dlIssueDate ?? ''}
            onChange={(event) => setDlIssueDate(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dl-expiry-date">DL Expiry Date <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="dl-expiry-date"
            type="date"
            value={dlExpiryDate ?? ''}
            onChange={(event) => setDlExpiryDate(event.target.value)}
          />
        </div>
      </FormSection>

      <FormSection title="Fee Details">
        <div className="space-y-2">
          <Label htmlFor="total-fee">Total Fee *</Label>
          <Input
            id="total-fee"
            type="number"
            min="1"
            value={totalAmount}
            onChange={(event) => setTotalAmount(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Enter the full course fee before installments.</p>
        </div>
      </FormSection>

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <div className="flex justify-end gap-2">
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

function FormSection({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="rounded-md border p-4">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
