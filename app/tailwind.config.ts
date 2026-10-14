import type { Config } from "tailwindcss";

// Colours: blue #0066FF, dark navy #0A1128 for headings and dark areas, white and light blue #EAF6FF backgrounds.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        cream: "#EAF6FF",
        card: "#FFFFFF",
        ink: "#0A1128",
        body: "#3A4256",
        muted: "#5A6378",
        rule: "#D9E4F0",
        "rule-soft": "#EBF1F7",
        line: "#C4D3E3",
        brand: { DEFAULT: "#0066FF", light: "#1A75FF", soft: "#EAF6FF", dot: "#0066FF" },
        clay: { DEFAULT: "#0052CC", dark: "#0A1128", soft: "#EAF6FF", line: "#BBD9FF" },
        bad: { DEFAULT: "#C62828", soft: "#FDECEC" },
      },
      fontFamily: {
        serif: ["-apple-system", "BlinkMacSystemFont", "Roboto", "Helvetica Neue", "Nanum Gothic", "Segoe UI", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "Roboto", "Helvetica Neue", "Nanum Gothic", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
