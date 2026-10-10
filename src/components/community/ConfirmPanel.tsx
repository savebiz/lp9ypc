"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import styles from "./community.module.css";

interface Props {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Offer an optional reason (kept in the moderation log). */
  askReason?: boolean;
  /** Which button gets focus when the panel opens (the reason box wins when shown). */
  defaultFocus?: "confirm" | "cancel";
  /** Resolve to an error message to show, or null on success (the parent closes the panel). */
  onConfirm: (reason: string) => Promise<string | null>;
  onCancel: () => void;
}

/** An inline confirm under a post — easier on a phone than a browser dialog. Escape cancels. */
export default function ConfirmPanel({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  askReason = false,
  defaultFocus = "confirm",
  onConfirm,
  onCancel,
}: Props) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (askReason ? reasonRef.current : defaultFocus === "cancel" ? cancelRef.current : confirmRef.current)?.focus();
  }, [askReason, defaultFocus]);

  async function confirm() {
    setBusy(true);
    setError("");
    const err = await onConfirm(reason.trim().slice(0, 500));
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div
      className={styles.inline}
      role="group"
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <p id={`${id}-title`} className={styles.inlineTitle}>{title}</p>
      {body && <p className={styles.inlineText}>{body}</p>}
      {askReason && (
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label" htmlFor={`${id}-reason`}>
            Reason <span className="opt">(optional, kept in the moderation log)</span>
          </label>
          <textarea
            id={`${id}-reason`}
            ref={reasonRef}
            className="input"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ minHeight: 72 }}
          />
        </div>
      )}
      {error && (
        <p className={`field-error ${styles.inlineError}`} role="alert">{error}</p>
      )}
      <div className={styles.inlineActions} style={{ marginTop: askReason ? 0 : 12 }}>
        <button
          ref={confirmRef}
          type="button"
          className={`btn btn-sm ${danger ? "btn-danger" : "btn-solid"}`}
          onClick={confirm}
          disabled={busy}
        >
          {busy && <Loader2 size={16} className="spin" aria-hidden="true" />}
          {confirmLabel}
        </button>
        <button ref={cancelRef} type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
