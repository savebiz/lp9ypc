"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield, Trash2 } from "lucide-react";
import { moderate, type ModerateRequest } from "./api";
import { toast } from "./Toast";
import styles from "./community.module.css";
import type { PostStatus } from "@/types";

export interface ConfirmSpec {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Offer an optional reason (kept in the moderation log). */
  askReason?: boolean;
}

interface ActionButtonProps {
  label: string;
  icon?: React.ReactNode;
  /** Sent to POST /api/community/moderate in order; stops at the first failure. */
  requests: ModerateRequest[];
  /** Toast shown when every request succeeded. */
  success: string;
  confirm?: ConfirmSpec;
  className?: string;
}

/**
 * One moderation action. Destructive ones open an inline confirm (with an
 * optional reason) instead of a browser dialog, which is easier on a phone.
 */
export function ActionButton({ label, icon, requests, success, confirm, className }: ActionButtonProps) {
  const router = useRouter();
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirming) firstFieldRef.current?.focus();
  }, [confirming]);

  async function run() {
    setBusy(true);
    setError("");
    const why = reason.trim().slice(0, 500);
    for (const req of requests) {
      const res = await moderate(why ? { ...req, reason: why } : req);
      if (!res.ok) {
        setBusy(false);
        setError(res.error);
        return;
      }
    }
    setBusy(false);
    setConfirming(false);
    setReason("");
    toast(success);
    router.refresh();
  }

  function cancel() {
    setConfirming(false);
    setError("");
    setReason("");
    triggerRef.current?.focus();
  }

  const panelId = `${id}-confirm`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ?? "btn btn-ghost btn-sm"}
        onClick={() => (confirm ? setConfirming(true) : run())}
        disabled={busy}
        aria-expanded={confirm ? confirming : undefined}
        aria-controls={confirm && confirming ? panelId : undefined}
      >
        {busy && !confirming ? <Loader2 size={16} className="spin" aria-hidden="true" /> : icon}
        {label}
      </button>

      {confirm && confirming && (
        <div id={panelId} className={styles.inline} role="group" aria-labelledby={`${id}-title`}>
          <p id={`${id}-title`} className={styles.inlineTitle}>{confirm.title}</p>
          {confirm.body && <p className={styles.inlineText}>{confirm.body}</p>}
          {confirm.askReason && (
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label" htmlFor={`${id}-reason`}>
                Reason <span className="opt">(optional, kept in the moderation log)</span>
              </label>
              <textarea
                id={`${id}-reason`}
                ref={(el) => { firstFieldRef.current = el; }}
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
          <div className={styles.inlineActions} style={{ marginTop: confirm.askReason ? 0 : 12 }}>
            <button
              ref={confirm.askReason ? undefined : (el) => { firstFieldRef.current = el; }}
              type="button"
              className={`btn btn-sm ${confirm.danger ? "btn-danger" : "btn-solid"}`}
              onClick={run}
              disabled={busy}
            >
              {busy && <Loader2 size={16} className="spin" aria-hidden="true" />}
              {confirm.confirmLabel}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!confirming && error && (
        <p className={`field-error ${styles.inlineError}`} role="alert">{error}</p>
      )}
    </>
  );
}

interface ModActionsProps {
  targetType: "thread" | "reply";
  targetId: string;
  status: PostStatus;
  isPinned?: boolean;
  isLocked?: boolean;
}

/** Moderator tools for one post, tucked behind a "Moderate" toggle. */
export function ModActions({ targetType, targetId, status, isPinned = false, isLocked = false }: ModActionsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const target = { targetType, targetId };
  const noun = targetType === "thread" ? "discussion" : "reply";
  const isThread = targetType === "thread";

  return (
    <>
      <button
        type="button"
        className={`btn-link ${styles.footBtn}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Shield size={16} aria-hidden="true" /> Moderate
      </button>

      {open && (
        <div id={panelId} className={styles.modPanel}>
          <div className={styles.inlineActions}>
            {status !== "visible" && (
              <ActionButton
                label="Restore"
                className="btn btn-solid btn-sm"
                requests={[{ action: "restore", ...target }]}
                success="Restored — members can see it again."
              />
            )}
            {isThread &&
              (isPinned ? (
                <ActionButton label="Unpin" requests={[{ action: "unpin", ...target }]} success="Unpinned." />
              ) : (
                <ActionButton label="Pin to top" requests={[{ action: "pin", ...target }]} success="Pinned to the top." />
              ))}
            {isThread &&
              (isLocked ? (
                <ActionButton label="Unlock replies" requests={[{ action: "unlock", ...target }]} success="Unlocked — members can reply again." />
              ) : (
                <ActionButton
                  label="Lock replies"
                  requests={[{ action: "lock", ...target }]}
                  success="Locked — no new replies."
                  confirm={{
                    title: "Lock this discussion?",
                    body: "Members can still read it, but new replies will be closed.",
                    confirmLabel: "Lock",
                    askReason: true,
                  }}
                />
              ))}
            {status === "visible" && (
              <ActionButton
                label="Hold for review"
                requests={[{ action: "hold", ...target }]}
                success="Held — hidden from members for now."
                confirm={{
                  title: `Hold this ${noun}?`,
                  body: "It will be hidden from members until a moderator restores it.",
                  confirmLabel: "Hold",
                  askReason: true,
                }}
              />
            )}
            {status !== "removed" && (
              <ActionButton
                label="Remove"
                requests={[{ action: "remove", ...target }]}
                success="Removed."
                confirm={{
                  title: `Remove this ${noun}?`,
                  body: "Members won't see it any more. The author and moderators still can, and a moderator can restore it.",
                  confirmLabel: "Remove",
                  danger: true,
                  askReason: true,
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** The author deletes their own post (status → removed, logged as delete_own). */
export function DeleteOwnButton({ targetType, targetId }: { targetType: "thread" | "reply"; targetId: string }) {
  return (
    <ActionButton
      label="Delete"
      icon={<Trash2 size={16} aria-hidden="true" />}
      className={`btn-link ${styles.footBtn}`}
      requests={[{ action: "delete_own", targetType, targetId }]}
      success="Your post was deleted."
      confirm={{
        title: "Delete your post?",
        body: "Other members won't see it any more. Community managers keep access for safety reviews.",
        confirmLabel: "Delete",
        danger: true,
      }}
    />
  );
}
