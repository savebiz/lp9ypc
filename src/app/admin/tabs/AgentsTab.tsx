"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, Loader2, RefreshCw } from "lucide-react";
import type { AgentRun } from "@/types";
import { formatDateTime, getJson } from "./shared";
import styles from "../admin.module.css";

interface AgentStatus { gemini: boolean; serviceRole: boolean; cronSecret: boolean; model: string }

const AGENT_LABELS: Record<AgentRun["agent"], { name: string; schedule: string }> = {
  job_scraper: { name: "Job finder", schedule: "Daily at 7:00am Lagos time" },
  career_research: { name: "Career research", schedule: "Daily at 4:00am Lagos time" },
  moderation_sweep: { name: "Moderation sweep", schedule: "Daily at 5:00am Lagos time" },
};

const RUN_STATUS: Record<AgentRun["status"], { text: string; cls: string }> = {
  running: { text: "Running", cls: "off" },
  ok: { text: "Finished", cls: "ok" },
  error: { text: "Error", cls: "off" },
  skipped: { text: "Skipped", cls: "off" },
};

function duration(run: AgentRun): string {
  if (!run.finished_at) return "—";
  const s = Math.max(0, Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Health of the AI assistants: configuration (booleans only, never secrets) and recent runs. */
export default function AgentsTab({ runs }: { runs: AgentRun[] }) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setStatusError("");
    const res = await getJson<AgentStatus & { ok: true }>("/api/admin/agents/status");
    setLoading(false);
    if (res.ok) setStatus(res.data);
    else { setStatus(null); setStatusError(res.error); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="stack-lg">
      <section className="card" aria-labelledby="agent-setup-h">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 id="agent-setup-h" className="title-sm">Set-up</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />} Check again
          </button>
        </div>
        {loading && !status && <p className="row small muted" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Checking…</p>}
        {statusError && (
          <div className="alert alert-error" role="alert"><CircleAlert size={18} aria-hidden="true" /> <span>Couldn&apos;t check the set-up: {statusError}</span></div>
        )}
        {status && (
          <p className="ink-2">
            {status.gemini && status.serviceRole && status.cronSecret
              ? "Everything the assistants need is set up."
              : "Some set-up is missing, so some assistants won't run yet. The tech team can fix the items marked below."}
          </p>
        )}
        {status && (
          <ul className={styles.checks}>
            <Check ok={status.gemini} label="Gemini API key" detail="Needed by all three assistants." />
            <Check ok={status.serviceRole} label="Server database key" detail="Lets the assistants save their results." />
            <Check ok={status.cronSecret} label="Daily schedule password" detail="Protects the assistants' daily runs." />
            <li className={styles.check}>
              <Info size={18} aria-hidden="true" className="text-blue" />
              <span><strong>Model:</strong> {status.model || "default"}</span>
            </li>
          </ul>
        )}
        <div className="alert alert-info" style={{ marginTop: 14 }}>
          <Info size={18} aria-hidden="true" />
          <span>
            Use a Gemini API key from a Google Cloud project with <strong>billing enabled</strong>. On the free tier,
            Google may use what we send to improve its products, and the usage limits are low.
          </span>
        </div>
      </section>

      <section className="stack" aria-labelledby="agent-schedule-h">
        <h2 id="agent-schedule-h" className="title-sm">What runs, and when</h2>
        <ul className={styles.checks}>
          {(Object.keys(AGENT_LABELS) as AgentRun["agent"][]).map((k) => (
            <li key={k} className={styles.check}>
              <span><strong>{AGENT_LABELS[k].name}</strong> — <span className="ink-2">{AGENT_LABELS[k].schedule}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack" aria-labelledby="agent-runs-h">
        <h2 id="agent-runs-h" className="title-sm">Recent runs</h2>
        {runs.length === 0 ? (
          <div className="empty">No runs yet. The assistants record each run here once they&apos;re set up.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Assistant</th><th scope="col">Result</th><th scope="col">Started</th><th scope="col">Took</th>
                  <th scope="col">Items</th><th scope="col">AI usage (in / out)</th><th scope="col">Problem</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td data-label="Assistant"><strong>{AGENT_LABELS[r.agent]?.name ?? r.agent}</strong></td>
                    <td data-label="Result"><span className={`status ${RUN_STATUS[r.status]?.cls ?? "off"}`}>{RUN_STATUS[r.status]?.text ?? r.status}</span></td>
                    <td data-label="Started">{formatDateTime(r.started_at)}</td>
                    <td data-label="Took">{duration(r)}</td>
                    <td data-label="Items">{r.items_processed}</td>
                    <td data-label="AI usage">{r.input_tokens.toLocaleString("en-GB")} / {r.output_tokens.toLocaleString("en-GB")}</td>
                    <td data-label="Problem"><span style={{ overflowWrap: "anywhere" }}>{r.error ? r.error.slice(0, 300) : "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className={styles.check}>
      {ok ? <CircleCheck size={18} aria-hidden="true" className={styles.okIcon} /> : <CircleAlert size={18} aria-hidden="true" className={styles.warn} />}
      <span>
        <strong>{label}:</strong> {ok ? "configured" : "not configured"}
        <span className="small muted" style={{ display: "block" }}>{detail}</span>
      </span>
    </li>
  );
}
