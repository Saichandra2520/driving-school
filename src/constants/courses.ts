import type { CourseType, DrivingTestCourseType, TrainingCourseType } from '@/types';

export const TRAINING_COURSE_OPTIONS: Array<{ value: TrainingCourseType; label: string }> = [
  { value: '2W', label: '2W' },
  { value: '4W', label: '4W' },
  { value: 'HV', label: 'Heavy Vehicle' }
];

export const STUDENT_COURSE_OPTIONS: Array<{ value: CourseType; label: string }> = [
  ...TRAINING_COURSE_OPTIONS,
  { value: 'both', label: '2W + 4W' }
];

export const COURSE_LABELS: Record<CourseType, string> = {
  '2W': '2W',
  '4W': '4W',
  HV: 'Heavy Vehicle',
  both: '2W + 4W'
};

export const TRAINING_COURSE_LABELS: Record<TrainingCourseType, string> = {
  '2W': '2W',
  '4W': '4W',
  HV: 'Heavy Vehicle'
};

export const COURSE_PARTS: Record<CourseType, TrainingCourseType[]> = {
  '2W': ['2W'],
  '4W': ['4W'],
  HV: ['HV'],
  both: ['2W', '4W']
};

export const DRIVING_TEST_COURSE_PARTS: Record<CourseType, DrivingTestCourseType[]> = COURSE_PARTS;
