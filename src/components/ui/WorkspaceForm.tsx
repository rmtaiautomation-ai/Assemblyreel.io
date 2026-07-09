'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, Info, Play, Image as ImageIcon } from 'lucide-react';

const NICHES = [
  { title: 'Mythology & Ancient Lore', match: 'Cinema Studio / Short Studio', prompt: 'Epic scale, archaic vocabulary, dramatic world-building.' },
  { title: 'Horror & Paranormal Suspense', match: 'Cinema Studio / Short Studio', prompt: 'Build slow tension, dark/shadowy visual cues, explicit sound-effect markers.' },
  { title: 'True Crime & Investigation', match: 'Cinema Studio', prompt: 'Grounded, objective journalistic tone. Legal documents, evidence boards.' },
  { title: 'Cosmic & Space Science', match: 'Cinema Studio / Short Studio', prompt: 'Awe-inspiring, abstract cosmic visuals, expansive soundscapes.' },
  { title: 'Philosophy & Stoicism', match: 'Short Studio', prompt: 'Calm, resonant, authoritative tone. Classical stone textures, statues.' },
  { title: 'Financial Case Studies & Wealth', match: 'Cinema Studio / Marketing Studio', prompt: 'Fast-paced, high RPM business hooks, charts, wealth symbolism.' },
  { title: 'Alternative History & Lost Civilizations', match: 'Cinema Studio', prompt: 'Speculative, mysterious undertones. Ancient architecture, archeological sketches.' },
  { title: 'Tech, AI & Future Trends', match: 'Short Studio / Marketing Studio', prompt: 'High-energy, modern narrative pacing. Slick UI wireframes, neon glows.' },
  { title: 'Geopolitics & Global Documentaries', match: 'Cinema Studio', prompt: 'Nuanced investigative script structure. Dynamic charts, vector maps.' },
  { title: 'Deep Sea & Earth Anomalies', match: 'Cinema Studio / Short Studio', prompt: 'Unknown, claustrophobic atmosphere, deep-ocean grading.' },
  { title: 'Dark Psychology & Human Behavior', match: 'Short Studio', prompt: 'Highly click-driven script structures. Expressions, micro-movements.' },
  { title: 'Survival, Disasters & True Accounts', match: 'Cinema Studio', prompt: 'High-stakes, action-oriented. High-contrast environmental effects.' },
  { title: 'Internet Mysteries & Creepypastas', match: 'Short Studio / Cinema Studio', prompt: 'Glitchy, analog-horror aesthetic formatting. Old forum threads.' },
  { title: 'Pop Culture & Media Lore (Anime/Gaming)', match: 'Short Studio', prompt: 'Direct, high-retention fan service language. Dynamic fight sequences.' },
  { title: 'Biographies & Historical Figures', match: 'Cinema Studio', prompt: 'Chronological storytelling style. Period-accurate descriptive keywords.' },
  { title: 'Self-Improvement & Parables', match: 'Short Studio', prompt: 'Allegorical, fable-driven narrative structure. Simple, high-impact symbolic visuals.' },
  { title: 'Corporate Empires & Brand Breakdowns', match: 'Marketing Studio / Cinema Studio', prompt: 'Commercial analytical tone. Consumer psychologies, sleek boardroom cinematography.' },
  { title: 'Micro-History & Forgotten Archives', match: 'Short Studio', prompt: 'Casual "Did you know?" style hook. Retro 16mm film reels, antique items.' },
  { title: 'Health, Longevity & Biohacking Facts', match: 'Short Studio / Marketing Studio', prompt: 'Scientific but accessible language. Clinical clean lines, anatomical highlights.' },
  { title: 'Luxury Lifestyle & Architecture', match: 'Marketing Studio / Short Studio', prompt: 'Elegant, slow cinematic pans. Upscale color grading palettes, high minimalism.' }
];

