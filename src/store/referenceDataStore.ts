import { create } from 'zustand';

type ReferenceDataState = {
  classTypes: Record<string, string[]>;
  setClassTypes: (key: string, values: string[]) => void;
};

export const useReferenceDataStore = create<ReferenceDataState>((set) => ({
  classTypes: {},
  setClassTypes: (key, values) =>
    set((current) => ({
      classTypes: {
        ...current.classTypes,
        [key]: values
      }
    }))
}));
