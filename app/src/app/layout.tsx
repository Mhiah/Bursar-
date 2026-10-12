import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/wallet";

export const metadata: Metadata = {
  title: "Bursar",
  description: "An agent that runs your business's money in USDC, inside rules you set.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
