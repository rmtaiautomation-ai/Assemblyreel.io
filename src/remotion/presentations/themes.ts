export const PRESENTATION_THEMES = {
  'dark-documentary': { background: '#101315', text: '#F7F1E5', muted: '#C7BCA9', accent: '#D5A35C', paper: '#F7F1E5', grid: '#778080', font: 'serif' },
  'parchment-archive': { background: '#D9D1BB', text: '#27231B', muted: '#605744', accent: '#95713A', paper: '#F5F0DF', grid: '#A69C85', font: 'serif' },
} as const;

export const DOCUMENTARY_THEMES_V2 = {
  'dark-documentary': { background: '#171717', surface: '#24211D', text: '#F5F0E7', muted: '#C5BEB2', accent: '#D4A15B', paper: '#F2ECDD', grid: '#655C50', font: 'serif' },
  'parchment-archive': { background: '#B9B29E', surface: '#F2ECDD', text: '#201B15', muted: '#514B40', accent: '#C5A45B', paper: '#F2ECDD', grid: '#807762', font: 'serif' },
} as const;
export function presentationTheme(theme: { id: keyof typeof PRESENTATION_THEMES; version: 1 | 2; overrides: { accent?: string } }) {
  const tokens = theme.version === 1 ? { ...PRESENTATION_THEMES[theme.id], surface: PRESENTATION_THEMES[theme.id].background } : DOCUMENTARY_THEMES_V2[theme.id];
  const accent = theme.overrides.accent ?? tokens.accent;
  const accentText = contrast(accent, tokens.background) >= 4.5 && contrast(accent, tokens.surface) >= 4.5 ? accent : tokens.text;
  const accentLabelText = contrast(accent, '#201B15') >= contrast(accent, '#F7F1E5') ? '#201B15' : '#F7F1E5';
  const accentLine = contrast(accent, tokens.background) >= 3 ? accent : tokens.text;
  return { ...tokens, accent, accentText, accentLabelText, accentLine };
}
export function accentTint(hex: string,alpha: number) { return `rgba(${[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)).join(',')},${alpha})`; }
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
