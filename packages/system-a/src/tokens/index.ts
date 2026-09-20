export const systemATokens = {
  color: {
    canvas: "#f7f7f3",
    surface: "#ffffff",
    surfaceMuted: "#eef1ec",
    ink: "#1d2925",
    inkMuted: "#60706a",
    line: "#dbe3dd",
    accent: "#317a67",
    accentStrong: "#245d4f",
    accentSoft: "#e0efe9",
    danger: "#bd4d4d",
    dangerSoft: "#f9e9e7",
    warning: "#936a2c",
    warningSoft: "#f8f0dc",
    focus: "#6caa98",
  },
  radius: { sm: "8px", md: "12px", lg: "18px", pill: "999px" },
  shadow: { sm: "0 2px 8px rgba(24, 47, 39, .06)", md: "0 16px 40px rgba(24, 47, 39, .10)" },
  motion: { fast: "140ms", normal: "220ms", ease: "cubic-bezier(.2,.7,.2,1)" },
} as const;

export type SystemATokens = typeof systemATokens;
