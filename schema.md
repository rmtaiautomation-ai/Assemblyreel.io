# Database Schema & State Interfaces

This file strictly enforces the database columns and state payloads to prevent data structure hallucinations.

## 1. Supabase PostgreSQL Tables

**Table: `users`**
- `id` (uuid, primary key)
- `email` (string, unique)
- `created_at` (timestamp)
- `credits` (integer, default: 0)
- `tier` (enum: 'free', 'pro')

**Table: `workspaces`** (The Niche Archetype Configuration)
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key -> users.id)
- `name` (string) - e.g., "FORBIDDEN SECRETS"
- `niche` (string) - e.g., "Esoteric Philosophy / Biblical Horror / Finance"
- `master_prompt` (text) - Holds permanent style instructions (e.g., "Deep cosmic backgrounds, weathered fresco textures, dark burgundy/ochre tones, featuring ancient iconography like the Ankh, Scarab, and Ouroboros.")

**Table: `projects`**
- `id` (uuid, primary key)
- `workspace_id` (uuid, foreign key -> workspaces.id)
- `title` (string)
- `status` (enum: 'scripting', 'generating', 'editing', 'published')
- `timeline_json` (jsonb) - *Governed strictly by the schema below*
- `final_video_url` (string, nullable)

## 2. Multi-Track Timeline Frontend State

```typescript
interface TimelineState {
  tracks: {
    video: VideoTrackBlock[];
    audio: AudioTrackBlock[];
  };
}

interface VideoTrackBlock {
  id: string;          // Unique node identifier
  start_time: number;  // Timestamp marker in seconds
  duration: number;    // Length of clip block
  asset_url: string;   // Address of the generated or uploaded MP4 clip
  transition_type: 'cut' | 'dissolve' | 'glitch' | 'fade';
  transition_duration: number; // Duration of transition in seconds
}

interface AudioTrackBlock {
  id: string;          // Unique node identifier
  start_time: number;  // Sync timestamp to match the video track above
  duration: number;    // Dynamic clip duration based on character pacing
  transcript: string;  // Explicit sentence slice used for individual micro-regeneration
  audio_url: string;   // Generated TTS file target
}