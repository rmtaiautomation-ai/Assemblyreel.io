"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function NewVideoPromptPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/ai/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic,
          format: "9:16", // Inherited from workspace state
          tone: "Cinematic" // Inherited from workspace settings
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Save the mock generated data to localStorage so we can read it in Phase 3
        localStorage.setItem('temp_video_timeline', JSON.stringify(data.data));
        router.push(`/workspaces/${slug}/videos/123/editor`);
      } else {
        alert("Generation failed");
        setIsGenerating(false);
      }
    } catch (err) {
      console.error(err);
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '2rem' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
        <button className="btn-secondary" onClick={() => router.back()} style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>
          &larr; Back to Studio
        </button>
        <span style={{ color: 'var(--text-secondary)' }}>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>New Video Generation</span>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="heading-1" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>What are we creating today?</h1>
        <p className="text-muted" style={{ fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto' }}>
          Describe your video idea. The AI will write the script, split it into timeline scenes, and fetch the B-roll automatically.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <form onSubmit={handleGenerate}>
          <div style={{ marginBottom: '1.5rem' }}>
            <textarea 
              className="input-field" 
              placeholder="e.g., 'Write a 60-second short about the history of artificial intelligence and how neural networks were invented.'"
              style={{ minHeight: '150px', resize: 'vertical', fontSize: '1.1rem', padding: '1rem' }}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
              disabled={isGenerating}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                Length: Inherited from Studio
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12 2.1 12"></path><path d="M12 12 21.8 16"></path></svg>
                Tone: Studio Default
              </div>
            </div>
            
            <button 
              type="submit" 
              className="btn-primary" 
              style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', opacity: isGenerating ? 0.7 : 1 }}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating Script...' : 'Generate Video Timeline ✨'}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
