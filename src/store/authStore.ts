import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { authService } from '@/services/authService';
import { clearPageCache } from '@/store/pageCacheStore';
import type { AuthState, Profile } from '@/types';

type AuthStore = AuthState & {
  setUser: (user: User | null, profile: Profile | null, authError?: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  restoreSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  authError: null,

  setUser: (user, profile, authError = null) => {
    if (!user) clearPageCache();
    set({ user, profile, authError, isLoading: false });
  },
  setLoading: (isLoading) => set({ isLoading }),

  restoreSession: async () => {
    set({ isLoading: true });

    try {
      const { user, profile } = await authService.getCurrentUser();
      set({
        user,
        profile,
        authError: user && !profile ? 'Signed in account is missing a user profile. Ask the owner to create the Firestore users profile.' : null,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to restore auth session:', error);
      set({ user: null, profile: null, authError: null, isLoading: false });
    }
  },

  signOut: async () => {
    await authService.signOut();
    clearPageCache();
    set({ user: null, profile: null, authError: null, isLoading: false });
  }
}));
