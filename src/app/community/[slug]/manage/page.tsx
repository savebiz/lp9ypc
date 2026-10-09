import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Bot, CircleCheck, Flag, Inbox, UserRound } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { ActionButton } from "@/components/community/ModActions";
import { StatusBadge, TimeAgo, categoryLabel } from "@/components/community/PostBits";
import { ToastHost } from "@/components/community/Toast";
import { withModerationNotes } from "@/lib/moderation-notes";
import styles from "@/components/community/community.module.css";
import { getSession } from "@/lib/session";
import { displayNames, loadCommunity, nameOf, viewerRole } from "../../_lib/data";
import type { ModerationAction, ModerationLogEntry, PostStatus, Report } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { community } = await loadCommunity(slug);
  return {
    title: community ? `Manage ${community.name} · LP9 YPC` : "Manage community · LP9 YPC",
    robots: { index: false },
  };
}

interface HeldThread {
  id: string;
  author_id: string;
  title: string;
  body: string;
  status: PostStatus;
  needs_review: boolean;
  moderation_reason: string | null;
  moderation_categories: string[] | null;
  moderated_by: "agent" | "human" | null;
  created_at: string;
}

interface HeldReply extends Omit<HeldThread, "title"> {
  thread_id: string;
}

interface TargetThread {
  id: string;
  author_id: string;
  title: string;
  body: string;
  status: PostStatus;
}

interface TargetReply {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  status: PostStatus;
}

