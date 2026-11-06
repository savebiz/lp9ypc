import { redirect } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DashboardClient from "./DashboardClient";
import CommunitiesPanel, { type MyCommunity } from "./CommunitiesPanel";
import CareerSuggestions from "@/components/career/CareerSuggestions";
import { PathIcon } from "@/components/ui/icons";
import { getSession } from "@/lib/session";
import { CAREER_GOAL_LABELS, suggestPathSlugs } from "@/lib/career-match";
import { firstName, isExpired, shortPathName } from "@/lib/utils";
import EventCard from "@/components/news/EventCard";
import AnnouncementItem from "@/components/news/AnnouncementItem";
import FeedbackPanel from "@/components/feedback/FeedbackPanel";
import { selectNews, type NewsItem } from "@/components/news/news";
import { JOB_CARD_COMPACT_COLUMNS, type JobCardJob } from "@/components/jobs/card-data";
import WelcomePanel, { type WelcomeCommunity } from "@/components/welcome/WelcomePanel";
import SinceLastVisit, { type SinceData, type SinceThread } from "@/components/welcome/SinceLastVisit";
import type { CareerPath, CareerPathSuggestion, Community, Job, MemberCareerPath, MyFeedback, Profile } from "@/types";

export const metadata = { title: "My dashboard · LP9 YPC" };

