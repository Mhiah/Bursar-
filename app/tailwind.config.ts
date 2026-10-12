import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14171f",
        paper: "#f7f6f2",
        brand: { DEFAULT: "#1f4d3a", light: "#2f6b52", soft: "#e3eee8" },
        warn: "#a15c07",
        bad: "#a3261f",
        // public website only
        site: {
          bg: "#F7F6F1",
          card: "#FFFFFF",
          panel: "#F0EEE6",
          ink: "#11231A",
          body: "#48524C",
          muted: "#7B827D",
          line: "#E5E2D8",
          green: "#1E7A4C",
          deep: "#0F2419",
          mint: "#E3F0DE",
          gold: "#E7B23A",
          goldsoft: "#FBF0D3",
          red: "#C2412D",
          redsoft: "#FBE6E1",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        head: ["var(--font-head)", "Inter", "system-ui", "sans-serif"],
        text: ["var(--font-text)", "Inter", "system-ui", "sans-serif"],
        code: ["var(--font-code)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
