import type { Config } from "tailwindcss";

// The "Ledger" look: warm paper, ink, a bookkeeper's green and a clay stamp colour.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F2EA",
        cream: "#FBF8F1",
        card: "#FFFDF8",
        ink: "#1B1A17",
        body: "#4A463F",
        muted: "#5E5A52",
        rule: "#E2DBCD",
        "rule-soft": "#EFE9DD",
        line: "#CFC6B4",
        brand: { DEFAULT: "#1F4D3A", light: "#2A634B", soft: "#E2EDE6", dot: "#2E7D57" },
        clay: { DEFAULT: "#8A4A26", dark: "#7A3F1F", soft: "#F3E3D6", line: "#E7C9B2" },
        bad: { DEFAULT: "#A3261F", soft: "#F7E1DE" },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Arial Narrow", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
