export const Colors = {
  // Primary Accent — Healthy Energy
  emerald: "#10B981",
  mint: "#34D399",

  // Secondary Action — Tech Depth
  teal: "#0D9488",

  // Neutrals
  slate900: "#0F172A",  // dark glass / camera backdrop
  slate800: "#1E293B",
  slate600: "#475569",
  slate400: "#94A3B8",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",   // results dashboard / light backdrop
  zinc: "#E4E4E7",      // border / divider

  white: "#FFFFFF",

  // Macro-Specific Tonal Tints
  protein: "#F97316",   // Warm Coral / Sunset Orange
  carbs: "#6366F1",     // Soft Indigo / Sky Blue
  fat: "#F59E0B",       // Deep Honey Amber
} as const;

export type ColorKey = keyof typeof Colors;

/** Appends an alpha hex suffix to a 6-digit hex color. (0–255) */
export const alpha = (hex: string, opacity: number): string => {
  const a = Math.round(Math.min(Math.max(opacity, 0), 255))
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
};
