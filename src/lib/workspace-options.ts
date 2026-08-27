/**
 * The option lists a channel is configured from — niches, art styles, aspect ratios,
 * languages and durations.
 *
 * These were previously literals inside WorkspaceForm.tsx, which was the only place a
 * workspace could ever be configured: everything here was chosen once at creation and
 * then frozen forever, because Workspace Settings had no editor for any of it (it had
 * an Appearance tab of unsaved colour pickers and a Providers tab of unsaved selects
 * instead). Settings now edits the same columns the creation wizard writes, so the two
 * screens have to offer the same choices — hence one module both import.
 *
 * The stored VALUES matter more than the labels: `aspect_ratio` holds the full string
 * "Vertical 9:16", `duration_pref` holds "60-90s", and existing rows are full of them.
 * Do not "tidy" these into codes without a migration.
 */

export interface NicheOption {
  title: string;
  /** Which studio mode this niche was authored for. Shown as guidance, never stored. */
  match: string;
  /** The starter aesthetic/tone hint shown when expanding the niche. Never stored. */
  prompt: string;
}

export const NICHES: readonly NicheOption[] = [
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
  { title: 'Luxury Lifestyle & Architecture', match: 'Marketing Studio / Short Studio', prompt: 'Elegant, slow cinematic pans. Upscale color grading palettes, high minimalism.' },
];

export const ART_STYLES = [
  'Charcoal', 'Cinematic', 'Minimalist', 'Cyberpunk', 'Watercolor',
  'Anime', 'Photorealistic', 'Oil Painting', 'Claymation', 'Vector Art',
] as const;

export const ASPECT_RATIOS = ['Vertical 9:16', 'Horizontal 16:9', 'Square 1:1'] as const;

export const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Japanese'] as const;

export const DURATIONS = ['30-60s', '60-90s', '2-3m', '3-5m', '5-10m', '10-20m', '20-30 minutes'] as const;

/** The destinations offered for `linked_accounts`. */
export const DESTINATIONS = [
  'Email Me Instead', 'TikTok', 'YouTube', 'Instagram',
] as const;
