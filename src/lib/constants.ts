/** z-index scale, mirrored as CSS variables in globals.css. Use these, never arbitrary values. */
export const Z = {
  sticky: 20,
  sidebar: 30,
  topbar: 40,
  overlay: 50,
  toast: 60,
} as const;

/** Standard icon stroke width across the app. */
export const ICON_STROKE = 1.75;

export const APP_NAME = "MediCore";

/** Query-cache timings (TanStack Query). Live-ish clinical data refreshes faster. */
export const STALE = {
  live: 15_000,
  standard: 60_000,
  reference: 30 * 60_000,
} as const;
