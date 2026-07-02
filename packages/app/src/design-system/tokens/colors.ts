export const lightColors = {
  background: "#f7f2ea",
  surface: "#fffaf2",
  surfaceMuted: "#efe7dc",
  foreground: "#27231f",
  muted: "#756d62",
  border: "#dfd2c2",
  primary: "#2f6f46",
  primaryForeground: "#f8fff8",
  accent: "#c96e33",
  accentMuted: "#f4dfcf",
  danger: "#b42318",
  success: "#2f7d32",
  shadow: "#2b2118"
} as const;

export const darkColors = {
  background: "#151310",
  surface: "#201d18",
  surfaceMuted: "#2b261f",
  foreground: "#f0e8dc",
  muted: "#b7aa9a",
  border: "#3a332a",
  primary: "#8fca98",
  primaryForeground: "#102015",
  accent: "#e49a68",
  accentMuted: "#3a281e",
  danger: "#ff8f86",
  success: "#91d399",
  shadow: "#000000"
} as const;

export type AppColors = {
  [Key in keyof typeof lightColors]: string;
};
