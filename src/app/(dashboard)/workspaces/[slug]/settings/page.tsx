"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  // Mock initial state (would be fetched from DB)
  const [colors, setColors] = useState({ primary: "#6366f1", secondary: "#14141d", accent: "#a855f7" });
  const [systemPrompt, setSystemPrompt] = useState("Use a cinematic cyberpunk aesthetic.");
  const [providers, setProviders] = useState({ llm: "GEMINI", video: "PEXELS", voice: "CARTESIA" });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Saving settings for", slug, { colors, systemPrompt, providers });
    // TODO: Wire up to Supabase update
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn-secondary" onClick={() => router.back()} style={{ padding: '0.5rem' }}>
          &larr; Back
        </button>
        <div>
          <h1 className="heading-1" style={{ fontSize: '2rem' }}>Workspace Settings</h1>
          <p className="text-muted">Configure the visual identity and AI engines for {slug}</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Section: Visual Identity */}
        <section className="glass-panel" style={{ padding: '2rem' }}>
          <h2 className="heading-2">Visual Identity (Color Palette)</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>These colors will be injected into Remotion during video rendering.</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Primary Color</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="color" value={colors.primary} onChange={e => setColors({...colors, primary: e.target.value})} style={{ width: '40px', height: '40px', padding: '0', border: 'none', background: 'transparent' }} />
                <input type="text" className="input-field" value={colors.primary.toUpperCase()} onChange={e => setColors({...colors, primary: e.target.value})} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Secondary Color</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="color" value={colors.secondary} onChange={e => setColors({...colors, secondary: e.target.value})} style={{ width: '40px', height: '40px', padding: '0', border: 'none', background: 'transparent' }} />
                <input type="text" className="input-field" value={colors.secondary.toUpperCase()} onChange={e => setColors({...colors, secondary: e.target.value})} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Accent Color</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="color" value={colors.accent} onChange={e => setColors({...colors, accent: e.target.value})} style={{ width: '40px', height: '40px', padding: '0', border: 'none', background: 'transparent' }} />
                <input type="text" className="input-field" value={colors.accent.toUpperCase()} onChange={e => setColors({...colors, accent: e.target.value})} />
              </div>
            </div>
          </div>
        </section>

        {/* Section: AI Directives */}
        <section className="glass-panel" style={{ padding: '2rem' }}>
          <h2 className="heading-2">System Directives</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Base instructions injected into every prompt for this channel.</p>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Master Aesthetic Prompt</label>
            <textarea 
              className="input-field" 
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="e.g., Always generate visual prompts using a dark, moody, cinematic style with high contrast lighting."
            />
          </div>
        </section>

        {/* Section: Swappable AI Providers */}
        <section className="glass-panel" style={{ padding: '2rem' }}>
          <h2 className="heading-2">AI Engine Providers</h2>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Select which models power this specific workspace.</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Script LLM</label>
              <select className="input-field" value={providers.llm} onChange={e => setProviders({...providers, llm: e.target.value})}>
                <option value="GEMINI">Google Gemini 2.5 Flash</option>
                <option value="OPENAI">OpenAI GPT-4o</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>B-Roll Generation</label>
              <select className="input-field" value={providers.video} onChange={e => setProviders({...providers, video: e.target.value})}>
                <option value="PEXELS">Pexels (Free Stock)</option>
                <option value="FAL_AI">Fal.ai (Fast Generate)</option>
                <option value="KLING">Kling AI (Cinematic)</option>
                <option value="GOOGLE_VEO">Google Veo</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Voice Engine</label>
              <select className="input-field" value={providers.voice} onChange={e => setProviders({...providers, voice: e.target.value})}>
                <option value="CARTESIA">Cartesia (High-Speed)</option>
                <option value="ELEVENLABS">ElevenLabs (Narrative)</option>
              </select>
            </div>
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem' }}>
            Save Settings
          </button>
        </div>

      </form>
    </div>
  );
}