const ART_STYLES = ['Charcoal', 'Cinematic', 'Minimalist', 'Cyberpunk', 'Watercolor', 'Anime', 'Photorealistic', 'Oil Painting', 'Claymation', 'Vector Art'];
const VOICES = [
  { id: 'cartesia_echo', name: 'Echo', desc: 'Male, American, Excited' },
  { id: 'cartesia_alloy', name: 'Alloy', desc: 'Female, American' },
  { id: 'cartesia_onyx', name: 'Onyx', desc: 'Male, American, Slow, Deep' },
  { id: 'cartesia_fable', name: 'Fable', desc: 'Female, British' },
  ...Array.from({ length: 16 }, (_, i) => ({ id: `voice_${i+5}`, name: `Voice Option ${i+5}`, desc: 'Generic Description' }))
];

const ASPECT_RATIOS = ['Vertical 9:16', 'Horizontal 16:9', 'Square 1:1'];
const DURATIONS = ['30-60s', '60-90s', '2-3m', '3-5m', '5-10m', '10-20m', '20-30 minutes'];

const StepHeader = ({ step, title, subtitle }: { step: number, title: string, subtitle: string }) => (
  <div className="mb-4 mt-12 first:mt-0">
    <span className="inline-block px-3 py-1 text-xs font-bold text-purple-600 border border-purple-200 rounded-full mb-2 bg-white">
      Step {step}
    </span>
    <h2 className="text-3xl font-bold text-purple-700 tracking-tight">{title}</h2>
    <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>
  </div>
);

