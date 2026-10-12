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
          bg: "#FBFBF9",
          card: "#FFFFFF",
          panel: "#F4F6FA",
          ink: "#141A26",
          body: "#4F5666",
          muted: "#8A909C",
          line: "#E9EBF0",
          main: "#1D3A6E",
          maindark: "#162D57",
          soft: "#EAEFF8",
          mid: "#C7D3E8",
          red: "#B4473B",
          redsoft: "#FBEDEA",
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
