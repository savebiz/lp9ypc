import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import DashboardClient from "./DashboardClient";
import { HeroFigures } from "@/components/ui/YPCMark";
import type { Profile, MemberCareerPath, Job } from "@/types";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, careerPathsRes, savedJobsRes, latestJobsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("member_career_paths").select("*, career_paths(*)").eq("member_id", user.id),
    supabase.from("saved_jobs").select("*, jobs(*, career_paths(*))").eq("member_id", user.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("jobs").select("*, career_paths(*)").eq("is_active", true).order("created_at", { ascending: false }).limit(6),
  ]);

  const profile = profileRes.data as Profile | null;
  const memberCareerPaths = (careerPathsRes.data ?? []) as MemberCareerPath[];
  const savedJobs = (savedJobsRes.data ?? []) as { jobs: Job }[];
  const latestJobs = (latestJobsRes.data ?? []) as Job[];
  const isAdmin = profile?.role === "admin";
  const profilePct = [profile?.profession, profile?.area_of_residence, profile?.phone, memberCareerPaths.length > 0].filter(Boolean).length * 25;

  const r = 42, c = 2 * Math.PI * r;

  return (
    <div>
      <Navbar user={user} isAdmin={isAdmin} userName={profile?.full_name ?? ""} />

      <div className="wrap dash-grid">
        {/* Sidebar */}
        <aside className="dash-side">
          {[
            { label: "Overview", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2V11Z"/></svg>, on: true },
            { label: "My applications", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>, badge: null },
            { label: "Saved jobs", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>, count: savedJobs.length },
            { label: "Events", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg> },
          ].map(({ label, icon, on, count }) => (
            <div key={label} className={`item${on ? " on" : ""}`}>
              {icon} {label}
              {count != null && count > 0 && <span style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>{count}</span>}
            </div>
          ))}
          <div style={{ height: 16 }} />
          <Link href="/dashboard/profile" className="item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>
            Settings
          </Link>
        </aside>

        <main>
          {welcome && (
            <div style={{ background: "var(--mint)", borderRadius: 20, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(11,15,44,.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24 2.24"/><path d="m20 9 2-2"/><path d="m9 20 2-2"/><path d="m7.8 7.8-5.66 5.66"/><path d="m7 7 6 6"/></svg>
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>Welcome to LP9 YPC!</p>
                <p style={{ margin: 0, fontSize: 14, color: "#555" }}>You&apos;re now a member. Explore jobs and connect with your community.</p>
              </div>
            </div>
          )}

          {/* Greeting */}
          <div className="dash-greeting">
            <div style={{ position: "absolute", right: -40, top: -40, opacity: .12, pointerEvents: "none" }}>
              <HeroFigures color="var(--accent)" accent="#fff" size={240} />
            </div>
            <span className="pill accent">
              Member · {memberCareerPaths.map((m) => m.career_paths?.name.split(" & ")[0]).join(" · ") || "YPC"}
            </span>
            <h2 style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
              Hey {profile?.full_name?.split(" ")[0] ?? "there"}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
            </h2>
            <p>You have <strong style={{ color: "var(--accent)" }}>{latestJobs.length} new matches</strong>. Let&apos;s go.</p>
          </div>

          {/* Stat tiles */}
          <div className="dash-tiles">
            <div className="dash-tile">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><div className="num">0</div><div className="lbl">Applications sent</div></div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>
              </div>
            </div>
            <div className="dash-tile">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><div className="num">{savedJobs.length}</div><div className="lbl">Saved jobs</div></div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round"><path d="M6 4h12v17l-6-4-6 4V4Z"/></svg>
              </div>
            </div>
            <div className="dash-tile" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><div className="num">{memberCareerPaths.length}</div><div className="lbl">Career paths</div></div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2v6M12 16v6M22 12h-6M8 12H2M19 5l-4 4M9 15l-4 4M19 19l-4-4M9 9 5 5"/></svg>
              </div>
            </div>
          </div>

          {/* Profile completion */}
          <div className="dash-section">
            <h3>Complete your profile <Link href="/dashboard/profile">Edit →</Link></h3>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 96, height: 96, position: "relative", flexShrink: 0 }}>
                <svg width="96" height="96" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="48" cy="48" r={r} stroke="#eee" strokeWidth="8" fill="none" />
                  <circle cx="48" cy="48" r={r} stroke="var(--blue)" strokeWidth="8" fill="none" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c * (1 - profilePct / 100)} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em" }}>
                  {profilePct}%
                </div>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Basic info", done: true },
                  { label: "Career paths chosen", done: memberCareerPaths.length > 0 },
                  { label: "Add profession / headline", done: !!profile?.profession },
                  { label: "Add your area / parish", done: !!profile?.area_of_residence },
                ].map(({ label, done }) => (
                  <li key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 10, fontSize: 14, color: done ? "#888" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}>
                    {done
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12.5 10 17.5 19 7.5"/></svg>
                      : <span style={{ width: 16, height: 16, borderRadius: 8, border: "1.5px solid #ccc", display: "inline-block", flexShrink: 0 }} />
                    }
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DashboardClient latestJobs={latestJobs} savedJobsData={savedJobs} userId={user.id} />
        </main>
      </div>

      <Footer />
    </div>
  );
}
