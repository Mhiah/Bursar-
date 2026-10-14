import { IBM_Plex_Mono } from "next/font/google";

// Headings and text use the device's own system font; numbers use IBM Plex Mono.
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
