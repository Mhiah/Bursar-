import type { Config } from "tailwindcss";

// "Clean store" look: white pages, soft grey panels, a money green and bright accent tiles.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        cream: "#F6F7F9",
        card: "#FFFFFF",
        ink: "#0B1220",
        body: "#3F4A5C",
        muted: "#6B7385",
        rule: "#E6E8EE",
        "rule-soft": "#F0F2F5",
        line: "#D5D9E2",
        brand: { DEFAULT: "#0E8A5F", light: "#12A06F", soft: "#E3F6EE", dot: "#16B47C" },
        clay: { DEFAULT: "#D9620B", dark: "#B4500A", soft: "#FFF1E5", line: "#FBD3B0" },
        bad: { DEFAULT: "#D02F2F", soft: "#FDECEC" },
        tile: { violet: "#EEEAFE", violetInk: "#5B3FD6", sky: "#E4F2FE", skyInk: "#1B6FC2", amber: "#FFF4DB", amberInk: "#B07A00", rose: "#FDE8EE", roseInk: "#C2335E", mint: "#E3F6EE", mintInk: "#0E8A5F" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,18,32,0.04), 0 4px 16px -6px rgba(11,18,32,0.08)",
        lift: "0 2px 4px rgba(11,18,32,0.04), 0 18px 40px -16px rgba(11,18,32,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