const LOUNGE_SLUG = "ypc-lounge";
/** "Since you were last here" looks back at most this far (and counts at most SINCE_JOBS_CAP jobs). */
const SINCE_WINDOW_DAYS = 60;
const SINCE_JOBS_CAP = 100;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { supabase, user, isAdmin } = await getSession();
  if (!user) redirect("/login?next=/dashboard");

  const now = new Date().toISOString();
  const [profileRes, pathsRes, savedRes, jobsRes, annRes, allPathsRes, suggestionsRes, communitiesRes, eventsRes, feedbackRes, myThreadsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("member_career_paths").select("*, career_paths(*)").eq("member_id", user.id),
    // Dashboard job cards don't show descriptions, so only the card's compact columns are fetched.
    supabase.from("saved_jobs").select(`job_id, jobs(${JOB_CARD_COMPACT_COLUMNS})`).eq("member_id", user.id).order("created_at", { ascending: false }),
    // Pool of the latest live jobs to pick "Jobs for your paths" from (only 4 reach the page).
    supabase.from("jobs").select(`career_path_id, ${JOB_CARD_COMPACT_COLUMNS}`).eq("is_active", true).eq("review_status", "approved")
      .order("created_at", { ascending: false }).limit(40),
    selectNews((cols) => supabase.from("announcements").select(cols).eq("is_active", true).eq("kind", "announcement")
      .order("created_at", { ascending: false }).limit(3)),
    supabase.from("career_paths").select("*").order("name"),
    // Phase 2. If these tables aren't there yet (or the query fails), the
    // panels below fall back gracefully instead of breaking the dashboard.
    supabase.from("career_path_suggestions").select("*, career_paths(*)").eq("member_id", user.id).eq("status", "new")
      .order("created_at", { ascending: false }),
    supabase.from("community_members").select("role, communities(*)").eq("member_id", user.id),
    selectNews((cols) => supabase.from("announcements").select(cols).eq("is_active", true).eq("kind", "event")
      .or(`starts_at.gte."${now}",ends_at.gte."${now}"`).order("starts_at", { ascending: true }).limit(2)),
    // Phase 3.2: the member's own feedback. If the view isn't there yet, the panel is hidden.
    supabase.from("my_feedback").select("id, kind, message, page_path, target_type, target_id, status, public_reason, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(5),
    // "Since you were last here": the member's own discussions (replies are looked up below).
    welcome
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("threads").select("id, title, communities(slug)").eq("author_id", user.id).eq("status", "visible")
          .order("last_activity_at", { ascending: false }).limit(30),
  ]);

  const profile = profileRes.data as Profile | null;
  const memberPaths = ((pathsRes.data ?? []) as MemberCareerPath[]).filter((m) => m.career_paths);
  // Saved jobs whose listing was archived come back with jobs = null (RLS hides them); drop those.
  const savedJobs = ((savedRes.data ?? []) as unknown as { job_id: string; jobs: Job | null }[])
    .map((s) => s.jobs)
    .filter((j): j is Job => !!j);
  // Card columns + career_path_id only; DashboardClient just renders JobCards from these.
  const latest = (jobsRes.data ?? []) as unknown as Job[];
  const announcements = (annRes.data ?? []) as unknown as NewsItem[];
  const events = (eventsRes.data ?? []) as unknown as NewsItem[];
  const allPaths = (allPathsRes.data ?? []) as CareerPath[];
  const myFeedback = feedbackRes.error ? [] : ((feedbackRes.data ?? []) as MyFeedback[]);

  const pathIds = new Set(memberPaths.map((m) => m.career_path_id));
  // Database ids, but filtered to UUIDs anyway before going into a PostgREST filter string.
  const pathIdList = [...pathIds].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const myThreads = myThreadsRes.error
    ? []
    : ((myThreadsRes.data ?? []) as unknown as { id: string; title: string; communities: { slug: string } | null }[])
        .filter((t) => t.communities?.slug);
  const sinceIso = new Date(Date.now() - SINCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Second round: things that depend on the member's paths / discussions.
  // Every query here is optional: on any error its section simply has less in it.
  const [welcomeJobsRes, welcomeCommunitiesRes, pathJobsRes, repliesRes] = await Promise.all([
    welcome && pathIdList.length
      ? supabase.from("jobs").select(JOB_CARD_COMPACT_COLUMNS).eq("is_active", true).eq("review_status", "approved")
          .in("career_path_id", pathIdList).order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [], error: null }),
    welcome
      ? supabase.from("communities").select("id, slug, name, kind, icon, career_path_id").eq("is_active", true)
          .or(pathIdList.length ? `career_path_id.in.(${pathIdList.join(",")}),slug.eq.${LOUNGE_SLUG}` : `slug.eq.${LOUNGE_SLUG}`)
      : Promise.resolve({ data: [], error: null }),
    !welcome && pathIdList.length
      ? supabase.from("jobs").select("created_at").eq("is_active", true).eq("review_status", "approved")
          .in("career_path_id", pathIdList).gte("created_at", sinceIso)
          .order("created_at", { ascending: false }).limit(SINCE_JOBS_CAP)
      : Promise.resolve({ data: [], error: null }),
    !welcome && myThreads.length
      ? supabase.from("replies").select("thread_id, created_at").in("thread_id", myThreads.map((t) => t.id))
          .neq("author_id", user.id).eq("status", "visible").gte("created_at", sinceIso)
          .order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const matched = latest.filter((j) => j.career_path_id && pathIds.has(j.career_path_id));
  const forYou = (matched.length ? matched : latest).slice(0, 4);
  const forYouTitle = matched.length ? "Jobs for your paths" : "Latest jobs";

  // Career suggestions: researched ones first; otherwise an instant keyword
  // match on the member's profession. Paths the member already has are hidden.
  const goal = profile?.career_goal ?? null;
  const openSuggestions = suggestionsRes.error
    ? []
    : ((suggestionsRes.data ?? []) as CareerPathSuggestion[]).filter((s) => s.career_paths && !pathIds.has(s.career_path_id));
  const matchSuggestions = openSuggestions.filter((s) => s.kind === "match");
  const switchSuggestions = openSuggestions.filter((s) => s.kind === "switch");
  const bySlug = new Map(allPaths.map((p) => [p.slug, p]));
  const keywordMatches = suggestPathSlugs(profile?.profession)
    .map((slug) => bySlug.get(slug))
    .filter((p): p is CareerPath => !!p && !pathIds.has(p.id));
  const showMatchPanel = matchSuggestions.length > 0 || keywordMatches.length > 0;
  const showSwitchPanel = goal === "switch" || goal === "explore";

  const myCommunities: MyCommunity[] = communitiesRes.error
    ? []
    : ((communitiesRes.data ?? []) as unknown as { role: "member" | "manager"; communities: Community | null }[])
        .filter((r) => r.communities && r.communities.is_active)
        .map((r) => ({ community: r.communities!, role: r.role }))
        .sort((a, b) => a.community.name.localeCompare(b.community.name));

  const joinedRoles = new Map(myCommunities.map((m) => [m.community.id, m.role]));
  // Up to 3 jobs that are still open (an expired deadline would show "Applications closed").
  const welcomeJobs = ((welcomeJobsRes.error ? [] : welcomeJobsRes.data ?? []) as unknown as JobCardJob[])
    .filter((j) => !isExpired(j.deadline))
    .slice(0, 3);
  const welcomeCommunities: WelcomeCommunity[] = (
    (welcomeCommunitiesRes.error ? [] : welcomeCommunitiesRes.data ?? []) as unknown as WelcomeCommunity["community"][]
  )
    // Career communities first (by name), YPC Lounge last.
    .sort((a, b) => Number(a.slug === LOUNGE_SLUG) - Number(b.slug === LOUNGE_SLUG) || a.name.localeCompare(b.name))
    .map((c) => ({ community: c, joined: joinedRoles.has(c.id), isManager: joinedRoles.get(c.id) === "manager" }));

  const pathJobTimes = pathJobsRes.error ? [] : ((pathJobsRes.data ?? []) as { created_at: string }[]).map((j) => j.created_at);
  const sinceThreads: SinceThread[] = myThreads.map((t) => ({
    id: t.id,
    title: t.title,
    href: `/community/${encodeURIComponent(t.communities!.slug)}/t/${t.id}`,
  }));
  const sinceData: SinceData = {
    jobTimes: pathJobTimes,
    jobsCapped: pathJobTimes.length >= SINCE_JOBS_CAP,
    jobsHref: memberPaths.length === 1 ? `/jobs?path=${encodeURIComponent(memberPaths[0].career_paths!.slug)}` : "/jobs",
    replies: repliesRes.error
      ? []
      : ((repliesRes.data ?? []) as { thread_id: string; created_at: string }[]).map((r) => ({ threadId: r.thread_id, createdAt: r.created_at })),
    threads: sinceThreads,
    nextEvent: events[0] ? { title: events[0].title, startsAt: events[0].starts_at, endsAt: events[0].ends_at } : null,
  };

  const missing = [
    !profile?.employment_status && "employment status",
    !profile?.preferred_work_mode && "preferred work mode",
    memberPaths.length === 0 && "career paths",
  ].filter(Boolean) as string[];

  const matchPanel = showMatchPanel && (
    <CareerSuggestions
      key="match"
      userId={user.id}
      variant="match"
      headingId="suggested-h"
      suggestions={matchSuggestions}
      fallback={keywordMatches}
    />
  );
  // A member with no paths yet (e.g. "Not sure yet" at signup) sees suggestions first.
  const suggestionsFirst = memberPaths.length === 0;

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={profile?.full_name ?? ""} />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }}>
        {welcome && (
          <WelcomePanel
            userId={user.id}
            firstName={firstName(profile?.full_name)}
            jobs={welcomeJobs}
            communities={welcomeCommunities}
            hasPaths={memberPaths.length > 0}
          />
        )}

        <div className="hello">
          <h1 id="dashboard-h" tabIndex={-1}>Hi, {firstName(profile?.full_name)}</h1>
          <div className="row-wrap" style={{ marginTop: 12 }}>
            {memberPaths.map((m) => (
              <span key={m.id} className="chip">
                <PathIcon slug={m.career_paths!.slug} size={14} className="text-blue" />
                {shortPathName(m.career_paths!.name)}
              </span>
            ))}
            <Link href="/dashboard/profile#paths" className="btn-link">
              <Pencil size={16} aria-hidden="true" /> {memberPaths.length ? "Edit paths" : "Choose your career paths"}
            </Link>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 20 }}>
          {!welcome && <SinceLastVisit userId={user.id} data={sinceData} />}

          {suggestionsFirst && matchPanel}

          <DashboardClient
            userId={user.id}
            forYou={forYou}
            forYouTitle={forYouTitle}
            saved={savedJobs}
          />

          {!suggestionsFirst && matchPanel}

          {showSwitchPanel && (
            <CareerSuggestions
              userId={user.id}
              variant="switch"
              headingId="switch-h"
              suggestions={switchSuggestions}
            />
          )}

          <CommunitiesPanel communities={myCommunities} />

          {(events.length > 0 || announcements.length > 0) && (
            <section className="panel" aria-labelledby="news-h">
              <div className="panel-head">
                <h2 id="news-h">News &amp; events</h2>
                <Link href="/news" className="btn-link">See all news &amp; events</Link>
              </div>
              <div className="stack">
                {events.length > 0 && (
                  <div className="announcements">
                    {events.map((e) => <EventCard key={e.id} event={e} compact />)}
                  </div>
                )}
                {announcements.length > 0 && (
                  <div className="announcements">
                    {announcements.map((a) => <AnnouncementItem key={a.id} item={a} compact />)}
                  </div>
                )}
              </div>
            </section>
          )}

          <FeedbackPanel items={myFeedback} />

          <section className="panel" aria-labelledby="profile-h">
            <div className="panel-head">
              <h2 id="profile-h">Your profile</h2>
              <Link href="/dashboard/profile" className="btn btn-ghost btn-sm">Update profile</Link>
            </div>
            <dl className="facts">
              <div><dt>Email</dt><dd style={{ overflowWrap: "anywhere" }}>{profile?.email || user.email}</dd></div>
              <div><dt>Phone</dt><dd>{profile?.phone || "—"}</dd></div>
              <div><dt>Profession</dt><dd>{profile?.profession || "—"}</dd></div>
              <div><dt>Area / parish</dt><dd>{profile?.area_of_residence || "—"}</dd></div>
              <div><dt>Looking to</dt><dd>{goal ? CAREER_GOAL_LABELS[goal] : "—"}</dd></div>
            </dl>
            {missing.length > 0 && (
              <p className="small ink-2" style={{ marginTop: 14 }}>
                Add your {missing.join(", ")} so we can match you with better opportunities.
              </p>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
