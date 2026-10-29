import type { Metadata } from "next";
import type { Show } from "@housemix/shared";
import { API_URL } from "@/lib/api";
import { ConsolePage } from "@/components/console/console-page";

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
  return { title: show?.title ?? "Show", description: show?.plan?.headline || "Crowd-programmed run-of-show with Qloo evidence." };
}

/** The show is fetched on the server so the header and headline arrive in the first HTML. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConsolePage id={id} initialShow={await load(id)} />;
}
