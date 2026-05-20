import { create } from 'zustand';

type AppState = {
  branchId: string | null;
  setBranchId: (branchId: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  branchId: null,
  setBranchId: (branchId) => set({ branchId })
}));
