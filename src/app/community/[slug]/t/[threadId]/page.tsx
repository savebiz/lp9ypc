import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Lock } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import JoinButton from "@/components/community/JoinButton";
import PostForm from "@/components/community/PostForm";
import ReportButton from "@/components/community/ReportButton";
import { DeleteOwnButton, ModActions } from "@/components/community/ModActions";
import {
  AuthorNote,
  LockedBadge,
  ModerationNote,
  PinnedBadge,
  StatusBadge,
  TimeAgo,
} from "@/components/community/PostBits";
import { ToastHost } from "@/components/community/Toast";
import { plural } from "@/components/community/time";
import styles from "@/components/community/community.module.css";
import { getSession } from "@/lib/session";
import { REPLY_COLUMNS, displayNames, isUuid, loadCommunity, loadThread, nameOf, viewerRole } from "../../../_lib/data";
import type { PostStatus, Reply, Thread } from "@/types";

type Params = Promise<{ slug: string; threadId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, threadId } = await params;
  const { community } = await loadCommunity(slug);
  if (!community) return { title: "Discussion · LP9 YPC" };
  const { thread } = isUuid(threadId) ? await loadThread(threadId) : { thread: null };
  const title = thread && thread.community_id === community.id ? thread.title : "Discussion";
  return { title: `${title} · ${community.name} · LP9 YPC`, robots: { index: false } };
}

interface FooterProps {
  kind: "thread" | "reply";
  post: { id: string; status: PostStatus };
  own: boolean;
  canModerate: boolean;
  userId: string;
  communityId: string;
  reported: boolean;
  isPinned?: boolean;
  isLocked?: boolean;
}

function PostFooter({ kind, post, own, canModerate, userId, communityId, reported, isPinned, isLocked }: FooterProps) {
  const showReport = !own && !canModerate && post.status === "visible";
  const showDelete = own && post.status !== "removed";
  if (!showReport && !showDelete && !canModerate) return null;
  return (
    <div className={styles.postFoot}>
      {showReport && (
        <ReportButton
          targetType={kind}
          targetId={post.id}
          communityId={communityId}
          userId={userId}
          alreadyReported={reported}
        />
      )}
      {showDelete && <DeleteOwnButton targetType={kind} targetId={post.id} />}
      {canModerate && (
        <ModActions targetType={kind} targetId={post.id} status={post.status} isPinned={isPinned} isLocked={isLocked} />
      )}
    </div>
  );
}

