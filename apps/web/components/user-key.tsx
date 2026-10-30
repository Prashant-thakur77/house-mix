"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useHealth } from "@/lib/hooks";
import { getUserKey, KEY_EVENT, looksLikeKey, NEED_KEY_EVENT, READ_ONLY_EVENT, setUserKey } from "@/lib/user-key";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Your API key": the visitor's own Anthropic key for the Claude features (planning, Ask, Without Qloo, the briefing).
 * Opens by itself when the API asks for a key; also offers a visitor their own copy when a demo show refuses a change.
 */
export function UserKey() {
  const router = useRouter();
  const { health } = useHealth();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const read = () => setSaved(Boolean(getUserKey()));
    const need = (e: Event) => {
      setWhy((e as CustomEvent<string>).detail);
      setOpen(true);
    };
    const readOnly = (e: Event) => {
      const showId = (e as CustomEvent<string>).detail;
      toast("Demo shows stay the same for everyone", {
        description: "Make your own copy to approve, swap, ask and plan. It takes a second.",
        action: {
          label: "Make my copy",
          onClick: async () => {
            try {
              const copy = await api.copy(showId);
              toast.success("Your copy is ready", { description: "Change anything here; the demo stays as it was." });
              router.push(`/shows/${copy.id}`);
            } catch {
              toast.error("Couldn't make a copy right now. Try again in a minute.");
            }
          },
        },
      });
    };
    read();
    window.addEventListener(KEY_EVENT, read);
    window.addEventListener(NEED_KEY_EVENT, need);
    window.addEventListener(READ_ONLY_EVENT, readOnly);
    return () => {
      window.removeEventListener(KEY_EVENT, read);
      window.removeEventListener(NEED_KEY_EVENT, need);
      window.removeEventListener(READ_ONLY_EVENT, readOnly);
    };
  }, [router]);

  // Only where the deployment asks visitors for their own key (the public site); local development uses the server's.
  if (!health?.userKeyRequired && !saved) return null;
  const valid = looksLikeKey(draft);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setWhy(undefined);
          setOpen(true);
        }}
        title="Claude features run on your own Anthropic API key"
      >
        {saved ? <Check data-icon="inline-start" className="text-status-ok" /> : <KeyRound data-icon="inline-start" />}
        <span className="hidden sm:inline">{saved ? "Key added" : "Your API key"}</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setDraft("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your Anthropic API key</DialogTitle>
            <DialogDescription>
              {why ? <span className="mb-2 block font-medium text-foreground">{why}</span> : null}
              Planning a show, Ask House Mix, Without Qloo and the crew briefing use Claude, so they run on your own key: you only pay for what you use, and this demo never
              spends anyone else&apos;s. Everything else (the demo shows, evidence, music, exports, Run the night) is free and needs no key.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              setUserKey(draft.trim());
              setDraft("");
              setOpen(false);
              toast.success("Key added", { description: "It stays in this browser. Try that again now." });
            }}
          >
            <Label htmlFor="user-key">API key</Label>
            <Input
              id="user-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={saved ? "A key is saved in this browser. Paste a new one to replace it." : "sk-ant-…"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={draft.length > 0 && !valid}
            />
            <p className="text-label text-muted-foreground">
              Kept only in this browser and sent only with Claude requests to House Mix&apos;s API, which uses it for that request and never stores or logs it. Get one at console.anthropic.com
              (API keys). A plan costs about half a dollar; a question up to about 25 cents.
            </p>
            {draft.length > 0 && !valid ? <p className="text-label text-destructive">Anthropic API keys start with sk-ant-.</p> : null}
            <DialogFooter className="mt-2">
              {saved ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setUserKey(undefined);
                    toast("Key removed from this browser");
                  }}
                >
                  Remove my key
                </Button>
              ) : null}
              <Button type="submit" disabled={!valid}>
                Save in this browser
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
