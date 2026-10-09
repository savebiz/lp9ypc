"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PathIcon } from "@/components/ui/icons";
import { hostnameOf, safeHttpUrl } from "@/lib/utils";
import type { CareerPath, CareerPathSuggestion } from "@/types";
import styles from "./CareerSuggestions.module.css";

/** One row: either a researched suggestion (has `suggestion`) or an instant keyword match. */
interface Item {
  key: string;
  path: CareerPath;
  suggestion?: CareerPathSuggestion;
}

interface Props {
  userId: string;
  /** Researched suggestions (status "new") of this panel's kind, already joined to career_paths. */
  suggestions: CareerPathSuggestion[];
  /** Instant keyword matches, used only when there are no researched suggestions. */
  fallback?: CareerPath[];
  variant: "match" | "switch";
  headingId: string;
}

/**
 * Dashboard panels "Suggested career paths" (variant "match") and
 * "Thinking of switching?" (variant "switch"). Add puts the path on the
 * member's profile; Dismiss hides a researched suggestion for good.
 */
export default function CareerSuggestions({ userId, suggestions, fallback = [], variant, headingId }: Props) {
  const router = useRouter();
  const researched = suggestions.filter((s) => s.career_paths);
  const usingFallback = researched.length === 0;
  const initial: Item[] = usingFallback
    ? fallback.map((p) => ({ key: `kw-${p.id}`, path: p }))
    : researched.map((s) => ({ key: s.id, path: s.career_paths!, suggestion: s }));

  const [items, setItems] = useState<Item[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [toast, setToast] = useState("");

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(""), 2400);
  }

  async function add(item: Item) {
    setBusy(item.key);
    setMessage(null);
    const supabase = createClient();
    // Add the path first, so a failure never hides a suggestion the member still wants.
    const ins = await supabase.from("member_career_paths").insert({ member_id: userId, career_path_id: item.path.id });
    if (ins.error && ins.error.code !== "23505") {
      setBusy(null);
      setMessage({ ok: false, text: `We couldn't add ${item.path.name}. Please check your connection and try again.` });
      return;
    }
    if (item.suggestion) {
      // Best effort: the path is already added; a stale "new" status only means it could reappear.
      await supabase.from("career_path_suggestions").update({ status: "added" }).eq("id", item.suggestion.id);
    }
    setBusy(null);
    setItems((list) => list.filter((i) => i.key !== item.key));
    showToast(`Added ${item.path.name} to your career paths`);
    router.refresh();
  }

  async function dismiss(item: Item) {
    if (!item.suggestion) return;
    setBusy(item.key);
    setMessage(null);
    const { error } = await createClient()
      .from("career_path_suggestions")
      .update({ status: "dismissed" })
      .eq("id", item.suggestion.id);
    setBusy(null);
    if (error) {
      setMessage({ ok: false, text: "We couldn't hide that suggestion. Please try again." });
      return;
    }
    setItems((list) => list.filter((i) => i.key !== item.key));
    showToast("Suggestion hidden");
  }

  const title = variant === "switch" ? "Thinking of switching?" : "Suggested career paths";
  const intro =
    variant === "switch"
      ? "Paths people with your background often move into, from our career research."
      : usingFallback
        ? "Based on your profession."
        : "From our career research, based on your profession.";

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="panel-head">
        <h2 id={headingId}>{title}</h2>
        <Link href="/dashboard/profile#paths" className="btn-link">All career paths</Link>
      </div>
      <p className="small ink-2" style={{ marginBottom: 14 }}>{intro}</p>

      {message && (
        <div className={`alert ${message.ok ? "alert-ok" : "alert-error"}`} role={message.ok ? "status" : "alert"} style={{ marginBottom: 12 }}>
          {message.text}
        </div>
      )}

      {items.length === 0 ? (
        <p className="ink-2">
          {variant === "switch"
            ? "Suggestions for paths you could move into will appear here once they're ready. Meanwhile, you can pick paths yourself on your profile."
            : "You're all caught up. You can change your career paths anytime on your profile."}
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const sources = (item.suggestion?.sources ?? [])
              .map((s) => ({ title: s.title, url: safeHttpUrl(s.url) }))
              .filter((s): s is { title: string; url: string } => !!s.url)
              .slice(0, 2);
            const isBusy = busy === item.key;
            return (
              <li key={item.key} className={styles.item}>
                <span className="icon-tile" aria-hidden="true"><PathIcon slug={item.path.slug} size={20} /></span>
                <div className={styles.body}>
                  <h3 className={styles.name}>{item.path.name}</h3>
                  {item.suggestion?.reason && <p className={styles.reason}>{item.suggestion.reason}</p>}
                  {sources.length > 0 && (
                    <p className={styles.sources}>
                      Sources:{" "}
                      {sources.map((s, i) => (
                        <span key={s.url}>
                          {i > 0 && " · "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className={styles.source}>
                            {s.title || hostnameOf(s.url)} <ExternalLink size={12} aria-hidden="true" />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                  <div className={styles.actions}>
                    <button type="button" className="btn btn-solid btn-sm" onClick={() => add(item)} disabled={!!busy}
                      aria-label={`Add ${item.path.name} to my career paths`}>
                      {isBusy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Add
                    </button>
                    {item.suggestion && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(item)} disabled={!!busy}
                        aria-label={`Dismiss the ${item.path.name} suggestion`}>
                        <X size={16} aria-hidden="true" /> Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}
