import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ArtifactAnalysis, AnalysisStatus } from '@/domain/entities/ArtifactAnalysis'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import { indexedDBStorage } from '@/infrastructure/services/indexedDBStorage'

interface AnalysisPersistedState {
  analyses: ArtifactAnalysis[]
  dismissedAnalysisIds: string[]
}

interface AnalysisStoreState extends AnalysisPersistedState {
  analyses: ArtifactAnalysis[]
  dismissedAnalysisIds: string[]
  addAnalysis: (analysis: ArtifactAnalysis) => void
  updateAnalysis: (id: string, updates: Partial<ArtifactAnalysis>) => void
  removeAnalysis: (id: string) => void
  getAnalysis: (id: string) => ArtifactAnalysis | undefined
  dismissAnalysis: (id: string) => void
  markComplete: (id: string, responses: PersonaResponse[], synthesis?: ArtifactSynthesis | null) => void
  markError: (id: string, error: string) => void
  markCancelled: (id: string) => void
}

const STORAGE_VERSION = 3;

export const useAnalysisStore = create<AnalysisStoreState>()(
  persist(
    (set, get) => ({
      analyses: [],
      dismissedAnalysisIds: [],

      dismissAnalysis: (id) =>
        set((state) => ({
          dismissedAnalysisIds: state.dismissedAnalysisIds.includes(id)
            ? state.dismissedAnalysisIds
            : [...state.dismissedAnalysisIds, id],
        })),

      addAnalysis: (analysis) =>
        set((state) => ({
          analyses: [analysis, ...state.analyses],
        })),

      updateAnalysis: (id, updates) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),

      removeAnalysis: (id) =>
        set((state) => ({
          analyses: state.analyses.filter((a) => a.id !== id),
        })),

      getAnalysis: (id) => get().analyses.find((a) => a.id === id),

      markComplete: (id, responses, synthesis) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: 'COMPLETED' as AnalysisStatus,
                  completedAt: new Date().toISOString(),
                  completedResponses: responses.length,
                  responses,
                  // Synthesis rides along when the poller fetched it; absent
                  // for legacy callers (undefined leaves any existing value).
                  ...(synthesis !== undefined ? { synthesis: synthesis ?? undefined } : {}),
                }
              : a
          ),
        })),

      markError: (id, error) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: 'ERROR' as AnalysisStatus,
                  completedAt: new Date().toISOString(),
                  error,
                }
              : a
          ),
        })),

      markCancelled: (id) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: 'CANCELLED' as AnalysisStatus,
                  completedAt: new Date().toISOString(),
                }
              : a
          ),
        })),
    }),
    {
      name: 'analysis-storage',
      version: STORAGE_VERSION,
      migrate(persistedState, version) {
        if (version < STORAGE_VERSION) {
          return { analyses: [], dismissedAnalysisIds: [] } as AnalysisPersistedState;
        }
        return persistedState as AnalysisPersistedState;
      },
      storage: createJSONStorage(() => indexedDBStorage),
      // Only persist metadata, not streaming data or large screenshots
      partialize: (state) => ({
        analyses: state.analyses.map(({ streamingTexts, screenshot, responses, ...rest }) => ({
          ...rest,
          // Strip base64 screenshots from each response to keep storage lean.
          // Screenshots are served via the server-side screenshot store on demand.
          responses: responses?.map(({ screenshotBase64, ...rest }) => rest),
        })),
        dismissedAnalysisIds: state.dismissedAnalysisIds,
      }),
    }
  )
)
