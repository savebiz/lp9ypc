import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import AdminClient from "./AdminClient";
import type { Job, Profile, CareerPath, Announcement } from "@/types";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const [jobsRes, membersRes, careerPathsRes, announcementsRes, statsRes] = await Promise.all([
    supabase.from("jobs").select("*, career_paths(*)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("career_paths").select("*").order("name"),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const jobs = (jobsRes.data ?? []) as Job[];
  const members = (membersRes.data ?? []) as Profile[];
  const careerPaths = (careerPathsRes.data ?? []) as CareerPath[];
  const announcements = (announcementsRes.data ?? []) as Announcement[];
  const totalMembers = statsRes.count ?? 0;

  const { data: adminProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const adminName = (adminProfile as { full_name: string } | null)?.full_name ?? "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <Navbar user={user} isAdmin={true} userName={adminName ?? ""} />
      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 64 }}>
        <div style={{ marginBottom: 32 }}>
          <span className="eyebrow">Admin</span>
          <h1 className="display" style={{ fontSize: 52, margin: "8px 0 4px" }}>Dashboard</h1>
          <p style={{ color: "#666", margin: 0 }}>Manage jobs, members, and announcements.</p>
        </div>

        {/* Stats */}
        <div className="hero-stats" style={{ marginBottom: 32 }}>
          {[
            { label: "Total Members", value: totalMembers, cls: "" },
            { label: "Active Jobs", value: jobs.filter((j) => j.is_active).length, cls: "b" },
            { label: "Announcements", value: announcements.length, cls: "c" },
          ].map(({ label, value, cls }) => (
            <div key={label} className={`stat${cls ? " " + cls : ""}`}>
              <div className="num">{value}</div>
              <div className="lbl">{label}</div>
            </div>
          ))}
        </div>

        <AdminClient jobs={jobs} members={members} careerPaths={careerPaths} announcements={announcements} />
      </div>
    </div>
  );
}
