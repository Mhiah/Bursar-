import localFont from "next/font/local";

// One font everywhere: Inter, the free match for SF Pro. The font files are in this repo,
// so every device gets the same font without downloading it from Google.
export const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/inter-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
});
