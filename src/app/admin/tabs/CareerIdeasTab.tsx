"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, hostnameOf, safeHttpUrl } from "@/lib/utils";
import type { CareerPath, CareerPathCandidate } from "@/types";
import { friendlyDbError, slugify, writeProblem, type TabActions } from "./shared";
import styles from "../admin.module.css";

/**
 * New career paths proposed by the career-research assistant. Approving one
 * adds it to the list members pick from at registration and on their profile.
 */
export default function CareerIdeasTab({ candidates, careerPaths, adminId, onError, onSuccess, onChanged }: TabActions & {
  candidates: CareerPathCandidate[]; careerPaths: CareerPath[]; adminId: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function markReviewed(c: CareerPathCandidate, status: "approved" | "rejected") {
    return createClient().from("career_path_candidates")
      .update({ status, reviewed_by: adminId || null, reviewed_at: new Date().toISOString() })
      .eq("id", c.id)
      .select("id");
  }

  async function approve(c: CareerPathCandidate) {
    const name = c.name.trim();
    const slug = slugify(name, 60);
    if (!name || !slug) return onError(`"${c.name}" can't be used as a career path name. Reject it instead.`);
    const clash = careerPaths.find((p) => p.name.toLowerCase() === name.toLowerCase() || p.slug === slug);
    if (clash) return onError(`There's already a career path called "${clash.name}". Reject this idea instead.`);
    if (!confirm(`Add "${name}" as a new career path? Members will see it at registration and on their profile.`)) return;

    setBusy(c.id); onError("");
    const ins = await createClient().from("career_paths").insert({ name, slug });
    if (ins.error) {
      setBusy(null);
      if (ins.error.code === "23505") return onError(`A career path with the name "${name}" (or the same web address) already exists. Reject this idea instead.`);
      return onError(friendlyDbError("add the career path", ins.error));
    }
    const problem = writeProblem("mark the idea as approved", await markReviewed(c, "approved"));
    setBusy(null);
    if (problem) {
      onError(`"${name}" was added as a career path, but the idea is still in this list. ${problem}`);
    } else {
      onSuccess(`"${name}" is now a career path members can choose.`);
    }
    onChanged();
  }

  async function reject(c: CareerPathCandidate) {
    if (!confirm(`Reject the idea "${c.name}"?`)) return;
    setBusy(c.id); onError("");
    const problem = writeProblem("reject the idea", await markReviewed(c, "rejected"));
    setBusy(null);
    if (problem) return onError(problem);
    onSuccess(`Rejected "${c.name}".`);
    onChanged();
  }

  return (
    <div className="stack">
      <div>
        <h2 className="title-sm">Career path ideas</h2>
        <p className="small muted" style={{ marginTop: 4 }}>
          Our career research assistant suggests new career paths when members&apos; professions don&apos;t fit the current list.
          Approving one adds it for every member to choose.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="empty">No new ideas waiting for review.</div>
      ) : (
        <div className="list">
          {candidates.map((c) => {
            const evidence = (c.evidence ?? [])
              .map((e) => ({ title: e.title, url: safeHttpUrl(e.url) }))
              .filter((e): e is { title: string; url: string } => !!e.url)
              .slice(0, 5);
            const isBusy = busy === c.id;
            return (
              <article key={c.id} className={`card ${styles.reviewCard}`} aria-labelledby={`cand-${c.id}`}>
                <h3 id={`cand-${c.id}`} className={styles.cardTitle}>{c.name}</h3>
                <p className="small muted" style={{ marginTop: 2 }}>Suggested {formatDate(c.created_at)}</p>
                {c.rationale && <p className="ink-2" style={{ marginTop: 8 }}>{c.rationale}</p>}
                {evidence.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p className="small" style={{ fontWeight: 600 }}>Evidence</p>
                    <ul className={styles.evidence}>
                      {evidence.map((e) => (
                        <li key={e.url}>
                          <a href={e.url} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
                            {e.title || hostnameOf(e.url)} <ExternalLink size={14} aria-hidden="true" />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                          <span className="small muted"> · {hostnameOf(e.url)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="row-wrap" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-solid btn-sm" onClick={() => approve(c)} disabled={!!busy}>
                    {isBusy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} Approve
                  </button>
                  <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => reject(c)} disabled={!!busy}>
                    <X size={16} aria-hidden="true" /> Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
