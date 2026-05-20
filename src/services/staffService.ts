import { where } from 'firebase/firestore';
import { collections, getCollection } from '@/services/firestoreUtils';
import type { StaffProfile } from '@/types';

export const staffService = {
  async getStaffByBranch(branchId: string): Promise<StaffProfile[]> {
    return getCollection<StaffProfile>(collections.users, [
      where('role', '==', 'staff'),
      where('branchId', '==', branchId)
    ]);
  }
};
