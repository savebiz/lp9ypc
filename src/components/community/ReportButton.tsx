"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "./Toast";
import styles from "./community.module.css";

const REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "scam", label: "Scam or fake job" },
  { value: "personal", label: "Personal information" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

const DETAIL_MAX = 400; // keeps "Label: detail" within the 500-char column limit

interface Target {
  targetType: "thread" | "reply";
  targetId: string;
  communityId: string;
  userId: string;
}

interface FormProps extends Target {
  onCancel: () => void;
  /** "sent" after a new report, "duplicate" when they had already reported it. */
  onDone: (result: "sent" | "duplicate") => void;
}

/** The report form on its own, for the thread page's ⋯ menu. */
export function ReportForm({ targetType, targetId, communityId, userId, onCancel, onDone }: FormProps) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRadioRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const choice = REASONS.find((r) => r.value === reason);
    if (!choice) {
      setReasonError("Choose a reason.");
      firstRadioRef.current?.focus();
      return;
    }
    setReasonError("");
    setFormError("");
    setBusy(true);

    const extra = detail.trim().slice(0, DETAIL_MAX);
    const text = (extra ? `${choice.label}: ${extra}` : choice.label).slice(0, 500);
    // community_id is overwritten by a database trigger from the post itself.
    const { error } = await createClient().from("reports").insert({
      community_id: communityId,
      target_type: targetType,
      target_id: targetId,
      reporter_id: userId,
      reason: text,
    });
    setBusy(false);

    if (error) {
      if (error.code === "23505") {
        toast("You've already reported this.");
        onDone("duplicate");
        return;
      }
      if (error.code === "P0002") {
        setFormError("This post isn't available any more.");
        return;
      }
      setFormError("We couldn't send your report. Please try again.");
      return;
    }
    toast("Thanks — a community manager will take a look.");
    onDone("sent");
  }

  const errId = `${id}-reason-err`;
  const detailHint = `${id}-detail-hint`;

  return (
    <form
      id={`${id}-form`}
      className={styles.inline}
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <fieldset className={styles.fieldset} aria-describedby={reasonError ? errId : undefined}>
        <legend className="label">What&apos;s wrong with this post?</legend>
        <div className="options">
          {REASONS.map((r, i) => {
            const on = reason === r.value;
            return (
              <label key={r.value} className={`option ${styles.reasonOption}${on ? ` ${styles.reasonOn}` : ""}`}>
                <input
                  ref={i === 0 ? firstRadioRef : undefined}
                  type="radio"
                  name={`${id}-reason`}
                  value={r.value}
                  checked={on}
                  onChange={() => { setReason(r.value); setReasonError(""); }}
                  aria-invalid={reasonError ? true : undefined}
                />
                <span>{r.label}</span>
              </label>
            );
          })}
        </div>
        {reasonError && (
          <p id={errId} className="field-error" style={{ marginTop: 8 }}>{reasonError}</p>
        )}
      </fieldset>

      <div className="field">
        <label className="label" htmlFor={`${id}-detail`}>
          Anything else we should know? <span className="opt">(optional)</span>
        </label>
        <textarea
          id={`${id}-detail`}
          className="input"
          rows={3}
          maxLength={DETAIL_MAX}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          aria-describedby={detailHint}
          style={{ minHeight: 88 }}
        />
        <p id={detailHint} className="hint">
          Only community managers and YPC admins see reports, including that it came from you. The author isn&apos;t told who reported them.
        </p>
      </div>

      {formError && (
        <p className={`alert alert-error ${styles.formAlert}`} role="alert">{formError}</p>
      )}

      <div className={styles.inlineActions}>
        <button type="submit" className="btn btn-solid btn-sm" disabled={busy}>
          {busy && <Loader2 size={16} className="spin" aria-hidden="true" />}
          {busy ? "Sending…" : "Send report"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface Props extends Target {
  /** The viewer already reported this post (from their own reports). */
  alreadyReported?: boolean;
}

/** A "Report" link that opens the form inline. */
export default function ReportButton({ alreadyReported = false, ...target }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<"" | "sent" | "duplicate">(alreadyReported ? "duplicate" : "");
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (done) {
    return (
      <span className={styles.footNote} role="status">
        <Flag size={15} aria-hidden="true" />
        {done === "sent" ? "Reported — thank you" : "You've already reported this"}
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`btn-link ${styles.footBtn}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Flag size={16} aria-hidden="true" /> Report
      </button>
      {open && (
        <ReportForm
          {...target}
          onCancel={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          onDone={(r) => setDone(r)}
        />
      )}
    </>
  );
}
