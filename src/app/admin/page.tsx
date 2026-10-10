import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import AdminClient from "./AdminClient";
import type { AdminData } from "./tabs/shared";
import { getSession } from "@/lib/session";
import { withModerationNotes } from "@/lib/moderation-notes";
import type {
  AgentRun, Announcement, CareerPath, CareerPathCandidate, Community, CommunityOverview, Job, JobSource,
  Profile, Reply, Report, Thread,
} from "@/types";

export const metadata = { title: "Admin · LP9 YPC" };

// Moderation notes are hidden from select by column grants; never select "*" on posts.
// Phase 3 adds like_count/edited_at (threads) and parent_id/depth/like_count/edited_at (replies).
const THREAD_COLS = "id, community_id, author_id, title, body, status, needs_review, is_pinned, is_locked, reply_count, last_activity_at, created_at, updated_at, like_count, edited_at";
const REPLY_COLS = "id, thread_id, community_id, author_id, body, status, needs_review, created_at, updated_at, parent_id, depth, like_count, edited_at";
// The review queue: held posts, plus posts published while the automatic check was down.
const NEEDS_REVIEW = "status.eq.held,and(status.eq.visible,needs_review.eq.true)";


export default async function AdminPage() {
  const { supabase, user, isAdmin, userName } = await getSession();
  if (!user) redirect("/login?next=/admin");
  // Server-side role check. The database's row-level security enforces the
  // same rule on every query, so this page can't leak data even if bypassed.
  if (!isAdmin) redirect("/dashboard");

  const [jobsRes, membersRes, pathsRes, annRes, linksRes] = await Promise.all([
    supabase.from("jobs").select("*, career_paths(*)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("career_paths").select("*").order("name"),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("member_career_paths").select("member_id, career_path_id"),
  ]);

  // Phase 2 (job finder, communities, moderation, agents). All admin-readable under RLS.
  const [
    sourcesRes, communitiesRes, communityMembersRes, overviewRes,
    heldThreadsRes, heldRepliesRes, reportsRes, candidatesRes, runsRes,
  ] = await Promise.all([
    supabase.from("job_sources").select("*").order("created_at", { ascending: false }),
    supabase.from("communities").select("*").order("name"),
    supabase.from("community_members").select("community_id, member_id, role"),
    supabase.from("community_overview").select("*"),
    supabase.from("threads").select(THREAD_COLS).or(NEEDS_REVIEW).order("created_at", { ascending: true }).limit(100),
    supabase.from("replies").select(REPLY_COLS).or(NEEDS_REVIEW).order("created_at", { ascending: true }).limit(100),
    supabase.from("reports").select("*").eq("status", "open").order("created_at", { ascending: true }).limit(100),
    supabase.from("career_path_candidates").select("*").eq("status", "pending").order("created_at", { ascending: true }),
    supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);

  const [heldThreads, heldReplies] = await Promise.all([
    withModerationNotes(supabase, "thread", (heldThreadsRes.data ?? []) as Thread[]),
    withModerationNotes(supabase, "reply", (heldRepliesRes.data ?? []) as Reply[]),
  ]);
  const openReports = (reportsRes.data ?? []) as Report[];

  // Context for the moderation queue: the discussion each held reply belongs
  // to, and the post each open report points at.
  const threadIds = new Set<string>([
    ...heldReplies.map((r) => r.thread_id),
    ...openReports.filter((r) => r.target_type === "thread").map((r) => r.target_id),
  ]);
  const replyIds = new Set(openReports.filter((r) => r.target_type === "reply").map((r) => r.target_id));
  const [relThreadsRes, relRepliesRes] = await Promise.all([
    threadIds.size ? supabase.from("threads").select(THREAD_COLS).in("id", [...threadIds]) : Promise.resolve({ data: [], error: null }),
    replyIds.size ? supabase.from("replies").select(REPLY_COLS).in("id", [...replyIds]) : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedReplies = (relRepliesRes.data ?? []) as Reply[];
  // Reported replies need their discussion's title too.
  const missingThreadIds = relatedReplies.map((r) => r.thread_id).filter((id) => !threadIds.has(id));
  const extraThreadsRes = missingThreadIds.length
    ? await supabase.from("threads").select(THREAD_COLS).in("id", [...new Set(missingThreadIds)])
    : { data: [], error: null };

  // Which sections failed (logged with the error code only — never row data).
  const sections: [string, { error: { code?: string } | null }][] = [
    ["jobs", jobsRes], ["members", membersRes], ["career paths", pathsRes], ["news & events", annRes],
    ["members' career paths", linksRes], ["job sources", sourcesRes], ["communities", communitiesRes],
    ["community members", communityMembersRes], ["community counts", overviewRes],
    ["held discussions", heldThreadsRes], ["held replies", heldRepliesRes], ["reports", reportsRes],
    ["career path ideas", candidatesRes], ["assistant runs", runsRes], ["reported discussions", relThreadsRes],
    ["reported replies", relRepliesRes], ["related discussions", extraThreadsRes],
  ];
  const failed = sections.filter(([, r]) => r.error);
  for (const [name, r] of failed) console.error(`[admin] ${name} failed to load (${r.error?.code ?? "unknown"})`);
  const loadError = sections.slice(0, 5).some(([, r]) => r.error);
  const phase2Error = !loadError && failed.length > 0;
  const failedNames = failed.map(([n]) => n).join(", ");

  const data: AdminData = {
    adminId: user.id,
    jobs: (jobsRes.data ?? []) as Job[],
    members: (membersRes.data ?? []) as Profile[],
    careerPaths: (pathsRes.data ?? []) as CareerPath[],
    announcements: (annRes.data ?? []) as Announcement[],
    memberPaths: (linksRes.data ?? []) as { member_id: string; career_path_id: string }[],
    jobSources: (sourcesRes.data ?? []) as JobSource[],
    communities: (communitiesRes.data ?? []) as Community[],
    communityMembers: (communityMembersRes.data ?? []) as AdminData["communityMembers"],
    communityOverview: (overviewRes.data ?? []) as CommunityOverview[],
    heldThreads,
    heldReplies,
    openReports,
    relatedThreads: [...((relThreadsRes.data ?? []) as Thread[]), ...((extraThreadsRes.data ?? []) as Thread[])],
    relatedReplies,
    candidates: (candidatesRes.data ?? []) as CareerPathCandidate[],
    agentRuns: (runsRes.data ?? []) as AgentRun[],
  };

  return (
    <div className="admin">
      <Navbar user={user} isAdmin userName={userName} />
      <main id="main" className="wrap" style={{ paddingBottom: 96 }}>
        <div className="page-head">
          <span className="eyebrow">Admin</span>
          <h1 className="title-lg">Club dashboard</h1>
          <p className="lede">Post and review jobs, see who has registered, look after communities and share news.</p>
        </div>
        {loadError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
            Some data didn&apos;t load ({failedNames}). Refresh the page; if it keeps happening, tell the tech team.
          </div>
        )}
        {!loadError && phase2Error && (
          <div className="alert alert-info" role="status" style={{ marginBottom: 16 }}>
            Some sections couldn&apos;t load: {failedNames}. Refresh the page; if it keeps happening, tell the tech team.
          </div>
        )}
        <AdminClient data={data} />
      </main>
    </div>
  );
}
