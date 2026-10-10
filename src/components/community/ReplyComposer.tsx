"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { OFFLINE_REPLY, isOffline, postJson, type PostResult } from "./api";
import styles from "./community.module.css";

const MAX = 3000;

export interface PostedReply {
  id: string;
  status: PostResult["status"];
  body: string;
}

interface Props {
  threadId: string;
  /** Reply to this reply (inline composer). Omit for the bottom "Add a reply" composer. */
  parentId?: string;
  /** "Replying to {Name}" header of the inline composer. */
  replyingTo?: string;
  initialText?: string;
  /** Extra line, e.g. the moderator note on a locked thread (bottom composer). */
  note?: string;
  onDraftChange?: (text: string) => void;
  /** Inline composers only. */
  onCancel?: () => void;
  onPosted: (reply: PostedReply) => void;
}

function Counter({ id, length }: { id: string; length: number }) {
  const near = length > MAX * 0.9;
  return (
    <span id={id} className={`${styles.counter}${near ? ` ${styles.counterNear}` : ""}`}>
      {length.toLocaleString("en-GB")} / {MAX.toLocaleString("en-GB")}
      <span className="sr-only"> characters</span>
    </span>
  );
}

/**
 * Reply composer (community-feature-spec §4). Inline under a post (with
 * "Replying to {Name}", Cancel and Escape) or at the bottom of the thread.
 * Keeps the draft when posting fails.
 */
export default function ReplyComposer({ threadId, parentId, replyingTo, initialText = "", note, onDraftChange, onCancel, onPosted }: Props) {
  const id = useId();
  const pathname = usePathname();
  const inline = !!onCancel;
  const [body, setBody] = useState(initialText);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState<{ message: string; status: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!inline) return;
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    wrapRef.current?.scrollIntoView({ block: "nearest" });
  }, [inline]);

  useEffect(() => {
    if (confirmDiscard) discardRef.current?.focus();
  }, [confirmDiscard]);

  function update(text: string) {
    setBody(text);
    onDraftChange?.(text);
  }

  function cancel() {
    if (!onCancel || busy) return;
    if (body.trim()) setConfirmDiscard(true);
    else onCancel();
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const text = body.trim();
    setFormError(null);
    if (!text) {
      setError("Write your reply first.");
      return bodyRef.current?.focus();
    }
    if (text.length > MAX) {
      setError(`Keep it under ${MAX.toLocaleString("en-GB")} characters.`);
      return bodyRef.current?.focus();
    }
    setError("");
    if (isOffline()) {
      setFormError({ message: OFFLINE_REPLY, status: 0 });
      return;
    }

    setBusy(true);
    const res = await postJson<PostResult>(
      "/api/community/replies",
      parentId ? { threadId, parentId, body: text } : { threadId, body: text },
      {
        forbidden: "You can't reply to this discussion right now.",
        unavailable: "Replies aren't switched on yet — we're still finishing the setup. Please try again later.",
      },
    );
    setBusy(false);

    if (!res.ok) {
      setFormError({ message: res.status === 0 ? OFFLINE_REPLY : res.error, status: res.status });
      return;
    }
    setBody("");
    onDraftChange?.("");
    onPosted({ id: res.data.id, status: res.data.status, body: text });
  }

  const errId = `${id}-err`;
  const countId = `${id}-count`;

  return (
    <section
      ref={wrapRef}
      className={inline ? styles.inlineComposer : styles.composer}
      aria-labelledby={`${id}-h`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && inline) {
          e.stopPropagation();
          if (confirmDiscard) setConfirmDiscard(false);
          else cancel();
        }
      }}
    >
      {inline ? (
        <p id={`${id}-h`} className={styles.replyingTo}>Replying to {replyingTo ?? "Member"}</p>
      ) : (
        <>
          <h2 id={`${id}-h`}>Add a reply</h2>
          <p className={styles.composerNote}>
            Posts are checked by our moderation assistant, and some are held for a community manager to review before they
            appear. Please keep to the{" "}
            <Link href="/guidelines" className={styles.inlineLink}>
              community guidelines
            </Link>
            .
          </p>
        </>
      )}
      {note && <p className={`small ink-2 ${styles.formAlert}`}>{note}</p>}

      {formError && (
        <div className={`alert alert-error ${styles.formAlert}`} role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>
            {formError.message}
            {formError.status === 401 && (
              <>
                {" "}
                <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={styles.inlineLink}>
                  Sign in
                </Link>
              </>
            )}
          </span>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className={inline ? "sr-only" : "label"} htmlFor={`${id}-body`}>Your reply</label>
          <textarea
            ref={bodyRef}
            id={`${id}-body`}
            className="input"
            rows={4}
            value={body}
            maxLength={MAX}
            placeholder="Write a kind, helpful reply…"
            onChange={(e) => update(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errId} ${countId}` : countId}
          />
          <div className={styles.fieldFoot}>
            {error && <p id={errId} className="field-error">{error}</p>}
            <Counter id={countId} length={body.length} />
          </div>
        </div>

        {confirmDiscard ? (
          <div className={styles.inline} role="group" aria-labelledby={`${id}-discard`}>
            <p id={`${id}-discard`} className={styles.inlineTitle}>Discard your reply?</p>
            <div className={styles.inlineActions} style={{ marginTop: 12 }}>
              <button ref={discardRef} type="button" className="btn btn-danger btn-sm" onClick={() => { update(""); onCancel?.(); }}>
                Discard
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setConfirmDiscard(false);
                  bodyRef.current?.focus();
                }}
              >
                Keep writing
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.formActions}>
            <button type="submit" className={inline ? "btn btn-solid" : "btn btn-action"} disabled={busy}>
              {busy && <Loader2 size={18} className="spin" aria-hidden="true" />}
              {busy ? "Posting…" : "Post reply"}
            </button>
            {inline && (
              <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>
                Cancel
              </button>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
