export const systemBTokens = {
  color: {
    canvas: "#111016",
    surface: "#1a1720",
    surfaceMuted: "#2a2432",
    ink: "#fff7e8",
    inkMuted: "#c4b8cf",
    line: "#51445d",
    accent: "#ff5b4d",
    accentStrong: "#ff786b",
    accentSoft: "#39242a",
    danger: "#ff4365",
    dangerSoft: "#3e1e2b",
    warning: "#ffd166",
    warningSoft: "#3b321c",
    focus: "#6ee7ff",
  },
  radius: { sm: "4px", md: "8px", lg: "14px", pill: "999px" },
  shadow: { sm: "3px 3px 0 rgba(255, 91, 77, .28)", md: "8px 8px 0 rgba(0, 0, 0, .38)" },
  motion: { fast: "120ms", normal: "260ms", ease: "cubic-bezier(.16,1,.3,1)" },
} as const;

export type SystemBTokens = typeof systemBTokens;
