"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import JobCard from "@/components/jobs/JobCard";
import type { JobCardJob } from "@/components/jobs/card-data";
import { PathIcon } from "@/components/ui/icons";
import { ENGAGEMENT_LABELS, LEVEL_LABELS, WORK_MODE_LABELS, shortPathName } from "@/lib/utils";
import type { CareerPath } from "@/types";
import { JOBS_PAGE_SIZE, fetchJobsPage, type JobFilters, type JobsPageResult } from "./jobs-query";
import styles from "./jobs.module.css";

export type PathOption = Pick<CareerPath, "id" | "name" | "slug">;

interface Props {
  /** First 20 jobs, already filtered by ?q= and ?path= on the server. */
  initialPage: JobsPageResult;
  /** Search text from the home page's "Find your next role" box (?q=). */
  initialQuery?: string;
  careerPaths: PathOption[];
  /** Every location among live jobs, for the Location filter. */
  locations: string[];
  userId: string | null;
  initialSavedIds: string[];
  initialPath: string | null;
}

const ALL = "all";
const SEARCH_DELAY_MS = 350;

interface UiFilters {
  q: string;
  paths: string[]; // slugs
  workMode: string;
  type: string;
  level: string;
  location: string;
}

export default function JobsClient({
  initialPage,
  careerPaths,
  locations,
  userId,
  initialSavedIds,
  initialPath,
  initialQuery = "",
}: Props) {
  const router = useRouter();
  const validInitialPath = careerPaths.some((c) => c.slug === initialPath) ? [initialPath as string] : [];

  const [filters, setFilters] = useState<UiFilters>({
    q: initialQuery,
    paths: validInitialPath,
    workMode: ALL,
    type: ALL,
    level: ALL,
    location: ALL,
  });
  const { q, paths, workMode, type, level, location } = filters;

  const [jobs, setJobs] = useState<JobCardJob[]>(initialPage.jobs);
  const [total, setTotal] = useState(initialPage.total);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  /** "loading" = new filters being fetched; "more" = next page being fetched. */
  const [status, setStatus] = useState<"idle" | "loading" | "more">("idle");
  const [loadError, setLoadError] = useState(initialPage.error);
  const [moreError, setMoreError] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(initialSavedIds));
  const [toast, setToast] = useState("");

  const loadedKey = useRef(keyOf(filters));
  const requestRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusJobId = useRef<string | null>(null);

  // Stop any pending search or request if the member leaves the page.
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      requestRef.current?.abort();
    },
    [],
  );

  // After "Show more", move focus to the first newly loaded job so keyboard
  // and screen-reader users continue from where the new jobs start.
  useEffect(() => {
    const id = focusJobId.current;
    if (!id) return;
    focusJobId.current = null;
    document.getElementById(`job-${id}`)?.querySelector<HTMLElement>("a")?.focus();
  }, [jobs]);

  function keyOf(f: UiFilters) {
    return JSON.stringify([f.q.trim().toLowerCase(), [...f.paths].sort(), f.workMode, f.type, f.level, f.location]);
  }

  function toQuery(f: UiFilters): JobFilters {
    return {
      q: f.q,
      pathIds: careerPaths.filter((c) => f.paths.includes(c.slug)).map((c) => c.id),
      workMode: f.workMode === ALL ? null : f.workMode,
      type: f.type === ALL ? null : f.type,
      level: f.level === ALL ? null : f.level,
      location: f.location === ALL ? null : f.location,
    };
  }

  /** Loads the first page for these filters (cancelling anything in flight). */
  async function loadFirstPage(f: UiFilters) {
    requestRef.current?.abort();
    const key = keyOf(f);
    if (key === loadedKey.current && !loadError) {
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    requestRef.current = ctrl;
    setStatus("loading");
    setMoreError(false);
    setAnnouncement("");
    const res = await fetchJobsPage(createClient(), toQuery(f), null, 0, ctrl.signal);
    if (ctrl.signal.aborted) return;
    requestRef.current = null;
    setStatus("idle");
    if (res.error) {
      setLoadError(true);
      return;
    }
    loadedKey.current = key;
    setLoadError(false);
    setJobs(res.jobs);
    setTotal(res.total);
    setHasMore(res.hasMore);
  }

  /** Updates filters; search typing waits briefly so we don't query on every key. */
  function update(next: Partial<UiFilters>, { debounce = false } = {}) {
    const f = { ...filters, ...next };
    setFilters(f);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (debounce) {
      searchTimer.current = setTimeout(() => void loadFirstPage(f), SEARCH_DELAY_MS);
    } else {
      void loadFirstPage(f);
    }
  }

  async function showMore() {
    if (status !== "idle" || !hasMore || jobs.length === 0) return;
    const key = loadedKey.current;
    const ctrl = new AbortController();
    requestRef.current = ctrl;
    setStatus("more");
    setMoreError(false);
    const last = jobs[jobs.length - 1];
    const res = await fetchJobsPage(createClient(), toQuery(filters), last, jobs.length, ctrl.signal);
    if (ctrl.signal.aborted || key !== loadedKey.current) return;
    requestRef.current = null;
    setStatus("idle");
    if (res.error) {
      setMoreError(true);
      return;
    }
    const seen = new Set(jobs.map((j) => j.id));
    const fresh = res.jobs.filter((j) => !seen.has(j.id));
    const nextCount = jobs.length + fresh.length;
    focusJobId.current = fresh[0]?.id ?? null;
    setJobs([...jobs, ...fresh]);
    setTotal(Math.max(res.total, nextCount));
    setHasMore(res.hasMore && fresh.length > 0);
    setAnnouncement(
      `${fresh.length} more ${fresh.length === 1 ? "job" : "jobs"} loaded. Showing ${nextCount} of ${Math.max(res.total, nextCount)}.`,
    );
  }

  const panelFilters = [
    workMode !== ALL && { key: "mode", label: WORK_MODE_LABELS[workMode], clear: () => update({ workMode: ALL }) },
    type !== ALL && { key: "type", label: ENGAGEMENT_LABELS[type], clear: () => update({ type: ALL }) },
    level !== ALL && { key: "level", label: LEVEL_LABELS[level], clear: () => update({ level: ALL }) },
    location !== ALL && { key: "loc", label: location, clear: () => update({ location: ALL }) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const anyFilter = panelFilters.length > 0 || paths.length > 0 || q.trim() !== "";
  const updating = status === "loading";
  const nextBatch = Math.max(1, Math.min(JOBS_PAGE_SIZE, total - jobs.length));

  function clearAll() {
    update({ q: "", paths: [], workMode: ALL, type: ALL, level: ALL, location: ALL });
  }

  function togglePath(slug: string) {
    update({ paths: paths.includes(slug) ? paths.filter((x) => x !== slug) : [...paths, slug] });
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
            onChange={(e) => update({ q: e.target.value.slice(0, 100) }, { debounce: true })}
            autoComplete="off"
          />
          {q && (
            <button type="button" className="icon-btn" onClick={() => update({ q: "" })} aria-label="Clear search">
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
            <select id="f-mode" className="input" value={workMode} onChange={(e) => update({ workMode: e.target.value })}>
              <option value={ALL}>Any</option>
              <option value="remote">Remote</option>
              <option value="onsite">On-site (physical)</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-type">Job type</label>
            <select id="f-type" className="input" value={type} onChange={(e) => update({ type: e.target.value })}>
              <option value={ALL}>Any</option>
              {Object.entries(ENGAGEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-level">Experience</label>
            <select id="f-level" className="input" value={level} onChange={(e) => update({ level: e.target.value })}>
              <option value={ALL}>Any</option>
              {Object.entries(LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-loc">Location</label>
            <select id="f-loc" className="input" value={location} onChange={(e) => update({ location: e.target.value })}>
              <option value={ALL}>Anywhere</option>
              {locations.map((l) => <option key={l} value={l}>{l.trim()}</option>)}
            </select>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn-link" onClick={() => update({ workMode: ALL, type: ALL, level: ALL, location: ALL })}>
              Reset filters
            </button>
            <button type="button" className="btn btn-solid btn-sm" onClick={() => setFiltersOpen(false)}>
              {updating ? "Show jobs" : `Show ${total} ${total === 1 ? "job" : "jobs"}`}
            </button>
          </div>
        </div>
      )}

      <div className="path-filter" role="group" aria-label="Filter by career path">
        <button type="button" className="chip-btn" aria-pressed={paths.length === 0} onClick={() => update({ paths: [] })}>
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

      <p className="result-count">
        <span aria-live="polite">
          <strong>{total}</strong> {total === 1 ? "role" : "roles"}
          {anyFilter ? " match your filters" : " open"}
        </span>
        {anyFilter && (
          <> · <button type="button" className="btn-link" style={{ minHeight: 0 }} onClick={clearAll}>Clear all</button></>
        )}
        {updating && <span className="muted" aria-hidden="true"> · Updating…</span>}
      </p>

      {loadError ? (
        <div className={styles.retry}>
          <div className="alert alert-error" role="alert">
            We couldn&apos;t load jobs just now. Check your connection, then try again.
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadFirstPage(filters)} disabled={updating}>
            Try again
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className={`empty${updating ? ` ${styles.updating}` : ""}`}>
          {anyFilter
            ? "No jobs match those filters. Try removing one."
            : "No jobs posted yet. New opportunities are added by YPC coordinators — check back soon."}
        </div>
      ) : (
        <>
          <div className={`jobs-list${updating ? ` ${styles.updating}` : ""}`} aria-busy={updating}>
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} isSaved={savedIds.has(j.id)} onToggleSave={toggleSave} />
            ))}
          </div>

          <div className={styles.more}>
            <p className="small muted" id="jobs-shown">
              Showing {jobs.length} of {total} {total === 1 ? "role" : "roles"}
            </p>
            {hasMore && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void showMore()}
                aria-disabled={status !== "idle"}
                aria-describedby="jobs-shown"
              >
                {status === "more" ? (
                  <><Loader2 size={18} className="spin" aria-hidden="true" /> Loading more jobs…</>
                ) : (
                  `Show ${nextBatch} more ${nextBatch === 1 ? "job" : "jobs"}`
                )}
              </button>
            )}
            {moreError && (
              <p className="field-error" role="alert">
                We couldn&apos;t load more jobs. Check your connection, then tap the button again.
              </p>
            )}
          </div>
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
