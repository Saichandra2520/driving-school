import type { Student, StudentStatus } from '@/types';

export function deriveStudentStatus(
  student: Pick<Student, 'drivingLicenceNo'> & { status?: StudentStatus }
): StudentStatus {
  if (student.status === 'dropped') return 'dropped';
  if (student.drivingLicenceNo?.trim()) return 'passed';
  if (student.status === 'extended') return 'extended';
  return 'ongoing';
}