export default async function ThreadPage({ params }: { params: Params }) {
  const { slug, threadId } = await params;
  if (!isUuid(threadId)) notFound();

  const [{ community, failed }, session] = await Promise.all([loadCommunity(slug), getSession()]);
  const { supabase, user, userName, isAdmin } = session;
  if (!community && !failed) notFound();

  const shell = (content: React.ReactNode) => (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }}>
        <Link href={community ? `/community/${community.slug}` : "/community"} className={`btn-link ${styles.backLink}`}>
          <ArrowLeft size={18} aria-hidden="true" /> {community ? community.name : "All communities"}
        </Link>
        {content}
      </main>
      <Footer />
      <ToastHost />
    </>
  );

  const loadError = (
    <div className="empty" style={{ marginTop: 24 }} role="status">
      We couldn&apos;t load this discussion right now. Please try again in a moment.
    </div>
  );

  if (!community) return shell(loadError);

  if (!user) {
    return shell(
      <section className={`card card-cream ${styles.ctaCard}`} style={{ marginTop: 16 }} aria-labelledby="members-h">
        <h1 id="members-h" className="title-sm">Discussions are for YPC members</h1>
        <p className="ink-2">Sign in to read this discussion and join in. New to YPC? Registering takes a few minutes.</p>
        <div className={styles.ctaActions}>
          <Link href={`/login?next=/community/${community.slug}/t/${threadId}`} className="btn btn-action">Sign in</Link>
          <Link href="/register" className="btn btn-ghost">Join YPC</Link>
        </div>
      </section>,
    );
  }

  const { thread, failed: threadFailed } = await loadThread(threadId);
  if (threadFailed) return shell(loadError);
  if (!thread || thread.community_id !== community.id) notFound();

  const [repliesRes, role] = await Promise.all([
    supabase
      .from("replies")
      .select(REPLY_COLUMNS)
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(300),
    viewerRole(supabase, community.id, user.id),
  ]);

  const isMember = role !== null;
  const canModerate = isAdmin || role === "manager";
  const repliesFailed = !!repliesRes.error;
  // RLS already hides other people's held/removed replies from non-moderators.
  const replies = ((repliesRes.data ?? []) as Reply[]).filter(
    (r) => r.status === "visible" || r.author_id === user.id || canModerate,
  );

  const postIds = [thread.id, ...replies.map((r) => r.id)];
  const [names, myReportsRes] = await Promise.all([
    displayNames(supabase, [thread.author_id, ...replies.map((r) => r.author_id)]),
    supabase.from("reports").select("target_id").eq("reporter_id", user.id).in("target_id", postIds),
  ]);
  const reported = new Set(((myReportsRes.data ?? []) as { target_id: string }[]).map((r) => r.target_id));

  const ownThread = thread.author_id === user.id;
  const threadHidden = thread.status !== "visible";
  const visibleReplies = replies.filter((r) => r.status === "visible").length;
  const threadOpen = thread.status === "visible";
  const canReply = isMember && (threadOpen || canModerate) && (!thread.is_locked || canModerate);

  const note = (post: Thread | Reply, kind: "thread" | "reply", own: boolean) =>
    canModerate ? <ModerationNote post={post} /> : own ? <AuthorNote status={post.status} kind={kind} /> : null;

  return shell(
    <>
      <article
        className={`${styles.post} ${styles.postLead}${threadHidden ? ` ${styles.postHidden}` : ""}`}
        aria-labelledby="thread-title"
      >
        {(thread.is_pinned || thread.is_locked || threadHidden) && (
          <div className={styles.badges}>
            {thread.is_pinned && <PinnedBadge />}
            {thread.is_locked && <LockedBadge />}
            <StatusBadge status={thread.status} />
          </div>
        )}
        <h1 id="thread-title" className={styles.postTitle}>{thread.title}</h1>
        <p className={styles.postMeta}>
          <span className={styles.author}>
            {nameOf(names, thread.author_id)}
            {ownThread ? " (you)" : ""}
          </span>
          <span aria-hidden="true">·</span>
          <TimeAgo date={thread.created_at} />
        </p>
        {note(thread, "thread", ownThread)}
        <div className={styles.postBody}>{thread.body}</div>
        <PostFooter
          kind="thread"
          post={thread}
          own={ownThread}
          canModerate={canModerate}
          userId={user.id}
          communityId={community.id}
          reported={reported.has(thread.id)}
          isPinned={thread.is_pinned}
          isLocked={thread.is_locked}
        />
      </article>

      <section className={styles.section} aria-labelledby="replies-h">
        <div className={styles.sectionHead}>
          <h2 id="replies-h">{plural(visibleReplies, "reply", "replies")}</h2>
        </div>
        {repliesFailed ? (
          <div className="empty" role="status">We couldn&apos;t load the replies right now. Please try again in a moment.</div>
        ) : replies.length === 0 ? (
          <p className="ink-2">No replies yet.{canReply ? " Be the first to reply." : ""}</p>
        ) : (
          <ol className={styles.replies}>
            {replies.map((r) => {
              const own = r.author_id === user.id;
              const hidden = r.status !== "visible";
              return (
                <li key={r.id}>
                  <article
                    id={`reply-${r.id}`}
                    className={`${styles.post}${hidden ? ` ${styles.postHidden}` : ""}`}
                    aria-label={`Reply from ${nameOf(names, r.author_id)}`}
                  >
                    {hidden && (
                      <div className={styles.badges}>
                        <StatusBadge status={r.status} />
                      </div>
                    )}
                    <p className={styles.postMeta} style={{ marginTop: 0 }}>
                      <span className={styles.author}>
                        {nameOf(names, r.author_id)}
                        {own ? " (you)" : ""}
                      </span>
                      <span aria-hidden="true">·</span>
                      <TimeAgo date={r.created_at} />
                    </p>
                    {note(r, "reply", own)}
                    <div className={styles.postBody} style={{ marginTop: 8 }}>{r.body}</div>
                    <PostFooter
                      kind="reply"
                      post={r}
                      own={own}
                      canModerate={canModerate}
                      userId={user.id}
                      communityId={community.id}
                      reported={reported.has(r.id)}
                    />
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className={styles.section} style={{ marginTop: 24 }}>
        {canReply ? (
          <PostForm
            kind="reply"
            threadId={thread.id}
            note={thread.is_locked ? "This discussion is locked for members. As a moderator you can still reply." : undefined}
          />
        ) : thread.is_locked ? (
          <p className="card card-cream ink-2 row" style={{ alignItems: "flex-start" }}>
            <Lock size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
            <span>This discussion is locked. You can still read it, but new replies are closed.</span>
          </p>
        ) : !threadOpen ? (
          <p className="card card-cream ink-2">
            {thread.status === "removed"
              ? "This discussion has been removed, so replies are closed."
              : "Replies open once this discussion has been approved."}
          </p>
        ) : (
          <div className={`card card-cream ${styles.ctaCard}`}>
            <p>
              <strong>Join to reply.</strong>{" "}
              <span className="ink-2">Join {community.name} to reply here and start your own discussions.</span>
            </p>
            <div>
              <JoinButton
                communityId={community.id}
                slug={community.slug}
                name={community.name}
                userId={user.id}
                initialJoined={false}
                variant="page"
              />
            </div>
          </div>
        )}
      </div>
    </>,
  );
}
