"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleAlert, Info, Loader2, PenLine } from "lucide-react";
import { postJson, type PostResult } from "./api";
import { toast } from "./Toast";
import styles from "./community.module.css";

const LIMITS = {
  title: { min: 3, max: 160 },
  threadBody: { min: 1, max: 5000 },
  replyBody: { min: 1, max: 3000 },
};

const HELD_DEFAULT = "Held for review — a community manager will check it soon.";

type Props =
  | {
      kind: "thread";
      communityId: string;
      /** The community slug: after posting, we go straight to the new thread page. */
      slug?: string;
      /** Show a "Start a discussion" button first. */
      collapsible?: boolean;
    }
  | { kind: "reply"; threadId: string; /** Extra line, e.g. "This discussion is locked". */ note?: string };

interface FieldErrors {
  title?: string;
  body?: string;
}

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  const near = length > max * 0.9;
  return (
    <span id={id} className={`${styles.counter}${near ? ` ${styles.counterNear}` : ""}`}>
      {length.toLocaleString("en-GB")} / {max.toLocaleString("en-GB")}
      <span className="sr-only"> characters</span>
    </span>
  );
}

export default function PostForm(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const isThread = props.kind === "thread";
  const collapsible = props.kind === "thread" && !!props.collapsible;
  const bodyLimit = isThread ? LIMITS.threadBody : LIMITS.replyBody;

  const [open, setOpen] = useState(!collapsible);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; status: number } | null>(null);
  const [held, setHeld] = useState("");
  const [busy, setBusy] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusOnOpen = useRef(false);

  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      (isThread ? titleRef.current : bodyRef.current)?.focus();
    }
  }, [open, isThread]);

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    const t = title.trim();
    const b = body.trim();
    if (isThread) {
      if (t.length < LIMITS.title.min) e.title = `Give your discussion a title (at least ${LIMITS.title.min} characters).`;
      else if (t.length > LIMITS.title.max) e.title = `Keep the title under ${LIMITS.title.max} characters.`;
    }
    if (b.length < bodyLimit.min) e.body = isThread ? "Write something to start the conversation." : "Write your reply first.";
    else if (b.length > bodyLimit.max) e.body = `Keep it under ${bodyLimit.max.toLocaleString("en-GB")} characters.`;
    return e;
  }

  function closeComposer() {
    setOpen(false);
    setErrors({});
    setFormError(null);
    setHeld("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    setHeld("");
    if (e.title) return titleRef.current?.focus();
    if (e.body) return bodyRef.current?.focus();

    setBusy(true);
    const res =
      props.kind === "thread"
        ? await postJson<PostResult>(
            "/api/community/threads",
            { communityId: props.communityId, title: title.trim(), body: body.trim() },
            {
              forbidden: "Only members of this community can start discussions here.",
              unavailable: "Posting isn't switched on yet — we're still finishing the setup. Please try again later.",
            },
          )
        : await postJson<PostResult>(
            "/api/community/replies",
            { threadId: props.threadId, body: body.trim() },
            {
              forbidden: "You can't reply to this discussion right now.",
              unavailable: "Replies aren't switched on yet — we're still finishing the setup. Please try again later.",
            },
          );
    setBusy(false);

    if (!res.ok) {
      setFormError({ message: res.error, status: res.status });
      return;
    }

    // New thread: go straight to it, where the "Checking…" chip shows (spec §6).
    if (props.kind === "thread" && props.slug) {
      router.push(`/community/${props.slug}/t/${res.data.id}`);
      return;
    }

    setTitle("");
    setBody("");
    setErrors({});
    if (res.data.status === "held") {
      setHeld(res.data.message?.trim() || HELD_DEFAULT);
    } else if (res.data.status === "pending") {
      toast("Posted. We’re doing a quick check before others can see it.");
      if (collapsible) closeComposer();
    } else {
      toast("Posted");
      if (collapsible) closeComposer();
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-action btn-block"
        aria-expanded={false}
        onClick={() => { focusOnOpen.current = true; setOpen(true); }}
      >
        <PenLine size={18} aria-hidden="true" /> Start a discussion
      </button>
    );
  }

  const titleErrId = `${id}-title-err`;
  const titleCountId = `${id}-title-count`;
  const bodyErrId = `${id}-body-err`;
  const bodyCountId = `${id}-body-count`;
  const heading = isThread ? "Start a discussion" : "Add a reply";

  return (
    <section className={styles.composer} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{heading}</h2>
      <p className={styles.composerNote}>
        Posts are checked by our moderation assistant, and some are held for a community manager to review before they
        appear. Please keep to the{" "}
        <Link href="/guidelines" className={styles.inlineLink}>
          community guidelines
        </Link>
        .
      </p>
      {props.kind === "reply" && props.note && <p className={`small ink-2 ${styles.formAlert}`}>{props.note}</p>}

      {held && (
        <div className={`alert alert-info ${styles.formAlert}`} role="status">
          <Info size={18} aria-hidden="true" />
          <span>{held}</span>
        </div>
      )}
      {formError && (
        <div className={`alert alert-error ${styles.formAlert}`} role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>
            {formError.message}
            {formError.status === 401 && (
              <>
                {" "}
                <Link href={`/login?next=${pathname}`} className={styles.inlineLink}>
                  Sign in
                </Link>
              </>
            )}
          </span>
        </div>
      )}

      <form id={`${id}-form`} onSubmit={onSubmit} noValidate>
        {isThread && (
          <div className="field">
            <label className="label" htmlFor={`${id}-title`}>Title</label>
            <input
              ref={titleRef}
              id={`${id}-title`}
              className="input"
              type="text"
              value={title}
              maxLength={LIMITS.title.max}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? `${titleErrId} ${titleCountId}` : titleCountId}
              autoComplete="off"
            />
            <div className={styles.fieldFoot}>
              {errors.title && (
                <p id={titleErrId} className="field-error">{errors.title}</p>
              )}
              <Counter id={titleCountId} length={title.length} max={LIMITS.title.max} />
            </div>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor={`${id}-body`}>{isThread ? "What would you like to talk about?" : "Your reply"}</label>
          <textarea
            ref={bodyRef}
            id={`${id}-body`}
            className="input"
            rows={isThread ? 6 : 4}
            value={body}
            maxLength={bodyLimit.max}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={errors.body ? `${bodyErrId} ${bodyCountId}` : bodyCountId}
          />
          <div className={styles.fieldFoot}>
            {errors.body && (
              <p id={bodyErrId} className="field-error">{errors.body}</p>
            )}
            <Counter id={bodyCountId} length={body.length} max={bodyLimit.max} />
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="submit" className="btn btn-action" disabled={busy}>
            {busy && <Loader2 size={18} className="spin" aria-hidden="true" />}
            {busy ? "Posting…" : isThread ? "Post discussion" : "Post reply"}
          </button>
          {collapsible && (
            <button type="button" className="btn btn-ghost" onClick={closeComposer} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
