import { create } from 'zustand';
import type { ExportContext } from '@/utils/exportOrgChart';

interface ExportStore {
  /** Export context provided by OrgChartView when it mounts */
  exportContext: ExportContext | null;
  setExportContext: (ctx: ExportContext | null) => void;
}

export const useExportStore = create<ExportStore>((set) => ({
  exportContext: null,
  setExportContext: (ctx) => set({ exportContext: ctx }),
}));
