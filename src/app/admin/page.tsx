import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import AdminClient from "./AdminClient";
import type { AdminData } from "./tabs/shared";
import { getSession } from "@/lib/session";
import type {
  AgentRun, Announcement, CareerPath, CareerPathCandidate, Community, CommunityOverview, Job, JobSource,
  Profile, Reply, Report, Thread,
} from "@/types";

export const metadata = { title: "Admin · LP9 YPC" };

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
    supabase.from("threads").select("*").eq("status", "held").order("created_at", { ascending: true }).limit(100),
    supabase.from("replies").select("*").eq("status", "held").order("created_at", { ascending: true }).limit(100),
    supabase.from("reports").select("*").eq("status", "open").order("created_at", { ascending: true }).limit(100),
    supabase.from("career_path_candidates").select("*").eq("status", "pending").order("created_at", { ascending: true }),
    supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(20),
  ]);

  const heldThreads = (heldThreadsRes.data ?? []) as Thread[];
  const heldReplies = (heldRepliesRes.data ?? []) as Reply[];
  const openReports = (reportsRes.data ?? []) as Report[];

  // Context for the moderation queue: the discussion each held reply belongs
  // to, and the post each open report points at.
  const threadIds = new Set<string>([
    ...heldReplies.map((r) => r.thread_id),
    ...openReports.filter((r) => r.target_type === "thread").map((r) => r.target_id),
  ]);
  const replyIds = new Set(openReports.filter((r) => r.target_type === "reply").map((r) => r.target_id));
  const [relThreadsRes, relRepliesRes] = await Promise.all([
    threadIds.size ? supabase.from("threads").select("*").in("id", [...threadIds]) : Promise.resolve({ data: [], error: null }),
    replyIds.size ? supabase.from("replies").select("*").in("id", [...replyIds]) : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedReplies = (relRepliesRes.data ?? []) as Reply[];
  // Reported replies need their discussion's title too.
  const missingThreadIds = relatedReplies.map((r) => r.thread_id).filter((id) => !threadIds.has(id));
  const extraThreadsRes = missingThreadIds.length
    ? await supabase.from("threads").select("*").in("id", [...new Set(missingThreadIds)])
    : { data: [], error: null };

  const loadError = [jobsRes, membersRes, pathsRes, annRes, linksRes].some((r) => r.error);
  const phase2Error = [
    sourcesRes, communitiesRes, communityMembersRes, overviewRes, heldThreadsRes, heldRepliesRes,
    reportsRes, candidatesRes, runsRes, relThreadsRes, relRepliesRes, extraThreadsRes,
  ].some((r) => r.error);

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
            Some data didn&apos;t load. Refresh the page; if it keeps happening, check the Supabase project is running.
          </div>
        )}
        {!loadError && phase2Error && (
          <div className="alert alert-info" role="status" style={{ marginBottom: 16 }}>
            Some newer sections (job sources, review queue, communities, moderation, career ideas or agents) couldn&apos;t load.
            If the latest database update hasn&apos;t been applied yet, that&apos;s expected — ask the tech lead.
          </div>
        )}
        <AdminClient data={data} />
      </main>
    </div>
  );
}
