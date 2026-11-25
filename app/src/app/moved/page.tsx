import { Wordmark } from "@/components/mark";

export const metadata = { title: "Bursar has moved" };

const NEW_ORIGIN = process.env.NEW_ORIGIN || "https://bursar.me";

/** Shown on the old domain: one line saying where Bursar is now, linking to the same page there. */
export default async function Moved({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to } = await searchParams;
  // Only ever link to the new domain.
  const href = to && to.startsWith(NEW_ORIGIN + "/") ? to : NEW_ORIGIN;
  const name = NEW_ORIGIN.replace(/^https?:\/\//, "");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Wordmark height={44} />
      <p className="text-lg text-ink">
        This site has moved to <a className="font-semibold text-brand underline underline-offset-4" href={href}>{name}</a>
      </p>
    </main>
  );
}
