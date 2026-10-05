import { ComboId } from "./ai/agents/edit-director";
import { OverlayClipKind, OverlayPreset } from "@/remotion/types";

export interface ComboOverlayConfig {
  kind: OverlayClipKind;
  preset: OverlayPreset;
  dimBackground?: boolean;
  templateData?: Record<string, unknown>;
}

export const COMBO_PRESETS: { id: ComboId; label: string; description: string }[] = [
  { id: "title_reveal", label: "Title Reveal", description: "Cinematic hook with scrim & sweep" },
  { id: "motion_text", label: "Motion Text", description: "Kinetic reveal for punchy lines" },
  { id: "checklist", label: "Checklist Card", description: "Slide-in animated check points" },
  { id: "quote", label: "Quote Card", description: "Prominent quote with dimmed backdrop" },
  { id: "chapter_open", label: "Chapter Open", description: "Old film grain + chapter card" },
  { id: "divine", label: "Divine Glow", description: "Ethereal light beam + floating dust" },
  { id: "archive", label: "Historical / Archive", description: "Film damage + documentary lower third" },
  { id: "clean", label: "Clean Cut", description: "Media only (Ken Burns motion, no overlays)" },
];

export function getComboConfigs(comboId: ComboId, text?: string): ComboOverlayConfig[] {
  const configs: ComboOverlayConfig[] = [];
  const cleanText = text && text.trim().length > 0 ? text.trim() : "Headline Statement";

  switch (comboId) {
    case "title_reveal":
      configs.push({ kind: "dim-scrim", preset: "none" });
      configs.push({ kind: "title-cutout-card", preset: "pop", templateData: { style: "default", text: cleanText } });
      configs.push({ kind: "light-sweep", preset: "none" });
      break;
    case "motion_text":
      configs.push({ kind: "text", preset: "cinematic-reveal" });
      break;
    case "checklist": {
      const parsedItems = text && text.includes('\n')
        ? text.split('\n').map(s => s.trim()).filter(Boolean)
        : text && text.includes('.')
        ? text.split('.').map(s => s.trim()).filter(Boolean).slice(0, 4)
        : ["Key Point 1", "Key Point 2", "Key Point 3"];
      const items = parsedItems.length > 0 ? parsedItems : ["Key Point 1", "Key Point 2", "Key Point 3"];
      configs.push({ kind: "dim-scrim", preset: "none" });
      configs.push({ kind: "checklist-card", preset: "slide", templateData: { style: "default", items } });
      break;
    }
    case "quote":
      configs.push({ kind: "dim-scrim", preset: "none" });
      configs.push({ kind: "title-cutout-card", preset: "slide", templateData: { style: "quote-card", text: cleanText } });
      break;
    case "chapter_open":
      configs.push({ kind: "film-damage", preset: "none" });
      configs.push({ kind: "text", preset: "chapter-card" });
      configs.push({ kind: "particles", preset: "none" });
      break;
    case "divine":
      configs.push({ kind: "light-beam", preset: "none" });
      configs.push({ kind: "particles", preset: "none" });
      configs.push({ kind: "text", preset: "line-wipe" });
      break;
    case "archive":
      configs.push({ kind: "film-damage", preset: "none" });
      configs.push({ kind: "text", preset: "lower-third" });
      break;
    case "clean":
      // No overlays, just media + ken burns
      break;
  }

  return configs;
}
