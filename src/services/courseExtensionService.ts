import { addDoc, collection, doc, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { db } from '@/services/firebase';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import type {
  CourseExtension,
  CourseType,
  CreateCourseExtensionPayload,
  Student,
  TrainingCourseType,
  TrainingEntitlement
} from '@/types';

const defaultBaseSessions = 30;
const defaultBaseDays = 30;

function appliesToCourse(extensionCourse: CourseType, courseType?: TrainingCourseType): boolean {
  if (!courseType) return true;
  return extensionCourse === 'both' || extensionCourse === courseType;
}

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
}

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'permission-denied'
  );
}

async function assertCanManageStudent(studentId: string): Promise<Student> {
  const [{ profile }, student] = await Promise.all([
    authService.getCurrentUser(),
    getDocument<Student>(collections.students, studentId)
  ]);

  if (!student) throw new Error('Student not found.');
  if (profile?.role === 'staff' && profile.branchId !== student.branchId) {
    throw new Error('You do not have access to this student.');
  }

  return student;
}

export function calculateTrainingEntitlement(
  student: Student,
  extensions: CourseExtension[] = [],
  courseType?: TrainingCourseType
): TrainingEntitlement {
  const baseSessions = Number(student.baseSessionCount ?? defaultBaseSessions);
  const baseDays = Number(student.baseDurationDays ?? student.durationDays ?? defaultBaseDays);
  const applicableExtensions = extensions.filter((extension) => appliesToCourse(extension.courseType, courseType));
  const extraSessions = applicableExtensions.reduce((total, extension) => total + Number(extension.extraSessions ?? 0), 0);
  const extraDays = applicableExtensions.reduce((total, extension) => total + Number(extension.extraDays ?? 0), 0);
  const extensionAmount = applicableExtensions.reduce((total, extension) => total + Number(extension.amount ?? 0), 0);

  return {
    baseSessions,
    baseDays,
    extraSessions,
    extraDays,
    allowedSessions: baseSessions + extraSessions,
    allowedDays: baseDays + extraDays,
    extensionAmount
  };
}

export const courseExtensionService = {
  async getExtensionsByStudent(studentId: string): Promise<CourseExtension[]> {
    const student = await assertCanManageStudent(studentId);
    const extensions = await getCollection<CourseExtension>(collections.courseExtensions, [
      where('branchId', '==', student.branchId)
    ]);

    return extensions
      .filter((extension) => extension.studentId === studentId)
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  },

  async getEntitlementForStudent(student: Student, courseType?: TrainingCourseType): Promise<TrainingEntitlement> {
    try {
      const extensions = await courseExtensionService.getExtensionsByStudent(student.id);
      return calculateTrainingEntitlement(student, extensions, courseType);
    } catch (error) {
      if (isPermissionError(error)) {
        console.warn('Course extensions could not be read. Falling back to base training entitlement.', error);
        return calculateTrainingEntitlement(student, [], courseType);
      }
      throw error;
    }
  },

  async getEntitlementByStudentId(studentId: string, courseType?: TrainingCourseType): Promise<TrainingEntitlement> {
    const student = await assertCanManageStudent(studentId);
    return courseExtensionService.getEntitlementForStudent(student, courseType);
  },

  async createExtension(payload: CreateCourseExtensionPayload): Promise<CourseExtension> {
    assertPositiveNumber(payload.extraSessions, 'Extra sessions');
    assertPositiveNumber(payload.extraDays, 'Extra days');
    assertPositiveNumber(payload.amount, 'Amount');

    if (!payload.paymentDate) throw new Error('Payment date is required.');
    if (payload.extraSessions <= 0 && payload.extraDays <= 0) {
      throw new Error('Add at least one extra session or extra day.');
    }

    const student = await assertCanManageStudent(payload.studentId);
    if (student.branchId !== payload.branchId) {
      throw new Error('Extension branch must match the student branch.');
    }

    const docRef = await addDoc(collection(db, collections.courseExtensions), {
      studentId: payload.studentId,
      branchId: payload.branchId,
      courseType: payload.courseType,
      extraSessions: payload.extraSessions,
      extraDays: payload.extraDays,
      amount: payload.amount,
      paymentDate: payload.paymentDate,
      notes: payload.notes?.trim() ?? '',
      createdAt: serverTimestamp()
    });

    const created = await getDocument<CourseExtension>(collections.courseExtensions, docRef.id);
    if (!created) throw new Error('Extension was created but could not be loaded.');
    if (student.status !== 'dropped') {
      await updateDoc(doc(db, collections.students, student.id), { status: 'extended' });
    }
    return created;
  }
};
