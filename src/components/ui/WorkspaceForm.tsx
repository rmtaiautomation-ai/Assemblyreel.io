'use client';

import React, { useState } from 'react';
import { useWorkspaceStore } from '@/store/workspaces';

const ART_STYLES = ['Charcoal', 'Cinematic', 'Minimalist', 'Cyberpunk', 'Watercolor'];
const MOCK_VOICES = [
  { id: 'cartesia_adam_deep', name: 'Adam (Deep & Mysterious)' },
  { id: 'cartesia_michael_hype', name: 'Michael (Hype/Energetic)' },
  { id: 'cartesia_sarah_calm', name: 'Sarah (Calm & Professional)' }
];

export default function WorkspaceForm({ onSuccess }: { onSuccess?: () => void }) {
  const addWorkspace = useWorkspaceStore((state) => state.addWorkspace);
  
  const [formData, setFormData] = useState({
    name: '',
    niche: '',
    master_prompt: '',
    art_style_preset: ART_STYLES[0],
    voice_id: MOCK_VOICES[0].id
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addWorkspace({
      id: Math.random().toString(36).substr(2, 9),
      ...formData
    });
    if (onSuccess) onSuccess();
  };

  const inputClasses = "w-full bg-gray-50 border border-gray-200 text-foreground p-2 px-3 rounded-lg focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-glow transition-all";
  const btnClasses = "btn-primary w-full";
  const labelClasses = "block text-sm font-medium text-text-secondary mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClasses}>Workspace Name</label>
        <input 
          required 
          type="text" 
          className={inputClasses} 
          placeholder="e.g. FORBIDDEN SECRETS"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
        />
      </div>
      <div>
        <label className={labelClasses}>Niche</label>
        <input 
          required 
          type="text" 
          className={inputClasses} 
          placeholder="e.g. Biblical Horror"
          value={formData.niche}
          onChange={(e) => setFormData({...formData, niche: e.target.value})}
        />
      </div>
      <div>
        <label className={labelClasses}>Master Prompt (Style Instructions)</label>
        <textarea 
          required 
          className={`${inputClasses} min-h-[100px]`} 
          placeholder="e.g. Deep cosmic backgrounds, weathered fresco textures..."
          value={formData.master_prompt}
          onChange={(e) => setFormData({...formData, master_prompt: e.target.value})}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClasses}>Art Style Preset</label>
          <select 
            className={inputClasses}
            value={formData.art_style_preset}
            onChange={(e) => setFormData({...formData, art_style_preset: e.target.value})}
          >
            {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClasses}>Voice ID</label>
          <select 
            className={inputClasses}
            value={formData.voice_id}
            onChange={(e) => setFormData({...formData, voice_id: e.target.value})}
          >
            {MOCK_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </div>
      <button type="submit" className={btnClasses}>Create Workspace</button>
    </form>
  );
}
