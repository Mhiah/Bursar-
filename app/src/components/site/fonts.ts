import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";

export const head = Inter_Tight({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-head" });
export const text = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-text" });
export const code = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-code" });
