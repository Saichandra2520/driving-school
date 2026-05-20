import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { collections, createdAt } from '@/services/firestoreUtils';
import { db, firebaseConfig } from '@/services/firebase';
import { settingsService } from '@/services/settingsService';
import type { CreateStaffUserPayload, ResetStaffPasswordPayload, StaffAccount, UpdateStaffProfilePayload } from '@/types';

export const staffAccountService = {
  async getStaffProfiles(): Promise<StaffAccount[]> {
    return settingsService.getStaffProfiles();
  },

  async createStaffUser(payload: CreateStaffUserPayload): Promise<StaffAccount> {
    const secondaryApp = initializeApp(firebaseConfig, `staff-create-${crypto.randomUUID()}`);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, payload.email.trim(), payload.password);
      const profile = {
        fullName: payload.fullName.trim(),
        role: 'staff' as const,
        branchId: payload.branchId,
        createdAt: createdAt()
      };

      await setDoc(doc(db, collections.users, credential.user.uid), profile);

      return {
        id: credential.user.uid,
        ...profile,
        createdAt: new Date().toISOString(),
        branch: null,
        email: payload.email.trim()
      };
    } finally {
      await deleteApp(secondaryApp);
    }
  },

  async resetStaffPassword(userId: string, newPassword: string): Promise<void> {
    const payload: ResetStaffPasswordPayload = { userId, newPassword };
    void payload;
    throw new Error('Firebase client SDK cannot reset another user password directly. Send a password reset email from the Firebase console or add an Admin SDK backend endpoint.');
  },

  async updateStaffProfile(profileId: string, payload: UpdateStaffProfilePayload): Promise<void> {
    if (!payload.fullName.trim()) throw new Error('Full name is required.');
    if (!payload.branchId) throw new Error('Branch is required.');

    await updateDoc(doc(db, collections.users, profileId), {
      fullName: payload.fullName.trim(),
      branchId: payload.branchId,
      role: 'staff'
    });
  },

  async deleteStaffProfile(profileId: string): Promise<void> {
    await deleteDoc(doc(db, collections.users, profileId));
  },

  async sendPasswordReset(email: string): Promise<void> {
    const secondaryApp = initializeApp(firebaseConfig, `staff-reset-${crypto.randomUUID()}`);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      await sendPasswordResetEmail(secondaryAuth, email);
    } finally {
      await deleteApp(secondaryApp);
    }
  }
};
