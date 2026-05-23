import { describe, expect, it } from 'vitest';
import { getStudentValidationError } from '@/utils/studentValidation';

const validStudent = {
  fullName: 'Amit Kumar',
  phone: '9876543210',
  branchId: 'branch-1',
  courseType: '4W' as const,
  enrollmentDate: '2026-05-01',
  courseStartDate: '2026-05-02',
  totalAmount: 5000
};

describe('student validation', () => {
  it('accepts a complete valid student payload', () => {
    expect(getStudentValidationError(validStudent, { requireAll: true })).toBeNull();
  });

  it('rejects blank names and short phone numbers', () => {
    expect(getStudentValidationError({ ...validStudent, fullName: ' ' }, { requireAll: true })).toBe('Full name is required.');
    expect(getStudentValidationError({ ...validStudent, phone: '12345' }, { requireAll: true })).toBe('Phone number must have at least 10 digits.');
  });

  it('rejects invalid date ordering and fee values', () => {
    expect(getStudentValidationError({ ...validStudent, courseStartDate: '2026-04-30' }, { requireAll: true })).toBe('Course start date cannot be before enrollment date.');
    expect(getStudentValidationError({ ...validStudent, llIssueDate: '2026-05-10', llExpiryDate: '2026-05-09' }, { requireAll: true })).toBe('Learning licence expiry date cannot be before issue date.');
    expect(getStudentValidationError({ ...validStudent, totalAmount: 0 }, { requireAll: true })).toBe('Total fee must be greater than 0.');
  });
});
