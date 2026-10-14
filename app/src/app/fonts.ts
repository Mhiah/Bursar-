import { Archivo, Figtree, IBM_Plex_Mono } from "next/font/google";

export const serif = Archivo({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif" });
export const sans = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
