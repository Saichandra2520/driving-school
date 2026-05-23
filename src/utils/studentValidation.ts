import type { CourseType, CreateStudentPayload, UpdateStudentPayload } from '@/types';

const courseTypes: CourseType[] = ['2W', '4W', 'HV', 'both'];

export type StudentValidationInput = Partial<CreateStudentPayload & UpdateStudentPayload>;

function normalizeOptionalDate(value?: string | null): string {
  return value ?? '';
}

export function getStudentValidationError(input: StudentValidationInput, options: { requireAll?: boolean } = {}): string | null {
  const requireAll = options.requireAll ?? false;
  const phoneDigits = input.phone?.replace(/\D/g, '') ?? '';

  if ((requireAll || input.fullName !== undefined) && !input.fullName?.trim()) return 'Full name is required.';
  if ((requireAll || input.phone !== undefined) && !input.phone?.trim()) return 'Phone is required.';
  if ((requireAll || input.phone !== undefined) && phoneDigits.length < 10) return 'Phone number must have at least 10 digits.';
  if ((requireAll || input.branchId !== undefined) && !input.branchId?.trim()) return 'Branch is required.';
  if ((requireAll || input.courseType !== undefined) && (!input.courseType || !courseTypes.includes(input.courseType))) {
    return 'Course type is required.';
  }
  if ((requireAll || input.enrollmentDate !== undefined) && !input.enrollmentDate) return 'Enrollment date is required.';

  if (input.courseStartDate && input.enrollmentDate && input.courseStartDate < input.enrollmentDate) {
    return 'Course start date cannot be before enrollment date.';
  }

  const totalAmount = input.totalAmount;
  if ((requireAll || totalAmount !== undefined) && (!Number.isFinite(Number(totalAmount)) || Number(totalAmount) <= 0)) {
    return 'Total fee must be greater than 0.';
  }

  const llIssueDate = normalizeOptionalDate(input.llIssueDate);
  const llExpiryDate = normalizeOptionalDate(input.llExpiryDate);
  if (llIssueDate && llExpiryDate && llExpiryDate < llIssueDate) {
    return 'Learning licence expiry date cannot be before issue date.';
  }

  const dlIssueDate = normalizeOptionalDate(input.dlIssueDate);
  const dlExpiryDate = normalizeOptionalDate(input.dlExpiryDate);
  if (dlIssueDate && dlExpiryDate && dlExpiryDate < dlIssueDate) {
    return 'Driving licence expiry date cannot be before issue date.';
  }

  return null;
}

export function assertValidStudentInput(input: StudentValidationInput, options: { requireAll?: boolean } = {}): void {
  const error = getStudentValidationError(input, options);
  if (error) throw new Error(error);
}
