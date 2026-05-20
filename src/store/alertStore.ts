import { create } from 'zustand';
import { alertService } from '@/services/alertService';
import type { AlertFilters, AppAlert } from '@/types';

type AlertStore = {
  alerts: AppAlert[];
  isLoading: boolean;
  hasShownLoginPopup: boolean;
  errorMessage: string;
  setAlerts: (alerts: AppAlert[]) => void;
  fetchAlerts: (filters: AlertFilters) => Promise<void>;
  setHasShownLoginPopup: (value: boolean) => void;
  clearAlerts: () => void;
};

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  isLoading: false,
  hasShownLoginPopup: false,
  errorMessage: '',

  setAlerts: (alerts) => set({ alerts }),
  fetchAlerts: async (filters) => {
    set({ isLoading: true, errorMessage: '' });

    try {
      const alerts = await alertService.getAlerts(filters);
      set({ alerts, isLoading: false });
    } catch {
      set({ alerts: [], isLoading: false, errorMessage: 'Unable to load alerts.' });
    }
  },
  setHasShownLoginPopup: (hasShownLoginPopup) => set({ hasShownLoginPopup }),
  clearAlerts: () => set({ alerts: [], isLoading: false, hasShownLoginPopup: false, errorMessage: '' })
}));