export default function WorkspaceForm({ onSuccess }: { onSuccess?: () => void }) {
  const [expandedNiche, setExpandedNiche] = useState<number | null>(null);
  const [isNicheDropdownOpen, setIsNicheDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
        narration_voice_id: formData.voice_id,
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
  const step4Visible = step3Visible && formData.voice_id.length > 0;
  const step5Visible = step4Visible && formData.art_style_preset.length > 0;
  const step6Visible = step5Visible && formData.aspectRatio.length > 0;
  const step7Visible = step6Visible && formData.videoLanguage.length > 0;
  const allComplete = step7Visible && formData.duration.length > 0;

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-3xl p-8 sm:p-12 text-gray-900 mb-24">
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
              className="w-full bg-white border border-gray-300 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" 
              placeholder="Workspace Name (e.g. Finance Shorts)"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />

            <div className="relative">
              <select
                required
                className="w-full bg-white border border-gray-300 text-gray-900 px-4 py-3 rounded-lg appearance-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                value={formData.linkedAccount}
                onChange={(e) => setFormData({...formData, linkedAccount: e.target.value})}
              >
                <option value="" disabled>Select an Account</option>
                <option value="Email Me Instead">@ Email Me Instead</option>
                <option value="TikTok">@ TikTok Account</option>
                <option value="YouTube">@ YouTube Channel</option>
                <option value="Instagram">@ Instagram Page</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                ▼
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 text-blue-800 text-sm px-4 py-3 rounded-lg flex gap-2 items-center">
              <Info size={16} className="text-blue-500 min-w-4" />
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
                <span className="absolute -top-2.5 left-3 bg-white px-1 text-xs text-gray-500 font-medium">Choose Content</span>
                <div 
                  className="w-full bg-white border border-gray-300 text-gray-900 px-4 py-3 rounded-lg cursor-pointer flex justify-between items-center"
                  onClick={() => setIsNicheDropdownOpen(!isNicheDropdownOpen)}
                >
                  <span>{formData.niche || "Select a theme..."}</span>
                  <span className="text-gray-500 text-xs">▼</span>
                </div>
              </div>

              {isNicheDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[300px] overflow-y-auto custom-scrollbar">
                  {NICHES.map((niche, idx) => (
                    <div 
                      key={idx} 
                      className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${formData.niche === niche.title ? 'bg-purple-50' : ''}`}
                    >
                      <div 
                        className="p-3 cursor-pointer flex justify-between items-center"
                        onClick={() => {
                          setFormData({...formData, niche: niche.title, master_prompt: niche.prompt});
                          setIsNicheDropdownOpen(false);
                        }}
                      >
                        <span className="font-medium text-gray-900">{niche.title}</span>
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedNiche(expandedNiche === idx ? null : idx); }}
                          className="text-gray-400 hover:text-purple-600 p-1"
                        >
                          <Info size={16} />
                        </button>
                      </div>
                      {expandedNiche === idx && (
                        <div className="px-4 pb-3 text-sm text-gray-600 bg-gray-50 border-t border-gray-100 pt-2">
                          <p className="mb-1"><strong className="text-gray-900">Best Match:</strong> {niche.match}</p>
                          <p><strong className="text-gray-900">Prompt:</strong> {niche.prompt}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {formData.niche && (
                <button type="button" className="text-purple-500 text-xs mt-2 hover:underline">Show Sample</button>
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
                <div className="flex items-center gap-2 mb-3 text-gray-700 font-medium">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  <span>Narration Voice</span>
                </div>
                
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-[300px] overflow-y-auto">
                  {VOICES.map((voice) => (
                    <div 
                      key={voice.id}
                      onClick={() => setFormData({...formData, voice_id: voice.id})}
                      className={`flex items-center justify-between p-4 border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${formData.voice_id === voice.id ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-4">
                        <button type="button" className="text-purple-600 p-1 rounded-full border border-purple-200 hover:bg-purple-100 transition-colors">
                          <Play size={16} fill="currentColor" className="ml-0.5" />
                        </button>
                        <div>
                          <div className="font-semibold text-gray-900">{voice.name}</div>
                          <div className="text-xs text-gray-500">{voice.desc}</div>
                        </div>
                      </div>
                      {formData.voice_id === voice.id && (
                        <Check size={20} className="text-purple-600" />
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
             <div className="flex items-center gap-2 mb-3 text-gray-700 font-medium">
                <ImageIcon size={16} />
                <span>Art Style</span>
              </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {ART_STYLES.map(style => (
                <div 
                  key={style}
                  onClick={() => setFormData({...formData, art_style_preset: style})}
                  className={`relative aspect-square rounded-xl border-2 cursor-pointer overflow-hidden transition-all flex items-center justify-center bg-gray-100 ${formData.art_style_preset === style ? 'border-purple-600 shadow-md' : 'border-transparent hover:border-gray-300'}`}
                >
                  <span className="font-medium text-gray-700 text-center px-2 z-10">{style}</span>
                  {formData.art_style_preset === style && (
                    <div className="absolute top-2 right-2 bg-purple-600 rounded-full p-0.5 z-20">
                      <Check size={14} className="text-white" />
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
                  className={`p-6 rounded-xl border-2 text-center cursor-pointer flex flex-col items-center gap-4 transition-all ${formData.aspectRatio === ratio ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <div className={`border-2 ${formData.aspectRatio === ratio ? 'border-purple-600' : 'border-gray-400'} 
                    ${ratio.includes('9:16') ? 'w-10 h-16' : ratio.includes('16:9') ? 'w-16 h-10' : 'w-12 h-12'} rounded-md`} />
                  <span className={`font-semibold ${formData.aspectRatio === ratio ? 'text-purple-700' : 'text-gray-700'}`}>{ratio}</span>
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
                className="w-full bg-white border border-gray-300 text-gray-900 px-4 py-3 rounded-lg appearance-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                value={formData.videoLanguage}
                onChange={(e) => setFormData({...formData, videoLanguage: e.target.value})}
              >
                <option value="" disabled>Select a language</option>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Japanese">Japanese</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
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
                  className={`p-3 rounded-lg border-2 text-center cursor-pointer font-medium transition-all ${formData.duration === dur ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
                >
                  {dur}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUBMIT BUTTON */}
        {allComplete && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8 mt-4 border-t border-gray-100">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSubmitting ? "Saving to Database..." : "Complete Setup"} {!isSubmitting && <Check size={20} />}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
