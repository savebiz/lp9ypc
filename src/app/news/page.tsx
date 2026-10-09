import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { CalendarDays, CloudOff, Megaphone, type LucideIcon } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import EventCard from "@/components/news/EventCard";
import AnnouncementItem from "@/components/news/AnnouncementItem";
import { NEWS_COLUMNS, SCOPES, SCOPE_NAMES, SCOPE_WORDS, parseScope, type NewsItem } from "@/components/news/news";
import { getSession } from "@/lib/session";
import type { AnnouncementScope } from "@/types";
import styles from "./news.module.css";

export const metadata = { title: "News & events · LP9 YPC" };

// "Upcoming" depends on the current time, so always render fresh.
export const dynamic = "force-dynamic";

const EVENTS_LIMIT = 30;
const ANNOUNCEMENTS_LIMIT = 30;

type Session = Awaited<ReturnType<typeof getSession>>;
type Loaded = { items: NewsItem[]; failed: boolean };

const FAILED: Loaded = { items: [], failed: true };

/** Never throws: a missing or unreachable database just means "couldn't load". */
async function settle(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Loaded> {
  try {
    const { data, error } = await query;
    if (error) return FAILED;
    return { items: (Array.isArray(data) ? data : []) as NewsItem[], failed: false };
  } catch {
    return FAILED;
  }
}

async function loadNews(supabase: Session["supabase"], scope: AnnouncementScope | null): Promise<[Loaded, Loaded]> {
  const now = new Date().toISOString();

  let events = supabase
    .from("announcements")
    .select(NEWS_COLUMNS)
    .eq("is_active", true)
    .eq("kind", "event")
    // Keep events listed while they're happening: upcoming, or not yet ended.
    .or(`starts_at.gte."${now}",ends_at.gte."${now}"`);
  let announcements = supabase
    .from("announcements")
    .select(NEWS_COLUMNS)
    .eq("is_active", true)
    .eq("kind", "announcement");

  if (scope) {
    events = events.eq("scope", scope);
    announcements = announcements.eq("scope", scope);
  }

  return Promise.all([
    settle(events.order("starts_at", { ascending: true }).limit(EVENTS_LIMIT)),
    settle(announcements.order("created_at", { ascending: false }).limit(ANNOUNCEMENTS_LIMIT)),
  ]);
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const currentHref = scope ? `/news?scope=${scope}` : "/news";

  let session: Session | null = null;
  try {
    session = await getSession();
  } catch (err) {
    unstable_rethrow(err);
  }

  const [events, announcements] = session ? await loadNews(session.supabase, scope) : [FAILED, FAILED];
  const allFailed = events.failed && announcements.failed;
  const word = scope ? SCOPE_WORDS[scope] : null;

  const filters: { label: string; href: string; value: AnnouncementScope | null }[] = [
    { label: "All", href: "/news", value: null },
    ...SCOPES.map((s) => ({ label: SCOPE_NAMES[s], href: `/news?scope=${s}`, value: s })),
  ];

  return (
    <>
      <Navbar user={session?.user ?? null} isAdmin={session?.isAdmin ?? false} userName={session?.userName ?? ""} />
      <main id="main" className="wrap">
        <div className="page-head">
          <span className="eyebrow">News &amp; events</span>
          <h1 className="title-lg">What&apos;s happening.</h1>
          <p className="lede">
            Events and updates from parishes, Lagos Province 9, the region and RCCG nationally, shared by YPC
            coordinators.
          </p>
        </div>

        <nav aria-label="Show news from" className={`row-wrap ${styles.filters}`}>
          {filters.map((f) => {
            const active = f.value === scope;
            return (
              <Link
                key={f.label}
                href={f.href}
                className={`chip-btn${active ? " on" : ""}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>

        {allFailed ? (
          <div className={styles.section}>
            <EmptyState icon={CloudOff} retryHref={currentHref}>
              We couldn&apos;t load news and events just now. Please try again in a little while.
            </EmptyState>
          </div>
        ) : (
          <>
            <section aria-labelledby="events-h" className={styles.section}>
              <div className={styles.head}>
                <h2 id="events-h" className="title-sm">Upcoming events</h2>
                <p className="small muted">Times are Lagos time (WAT).</p>
              </div>
              {events.failed ? (
                <EmptyState icon={CloudOff} retryHref={currentHref}>
                  We couldn&apos;t load events just now. Please try again in a little while.
                </EmptyState>
              ) : events.items.length === 0 ? (
                <EmptyState icon={CalendarDays} showAll={!!scope}>
                  {word
                    ? `No upcoming ${word} events right now.`
                    : "No upcoming events yet. Workshops, meet-ups and other events will appear here when coordinators add them."}
                </EmptyState>
              ) : (
                <ul role="list" className={`${styles.list} ${styles.events}`}>
                  {events.items.map((e) => (
                    <li key={e.id}>
                      <EventCard event={e} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="announcements-h" className={styles.section}>
              <div className={styles.head}>
                <h2 id="announcements-h" className="title-sm">Announcements</h2>
                <p className="small muted">Newest first.</p>
              </div>
              {announcements.failed ? (
                <EmptyState icon={CloudOff} retryHref={currentHref}>
                  We couldn&apos;t load announcements just now. Please try again in a little while.
                </EmptyState>
              ) : announcements.items.length === 0 ? (
                <EmptyState icon={Megaphone} showAll={!!scope}>
                  {word ? `No ${word} announcements right now.` : "No announcements right now. Check back soon."}
                </EmptyState>
              ) : (
                <ul role="list" className={styles.list}>
                  {announcements.items.map((a) => (
                    <li key={a.id}>
                      <AnnouncementItem item={a} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

function EmptyState({
  icon: Icon,
  children,
  showAll = false,
  retryHref,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  showAll?: boolean;
  retryHref?: string;
}) {
  return (
    <div className="empty">
      <Icon size={28} aria-hidden="true" className={styles.emptyIcon} />
      <p className={styles.emptyText}>{children}</p>
      {showAll && (
        <p className={styles.emptyAction}>
          <Link href="/news" className="btn-link" scroll={false}>See all news &amp; events</Link>
        </p>
      )}
      {retryHref && (
        <p className={styles.emptyAction}>
          {/* A full page load, so the server tries the database again. */}
          <a href={retryHref} className="btn-link">Try again</a>
        </p>
      )}
    </div>
  );
}
