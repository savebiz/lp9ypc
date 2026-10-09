"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import JobCard from "@/components/jobs/JobCard";
import type { Job } from "@/types";

interface Props {
  userId: string;
  forYou: Job[];
  forYouTitle: string;
  saved: Job[];
}

export default function DashboardClient({ userId, forYou, forYouTitle, saved: initialSaved }: Props) {
  const [saved, setSaved] = useState<Job[]>(initialSaved);
  const [toast, setToast] = useState("");
  const savedIds = new Set(saved.map((j) => j.id));

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }

  async function toggleSave(jobId: string) {
    const supabase = createClient();
    if (savedIds.has(jobId)) {
      const { error } = await supabase.from("saved_jobs").delete().eq("member_id", userId).eq("job_id", jobId);
      if (error) return showToast("Couldn't remove it — please try again");
      setSaved((s) => s.filter((j) => j.id !== jobId));
      showToast("Removed from saved jobs");
    } else {
      const { error } = await supabase.from("saved_jobs").insert({ member_id: userId, job_id: jobId });
      if (error) return showToast("Couldn't save it — please try again");
      const job = forYou.find((j) => j.id === jobId);
      if (job) setSaved((s) => [job, ...s]);
      showToast("Saved");
    }
  }

  return (
    <>
      <section className="panel" aria-labelledby="foryou-h">
        <div className="panel-head">
          <h2 id="foryou-h">{forYouTitle}</h2>
          <Link href="/jobs" className="btn-link">See all jobs</Link>
        </div>
        {forYou.length === 0 ? (
          <div className="empty">No jobs posted yet. New opportunities are added by YPC coordinators — check back soon.</div>
        ) : (
          <div className="jobs-list" style={{ gridTemplateColumns: "1fr", paddingBottom: 0 }}>
            {forYou.map((j) => (
              <JobCard key={j.id} job={j} isSaved={savedIds.has(j.id)} onToggleSave={toggleSave} showDescription={false} />
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="saved-h">
        <div className="panel-head">
          <h2 id="saved-h">Saved jobs</h2>
          {saved.length > 0 && <span className="small muted">{saved.length} saved</span>}
        </div>
        {saved.length === 0 ? (
          <p className="ink-2">Tap the bookmark on any job to keep it here for later.</p>
        ) : (
          <div className="jobs-list" style={{ gridTemplateColumns: "1fr", paddingBottom: 0 }}>
            {saved.map((j) => (
              <JobCard key={j.id} job={j} isSaved onToggleSave={toggleSave} showDescription={false} />
            ))}
          </div>
        )}
      </section>

      <div role="status" aria-live="polite">{toast && <div className="toast">{toast}</div>}</div>
    </>
  );
}
