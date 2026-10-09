import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MessageSquare, MessagesSquare, Settings2, ShieldCheck, Users } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CommunityIcon } from "@/components/community/CommunityIcon";
import JoinButton from "@/components/community/JoinButton";
import PostForm from "@/components/community/PostForm";
import { LockedBadge, PinnedBadge, StatusBadge, TimeAgo } from "@/components/community/PostBits";
import { ToastHost } from "@/components/community/Toast";
import { plural } from "@/components/community/time";
import styles from "@/components/community/community.module.css";
import { getSession } from "@/lib/session";
import { displayNames, loadCommunity, nameOf, viewerAndManagers } from "../_lib/data";
import type { CommunityOverview, Thread } from "@/types";

type ThreadRow = Pick<
  Thread,
  "id" | "author_id" | "title" | "status" | "is_pinned" | "is_locked" | "reply_count" | "last_activity_at" | "created_at"
>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { community } = await loadCommunity(slug);
  return { title: community ? `${community.name} · Communities · LP9 YPC` : "Communities · LP9 YPC" };
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ community, failed }, session] = await Promise.all([loadCommunity(slug), getSession()]);
  const { supabase, user, userName, isAdmin } = session;

  if (!community && !failed) notFound();

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

  const [overviewRes, viewer, threadsRes] = await Promise.all([
    supabase
      .from("community_overview")
      .select("community_id, member_count, thread_count, last_activity_at")
      .eq("community_id", community.id)
      .maybeSingle(),
    user ? viewerAndManagers(supabase, community.id, user.id) : Promise.resolve({ role: null, managerIds: [] as string[] }),
    user
      ? supabase
          .from("threads")
          .select("id, author_id, title, status, is_pinned, is_locked, reply_count, last_activity_at, created_at")
          .eq("community_id", community.id)
          .order("is_pinned", { ascending: false })
          .order("last_activity_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as ThreadRow[], error: null }),
  ]);

  const overview = overviewRes.data as CommunityOverview | null;
  const isMember = viewer.role !== null;
  const isManager = viewer.role === "manager";
  const canModerate = isAdmin || isManager;
  const threadsFailed = !!threadsRes.error;

  // RLS already limits rows to visible + own + (moderators) everything. Keep the
  // list calm: visible threads, the viewer's own, and held ones for moderators.
  const threads = ((threadsRes.data ?? []) as ThreadRow[]).filter(
    (t) =>
      t.status === "visible" ||
      (user && t.author_id === user.id) ||
      (canModerate && t.status === "held"),
  );

  const names = user
    ? await displayNames(supabase, [...threads.map((t) => t.author_id), ...viewer.managerIds])
    : new Map<string, string>();
  const managerNames = viewer.managerIds.map((id) => nameOf(names, id));
  const kindLabel = community.kind === "career" ? "Career community" : "Interest community";

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }}>
        <Link href="/community" className={`btn-link ${styles.backLink}`}>
          <ArrowLeft size={18} aria-hidden="true" /> All communities
        </Link>

        <header className={styles.head}>
          <div className={styles.headTop}>
            <span className={`icon-tile ${styles.tileLg}`}>
              <CommunityIcon community={community} size={26} />
            </span>
            <span className="eyebrow">{kindLabel}</span>
          </div>
          <h1 className={styles.headTitle}>{community.name}</h1>
          {community.description && <p className={styles.headDesc}>{community.description}</p>}

          <div className={styles.headMeta}>
            {overview && (
              <>
                <span><Users size={15} aria-hidden="true" /> {plural(overview.member_count, "member")}</span>
                <span><MessagesSquare size={15} aria-hidden="true" /> {plural(overview.thread_count, "discussion")}</span>
              </>
            )}
            {managerNames.length > 0 && (
              <span>
                <ShieldCheck size={15} aria-hidden="true" />
                Managed by {managerNames.join(", ")}
              </span>
            )}
          </div>

          {user && (
            <div className={styles.headActions}>
              <JoinButton
                communityId={community.id}
                slug={community.slug}
                name={community.name}
                userId={user.id}
                initialJoined={isMember}
                isManager={isManager}
                variant="page"
              />
              {canModerate && (
                <Link href={`/community/${community.slug}/manage`} className="btn btn-ghost btn-sm">
                  <Settings2 size={16} aria-hidden="true" /> Manage
                </Link>
              )}
            </div>
          )}
        </header>

        {!user ? (
          <section className={`card card-cream ${styles.ctaCard} ${styles.section}`} aria-labelledby="members-h">
            <h2 id="members-h">Discussions are for YPC members</h2>
            <p className="ink-2">
              Sign in to read the conversations here and join in. New to YPC? Registering takes a few minutes.
            </p>
            <div className={styles.ctaActions}>
              <Link href={`/login?next=/community/${community.slug}`} className="btn btn-action">Sign in</Link>
              <Link href="/register" className="btn btn-ghost">Join YPC</Link>
            </div>
          </section>
        ) : (
          <>
            <div className={styles.section} style={{ marginTop: 24 }}>
              {isMember ? (
                <PostForm kind="thread" communityId={community.id} collapsible />
              ) : (
                <div className="card card-cream">
                  <p>
                    <strong>Join to post.</strong>{" "}
                    <span className="ink-2">
                      Any signed-in member can read these discussions. Join this community to start one or reply.
                    </span>
                  </p>
                </div>
              )}
            </div>

            <section className={styles.section} aria-labelledby="threads-h">
              <div className={styles.sectionHead}>
                <h2 id="threads-h">Discussions</h2>
              </div>

              {threadsFailed ? (
                <div className="empty" role="status">
                  We couldn&apos;t load the discussions right now. Please try again in a moment.
                </div>
              ) : threads.length === 0 ? (
                <div className="empty">
                  No discussions yet.{" "}
                  {isMember ? "Start the first one — ask a question or say hello." : "Join the community to start the first one."}
                </div>
              ) : (
                <ul className={styles.threads}>
                  {threads.map((t) => {
                    const own = t.author_id === user.id;
                    const hidden = t.status !== "visible";
                    return (
                      <li key={t.id} className={`${styles.thread}${hidden ? ` ${styles.threadHidden}` : ""}`}>
                        {(t.is_pinned || t.is_locked || hidden) && (
                          <div className={styles.badges}>
                            {t.is_pinned && <PinnedBadge />}
                            {t.is_locked && <LockedBadge />}
                            <StatusBadge status={t.status} />
                          </div>
                        )}
                        <h3 className={styles.threadTitle}>
                          <Link href={`/community/${community.slug}/t/${t.id}`} className={styles.stretched}>
                            {t.title}
                          </Link>
                        </h3>
                        <p className={styles.threadMeta}>
                          <span>
                            {nameOf(names, t.author_id)}
                            {own ? " (you)" : ""}
                          </span>
                          <span aria-hidden="true">·</span>
                          <TimeAgo date={t.created_at} />
                          <span aria-hidden="true">·</span>
                          <span>
                            <MessageSquare size={14} aria-hidden="true" /> {plural(t.reply_count, "reply", "replies")}
                          </span>
                          {t.reply_count > 0 && t.last_activity_at !== t.created_at && (
                            <span>
                              last reply <TimeAgo date={t.last_activity_at} />
                            </span>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
      <ToastHost />
    </>
  );
}
