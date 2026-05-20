import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { authService } from '@/services/authService';
import type { AuthState, Profile } from '@/types';

type AuthStore = AuthState & {
  setUser: (user: User | null, profile: Profile | null) => void;
  setLoading: (isLoading: boolean) => void;
  restoreSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profile: null,
  isLoading: true,

  setUser: (user, profile) => set({ user, profile, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),

  restoreSession: async () => {
    set({ isLoading: true });

    try {
      const { user, profile } = await authService.getCurrentUser();
      set({ user, profile, isLoading: false });
    } catch (error) {
      console.error('Failed to restore auth session:', error);
      set({ user: null, profile: null, isLoading: false });
    }
  },

  signOut: async () => {
    await authService.signOut();
    set({ user: null, profile: null, isLoading: false });
  }
}));
