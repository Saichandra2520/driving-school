import { addDoc, deleteDoc, doc, getCountFromServer, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { collection } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { collections, createdAt, getCollection, getDocument, subscribeCollection } from '@/services/firestoreUtils';
import type {
  Branch,
  CreateBranchPayload,
  CreateStaffProfilePayload,
  StaffProfile,
  UpdateBranchPayload,
  UpdateStaffProfilePayload
} from '@/types';

function friendlyError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error('Something went wrong. Please try again.');
}

async function getCollectionCount(collectionName: string, branchId: string): Promise<number> {
  const snapshot = await getCountFromServer(
    query(collection(db, collectionName), where('branchId', '==', branchId))
  );
  return snapshot.data().count;
}

async function attachBranch<T extends { branchId: string; branch?: Branch | null }>(profile: T): Promise<T> {
  return { ...profile, branch: await getDocument<Branch>(collections.branches, profile.branchId) };
}

export const settingsService = {
  async getBranches(): Promise<Branch[]> {
    return getCollection<Branch>(collections.branches, [orderBy('createdAt', 'desc')]);
  },

  subscribeBranches(onNext: (branches: Branch[]) => void, onError?: (error: Error) => void): () => void {
    return subscribeCollection<Branch>(
      collections.branches,
      [orderBy('createdAt', 'desc')],
      ({ rows }) => onNext(rows),
      onError,
      'branches:createdAt-desc'
    );
  },

  async getBranchById(branchId: string): Promise<Branch | null> {
    return getDocument<Branch>(collections.branches, branchId);
  },

  async createBranch(payload: CreateBranchPayload): Promise<void> {
    if (!payload.name.trim()) throw new Error('Branch name is required.');

    await addDoc(collection(db, collections.branches), {
      name: payload.name.trim(),
      location: payload.location?.trim() || null,
      createdAt: createdAt()
    });
  },

  async updateBranch(branchId: string, payload: UpdateBranchPayload): Promise<void> {
    if (!payload.name.trim()) throw new Error('Branch name is required.');

    await updateDoc(doc(db, collections.branches, branchId), {
      name: payload.name.trim(),
      location: payload.location?.trim() || null
    });
  },

  async deleteBranch(branchId: string): Promise<void> {
    try {
      const [staffCount, studentCount, expenseCount] = await Promise.all([
        getCollectionCount(collections.users, branchId),
        getCollectionCount(collections.students, branchId),
        getCollectionCount(collections.expenses, branchId)
      ]);

      if (staffCount || studentCount || expenseCount) {
        throw new Error('This branch has staff, students, or expenses. Remove those records before deleting it.');
      }

      await deleteDoc(doc(db, collections.branches, branchId));
    } catch (error) {
      throw friendlyError(error);
    }
  },

  async getStaffProfiles(): Promise<StaffProfile[]> {
    const profiles = await getCollection<StaffProfile>(collections.users, [
      where('role', '==', 'staff'),
      orderBy('createdAt', 'desc')
    ]);
    return Promise.all(profiles.map(attachBranch));
  },

  async createStaffProfile(payload: CreateStaffProfilePayload): Promise<void> {
    if (!payload.id.trim()) throw new Error('Auth User ID is required.');
    if (!payload.fullName.trim()) throw new Error('Full name is required.');
    if (!payload.branchId) throw new Error('Branch is required.');

    await setDoc(doc(db, collections.users, payload.id.trim()), {
      fullName: payload.fullName.trim(),
      role: 'staff',
      branchId: payload.branchId,
      createdAt: createdAt()
    });
  },

  async updateStaffProfile(profileId: string, payload: UpdateStaffProfilePayload): Promise<void> {
    if (!payload.fullName.trim()) throw new Error('Full name is required.');
    if (!payload.branchId) throw new Error('Branch is required.');

    await updateDoc(doc(db, collections.users, profileId), {
      fullName: payload.fullName.trim(),
      role: 'staff',
      branchId: payload.branchId
    });
  },

  async deleteStaffProfile(profileId: string): Promise<void> {
    await deleteDoc(doc(db, collections.users, profileId));
  }
};
