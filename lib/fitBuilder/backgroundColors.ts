export type CanvasBackgroundSwatch = {
  id: string;
  label: string;
  hex: string;
};

/**
 * Curated pastel backdrops for the Fit Builder canvas -- a deliberate, narrow
 * exception to DESIGN.md's monochrome-chrome rule, scoped to this one surface
 * only (lets a fit be previewed against an editorial backdrop, the way a
 * lookbook photo would be). A fixed, hand-picked set rather than an open
 * color picker, so the exception stays controlled instead of unbounded.
 */
export const CANVAS_BACKGROUND_COLORS: CanvasBackgroundSwatch[] = [
  { id: 'blush', label: 'Blush', hex: '#F6DADA' },
  { id: 'peach', label: 'Peach', hex: '#F8DFC8' },
  { id: 'butter', label: 'Butter', hex: '#F5EBC8' },
  { id: 'sage', label: 'Sage', hex: '#DCE8DC' },
  { id: 'sky', label: 'Sky', hex: '#D9E6F2' },
  { id: 'lavender', label: 'Lavender', hex: '#E6DCF0' },
  { id: 'sand', label: 'Sand', hex: '#F0E4D3' },
  { id: 'stone', label: 'Stone', hex: '#DDD5CC' },
];
