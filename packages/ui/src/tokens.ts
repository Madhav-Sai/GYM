// Design tokens (spec §6). Web mirrors these in Tailwind @theme; mobile imports directly.
export const colors = {
  bg: "#0A0A0B", surface: "#141416", surface2: "#1C1C1F", border: "#27272A",
  text: "#FAFAFA", textDim: "#A1A1AA", textMute: "#52525B",
  accent: "#10B981", warn: "#F59E0B", danger: "#EF4444", info: "#3B82F6", strain: "#0EA5E9",
} as const;
