'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, Info, Image as ImageIcon } from 'lucide-react';
import {
  ART_STYLES,
  ASPECT_RATIOS,
  DESTINATIONS,
  DURATIONS,
  LANGUAGES,
  NICHES,
} from '@/lib/workspace-options';
import { getAvailableVoices } from '@/app/actions/audio-actions';

/**
 * The niche / art style / ratio / duration lists live in `@/lib/workspace-options` rather
 * than here, because Workspace Settings now edits the very same columns this wizard
 * writes. Two copies of the option lists would let the two screens drift, and a channel
 * created under one list but re-saved under another would silently change value.
 */

/**
 * One voice as the local Voice Studio reports it.
 *
 * This step used to render a hardcoded list of twenty Cartesia-style ids
 * (`cartesia_echo`, `voice_5`, …) with a play button that played nothing. None of those
 * ids exist: narration is synthesised by Voice Studio on the user's own machine, and
 * `resolveValidVoice` silently discards any id it doesn't serve. So every channel ever
 * created here stored a voice id that the pipeline then ignored — and Settings, which now
 * lists the real voices, would flag each one as unrecognised. Reading the same live list
 * the Timeline Editor and Settings read makes the choice real at the point it is made.
 */
interface VoiceOption {
  id: string;
  name?: string;
  engine?: string;
  gender?: string;
}

const StepHeader = ({ step, title, subtitle }: { step: number, title: string, subtitle: string }) => (
  <div className="mb-4 mt-12 first:mt-0">
    <span className="inline-block px-3 py-1 text-xs font-bold text-ed-accent-text border border-ed-accent-border rounded-full mb-2 bg-ed-surface">
      Step {step}
    </span>
    <h2 className="text-3xl font-bold text-ed-accent-text tracking-tight">{title}</h2>
    <p className="text-ed-text-dim mt-1 text-sm">{subtitle}</p>
  </div>
);