const ACTION_LABEL: Record<ModerationAction, string> = {
  allow: "Allowed",
  hold: "Held",
  remove: "Removed",
  restore: "Restored",
  pin: "Pinned",
  unpin: "Unpinned",
  lock: "Locked",
  unlock: "Unlocked",
  delete_own: "Deleted by its author",
  report_resolve: "Resolved a report",
  report_dismiss: "Dismissed a report",
  flag: "Flagged for review",
};

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export default async function ManageCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ community, failed }, session] = await Promise.all([loadCommunity(slug), getSession()]);
  const { supabase, user, userName, isAdmin } = session;

  if (!community && !failed) notFound();
  if (!user) redirect(`/login?next=/community/${slug}/manage`);

  if (!community) {
    return (
      <>
        <Navbar user={user} isAdmin={isAdmin} userName={userName} />
        <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }}>
          <Link href="/community" className={`btn-link ${styles.backLink}`}>
            <ArrowLeft size={18} aria-hidden="true" /> All communities
          </Link>
          <div className="empty" style={{ marginTop: 24 }} role="status">
            We couldn&apos;t load this community right now. Please try again in a moment.
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const role = isAdmin ? null : await viewerRole(supabase, community.id, user.id);
  if (!isAdmin && role !== "manager") redirect(`/community/${community.slug}`);

  const cid = community.id;
  const base = `/community/${community.slug}`;

  // ── 1. The queues ────────────────────────────────────────────────────
  const [heldThreadsRes, heldRepliesRes, reportsRes, logRes] = await Promise.all([
    supabase
      .from("threads")
      .select("id, author_id, title, body, status, needs_review, created_at")
      .eq("community_id", cid)
      .or("status.eq.held,and(status.eq.visible,needs_review.eq.true)")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("replies")
      .select("id, thread_id, author_id, body, status, needs_review, created_at")
      .eq("community_id", cid)
      .or("status.eq.held,and(status.eq.visible,needs_review.eq.true)")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("reports")
      .select("id, community_id, target_type, target_id, reason, status, created_at")
      .eq("community_id", cid)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("moderation_log")
      .select("id, community_id, target_type, target_id, actor_type, actor_id, action, reason, created_at")
      .eq("community_id", cid)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const [heldThreads, heldReplies] = await Promise.all([
    withModerationNotes(supabase, "thread", (heldThreadsRes.data ?? []) as HeldThread[]),
    withModerationNotes(supabase, "reply", (heldRepliesRes.data ?? []) as HeldReply[]),
  ]);
  const reports = (reportsRes.data ?? []) as Pick<Report, "id" | "community_id" | "target_type" | "target_id" | "reason" | "status" | "created_at">[];
  const log = (logRes.data ?? []) as ModerationLogEntry[];
  const heldFailed = !!heldThreadsRes.error || !!heldRepliesRes.error;

  // ── 2. What the reports and log entries point at ─────────────────────
  const replyTargetIds = uniq([
    ...reports.filter((r) => r.target_type === "reply").map((r) => r.target_id),
    ...log.filter((l) => l.target_type === "reply").map((l) => l.target_id),
  ]);
  const replyTargetsRes = replyTargetIds.length
    ? await supabase.from("replies").select("id, thread_id, author_id, body, status").in("id", replyTargetIds)
    : { data: [] as TargetReply[] };
  const replyTargets = new Map(((replyTargetsRes.data ?? []) as TargetReply[]).map((r) => [r.id, r]));

  const threadIds = uniq([
    ...reports.filter((r) => r.target_type === "thread").map((r) => r.target_id),
    ...log.filter((l) => l.target_type === "thread").map((l) => l.target_id),
    ...heldReplies.map((r) => r.thread_id),
    ...[...replyTargets.values()].map((r) => r.thread_id),
  ]);
  const threadTargetsRes = threadIds.length
    ? await supabase.from("threads").select("id, author_id, title, body, status").in("id", threadIds)
    : { data: [] as TargetThread[] };
  const threadTargets = new Map(((threadTargetsRes.data ?? []) as TargetThread[]).map((t) => [t.id, t]));

  const names = await displayNames(supabase, [
    ...heldThreads.map((t) => t.author_id),
    ...heldReplies.map((r) => r.author_id),
    ...[...replyTargets.values()].map((r) => r.author_id),
    ...[...threadTargets.values()].map((t) => t.author_id),
    ...log.map((l) => l.actor_id),
  ]);

  const threadHref = (threadId: string, replyId?: string) => `${base}/t/${threadId}${replyId ? `#reply-${replyId}` : ""}`;

  const held = [
    ...heldThreads.map((t) => ({ kind: "thread" as const, post: t, title: t.title, threadId: t.id })),
    ...heldReplies.map((r) => ({
      kind: "reply" as const,
      post: r,
      title: threadTargets.get(r.thread_id)?.title ?? "a discussion",
      threadId: r.thread_id,
    })),
  ].sort((a, b) => a.post.created_at.localeCompare(b.post.created_at));

  const actorLabel = (l: ModerationLogEntry) =>
    l.actor_type === "agent" ? "Moderation assistant" : l.actor_type === "system" ? "System" : l.actor_id ? nameOf(names, l.actor_id) : "A moderator";

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }}>
        <Link href={base} className={`btn-link ${styles.backLink}`}>
          <ArrowLeft size={18} aria-hidden="true" /> {community.name}
        </Link>

        <div className="page-head" style={{ paddingTop: 16 }}>
          <span className="eyebrow">Manage</span>
          <h1 className="title-md" style={{ marginTop: 8, overflowWrap: "anywhere" }}>{community.name}</h1>
          <p className="lede">
            Posts needing review, reports from members, and what&apos;s been done recently. Every action here is logged.
          </p>
        </div>

        <div className="stack">
          {/* ── Held for review ─────────────────────────────────────── */}
          <section className="panel" aria-labelledby="held-h">
            <div className="panel-head">
              <h2 id="held-h">Needs your review</h2>
              {!heldFailed && <span className={styles.panelCount}>{held.length} waiting</span>}
            </div>
            {heldFailed ? (
              <div className="empty" role="status">We couldn&apos;t load held posts right now. Please try again in a moment.</div>
            ) : held.length === 0 ? (
              <p className="ink-2 row"><Inbox size={18} aria-hidden="true" /> Nothing waiting. Held posts, and posts that missed the automatic check, appear here.</p>
            ) : (
              <ul className={styles.queue}>
                {held.map(({ kind, post, title, threadId }) => {
                  const cats = post.moderation_categories ?? [];
                  return (
                    <li key={`${kind}-${post.id}`} className={styles.queueItem}>
                      <p className={styles.queueKind}>{kind === "thread" ? "Discussion" : "Reply"}</p>
                      <h3 className={styles.queueTitle}>
                        {kind === "thread" ? (
                          <Link href={threadHref(threadId)} className={styles.titleLink}>{title}</Link>
                        ) : (
                          <>
                            In{" "}
                            <Link href={threadHref(threadId, post.id)} className={styles.titleLink}>{title}</Link>
                          </>
                        )}
                      </h3>
                      <p className="small muted" style={{ marginTop: 2 }}>
                        {nameOf(names, post.author_id)} · <TimeAgo date={post.created_at} />
                      </p>
                      <p className={styles.excerpt}>{post.body}</p>
                      <div className={styles.note}>
                        <p>
                          <strong>
                            {post.status === "visible"
                              ? "Published without an automatic check — please look it over."
                              : post.moderated_by === "human" ? "Held by a moderator." : "Held by the moderation assistant."}
                          </strong>
                          {post.moderation_reason ? ` ${post.moderation_reason}` : ""}
                        </p>
                        {cats.length > 0 && (
                          <div className={styles.cats}>
                            {cats.map((c) => <span key={c} className="chip">{categoryLabel(c)}</span>)}
                          </div>
                        )}
                        {cats.includes("self_harm") && (
                          <p style={{ marginTop: 8 }}>
                            This member may be going through a hard time. Please make sure someone from the YPC team reaches out kindly and privately.
                          </p>
                        )}
                        {cats.includes("minors") && <p style={{ marginTop: 8 }}>Please tell a YPC admin about this post as well.</p>}
                      </div>
                      <div className={styles.queueActions}>
                        <ActionButton
                          label={post.status === "held" ? "Approve and publish" : "Looks fine"}
                          className="btn btn-solid btn-sm"
                          requests={[{ action: "restore", targetType: kind, targetId: post.id }]}
                          success={post.status === "held" ? "Published — members can see it now." : "Marked as checked."}
                        />
                        <ActionButton
                          label="Remove"
                          requests={[{ action: "remove", targetType: kind, targetId: post.id }]}
                          success="Removed."
                          confirm={{
                            title: `Remove this ${kind === "thread" ? "discussion" : "reply"}?`,
                            body: "It stays hidden from members. The author can still see it was removed.",
                            confirmLabel: "Remove",
                            danger: true,
                            askReason: true,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Open reports ────────────────────────────────────────── */}
          <section className="panel" aria-labelledby="reports-h">
            <div className="panel-head">
              <h2 id="reports-h">Open reports</h2>
              {!reportsRes.error && <span className={styles.panelCount}>{reports.length} open</span>}
            </div>
            {reportsRes.error ? (
              <div className="empty" role="status">We couldn&apos;t load reports right now. Please try again in a moment.</div>
            ) : reports.length === 0 ? (
              <p className="ink-2 row"><CircleCheck size={18} aria-hidden="true" /> No open reports.</p>
            ) : (
              <>
                <p className="small ink-2" style={{ marginBottom: 12 }}>
                  Resolve a report once you&apos;ve dealt with it. Dismiss it if the post doesn&apos;t break the guidelines.
                </p>
                <ul className={styles.queue}>
                  {reports.map((rep) => {
                    const reply = rep.target_type === "reply" ? replyTargets.get(rep.target_id) : undefined;
                    const thread =
                      rep.target_type === "thread" ? threadTargets.get(rep.target_id) : reply ? threadTargets.get(reply.thread_id) : undefined;
                    const target = rep.target_type === "thread" ? thread : reply;
                    const href = rep.target_type === "thread"
                      ? thread && threadHref(thread.id)
                      : reply && threadHref(reply.thread_id, reply.id);
                    return (
                      <li key={rep.id} className={styles.queueItem}>
                        <p className={styles.queueKind}>
                          <Flag size={12} aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
                          Reported {rep.target_type === "thread" ? "discussion" : "reply"} · <TimeAgo date={rep.created_at} />
                        </p>
                        <p className={styles.reportReason}>{rep.reason}</p>
                        {target ? (
                          <>
                            <h3 className={styles.queueTitle} style={{ marginTop: 10 }}>
                              {href ? (
                                <Link href={href} className={styles.titleLink}>
                                  {rep.target_type === "thread" ? thread?.title : `Reply in ${thread?.title ?? "a discussion"}`}
                                </Link>
                              ) : (
                                rep.target_type === "thread" ? thread?.title : "Reply"
                              )}
                            </h3>
                            <p className="small muted row-wrap" style={{ marginTop: 2, gap: 6 }}>
                              <span>{nameOf(names, target.author_id)}</span>
                              <StatusBadge status={target.status} />
                            </p>
                            <p className={styles.excerpt}>{target.body}</p>
                          </>
                        ) : (
                          <p className="small ink-2" style={{ marginTop: 8 }}>This post no longer exists.</p>
                        )}
                        <div className={styles.queueActions}>
                          <ActionButton
                            label="Resolve"
                            className="btn btn-solid btn-sm"
                            requests={[{ action: "report_resolve", reportId: rep.id }]}
                            success="Report resolved."
                          />
                          <ActionButton
                            label="Dismiss"
                            requests={[{ action: "report_dismiss", reportId: rep.id }]}
                            success="Report dismissed."
                          />
                          {target && target.status !== "removed" && (
                            <ActionButton
                              label="Remove post"
                              requests={[
                                { action: "remove", targetType: rep.target_type, targetId: rep.target_id },
                                { action: "report_resolve", reportId: rep.id },
                              ]}
                              success="Post removed and report resolved."
                              confirm={{
                                title: "Remove this post and resolve the report?",
                                body: "Members won't see the post any more. A moderator can restore it later.",
                                confirmLabel: "Remove post",
                                danger: true,
                                askReason: true,
                              }}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          {/* ── Recent actions ──────────────────────────────────────── */}
          <section className="panel" aria-labelledby="log-h">
            <div className="panel-head">
              <h2 id="log-h">Recent actions</h2>
            </div>
            {logRes.error ? (
              <div className="empty" role="status">We couldn&apos;t load recent actions right now. Please try again in a moment.</div>
            ) : log.length === 0 ? (
              <p className="ink-2">No moderation actions yet.</p>
            ) : (
              <ul className={styles.log}>
                {log.map((l) => {
                  const reply = l.target_type === "reply" && l.target_id ? replyTargets.get(l.target_id) : undefined;
                  const threadId = l.target_type === "thread" ? l.target_id : reply?.thread_id;
                  const threadTitle = threadId ? threadTargets.get(threadId)?.title : undefined;
                  const targetText = l.target_type === "thread" ? "a discussion" : l.target_type === "reply" ? "a reply" : null;
                  return (
                    <li key={l.id} className={styles.logItem}>
                      <p>
                        <strong>{ACTION_LABEL[l.action] ?? l.action}</strong>
                        {targetText && (
                          <>
                            {" "}{targetText}
                            {threadId && threadTitle && (
                              <>
                                {l.target_type === "reply" ? " in " : ": "}
                                <Link
                                  href={threadHref(threadId, l.target_type === "reply" && l.target_id ? l.target_id : undefined)}
                                  className={styles.inlineLink}
                                >
                                  {threadTitle}
                                </Link>
                              </>
                            )}
                          </>
                        )}
                      </p>
                      {l.reason && <p className="small ink-2" style={{ marginTop: 2 }}>{l.reason}</p>}
                      <p className={styles.logMeta}>
                        {l.actor_type === "agent" ? (
                          <Bot size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} />
                        ) : (
                          <UserRound size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} />
                        )}{" "}
                        {actorLabel(l)} · <TimeAgo date={l.created_at} />
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />
      <ToastHost />
    </>
  );
}
