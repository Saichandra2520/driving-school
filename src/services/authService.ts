import type { User } from 'firebase/auth';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword
} from 'firebase/auth';
import { auth } from '@/services/firebase';
import { collections, getDocument } from '@/services/firestoreUtils';
import type { Profile } from '@/types';

type CurrentUserResult = {
  user: User | null;
  profile: Profile | null;
};

export const authService = {
  async signIn(email: string, password: string): Promise<CurrentUserResult> {
    await signInWithEmailAndPassword(auth, email, password);
    return authService.getCurrentUser();
  },

  async signOut(): Promise<void> {
    await firebaseSignOut(auth);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;

    if (!user?.email) {
      throw new Error('Unable to confirm current user email.');
    }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);

    try {
      await reauthenticateWithCredential(user, credential);
    } catch {
      throw new Error('Current password is incorrect.');
    }

    await updatePassword(user, newPassword);
  },

  async getCurrentUser(): Promise<CurrentUserResult> {
    const user = auth.currentUser;

    if (!user) {
      return { user: null, profile: null };
    }

    const profile = await getDocument<Profile>(collections.users, user.uid);
    return { user, profile };
  }
};
