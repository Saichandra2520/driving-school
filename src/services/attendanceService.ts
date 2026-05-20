import { where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { courseExtensionService } from '@/services/courseExtensionService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import { getLastCompletedSession, getNextEmptySlot, sessionService } from '@/services/sessionService';
import type {
  AttendanceFilters,
  AttendanceRow,
  Branch,
  MarkAttendancePayload,
  Student,
  TrainingCourseType,
  TrainingSession
} from '@/types';

const courseParts: Record<Student['courseType'], TrainingCourseType[]> = {
  '2W': ['2W'],
  '4W': ['4W'],
  both: ['2W', '4W']
};

async function getEffectiveBranchId(filters: AttendanceFilters): Promise<string | undefined> {
  const { profile } = await authService.getCurrentUser();

  if (profile?.role === 'staff') {
    if (!profile.branchId) {
      throw new Error('Your staff profile is not assigned to a branch. Ask the owner to edit your staff profile and select a branch.');
    }

    return profile.branchId;
  }

  if (profile?.role === 'owner') {
    return filters.branchId && filters.branchId !== 'all' ? filters.branchId : undefined;
  }

  if (filters.role === 'staff') {
    if (!filters.userBranchId) {
      throw new Error('Your staff profile is not assigned to a branch. Ask the owner to edit your staff profile and select a branch.');
    }

    return filters.userBranchId;
  }

  return filters.branchId && filters.branchId !== 'all' ? filters.branchId : undefined;
}

async function getVisibleBranches(branchId?: string): Promise<Branch[]> {
  if (!branchId) {
    return getCollection<Branch>(collections.branches);
  }

  const branch = await getDocument<Branch>(collections.branches, branchId);
  return branch ? [branch] : [];
}

function matchesSearch(student: Student, search?: string): boolean {
  const value = search?.trim().toLowerCase();
  if (!value) return true;

  return student.fullName.toLowerCase().includes(value) || student.phone.toLowerCase().includes(value);
}

function completedCount(session: TrainingSession): number {
  return session.slots.filter((slot) => slot.date && slot.classType).length;
}

export const attendanceService = {
  async getAttendanceRows(filters: AttendanceFilters): Promise<AttendanceRow[]> {
    const branchId = await getEffectiveBranchId(filters);
    const [branches, studentsRaw, sessionsRaw] = await Promise.all([
      getVisibleBranches(branchId),
      getCollection<Student>(collections.students, [
        ...(branchId ? [where('branchId', '==', branchId)] : [])
      ]),
      getCollection<TrainingSession>(collections.sessions, [
        ...(branchId ? [where('branchId', '==', branchId)] : [])
      ])
    ]);

    const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
    const sessionsByStudentAndCourse = new Map(
      sessionsRaw.map((session) => [`${session.studentId}-${session.courseType}`, session])
    );
    const courseFilter = filters.courseType && filters.courseType !== 'all' ? filters.courseType : null;
    const rows: AttendanceRow[] = [];

    const students = studentsRaw
      .filter((student) => student.status === 'ongoing' || student.status === 'extended')
      .filter((student) => matchesSearch(student, filters.search))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    for (const student of students) {
      const courses = courseParts[student.courseType].filter((courseType) => !courseFilter || courseType === courseFilter);

      for (const courseType of courses) {
        const sessionKey = `${student.id}-${courseType}`;
        const session =
          sessionsByStudentAndCourse.get(sessionKey) ??
          (await sessionService.createEmptySessionCard(student.id, student.branchId, courseType));
        const entitlement = await courseExtensionService.getEntitlementForStudent(student, courseType);
        const sessionWithCapacity =
          session.slots.length < entitlement.allowedSessions
            ? await sessionService.ensureSessionCapacity(session.id, entitlement.allowedSessions)
            : session;
        const completedSessions = completedCount(sessionWithCapacity);
        const nextSlot = getNextEmptySlot(sessionWithCapacity.slots);
        const lastSlot = getLastCompletedSession(sessionWithCapacity.slots);

        rows.push({
          studentId: student.id,
          studentName: student.fullName,
          phone: student.phone,
          branchId: student.branchId,
          branchName: branchNames.get(student.branchId),
          courseType,
          sessionId: sessionWithCapacity.id,
          completedSessions,
          allowedSessions: entitlement.allowedSessions,
          remainingSessions: Math.max(entitlement.allowedSessions - completedSessions, 0),
          nextSessionNo: nextSlot?.slotNo ?? null,
          lastClassType: lastSlot?.classType || undefined,
          lastSessionDate: lastSlot?.date ?? undefined,
          isCompleted: completedSessions >= entitlement.allowedSessions || !nextSlot
        });
      }
    }

    return rows;
  },

  async markAttendance(sessionId: string, payload: MarkAttendancePayload, allowedSessions?: number): Promise<void> {
    if (allowedSessions) {
      await sessionService.ensureSessionCapacity(sessionId, allowedSessions);
    }
    await sessionService.quickMarkNextSession(sessionId, payload);
  }
};
