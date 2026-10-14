import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/wallet";
import { MockBanner } from "@/components/mock-banner";
import { mono } from "./fonts";

export const metadata: Metadata = {
  title: "Bursar",
  description: "An agent that runs your business's money in USDC, inside rules you set.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <WalletProvider>
          <MockBanner />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
