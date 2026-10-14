import { Inter } from "next/font/google";

// Every font is SF Pro. Apple devices have it built in; a PC uses SF Pro if it's installed,
// otherwise Inter, the closest free match (SF Pro's licence doesn't allow serving it from a website).
export const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-inter" });
