import type { Student, StudentStatus } from '@/types';
import { getCourseStartDate } from '@/utils/dateUtils';

export function deriveStudentStatus(
  student: Pick<Student, 'drivingLicenceNo' | 'enrollmentDate'> & { courseStartDate?: string | null; status?: StudentStatus }
): StudentStatus {
  if (student.drivingLicenceNo?.trim()) return 'passed';
  if (student.status === 'passed') return 'passed';
  if (student.status === 'completed') return 'completed';
  if (student.status === 'extended') return 'extended';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const courseStartDate = new Date(`${getCourseStartDate(student)}T00:00:00`);
  if (courseStartDate.getTime() > today.getTime()) return 'about_to_start';

  return 'ongoing';
}
