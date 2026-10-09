"use client";

import { useMemo, useState } from "react";
import { categoryLabel } from "@/components/community/PostBits";
import { Check, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import type { Community, PostStatus, Profile, Reply, Report, Thread } from "@/types";
import { formatDateTime, memberNames, postJson, type TabActions } from "./shared";
import styles from "../admin.module.css";

type ModerateBody =
  | { action: "restore" | "remove"; targetType: "thread" | "reply"; targetId: string }
  | { action: "report_resolve" | "report_dismiss"; reportId: string };

const STATUS_TEXT: Record<PostStatus, string> = {
  visible: "Visible to members",
  held: "Held for review",
  removed: "Removed",
  pending: "Being checked",
};

/** Held posts and open reports across every community. Actions go through POST /api/community/moderate. */
export default function ModerationTab({
  heldThreads, heldReplies, openReports, relatedThreads, relatedReplies, communities, members, onError, onSuccess, onChanged,
}: TabActions & {
  heldThreads: Thread[]; heldReplies: Reply[]; openReports: Report[];
  relatedThreads: Thread[]; relatedReplies: Reply[];
  communities: Community[]; members: Profile[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const names = useMemo(() => memberNames(members), [members]);
  const communityName = useMemo(() => new Map(communities.map((c) => [c.id, c.name])), [communities]);
  const threadsById = useMemo(() => new Map([...relatedThreads, ...heldThreads].map((t) => [t.id, t])), [relatedThreads, heldThreads]);
  const repliesById = useMemo(() => new Map([...relatedReplies, ...heldReplies].map((r) => [r.id, r])), [relatedReplies, heldReplies]);

  const held = [
    ...heldThreads.map((t) => ({ type: "thread" as const, post: t as Thread | Reply, at: t.created_at })),
    ...heldReplies.map((r) => ({ type: "reply" as const, post: r as Thread | Reply, at: r.created_at })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function moderate(key: string, body: ModerateBody): Promise<boolean> {
    setBusy(key); onError("");
    const res = await postJson("/api/community/moderate", body);
    setBusy(null);
    if (!res.ok) {
      onError(res.error);
      return false;
    }
    return true;
  }

  async function restore(type: "thread" | "reply", id: string, wasHeld: boolean) {
    if (await moderate(id, { action: "restore", targetType: type, targetId: id })) {
      onSuccess(wasHeld ? "Published — members can see the post now." : "Marked as checked.");
      onChanged();
    }
  }

  async function remove(type: "thread" | "reply", id: string) {
    if (!confirm("Remove this post? Members won't see it any more.")) return;
    if (await moderate(id, { action: "remove", targetType: type, targetId: id })) {
      onSuccess("Post removed.");
      onChanged();
    }
  }

  async function removeAndResolve(r: Report) {
    if (!confirm("Remove the reported post and close this report?")) return;
    if (!(await moderate(r.id, { action: "remove", targetType: r.target_type, targetId: r.target_id }))) return;
    if (await moderate(r.id, { action: "report_resolve", reportId: r.id })) onSuccess("Post removed and report closed.");
    onChanged();
  }

  async function closeReport(r: Report, action: "report_resolve" | "report_dismiss") {
    if (await moderate(r.id, { action, reportId: r.id })) {
      onSuccess(action === "report_resolve" ? "Report marked as resolved." : "Report dismissed — the post stays up.");
      onChanged();
    }
  }

  function postSummary(type: "thread" | "reply", post: Thread | Reply | undefined) {
    if (!post) return <p className="small muted">This post no longer exists.</p>;
    const thread = type === "thread" ? (post as Thread) : threadsById.get((post as Reply).thread_id);
    return (
      <>
        {type === "thread" ? (
          <p className={styles.postTitle}>{(post as Thread).title}</p>
        ) : (
          <p className="small muted">Reply in “{thread?.title ?? "a discussion"}”</p>
        )}
        <Excerpt text={post.body} />
        <p className="small muted" style={{ marginTop: 4 }}>
          By {names.get(post.author_id) ?? "a member"} · {communityName.get(post.community_id) ?? "Unknown community"} · {formatDateTime(post.created_at)}
        </p>
      </>
    );
  }

  return (
    <div className="stack-lg">
      <section className="stack" aria-labelledby="held-h">
        <div>
          <h2 id="held-h" className="title-sm">Posts needing review ({held.length})</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Posts our moderation assistant or a manager held back, and posts published while the automatic check
            was unavailable. Approve to publish, or Remove to hide for good.
          </p>
        </div>
        {held.length === 0 ? (
          <div className="empty">Nothing is waiting. Held posts from every community appear here.</div>
        ) : (
          <div className="list">
            {held.map(({ type, post }) => {
              const isBusy = busy === post.id;
              return (
                <article key={post.id} className={`card ${styles.reviewCard}`}>
                  <div className="row-wrap" style={{ gap: 8, marginBottom: 6 }}>
                    <span className="status off">{type === "thread" ? "Discussion" : "Reply"}</span>
                    <span className="small muted">
                      {post.status === "visible"
                        ? "Published without an automatic check"
                        : post.moderated_by === "agent" ? "Held by the moderation assistant" : post.moderated_by === "human" ? "Held by a moderator" : "Held"}
                    </span>
                  </div>
                  {postSummary(type, post)}
                  {(post.moderation_reason || post.moderation_categories.length > 0) && (
                    <p className="small ink-2" style={{ marginTop: 6 }}>
                      <strong>Why:</strong> {post.moderation_reason || "No reason given"}
                      {post.moderation_categories.length > 0 && ` (${post.moderation_categories.map(categoryLabel).join(", ")})`}
                    </p>
                  )}
                  <div className="row-wrap" style={{ marginTop: 12 }}>
                    <button type="button" className="btn btn-solid btn-sm" onClick={() => restore(type, post.id, post.status === "held")} disabled={!!busy}>
                      {isBusy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}{" "}
                      {post.status === "held" ? "Approve and publish" : "Looks fine"}
                    </button>
                    <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => remove(type, post.id)} disabled={!!busy}>
                      <Trash2 size={16} aria-hidden="true" /> Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="reports-h">
        <div>
          <h2 id="reports-h" className="title-sm">Open reports ({openReports.length})</h2>
          <p className="small muted" style={{ marginTop: 4 }}>Posts members reported. Remove the post, or dismiss the report if the post is fine.</p>
        </div>
        {openReports.length === 0 ? (
          <div className="empty">No open reports.</div>
        ) : (
          <div className="list">
            {openReports.map((r) => {
              const post = r.target_type === "thread" ? threadsById.get(r.target_id) : repliesById.get(r.target_id);
              const isBusy = busy === r.id;
              return (
                <article key={r.id} className={`card ${styles.reviewCard}`}>
                  <div className="row-wrap" style={{ gap: 8, marginBottom: 6 }}>
                    <span className="status off">Report</span>
                    <span className="small muted">
                      {names.get(r.reporter_id) ?? "A member"} · {formatDateTime(r.created_at)}
                      {post ? ` · Post is ${STATUS_TEXT[post.status].toLowerCase()}` : ""}
                    </span>
                  </div>
                  <p className="ink-2"><strong>Reason:</strong> {r.reason}</p>
                  <div className={styles.quoted}>{postSummary(r.target_type, post)}</div>
                  <div className="row-wrap" style={{ marginTop: 12 }}>
                    {post && post.status !== "removed" && (
                      <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => removeAndResolve(r)} disabled={!!busy}>
                        {isBusy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />} Remove post
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => closeReport(r, "report_dismiss")} disabled={!!busy}>
                      <X size={16} aria-hidden="true" /> Post is fine, close report
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => closeReport(r, "report_resolve")} disabled={!!busy}>
                      <Check size={16} aria-hidden="true" /> Handled, close report
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Excerpt({ text }: { text: string }) {
  if (text.length <= 280) return <p className="prose small" style={{ marginTop: 4 }}>{text}</p>;
  return (
    <details className={styles.excerpt}>
      <summary>{text.slice(0, 240).trimEnd()}… <span className={styles.more}>Show full post</span></summary>
      <p className="prose small">{text}</p>
    </details>
  );
}
