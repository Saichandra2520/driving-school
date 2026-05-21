import { where } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { collections, getCollection } from '@/services/firestoreUtils';
import type {
  BackupScope,
  Branch,
  ClassTypes,
  CourseExtension,
  DrivingTest,
  Expense,
  Fee,
  FullBackupData,
  Profile,
  Session,
  Student
} from '@/types';

type CounterDocument = {
  id: string;
  [key: string]: unknown;
};

function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function effectiveBranchId(scope?: BackupScope): string | undefined {
  return scope?.branchId && scope.branchId !== 'all' ? scope.branchId : undefined;
}

async function assertOwner(): Promise<void> {
  const { profile } = await authService.getCurrentUser();
  if (profile?.role !== 'owner') {
    throw new Error('Access denied. Owner only.');
  }
}

export const backupService = {
  async getFullBackupData(scope: BackupScope = { branchId: 'all' }): Promise<FullBackupData> {
    await assertOwner();
    const branchId = effectiveBranchId(scope);
    const [branchesRaw, usersRaw, students, fees, sessions, drivingTests, expenses, courseExtensions, classTypes, counters] =
      await Promise.all([
        getCollection<Branch>(collections.branches),
        getCollection<Profile>(collections.users),
        getCollection<Student>(collections.students, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
        getCollection<Fee>(collections.fees, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
        getCollection<Session>(collections.sessions, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
        getCollection<DrivingTest>(collections.drivingTests, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
        getCollection<Expense>(collections.expenses, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
        getCollection<CourseExtension>(collections.courseExtensions, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
        getCollection<ClassTypes>(collections.classTypes, [...(branchId ? [where('branchId', '==', branchId)] : [])]),
        getCollection<CounterDocument>(collections.counters)
      ]);

    const branches = branchId ? branchesRaw.filter((branch) => branch.id === branchId) : branchesRaw;
    const users = branchId ? usersRaw.filter((user) => user.role === 'owner' || user.branchId === branchId) : usersRaw;

    return {
      app: 'Mary Driving School',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      scope: { branchId: branchId ?? 'all' },
      data: {
        branches,
        users,
        students,
        fees,
        sessions,
        drivingTests,
        expenses,
        courseExtensions,
        classTypes,
        counters
      }
    };
  },

  downloadJsonFile(data: unknown, filename = `driving-school-backup-${todayForFilename()}.json`): void {
    downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json;charset=utf-8');
  }
};
