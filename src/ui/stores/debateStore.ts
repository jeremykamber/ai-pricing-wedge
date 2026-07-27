import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DebateRoom, DebateMessage } from "@/domain/entities/DebateRoom";
import { indexedDBStorage } from "@/infrastructure/services/indexedDBStorage";

interface DebateStoreState {
  debates: DebateRoom[];
  activeDebateId: string | null;
  isStreaming: boolean;
  MAX_CONCURRENT: number;

  addDebate: (debate: DebateRoom, setActive?: boolean) => void;
  updateDebate: (id: string, updates: Partial<DebateRoom>) => void;
  removeDebate: (id: string) => void;
  setActive: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
  addMessage: (debateId: string, message: DebateMessage) => void;
  getDebate: (id: string) => DebateRoom | undefined;
}

export const useDebateStore = create<DebateStoreState>()(
  persist(
    (set, get) => ({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
      MAX_CONCURRENT: 3,

      addDebate: (debate, setActive = true) => {
        const state = get();
        const activeCount = state.debates.filter(
          (d) => d.status === "setup" || d.status === "in_progress"
        ).length;
        if (activeCount >= state.MAX_CONCURRENT) return;

        set({
          debates: [debate, ...state.debates],
          ...(setActive ? { activeDebateId: debate.id } : {}),
        });
      },

      updateDebate: (id, updates) =>
        set((state) => ({
          debates: state.debates.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        })),

      removeDebate: (id) =>
        set((state) => ({
          debates: state.debates.filter((d) => d.id !== id),
          activeDebateId:
            state.activeDebateId === id ? null : state.activeDebateId,
        })),

      setActive: (id) => set({ activeDebateId: id }),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      addMessage: (debateId, message) =>
        set((state) => ({
          debates: state.debates.map((d) =>
            d.id === debateId
              ? { ...d, messages: [...d.messages, message] }
              : d
          ),
        })),

      getDebate: (id) => get().debates.find((d) => d.id === id),
    }),
    {
      name: "debate-storage",
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: (state) => ({
        debates: state.debates,
        activeDebateId: state.activeDebateId,
      }),
    }
  )
);
