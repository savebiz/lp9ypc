"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import JobCard from "@/components/jobs/JobCard";
import { PathIcon } from "@/components/ui/icons";
import { ENGAGEMENT_LABELS, LEVEL_LABELS, WORK_MODE_LABELS, shortPathName } from "@/lib/utils";
import type { CareerPath, Job } from "@/types";

interface Props {
  initialJobs: Job[];
  careerPaths: CareerPath[];
  userId: string | null;
  initialSavedIds: string[];
  initialPath: string | null;
}

const ALL = "all";

export default function JobsClient({ initialJobs, careerPaths, userId, initialSavedIds, initialPath }: Props) {
  const router = useRouter();
  const validInitialPath = careerPaths.some((c) => c.slug === initialPath) ? [initialPath as string] : [];

  const [q, setQ] = useState("");
  const [paths, setPaths] = useState<string[]>(validInitialPath);
  const [workMode, setWorkMode] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(initialSavedIds));
  const [toast, setToast] = useState("");

  const locations = useMemo(
    () => [...new Set(initialJobs.map((j) => j.location?.trim()).filter((l): l is string => !!l))].sort(),
    [initialJobs],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return initialJobs.filter((j) => {
      if (paths.length && !(j.career_paths && paths.includes(j.career_paths.slug))) return false;
      if (workMode !== ALL && j.work_mode !== workMode) return false;
      if (type !== ALL && j.engagement_type !== type) return false;
      if (level !== ALL && j.experience_level !== level) return false;
      if (location !== ALL && j.location?.trim() !== location) return false;
      if (s) {
        const hay = [j.title, j.company, j.location, j.description].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [initialJobs, q, paths, workMode, type, level, location]);

  const panelFilters = [
    workMode !== ALL && { key: "mode", label: WORK_MODE_LABELS[workMode], clear: () => setWorkMode(ALL) },
    type !== ALL && { key: "type", label: ENGAGEMENT_LABELS[type], clear: () => setType(ALL) },
    level !== ALL && { key: "level", label: LEVEL_LABELS[level], clear: () => setLevel(ALL) },
    location !== ALL && { key: "loc", label: location, clear: () => setLocation(ALL) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const anyFilter = panelFilters.length > 0 || paths.length > 0 || q.trim() !== "";

  function clearAll() {
    setQ(""); setPaths([]); setWorkMode(ALL); setType(ALL); setLevel(ALL); setLocation(ALL);
  }

  function togglePath(slug: string) {
    setPaths((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }

  async function toggleSave(jobId: string) {
    if (!userId) {
      router.push("/login?next=/jobs");
      return;
    }
    const supabase = createClient();
    if (savedIds.has(jobId)) {
      const { error } = await supabase.from("saved_jobs").delete().eq("member_id", userId).eq("job_id", jobId);
      if (error) return showToast("Couldn't remove it — please try again");
      setSavedIds((s) => { const n = new Set(s); n.delete(jobId); return n; });
      showToast("Removed from saved jobs");
    } else {
      const { error } = await supabase.from("saved_jobs").insert({ member_id: userId, job_id: jobId });
      if (error) return showToast("Couldn't save it — please try again");
      setSavedIds((s) => new Set([...s, jobId]));
      showToast("Saved to your dashboard");
    }
  }

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={20} aria-hidden="true" />
          <label htmlFor="job-search" className="sr-only">Search jobs</label>
          <input
            id="job-search"
            className="input"
            type="search"
            placeholder="Search title, organisation or location"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          {q && (
            <button type="button" className="icon-btn" onClick={() => setQ("")} aria-label="Clear search">
              <X size={18} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="filter-panel"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          Filters{panelFilters.length ? ` (${panelFilters.length})` : ""}
        </button>
      </div>

      {filtersOpen && (
        <div id="filter-panel" className="filter-panel">
          <div className="field">
            <label className="label" htmlFor="f-mode">Work mode</label>
            <select id="f-mode" className="input" value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
              <option value={ALL}>Any</option>
              <option value="remote">Remote</option>
              <option value="onsite">On-site (physical)</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-type">Job type</label>
            <select id="f-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value={ALL}>Any</option>
              {Object.entries(ENGAGEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-level">Experience</label>
            <select id="f-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value={ALL}>Any</option>
              {Object.entries(LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-loc">Location</label>
            <select id="f-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value={ALL}>Anywhere</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn-link" onClick={() => { setWorkMode(ALL); setType(ALL); setLevel(ALL); setLocation(ALL); }}>
              Reset filters
            </button>
            <button type="button" className="btn btn-solid btn-sm" onClick={() => setFiltersOpen(false)}>
              Show {filtered.length} {filtered.length === 1 ? "job" : "jobs"}
            </button>
          </div>
        </div>
      )}

      <div className="path-filter" role="group" aria-label="Filter by career path">
        <button type="button" className="chip-btn" aria-pressed={paths.length === 0} onClick={() => setPaths([])}>
          All paths
        </button>
        {careerPaths.map((cp) => (
          <button
            key={cp.id}
            type="button"
            className="chip-btn"
            aria-pressed={paths.includes(cp.slug)}
            onClick={() => togglePath(cp.slug)}
          >
            <PathIcon slug={cp.slug} size={16} />
            {shortPathName(cp.name)}
          </button>
        ))}
      </div>

      {panelFilters.length > 0 && (
        <div className="row-wrap" style={{ marginBottom: 8 }}>
          {panelFilters.map((f) => (
            <button key={f.key} type="button" className="chip-btn on chip-remove" onClick={f.clear} aria-label={`Remove filter: ${f.label}`}>
              {f.label} <X size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <p className="result-count" aria-live="polite">
        <strong>{filtered.length}</strong> {filtered.length === 1 ? "role" : "roles"}
        {anyFilter ? " match your filters" : " open"}
        {anyFilter && (
          <> · <button type="button" className="btn-link" style={{ minHeight: 0 }} onClick={clearAll}>Clear all</button></>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="empty">
          {initialJobs.length === 0
            ? "No jobs posted yet. New opportunities are added by YPC coordinators — check back soon."
            : "No jobs match those filters. Try removing one."}
        </div>
      ) : (
        <div className="jobs-list">
          {filtered.map((j) => (
            <JobCard key={j.id} job={j} isSaved={savedIds.has(j.id)} onToggleSave={toggleSave} />
          ))}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
