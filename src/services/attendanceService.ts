import { where } from 'firebase/firestore';
import { BASE_TRAINING_SESSION_COUNT, COURSE_PARTS } from '@/constants/courses';
import { authService } from '@/services/authService';
import { calculateTrainingEntitlement } from '@/services/courseExtensionService';
import { collections, getCollection, getDocument, subscribeCollection } from '@/services/firestoreUtils';
import { getLastCompletedSession, getNextEmptySlot, sessionService } from '@/services/sessionService';
import { calculateStudentExpiryDate, getCourseStartDate } from '@/utils/dateUtils';
import { deriveStudentStatus } from '@/utils/studentStatus';
import type {
  AttendanceFilters,
  AttendanceRow,
  Branch,
  CourseExtension,
  MarkAttendancePayload,
  Student,
  TrainingCourseType,
  TrainingSession
} from '@/types';

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

function getPendingSessionId(studentId: string, branchId: string, courseType: TrainingCourseType): string {
  return `pending-session:${encodeURIComponent(studentId)}:${encodeURIComponent(branchId)}:${courseType}`;
}

function parsePendingSessionId(sessionId: string): { studentId: string; branchId: string; courseType: TrainingCourseType } | null {
  const parts = sessionId.split(':');
  if (parts.length !== 4 || parts[0] !== 'pending-session') return null;

  const courseType = parts[3];
  if (courseType !== '2W' && courseType !== '4W' && courseType !== 'HV') return null;

  return {
    studentId: decodeURIComponent(parts[1]),
    branchId: decodeURIComponent(parts[2]),
    courseType
  };
}

function getSelectedDateMetadata(session: TrainingSession, selectedDate?: string): {
  isMarkedOnSelectedDate: boolean;
  selectedDateSessionCount: number;
  selectedDateClassTypes: string[];
} {
  if (!selectedDate) {
    return {
      isMarkedOnSelectedDate: false,
      selectedDateSessionCount: 0,
      selectedDateClassTypes: []
    };
  }

  const selectedDateSlots = session.slots.filter((slot) => slot.date === selectedDate && slot.classType.trim());
  return {
    isMarkedOnSelectedDate: selectedDateSlots.length > 0,
    selectedDateSessionCount: selectedDateSlots.length,
    selectedDateClassTypes: Array.from(new Set(selectedDateSlots.map((slot) => slot.classType).filter(Boolean)))
  };
}

function matchesView(row: AttendanceRow, view: AttendanceFilters['view']): boolean {
  if (!view || view === 'all') return true;
  if (view === 'pending') return !row.isCompleted && !row.isMarkedOnSelectedDate;
  if (view === 'marked') return row.isMarkedOnSelectedDate;
  if (view === 'completed') return row.isCompleted;
  if (view === 'extension_needed') return row.isCompleted;
  return true;
}

function buildAttendanceRows({
  branches,
  studentsRaw,
  sessionsRaw,
  extensionsRaw,
  filters
}: {
  branches: Branch[];
  studentsRaw: Student[];
  sessionsRaw: TrainingSession[];
  extensionsRaw: CourseExtension[];
  filters: AttendanceFilters;
}): AttendanceRow[] {
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const sessionsByStudentAndCourse = new Map(
    sessionsRaw.map((session) => [`${session.studentId}-${session.courseType}`, session])
  );
  const extensionsByStudent = new Map<string, CourseExtension[]>();
  extensionsRaw.forEach((extension) => {
    extensionsByStudent.set(extension.studentId, [...(extensionsByStudent.get(extension.studentId) ?? []), extension]);
  });
  const courseFilter = filters.courseType && filters.courseType !== 'all' ? filters.courseType : null;
  const rows: AttendanceRow[] = [];

  const students = studentsRaw
    .map((student) => ({ ...student, status: deriveStudentStatus(student) }))
    .filter((student) => student.status === 'ongoing' || student.status === 'extended')
    .filter((student) => matchesSearch(student, filters.search))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  for (const student of students) {
    const courses = COURSE_PARTS[student.courseType].filter((courseType) => !courseFilter || courseType === courseFilter);

    for (const courseType of courses) {
      const sessionKey = `${student.id}-${courseType}`;
      const session = sessionsByStudentAndCourse.get(sessionKey);
      const entitlement = calculateTrainingEntitlement(student, extensionsByStudent.get(student.id) ?? [], courseType);
      const courseStartDate = getCourseStartDate(student);
      const courseCompletionDate = calculateStudentExpiryDate(courseStartDate, entitlement.allowedDays);
      if (filters.selectedDate && (filters.selectedDate < courseStartDate || filters.selectedDate > courseCompletionDate)) {
        continue;
      }

      const completedSessions = session ? completedCount(session) : 0;
      const nextSlot = session ? getNextEmptySlot(session.slots) : null;
      const lastSlot = session ? getLastCompletedSession(session.slots) : null;
      const selectedDateMetadata = session
        ? getSelectedDateMetadata(session, filters.selectedDate)
        : {
            isMarkedOnSelectedDate: false,
            selectedDateSessionCount: 0,
            selectedDateClassTypes: []
          };
      const isCompleted = completedSessions >= entitlement.allowedSessions;
      const nextSessionNo = isCompleted ? null : nextSlot?.slotNo ?? completedSessions + 1;

      rows.push({
        studentId: student.id,
        studentName: student.fullName,
        phone: student.phone,
        branchId: student.branchId,
        branchName: branchNames.get(student.branchId),
        courseType,
        sessionId: session?.id ?? getPendingSessionId(student.id, student.branchId, courseType),
        completedSessions,
        allowedSessions: entitlement.allowedSessions,
        allowedDays: entitlement.allowedDays,
        courseStartDate,
        courseCompletionDate,
        remainingSessions: Math.max(entitlement.allowedSessions - completedSessions, 0),
        nextSessionNo,
        lastClassType: lastSlot?.classType || undefined,
        lastSessionDate: lastSlot?.date ?? undefined,
        ...selectedDateMetadata,
        isCompleted
      });
    }
  }

  return rows.filter((row) => matchesView(row, filters.view));
}

