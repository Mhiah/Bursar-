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
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
