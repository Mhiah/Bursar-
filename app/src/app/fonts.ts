import { IBM_Plex_Mono, Nanum_Gothic } from "next/font/google";

// Headings and text: the device's system font, with Nanum Gothic loaded for devices that have none of them (most Windows PCs).
export const nanum = Nanum_Gothic({ subsets: ["latin"], weight: ["400", "700", "800"], variable: "--font-nanum" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