export const attendanceService = {
  async getAttendanceRows(filters: AttendanceFilters): Promise<AttendanceRow[]> {
    const branchId = await getEffectiveBranchId(filters);
    const branchScoped = branchId ? [where('branchId', '==', branchId)] : [];
    const [branches, studentsRaw, sessionsRaw, extensionsRaw] = await Promise.all([
      getVisibleBranches(branchId),
      getCollection<Student>(collections.students, branchScoped),
      getCollection<TrainingSession>(collections.sessions, branchScoped),
      getCollection<CourseExtension>(collections.courseExtensions, branchScoped)
    ]);

    return buildAttendanceRows({ branches, studentsRaw, sessionsRaw, extensionsRaw, filters });
  },

  subscribeAttendanceRows(
    filters: AttendanceFilters,
    onNext: (rows: AttendanceRow[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    let isActive = true;
    let cleanup = (): void => undefined;
    let latestBranches: Branch[] = [];
    let latestStudents: Student[] = [];
    let latestSessions: TrainingSession[] = [];
    let latestExtensions: CourseExtension[] = [];
    let branchesLoaded = false;
    let studentsLoaded = false;
    let sessionsLoaded = false;
    let extensionsLoaded = false;

    const emit = async (): Promise<void> => {
      if (!isActive) return;
      if (!branchesLoaded || !studentsLoaded || !sessionsLoaded || !extensionsLoaded) return;

      if (isActive) {
        onNext(buildAttendanceRows({
          branches: latestBranches,
          studentsRaw: latestStudents,
          sessionsRaw: latestSessions,
          extensionsRaw: latestExtensions,
          filters
        }));
      }
    };

    void getEffectiveBranchId(filters).then((branchId) => {
      if (!isActive) return;

      const branchScoped = branchId ? [where('branchId', '==', branchId)] : [];
      const queryKey = `branch=${branchId ?? 'all'}`;
      const unsubscribers: Array<() => void> = [
        subscribeCollection<Student>(
          collections.students,
          branchScoped,
          ({ rows }) => {
            studentsLoaded = true;
            latestStudents = rows;
            void emit();
          },
          onError,
          `students:attendance:${queryKey}`
        ),
        subscribeCollection<TrainingSession>(
          collections.sessions,
          branchScoped,
          ({ rows }) => {
            sessionsLoaded = true;
            latestSessions = rows;
            void emit();
          },
          onError,
          `sessions:attendance:${branchId ?? 'all'}`
        ),
        subscribeCollection<CourseExtension>(
          collections.courseExtensions,
          branchScoped,
          ({ rows }) => {
            extensionsLoaded = true;
            latestExtensions = rows;
            void emit();
          },
          onError,
          `extensions:attendance:${branchId ?? 'all'}`
        )
      ];

      if (branchId) {
        void getDocument<Branch>(collections.branches, branchId)
          .then((branch) => {
            branchesLoaded = true;
            latestBranches = branch ? [branch] : [];
            void emit();
          })
          .catch((error) => onError?.(error instanceof Error ? error : new Error('Unable to load branch.')));
      } else {
        unsubscribers.push(
          subscribeCollection<Branch>(
            collections.branches,
            [],
            ({ rows }) => {
              branchesLoaded = true;
              latestBranches = rows;
              void emit();
            },
            onError,
            'branches:all'
          )
        );
      }

      cleanup = (): void => unsubscribers.forEach((unsubscribe) => unsubscribe());
    });

    return () => {
      isActive = false;
      cleanup();
    };
  },

  async markAttendance(sessionId: string, payload: MarkAttendancePayload, allowedSessions?: number): Promise<void> {
    const pendingSession = parsePendingSessionId(sessionId);
    const effectiveSessionId = pendingSession
      ? (await sessionService.createEmptySessionCard(
          pendingSession.studentId,
          pendingSession.branchId,
          pendingSession.courseType,
          allowedSessions ?? BASE_TRAINING_SESSION_COUNT
        )).id
      : sessionId;

    await sessionService.quickMarkNextSessionFast(
      effectiveSessionId,
      payload,
      Math.max(allowedSessions ?? BASE_TRAINING_SESSION_COUNT, BASE_TRAINING_SESSION_COUNT)
    );
  }
};
