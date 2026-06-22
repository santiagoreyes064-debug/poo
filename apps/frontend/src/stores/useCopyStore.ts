import { create } from 'zustand';
import { copyApi, type CopyRelationResponse, type CreateCopyRelationRequest, type UpdateCopyRelationRequest } from '@/lib/api';

interface CopyState {
  relations: CopyRelationResponse[];
  isLoading: boolean;
  error: string | null;

  fetchRelations: (token: string) => Promise<void>;
  createRelation: (token: string, data: CreateCopyRelationRequest) => Promise<void>;
  updateRelation: (token: string, relationId: string, data: UpdateCopyRelationRequest) => Promise<void>;
  deleteRelation: (token: string, relationId: string) => Promise<void>;
}

export const useCopyStore = create<CopyState>((set) => ({
  relations: [],
  isLoading: false,
  error: null,

  fetchRelations: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const { relations } = await copyApi.list(token);
      set({ relations, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch', isLoading: false });
    }
  },

  createRelation: async (token, data) => {
    set({ isLoading: true, error: null });
    try {
      const relation = await copyApi.create(token, data);
      set((state) => ({
        relations: [...state.relations, relation],
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create', isLoading: false });
    }
  },

  updateRelation: async (token, relationId, data) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await copyApi.update(token, relationId, data);
      set((state) => ({
        relations: state.relations.map((r) => (r.id === relationId ? updated : r)),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update', isLoading: false });
    }
  },

  deleteRelation: async (token, relationId) => {
    set({ isLoading: true, error: null });
    try {
      await copyApi.delete(token, relationId);
      set((state) => ({
        relations: state.relations.filter((r) => r.id !== relationId),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete', isLoading: false });
    }
  },
}));
