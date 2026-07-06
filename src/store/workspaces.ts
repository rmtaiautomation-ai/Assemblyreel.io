import { create } from 'zustand';

export interface Workspace {
  id: string;
  name: string;
  niche: string;
  master_prompt: string;
  voice_id: string | null;
  art_style_preset: string | null;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  addWorkspace: (workspace: Workspace) => void;
  setActiveWorkspace: (id: string) => void;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
}

const mockWorkspaces: Workspace[] = [
  {
    id: '1',
    name: 'FORBIDDEN SECRETS',
    niche: 'Esoteric Philosophy / Biblical Horror',
    master_prompt: 'Deep cosmic backgrounds, weathered fresco textures, dark burgundy/ochre tones, featuring ancient iconography like the Ankh, Scarab, and Ouroboros.',
    voice_id: 'cartesia_adam_deep',
    art_style_preset: 'Charcoal'
  },
  {
    id: '2',
    name: 'FINANCE BROS',
    niche: 'Finance / Crypto',
    master_prompt: 'High-contrast modern aesthetics, neon green and dark blues, 3D coin renders, fast-paced energetic feel.',
    voice_id: 'cartesia_michael_hype',
    art_style_preset: 'Cinematic'
  }
];

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: mockWorkspaces,
  activeWorkspaceId: mockWorkspaces[0].id,
  addWorkspace: (workspace) => set((state) => ({ 
    workspaces: [...state.workspaces, workspace] 
  })),
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  updateWorkspace: (id, updates) => set((state) => ({
    workspaces: state.workspaces.map(w => w.id === id ? { ...w, ...updates } : w)
  }))
}));
