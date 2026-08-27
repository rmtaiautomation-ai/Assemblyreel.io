'use client';
import React, { useState } from 'react';

export default function VoiceCloningModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ed-media/50 backdrop-blur-sm">
      <div className="bg-ed-surface border border-[rgba(255,255,255,0.08)] p-6 rounded-lg w-full max-w-md shadow-glass">
        <h2 className="text-xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-ed-surface to-text-secondary">
          Voice Cloning Hub
        </h2>
        <p className="text-ed-text-dim mb-4 text-sm">
          Upload a clear, 60-second audio sample (.wav or .mp3) without background noise to clone a custom Cartesia voice.
        </p>
        
        <div className="border-2 border-dashed border-[rgba(255,255,255,0.15)] rounded-md p-8 text-center mb-4">
          <input 
            type="file" 
            accept="audio/mp3,audio/wav" 
            className="hidden" 
            id="voice-upload"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <label htmlFor="voice-upload" className="cursor-pointer text-ed-accent hover:text-ed-accent-hover transition-colors font-medium">
            {file ? file.name : 'Click to select audio file'}
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-4 py-2 border border-[rgba(255,255,255,0.08)] text-ed-text rounded-md hover:bg-ed-surface transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={!file} 
            className="bg-ed-accent text-ed-base py-2 px-4 rounded-md font-medium transition-all hover:bg-ed-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clone Voice
          </button>
        </div>
      </div>
    </div>
  );
}
