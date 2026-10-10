"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { NETWORK_ERROR, editPost, isOffline, type PostResult } from "./api";
import styles from "./community.module.css";

const LIMITS = { title: { min: 3, max: 160 }, thread: 5000, reply: 3000 };

export interface SavedEdit {
  title?: string;
  body: string;
  status: PostResult["status"];
  editedAt: string;
}

interface Props {
  kind: "thread" | "reply";
  id: string;
  initialTitle?: string;
  initialBody: string;
  onCancel: () => void;
  onSaved: (edit: SavedEdit) => void;
}

/** In-place edit of your own post (community-feature-spec §8). */
export default function EditForm({ kind, id, initialTitle = "", initialBody, onCancel, onSaved }: Props) {
  const uid = useId();
  const isThread = kind === "thread";
  const max = isThread ? LIMITS.thread : LIMITS.reply;
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (isThread ? titleRef.current : bodyRef.current)?.focus();
  }, [isThread]);

  const unchanged = body.trim() === initialBody.trim() && (!isThread || title.trim() === initialTitle.trim());

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (unchanged || busy) return;
    const t = title.trim();
    const b = body.trim();
    const e: { title?: string; body?: string } = {};
    if (isThread) {
      if (t.length < LIMITS.title.min) e.title = `Give your discussion a title (at least ${LIMITS.title.min} characters).`;
      else if (t.length > LIMITS.title.max) e.title = `Keep the title under ${LIMITS.title.max} characters.`;
    }
    if (!b) e.body = isThread ? "Write something to start the conversation." : "Write your reply first.";
    else if (b.length > max) e.body = `Keep it under ${max.toLocaleString("en-GB")} characters.`;
    setErrors(e);
    setFormError("");
    if (e.title) return titleRef.current?.focus();
    if (e.body) return bodyRef.current?.focus();
    if (isOffline()) return setFormError("You seem to be offline. Your changes haven't been saved.");

    setBusy(true);
    const res = await editPost({ targetType: kind, targetId: id, ...(isThread ? { title: t } : {}), body: b });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.status === 0 ? NETWORK_ERROR : res.error);
      return;
    }
    onSaved({ ...(isThread ? { title: t } : {}), body: b, status: res.data.status, editedAt: new Date().toISOString() });
  }

  const helpId = `${uid}-help`;

  return (
    <form
      className={styles.editForm}
      onSubmit={save}
      noValidate
      aria-label={isThread ? "Edit your discussion" : "Edit your reply"}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {formError && (
        <div className={`alert alert-error ${styles.formAlert}`} role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}
      {isThread && (
        <div className="field">
          <label className="label" htmlFor={`${uid}-title`}>Title</label>
          <input
            ref={titleRef}
            id={`${uid}-title`}
            className="input"
            type="text"
            value={title}
            maxLength={LIMITS.title.max}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? `${uid}-title-err` : undefined}
            autoComplete="off"
          />
          {errors.title && <p id={`${uid}-title-err`} className="field-error">{errors.title}</p>}
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor={`${uid}-body`}>{isThread ? "Your post" : "Your reply"}</label>
        <textarea
          ref={bodyRef}
          id={`${uid}-body`}
          className="input"
          rows={isThread ? 6 : 4}
          value={body}
          maxLength={max}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? `${uid}-body-err ${helpId}` : helpId}
        />
        {errors.body && <p id={`${uid}-body-err`} className="field-error">{errors.body}</p>}
      </div>
      <p id={helpId} className="hint" style={{ marginBottom: 12 }}>
        Saving sends your post for a quick check again. Others won&apos;t see it until that&apos;s done.
      </p>
      <div className={styles.formActions}>
        <button type="submit" className="btn btn-solid" disabled={busy || unchanged}>
          {busy && <Loader2 size={18} className="spin" aria-hidden="true" />}
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
