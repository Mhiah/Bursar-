import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/mark";

export const metadata: Metadata = {
  metadataBase: new URL("https://bursar.myacxt.site"),
  title: "Bursar Whitepaper",
  description: "How Bursar runs a small business's money in USDC on Arc: the agent decides, the vault has the final say.",
  openGraph: { title: "Bursar Whitepaper", images: ["/whitepaper-pages/page-01.jpg"] },
};

// The whitepaper's pages as images, so it reads the same on every phone; the PDF is one tap away.
const pages = Array.from({ length: 12 }, (_, i) => `/whitepaper-pages/page-${String(i + 1).padStart(2, "0")}.jpg`);

export default function Whitepaper() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center no-underline">
          <Wordmark height={36} />
        </Link>
        <a href="/bursar-whitepaper.pdf" download="Bursar Whitepaper.pdf" className="btn whitespace-nowrap">
          Download PDF
        </a>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-4 px-5 pb-16 sm:px-8">
        {pages.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={`Bursar Whitepaper, page ${i + 1}`}
            width={1076}
            height={1522}
            loading={i < 2 ? "eager" : "lazy"}
            className="block h-auto w-full rounded-xl border border-rule bg-white"
          />
        ))}
      </main>
    </div>
  );
}
