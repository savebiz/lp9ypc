import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import SignInPrompt from "@/components/community/SignInPrompt";
import ThreadView, { type ViewPost, type ViewThread } from "@/components/community/ThreadView";
import { ToastHost } from "@/components/community/Toast";
import styles from "@/components/community/community.module.css";
import { getSession } from "@/lib/session";
import { scheduleStalePostChecks } from "@/app/api/_lib/community";
import {
  REPLY_COLUMNS,
  displayNames,
  isUuid,
  loadCommunity,
  loadThread,
  roleBadges,
  viewerAndManagers,
} from "../../../_lib/data";
import { fetchModerationNotes, type ModerationNotes } from "@/lib/moderation-notes";
import type { Reply, Thread } from "@/types";

type Params = Promise<{ slug: string; threadId: string }>;

const REPLY_LIMIT = 300;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, threadId } = await params;
  const { community } = await loadCommunity(slug);
  if (!community) return { title: "Discussion · LP9 YPC" };
  const { thread } = isUuid(threadId) ? await loadThread(threadId) : { thread: null };
  const title = thread && thread.community_id === community.id ? thread.title : "Discussion";
  return { title: `${title} · ${community.name} · LP9 YPC`, robots: { index: false } };
}

function toView(r: Reply): ViewPost {
  return {
    id: r.id,
    authorId: r.author_id,
    body: r.body,
    status: r.status,
    needsReview: r.needs_review,
    likeCount: r.like_count ?? 0,
    editedAt: r.edited_at ?? null,
    createdAt: r.created_at,
    parentId: r.parent_id ?? null,
    depth: r.depth ?? 0,
  };
}

function threadView(t: Thread): ViewThread {
  return {
    id: t.id,
    authorId: t.author_id,
    body: t.body,
    status: t.status,
    needsReview: t.needs_review,
    likeCount: t.like_count ?? 0,
    editedAt: t.edited_at ?? null,
    createdAt: t.created_at,
    parentId: null,
    depth: 0,
    title: t.title,
    isPinned: t.is_pinned,
    isLocked: t.is_locked,
  };
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

  // Signed out: no content and no title — just how to get in (community-feature-spec §7).
  if (!user) return shell(<SignInPrompt path={`/community/${community.slug}/t/${threadId}`} />);

  // Everything that only needs the ids runs in parallel.
  const [{ thread, failed: threadFailed }, repliesRes, viewer, likesRes, reportsRes] = await Promise.all([
    loadThread(threadId),
    supabase
      .from("replies")
      .select(REPLY_COLUMNS)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(REPLY_LIMIT),
    viewerAndManagers(supabase, community.id, user.id),
    supabase.from("post_likes").select("target_id").eq("member_id", user.id).eq("community_id", community.id).limit(2000),
    supabase.from("reports").select("target_id").eq("reporter_id", user.id).eq("community_id", community.id).limit(2000),
  ]);
  if (threadFailed) return shell(loadError);
  if (!thread || thread.community_id !== community.id) notFound();

  const isMember = viewer.role !== null;
  const canModerate = isAdmin || viewer.role === "manager";
  const repliesFailed = !!repliesRes.error;
  const rawReplies = (repliesRes.data ?? []) as Reply[];
  // RLS already hides other people's held/removed replies from non-moderators.
  // Your own deleted replies drop out too; any replies under them get a stub.
  const replies = rawReplies.filter(
    (r) => canModerate || r.status === "visible" || (r.author_id === user.id && r.status !== "removed"),
  );

  const authorIds = [thread.author_id, ...replies.map((r) => r.author_id)];
  const [names, badges, threadNotes, replyNotes] = await Promise.all([
    displayNames(supabase, authorIds),
    roleBadges(supabase, authorIds, viewer.managerIds),
    canModerate ? fetchModerationNotes(supabase, "thread", [thread.id]) : Promise.resolve(new Map<string, ModerationNotes>()),
    canModerate
      ? fetchModerationNotes(supabase, "reply", replies.map((r) => r.id))
      : Promise.resolve(new Map<string, ModerationNotes>()),
    // Stale safety net: posts in this thread still pending 2+ minutes after
    // they were saved get their check scheduled again (server side, at most 3).
    scheduleStalePostChecks({ id: thread.id, communityId: community.id, communityName: community.name }),
  ]);
  const notes: Record<string, ModerationNotes> = Object.fromEntries([...threadNotes, ...replyNotes]);

  return shell(
    <ThreadView
      community={{ id: community.id, slug: community.slug, name: community.name }}
      thread={threadView(thread)}
      replies={replies.map(toView)}
      names={Object.fromEntries(names)}
      badges={badges}
      liked={((likesRes.data ?? []) as { target_id: string }[]).map((l) => l.target_id)}
      reported={((reportsRes.data ?? []) as { target_id: string }[]).map((r) => r.target_id)}
      notes={notes}
      viewer={{ id: user.id, isMember, canModerate }}
      repliesFailed={repliesFailed}
      limitHit={rawReplies.length >= REPLY_LIMIT}
    />,
  );
}
