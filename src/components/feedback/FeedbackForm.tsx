"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { FeedbackKind, FeedbackTargetType } from "@/types";
import {
  FEEDBACK_COPY,
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_LIMITS,
} from "./feedback";
import styles from "./FeedbackForm.module.css";

export interface FeedbackTarget {
  type: FeedbackTargetType;
  id: string;
  title: string;
  /** Where the item lives on the site (used as the page it's about, and the back link). */
  href: string;
}

interface Props {
  target: FeedbackTarget | null;
  initialKind: FeedbackKind | null;
  /** The page the member came from (already checked as a same-site path), if any. */
  from: string | null;
}

function count(s: string): number {
  return Array.from(s).length;
}

export default function FeedbackForm({ target, initialKind, from }: Props) {
  const id = useId();
  const [kind, setKind] = useState<FeedbackKind | null>(initialKind);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<{ kind?: string; message?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const kindRef = useRef<HTMLLegendElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sent) thanksRef.current?.focus();
  }, [sent]);

  const isIdea = kind === "idea";
  const length = count(message.trim());
  const backHref = from ?? target?.href ?? "/dashboard";
  const backLabel = from || target ? "Back to where you were" : "Go to your dashboard";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError("");

    const next: typeof errors = {};
    if (!kind) next.kind = "Please choose what kind of feedback this is.";
    if (length > FEEDBACK_LIMITS.message) next.message = `Please keep your note to ${FEEDBACK_LIMITS.message} characters.`;
    else if (isIdea && length < FEEDBACK_LIMITS.ideaMin) next.message = "Please tell us your idea in a few words.";
    setErrors(next);
    if (next.kind) {
      kindRef.current?.focus();
      return;
    }
    if (next.message) {
      messageRef.current?.focus();
      return;
    }

    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          kind,
          message: message.trim() || undefined,
          pagePath: target?.href ?? from ?? undefined,
          targetType: target?.type,
          targetId: target?.id,
          website: website || undefined,
        }),
      });
    } catch {
      setBusy(false);
      setFormError("We couldn't reach the server. Check your connection and try again.");
      return;
    }

    let body: { ok?: boolean; error?: string } | null = null;
    try {
      body = (await res.json()) as { ok?: boolean; error?: string };
    } catch {
      body = null;
    }
    setBusy(false);
    if (res.ok && body?.ok) {
      setSent(true);
      return;
    }
    if (typeof body?.error === "string" && body.error) setFormError(body.error);
    else if (res.status === 401) setFormError("Your session has expired. Please sign in again.");
    else setFormError("Something went wrong on our side. Please try again.");
  }

  if (sent) {
    return (
      <div className="page-head stack">
        <span className="eyebrow">Feedback</span>
        <h1 ref={thanksRef} tabIndex={-1} className="title-lg">Thank you.</h1>
        <div className="alert alert-ok" role="status">
          <CircleCheck size={20} aria-hidden="true" />
          <span>{FEEDBACK_COPY.thanks}</span>
        </div>
        <div className="row-wrap">
          <Link href={backHref} className="btn btn-ghost">
            <ArrowLeft size={18} aria-hidden="true" /> {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  const kindErrId = `${id}-kind-err`;
  const msgHintId = `${id}-msg-hint`;
  const msgErrId = `${id}-msg-err`;
  const counterId = `${id}-count`;
  const near = length > FEEDBACK_LIMITS.message * 0.9;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Feedback</span>
        <h1 className="title-lg">Spotted a problem or have an idea?</h1>
        <p className="lede">{FEEDBACK_COPY.hint}</p>
      </div>

      <form className="card stack" onSubmit={submit} noValidate>
        {target && (
          <p className={styles.about}>
            <span className={styles.aboutLabel}>About:</span> <span className={styles.aboutTitle}>{target.title}</span>
          </p>
        )}

        <fieldset className={styles.fieldset} aria-describedby={errors.kind ? kindErrId : undefined}>
          <legend ref={kindRef} tabIndex={-1} className="label">What would you like to tell us?</legend>
          <div className={`options ${styles.options}`}>
            {FEEDBACK_KINDS.map((k) => {
              const on = kind === k;
              return (
                <label key={k} className={`option radio${on ? " on" : ""} ${styles.option}`}>
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    checked={on}
                    required
                    aria-invalid={errors.kind ? true : undefined}
                    onChange={() => {
                      setKind(k);
                      setErrors((prev) => ({ ...prev, kind: undefined, message: undefined }));
                    }}
                    className={styles.radio}
                  />
                  <span className="box" aria-hidden="true">{on && <span className={styles.dot} />}</span>
                  <span>{FEEDBACK_KIND_LABELS[k]}</span>
                </label>
              );
            })}
          </div>
          {errors.kind && (
            <span className="field-error" id={kindErrId} style={{ marginTop: 8 }}>
              <CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2 }} /> {errors.kind}
            </span>
          )}
        </fieldset>

        <div className="field" style={{ margin: 0 }}>
          <div className={styles.labelRow}>
            <label className="label" htmlFor={`${id}-msg`} style={{ margin: 0 }}>
              {isIdea ? "Your idea" : <>Add a note <span className="opt">(optional)</span></>}
            </label>
            <span id={counterId} className={`${styles.counter}${near ? ` ${styles.counterNear}` : ""}`}>
              {length} / {FEEDBACK_LIMITS.message}
              <span className="sr-only"> characters</span>
            </span>
          </div>
          <p className="hint" id={msgHintId}>
            {isIdea ? "A sentence or two is plenty." : "What did you notice? A sentence or two is plenty."}
          </p>
          <textarea
            ref={messageRef}
            id={`${id}-msg`}
            className="input"
            rows={4}
            maxLength={FEEDBACK_LIMITS.message + 50}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
            }}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={[msgHintId, counterId, errors.message ? msgErrId : ""].filter(Boolean).join(" ")}
            aria-required={isIdea || undefined}
          />
          {errors.message && (
            <span className="field-error" id={msgErrId}>
              <CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2 }} /> {errors.message}
            </span>
          )}
        </div>

        {/* Honeypot: hidden from people and screen readers; bots tend to fill it in. */}
        <div className={styles.trap} aria-hidden="true">
          <label htmlFor={`${id}-website`}>Website</label>
          <input
            id={`${id}-website`}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {formError && (
          <div className="alert alert-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <button type="submit" className="btn btn-action btn-block" disabled={busy} aria-busy={busy || undefined}>
          {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : "Send feedback"}
        </button>
      </form>
    </>
  );
}