export default function WorkspaceForm({ onSuccess }: { onSuccess?: () => void }) {
  const [expandedNiche, setExpandedNiche] = useState<number | null>(null);
  const [isNicheDropdownOpen, setIsNicheDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceState, setVoiceState] = useState<'loading' | 'ready' | 'unreachable'>('loading');
  // Separate from `formData.voice_id` because the valid choice "Auto" IS the empty id.
  // Gating the next step on the id alone would make Auto impossible to pick, and would
  // wall off workspace creation entirely whenever Voice Studio isn't running.
  const [voiceChosen, setVoiceChosen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAvailableVoices()
      .then((result) => {
        if (cancelled) return;
        const list: VoiceOption[] = result.success ? (result.voices ?? []) : [];
        setVoices(list);
        setVoiceState(list.length > 0 ? 'ready' : 'unreachable');
      })
      .catch(() => {
        if (!cancelled) setVoiceState('unreachable');
      });
    return () => { cancelled = true; };
  }, []);
  
  const [formData, setFormData] = useState({
    name: '',
    linkedAccount: '', // Store single primary account for the destination dropdown
    niche: '',
    master_prompt: '',
    art_style_preset: '',
    voice_id: '',
    aspectRatio: '',
    videoLanguage: '',
    duration: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const supabase = createClient();
    
    // Insert into Supabase
    const { error } = await supabase.from('workspaces').insert([
      {
        name: formData.name,
        linked_accounts: [formData.linkedAccount],
        content_theme: formData.niche,
        narration_voice_id: formData.voice_id || null,
        visual_aesthetic: formData.art_style_preset,
        aspect_ratio: formData.aspectRatio,
        video_language: formData.videoLanguage,
        duration_pref: formData.duration,
      }
    ]);

    setIsSubmitting(false);

    if (error) {
      console.error("Error creating workspace:", error.message, error.details, error.hint);
      alert(`Failed to create workspace: ${error.message}`);
      return;
    }

    if (onSuccess) onSuccess();
  };

  // Logic to show subsequent steps progressively
  const step2Visible = formData.name.length > 0 && formData.linkedAccount.length > 0;
  const step3Visible = step2Visible && formData.niche.length > 0;
  const step4Visible = step3Visible && voiceChosen;
  const step5Visible = step4Visible && formData.art_style_preset.length > 0;
  const step6Visible = step5Visible && formData.aspectRatio.length > 0;
  const step7Visible = step6Visible && formData.videoLanguage.length > 0;
  const allComplete = step7Visible && formData.duration.length > 0;

  return (
    <div className="bg-ed-surface border border-ed-border shadow-sm rounded-3xl p-8 sm:p-12 text-ed-text mb-24">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* STEP 1: DESTINATION */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <StepHeader 
            step={1} 
            title="Destination" 
            subtitle="The account where your video series will be posted" 
          />
          
          <div className="space-y-4">
            <input 
              required 
              type="text" 
              className="w-full bg-ed-surface border border-ed-border-strong text-ed-text px-4 py-3 rounded-lg focus:outline-none focus:border-ed-accent-border focus:ring-1 focus:ring-ed-accent-border" 
              placeholder="Workspace Name (e.g. Finance Shorts)"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />

            <div className="relative">
              <select
                required
                className="w-full bg-ed-surface border border-ed-border-strong text-ed-text px-4 py-3 rounded-lg appearance-none focus:outline-none focus:border-ed-accent-border focus:ring-1 focus:ring-ed-accent-border"
                value={formData.linkedAccount}
                onChange={(e) => setFormData({...formData, linkedAccount: e.target.value})}
              >
                <option value="" disabled>Select an Account</option>
                {DESTINATIONS.map((destination) => (
                  <option key={destination} value={destination}>@ {destination}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-ed-text-dim">
                ▼
              </div>
            </div>

            <div className="bg-ed-info-soft border border-ed-info-border text-ed-info text-sm px-4 py-3 rounded-lg flex gap-2 items-center">
              <Info size={16} className="text-ed-info min-w-4" />
              <span><strong>Tip:</strong> Make sure your account is <a href="#" className="underline">warmed up</a> for the best results.</span>
            </div>
          </div>
        </div>

        {/* STEP 2: CONTENT */}
        {step2Visible && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-6">
            <StepHeader 
              step={2} 
              title="Content" 
              subtitle="What will your video series be about?" 
            />
            
            <div className="relative">
              <div className="relative">
                <span className="absolute -top-2.5 left-3 bg-ed-surface px-1 text-xs text-ed-text-dim font-medium">Choose Content</span>
                <div 
                  className="w-full bg-ed-surface border border-ed-border-strong text-ed-text px-4 py-3 rounded-lg cursor-pointer flex justify-between items-center"
                  onClick={() => setIsNicheDropdownOpen(!isNicheDropdownOpen)}
                >
                  <span>{formData.niche || "Select a theme..."}</span>
                  <span className="text-ed-text-dim text-xs">▼</span>
                </div>
              </div>

              {isNicheDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-ed-surface border border-ed-border rounded-lg shadow-xl max-h-[300px] overflow-y-auto custom-scrollbar">
                  {NICHES.map((niche, idx) => (
                    <div 
                      key={idx} 
                      className={`border-b border-ed-border last:border-0 hover:bg-ed-well transition-colors ${formData.niche === niche.title ? 'bg-ed-accent-soft' : ''}`}
                    >
                      <div 
                        className="p-3 cursor-pointer flex justify-between items-center"
                        onClick={() => {
                          setFormData({...formData, niche: niche.title, master_prompt: niche.prompt});
                          setIsNicheDropdownOpen(false);
                        }}
                      >
                        <span className="font-medium text-ed-text">{niche.title}</span>
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedNiche(expandedNiche === idx ? null : idx); }}
                          className="text-ed-text-faint hover:text-ed-accent-text p-1"
                        >
                          <Info size={16} />
                        </button>
                      </div>
                      {expandedNiche === idx && (
                        <div className="px-4 pb-3 text-sm text-ed-text-dim bg-ed-well border-t border-ed-border pt-2">
                          <p className="mb-1"><strong className="text-ed-text">Best Match:</strong> {niche.match}</p>
                          <p><strong className="text-ed-text">Prompt:</strong> {niche.prompt}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {formData.niche && (
                <button type="button" className="text-ed-accent-text text-xs mt-2 hover:underline">Show Sample</button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: SERIES SETTINGS */}
        {step3Visible && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-6">
            <StepHeader 
              step={3} 
              title="Series Settings" 
              subtitle="Preferences for every video in your series" 
            />
            
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3 text-ed-text-dim font-medium">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  <span>Narration Voice</span>
                </div>
                
                {voiceState === 'loading' && (
                  <p className="text-sm text-ed-text-dim">Looking for Voice Studio…</p>
                )}

                {voiceState === 'unreachable' && (
                  <div className="rounded-xl border border-ed-warn-border bg-ed-warn-soft px-4 py-3 text-sm text-ed-warn">
                    <strong>Voice Studio isn&apos;t running.</strong> Narration is synthesised
                    on your own machine, so there are no voices to list right now. Continue
                    with Auto below — you can pick a specific voice later in Settings.
                  </div>
                )}

                <div className="border border-ed-border rounded-xl overflow-hidden bg-ed-surface shadow-sm max-h-[300px] overflow-y-auto">
                  <div
                    onClick={() => { setFormData({ ...formData, voice_id: '' }); setVoiceChosen(true); }}
                    className={`flex items-center justify-between p-4 border-b border-ed-border cursor-pointer transition-colors ${voiceChosen && formData.voice_id === '' ? 'bg-ed-well' : 'hover:bg-ed-well'}`}
                  >
                    <div>
                      <div className="font-semibold text-ed-text">Auto</div>
                      <div className="text-xs text-ed-text-dim">Voice Studio&apos;s default for its active engine</div>
                    </div>
                    {voiceChosen && formData.voice_id === '' && (
                      <Check size={20} className="text-ed-accent-text" />
                    )}
                  </div>

                  {voices.map((voice) => (
                    <div
                      key={voice.id}
                      onClick={() => { setFormData({ ...formData, voice_id: voice.id }); setVoiceChosen(true); }}
                      className={`flex items-center justify-between p-4 border-b border-ed-border last:border-0 cursor-pointer transition-colors ${formData.voice_id === voice.id ? 'bg-ed-well' : 'hover:bg-ed-well'}`}
                    >
                      <div>
                        <div className="font-semibold text-ed-text">{voice.name ?? voice.id}</div>
                        <div className="text-xs text-ed-text-dim">
                          {[voice.engine, voice.gender].filter(Boolean).join(' · ') || voice.id}
                        </div>
                      </div>
                      {formData.voice_id === voice.id && (
                        <Check size={20} className="text-ed-accent-text" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: ART STYLE */}
        {step4Visible && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-6">
             <div className="flex items-center gap-2 mb-3 text-ed-text-dim font-medium">
                <ImageIcon size={16} />
                <span>Art Style</span>
              </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {ART_STYLES.map(style => (
                <div 
                  key={style}
                  onClick={() => setFormData({...formData, art_style_preset: style})}
                  className={`relative aspect-square rounded-xl border-2 cursor-pointer overflow-hidden transition-all flex items-center justify-center bg-ed-raised ${formData.art_style_preset === style ? 'border-ed-accent shadow-md' : 'border-transparent hover:border-ed-border-strong'}`}
                >
                  <span className="font-medium text-ed-text-dim text-center px-2 z-10">{style}</span>
                  {formData.art_style_preset === style && (
                    <div className="absolute top-2 right-2 bg-ed-accent rounded-full p-0.5 z-20">
                      <Check size={14} className="text-ed-base" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: ASPECT RATIO */}
        {step5Visible && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8">
            <StepHeader 
              step={5} 
              title="Aspect Ratio" 
              subtitle="Choose the default rendering layout" 
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {ASPECT_RATIOS.map(ratio => (
                <div 
                  key={ratio}
                  onClick={() => setFormData({...formData, aspectRatio: ratio})}
                  className={`p-6 rounded-xl border-2 text-center cursor-pointer flex flex-col items-center gap-4 transition-all ${formData.aspectRatio === ratio ? 'border-ed-accent-border bg-ed-accent-soft' : 'border-ed-border bg-ed-surface hover:border-ed-border-strong'}`}
                >
                  <div className={`border-2 ${formData.aspectRatio === ratio ? 'border-ed-accent-border' : 'border-ed-border-strong'} 
                    ${ratio.includes('9:16') ? 'w-10 h-16' : ratio.includes('16:9') ? 'w-16 h-10' : 'w-12 h-12'} rounded-md`} />
                  <span className={`font-semibold ${formData.aspectRatio === ratio ? 'text-ed-accent-text' : 'text-ed-text-dim'}`}>{ratio}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 6: LANGUAGE */}
        {step6Visible && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8">
            <StepHeader 
              step={6} 
              title="Language" 
              subtitle="Select the primary language of the videos" 
            />
            <div className="relative">
              <select
                required
                className="w-full bg-ed-surface border border-ed-border-strong text-ed-text px-4 py-3 rounded-lg appearance-none focus:outline-none focus:border-ed-accent-border focus:ring-1 focus:ring-ed-accent-border"
                value={formData.videoLanguage}
                onChange={(e) => setFormData({...formData, videoLanguage: e.target.value})}
              >
                <option value="" disabled>Select a language</option>
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>{language}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-ed-text-dim">
                ▼
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: DURATION */}
        {step7Visible && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8">
            <StepHeader 
              step={7} 
              title="Duration" 
              subtitle="Target length for your videos" 
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DURATIONS.map(dur => (
                <div 
                  key={dur}
                  onClick={() => setFormData({...formData, duration: dur})}
                  className={`p-3 rounded-lg border-2 text-center cursor-pointer font-medium transition-all ${formData.duration === dur ? 'border-ed-accent-border bg-ed-accent-soft text-ed-accent-text' : 'border-ed-border bg-ed-surface text-ed-text-dim hover:border-ed-border-strong'}`}
                >
                  {dur}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUBMIT BUTTON */}
        {allComplete && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8 mt-4 border-t border-ed-border">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-ed-accent hover:bg-ed-accent-hover text-ed-base font-semibold py-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSubmitting ? "Saving to Database..." : "Complete Setup"} {!isSubmitting && <Check size={20} />}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
