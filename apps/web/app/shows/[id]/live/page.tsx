import type { Metadata } from "next";
import Link from "next/link";
import type { Show } from "@housemix/shared";
import { API_URL } from "@/lib/api";
import { LivePage } from "@/components/live/live-page";

async function load(id: string): Promise<Show | undefined> {
  try {
    const res = await fetch(`${API_URL}/shows/${encodeURIComponent(id)}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Show) : undefined;
  } catch {
    return undefined;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const show = await load((await params).id);
  return { title: show ? `Run the night · ${show.title}` : "Run the night", description: "The run-of-show played out: what's on, what's next and every crew cue." };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await load(id);
  if (!show?.plan) {
    return (
      <main id="main" className="mx-auto max-w-xl p-6">
        <h1 className="font-display text-[2rem] font-bold uppercase">Nothing to run yet</h1>
        <p className="mt-2 text-muted-foreground">{show ? "This show has no plan yet. Build the run-of-show first." : "This show doesn't exist."}</p>
        <Link href={show ? `/shows/${id}` : "/"} className="mt-4 inline-block font-medium underline">
          {show ? "Back to the console" : "Back to shows"}
        </Link>
      </main>
    );
  }
  return <LivePage show={show} />;
}
