export const v2ValidTokens = {
  color: {
    ink: "#1d2925",
    surface: "#ffffff",
    accent: "#317a67",
    line: "#dbe3dd",
  },
  radius: { sm: "8px", md: "12px", lg: "18px" },
  motion: { fast: "140ms", normal: "220ms" },
} as const;

export type V2ValidTokens = typeof v2ValidTokens;
