import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ApplyButton from "@/components/jobs/ApplyButton";
import { PathIcon } from "@/components/ui/icons";
import { getSession } from "@/lib/session";
import {
  ENGAGEMENT_LABELS,
  LEVEL_LABELS,
  WORK_MODE_LABELS,
  closesLabel,
  formatDate,
  isDeadlineSoon,
  isExpired,
} from "@/lib/utils";
import type { Job } from "@/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, user, userName, isAdmin } = await getSession();
  const { data } = await supabase.from("jobs").select("*, career_paths(*)").eq("id", id).maybeSingle();
  const job = data as Job | null;
  if (!job) notFound();

  const expired = isExpired(job.deadline);
  const facts: [string, React.ReactNode][] = [
    ["Organisation", job.company],
    ["Location", job.location ?? (job.work_mode === "remote" ? "Anywhere (remote)" : "Not stated")],
    ["Work mode", job.work_mode ? WORK_MODE_LABELS[job.work_mode] : "Not stated"],
    ["Job type", job.engagement_type ? ENGAGEMENT_LABELS[job.engagement_type] : "Not stated"],
    ["Experience", job.experience_level ? LEVEL_LABELS[job.experience_level] : "Not stated"],
    ["Salary", job.salary_range ?? "Not listed"],
    [
      "Deadline",
      <span key="d" style={isDeadlineSoon(job.deadline) ? { color: "var(--coral-ink)", fontWeight: 600 } : undefined}>
        {job.deadline ? `${formatDate(job.deadline)} · ${closesLabel(job.deadline)}` : "Open until filled"}
      </span>,
    ],
    [
      "Career path",
      job.career_paths ? (
        <Link key="p" href={`/jobs?path=${job.career_paths.slug}`} className="row" style={{ gap: 6, color: "var(--blue)" }}>
          <PathIcon slug={job.career_paths.slug} size={16} /> {job.career_paths.name}
        </Link>
      ) : "General",
    ],
    ["Posted", formatDate(job.created_at)],
  ];

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-narrow detail">
        <Link href="/jobs" className="btn-link" style={{ color: "var(--ink-2)", textDecoration: "none" }}>
          <ArrowLeft size={18} aria-hidden="true" /> All jobs
        </Link>

        <article className="detail-card" style={{ marginTop: 12 }}>
          {!job.is_active && (
            <p className="alert alert-info" style={{ marginBottom: 16 }}>This listing is archived and hidden from members.</p>
          )}
          <h1>{job.title}</h1>
          <p className="org">{job.company}</p>

          <div className="apply-panel">
            <p>
              {expired
                ? "The deadline for this role has passed."
                : "Ready? This takes you straight to the official application page."}
            </p>
            <ApplyButton link={job.application_link} deadline={job.deadline} title={job.title} size="lg" referral={!!job.is_referral} />
          </div>

          <dl className="facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          {job.description && (
            <section style={{ marginTop: 28 }}>
              <h2 className="title-sm" style={{ marginBottom: 12 }}>About this role</h2>
              <div className="prose">{job.description}</div>
            </section>
          )}
        </article>

        {!expired && (
          <div className="apply-sticky">
            <ApplyButton link={job.application_link} deadline={job.deadline} title={job.title} hint={false} />
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
