import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Heart, MessageSquare, MessagesSquare, Settings2, ShieldCheck, Users } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CommunityIcon } from "@/components/community/CommunityIcon";
import JoinButton from "@/components/community/JoinButton";
import PostForm from "@/components/community/PostForm";
import NewActivityPill from "@/components/community/NewActivityPill";
import { LockedBadge, PinnedBadge, RoleBadge, StatusBadge, TimeAgo } from "@/components/community/PostBits";
import { ToastHost } from "@/components/community/Toast";
import { plural } from "@/components/community/time";
import styles from "@/components/community/community.module.css";
import { getSession } from "@/lib/session";
import { displayNames, loadCommunity, nameOf, roleBadges, viewerAndManagers } from "../_lib/data";
import type { CommunityOverview, Thread } from "@/types";

type ThreadRow = Pick<
  Thread,
  "id" | "author_id" | "title" | "status" | "is_pinned" | "is_locked" | "reply_count" | "last_activity_at" | "created_at" | "like_count"
>;

const BOARD_COLUMNS = "id, author_id, title, status, is_pinned, is_locked, reply_count, last_activity_at, created_at, like_count";

type Sort = "active" | "new" | "top";
const SORTS: { key: Sort; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "top", label: "Top" },
];
const parseSort = (v: string | string[] | undefined): Sort => (v === "new" || v === "top" ? v : "active");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { community } = await loadCommunity(slug);
  return { title: community ? `${community.name} · Communities · LP9 YPC` : "Communities · LP9 YPC" };
}

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const sort = parseSort(query.sort);
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
    user ? loadBoard(supabase, community.id, sort) : Promise.resolve({ data: [] as ThreadRow[], error: null }),
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

  const [names, badges] = user
    ? await Promise.all([
        displayNames(supabase, [...threads.map((t) => t.author_id), ...viewer.managerIds]),
        roleBadges(supabase, threads.map((t) => t.author_id), viewer.managerIds),
      ])
    : [new Map<string, string>(), {} as Record<string, "admin" | "manager">];
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
                <PostForm kind="thread" communityId={community.id} slug={community.slug} collapsible />
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
              <div className={styles.sortBar}>
                <nav className={styles.segmented} aria-label="Sort discussions">
                  {SORTS.map((s) => (
                    <Link
                      key={s.key}
                      href={s.key === "active" ? `/community/${community.slug}` : `/community/${community.slug}?sort=${s.key}`}
                      className={styles.segment}
                      aria-current={sort === s.key ? "page" : undefined}
                      scroll={false}
                      replace
                    >
                      {s.label}
                    </Link>
                  ))}
                </nav>
                {sort === "top" && <span className={styles.sortNote}>Most liked, all time</span>}
              </div>

              {threadsFailed ? (
                <div className="empty" role="status">
                  We couldn&apos;t load the discussions right now. Please try again in a moment.
                </div>
              ) : threads.length === 0 ? (
                <div className="empty">
                  {isMember
                    ? "No discussions yet. Start the first one — ask a question or share something useful."
                    : `No discussions yet. Join ${community.name} to start the first one.`}
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
                          <Link href={`/community/${community.slug}/t/${t.id}`} className={styles.stretched} prefetch>
                            {t.title}
                          </Link>
                        </h3>
                        {/* Two short lines so rows stay tidy at 320px; "·" is drawn by CSS (.metaItem). */}
                        <p className={styles.threadMeta}>
                          <span className={styles.metaItem}>
                            {nameOf(names, t.author_id)}
                            {own ? " (you)" : ""}
                            <RoleBadge role={badges[t.author_id]} />
                          </span>
                          <span className={styles.metaItem}>
                            <TimeAgo date={t.created_at} />
                          </span>
                        </p>
                        <p className={`${styles.threadMeta} ${styles.threadMeta2}`}>
                          <span className={styles.metaItem}>
                            <MessageSquare size={14} aria-hidden="true" /> {plural(t.reply_count, "reply", "replies")}
                          </span>
                          {t.like_count > 0 && (
                            <span className={styles.metaItem}>
                              <Heart size={14} aria-hidden="true" /> {plural(t.like_count, "like")}
                            </span>
                          )}
                          {t.reply_count > 0 && t.last_activity_at !== t.created_at && (
                            <span className={styles.metaItem}>
                              last reply <TimeAgo date={t.last_activity_at} />
                            </span>
                          )}
                          <NewActivityPill threadId={t.id} lastActivityAt={t.last_activity_at} />
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

/** Board order (community-feature-spec §9): pinned first, then by the chosen sort. */
function loadBoard(supabase: Awaited<ReturnType<typeof getSession>>["supabase"], communityId: string, sort: Sort) {
  let q = supabase.from("threads").select(BOARD_COLUMNS).eq("community_id", communityId).order("is_pinned", { ascending: false });
  if (sort === "new") q = q.order("created_at", { ascending: false });
  else if (sort === "top") q = q.order("like_count", { ascending: false }).order("last_activity_at", { ascending: false });
  else q = q.order("last_activity_at", { ascending: false });
  return q.limit(50);
}
