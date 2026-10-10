import { Clock, EyeOff, Lock, Pin, ShieldCheck } from "lucide-react";
import { fullDateTime, relativeTime } from "./time";
import styles from "./community.module.css";
import type { PostStatus } from "@/types";

// Small server-safe pieces shared by the thread list, thread page and manage queue.

const STATUS_LABEL: Record<Exclude<PostStatus, "visible">, string> = {
  held: "Held for review",
  removed: "Removed",
  pending: "Checking…",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  if (status === "visible") return null;
  const cls = status === "removed" ? styles.badgeRemoved : styles.badgeHeld;
  const Icon = status === "removed" ? EyeOff : Clock;
  return (
    <span className={`${styles.badge} ${cls}`}>
      <Icon size={13} aria-hidden="true" /> {STATUS_LABEL[status]}
    </span>
  );
}

/** "Checking…" chip shown to the author (and moderators) while a post waits for its check. */
export function CheckingChip({ pulse = false }: { pulse?: boolean }) {
  return (
    <span className={`${styles.badge} ${styles.badgeHeld} ${styles.checking}${pulse ? ` ${styles.checkingPulse}` : ""}`}>
      <Clock size={13} aria-hidden="true" /> Checking…
    </span>
  );
}

/** Manager / Admin chip after an author's name (text, not colour alone). */
export function RoleBadge({ role }: { role: "admin" | "manager" | undefined | null }) {
  if (!role) return null;
  return (
    <span className={`${styles.roleBadge}${role === "admin" ? ` ${styles.roleAdmin}` : ""}`}>
      <ShieldCheck size={12} aria-hidden="true" /> {role === "admin" ? "Admin" : "Manager"}
    </span>
  );
}

/** "edited" (its "·" is drawn by CSS .metaItem) with the full edit time as a tooltip. Shown to everyone. */
export function EditedMark({ editedAt }: { editedAt: string | null | undefined }) {
  if (!editedAt) return null;
  return (
    <span className={`${styles.metaItem} ${styles.edited}`} title={`Edited ${fullDateTime(editedAt)}`}>
      edited
    </span>
  );
}

/**
 * Post text with "> " lines shown as quote blocks (left rule, ink-2).
 * Plain text only — nothing is rendered as HTML.
 */
export function PostBody({ text, className }: { text: string; className?: string }) {
  const blocks: { quote: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const isQuote = line.startsWith("> ") || line === ">";
    const content = isQuote ? line.replace(/^>\s?/, "") : line;
    const last = blocks[blocks.length - 1];
    if (last && last.quote === isQuote) last.lines.push(content);
    else blocks.push({ quote: isQuote, lines: [content] });
  }
  return (
    <div className={`${styles.postBody}${className ? ` ${className}` : ""}`}>
      {blocks.map((b, i) =>
        b.quote ? (
          <blockquote key={i} className={styles.quote}>{b.lines.join("\n")}</blockquote>
        ) : (
          <span key={i} className={styles.bodyText}>{trimBlankEdges(b.lines, i > 0, i < blocks.length - 1).join("\n")}</span>
        ),
      )}
    </div>
  );
}

/** Drops the blank line between a quote and the text after it (the block gap replaces it). */
function trimBlankEdges(lines: string[], afterBlock: boolean, beforeBlock: boolean): string[] {
  let start = 0;
  let end = lines.length;
  if (afterBlock) while (start < end && lines[start].trim() === "") start++;
  if (beforeBlock) while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

export function PinnedBadge() {
  return (
    <span className={`${styles.badge} ${styles.badgePinned}`}>
      <Pin size={13} aria-hidden="true" /> Pinned
    </span>
  );
}

export function LockedBadge() {
  return (
    <span className={styles.badge}>
      <Lock size={13} aria-hidden="true" /> Locked
    </span>
  );
}

export function TimeAgo({ date }: { date: string }) {
  return (
    <time dateTime={date} title={fullDateTime(date)}>
      {relativeTime(date)}
    </time>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  harassment: "Harassment",
  sexual: "Sexual content",
  minors: "Minors",
  scam: "Scam",
  payment_request: "Payment request",
  personal_data: "Personal data",
  self_harm: "Self-harm",
  spam: "Spam",
  violence: "Violence",
  other: "Other",
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c.replace(/_/g, " ");
}

interface ModInfo {
  status: PostStatus;
  needs_review: boolean;
  moderation_reason: string | null;
  moderation_categories: string[] | null;
  moderated_by: "agent" | "human" | null;
}

/**
 * What a moderator sees about a post's moderation: who acted, why, and any
 * categories. Renders nothing for an ordinary visible post.
 */
export function ModerationNote({ post }: { post: ModInfo }) {
  const cats = post.moderation_categories ?? [];
  const showReason = post.status !== "visible" || cats.length > 0;
  if (!showReason && !post.needs_review) return null;

  const by =
    post.moderated_by === "agent" ? "the moderation assistant" : post.moderated_by === "human" ? "a moderator" : null;
  const verb = post.status === "removed" ? "Removed" : post.status === "held" ? "Held" : post.status === "pending" ? "Not checked yet" : "Checked";

  return (
    <div className={styles.note}>
      {showReason && (
        <p>
          <strong>{verb}{by && post.status !== "pending" ? ` by ${by}` : ""}.</strong>
          {post.moderation_reason ? ` ${post.moderation_reason}` : ""}
        </p>
      )}
      {cats.length > 0 && (
        <div className={styles.cats}>
          {cats.map((c) => (
            <span key={c} className="chip">{categoryLabel(c)}</span>
          ))}
        </div>
      )}
      {cats.includes("self_harm") && (
        <p style={{ marginTop: 8 }}>
          This member may be going through a hard time. Please make sure someone from the YPC team reaches out kindly and privately.
        </p>
      )}
      {cats.includes("minors") && (
        <p style={{ marginTop: 8 }}>Please tell a YPC admin about this post as well.</p>
      )}
      {post.needs_review && (
        <p style={{ marginTop: showReason ? 8 : 0 }}>
          Published while the moderation assistant was unavailable — it will be re-checked automatically.
        </p>
      )}
    </div>
  );
}

/** What the author sees on their own post that others can't see. Never shows the agent's reason. */
export function AuthorNote({ status, kind }: { status: PostStatus; kind: "thread" | "reply" }) {
  if (status === "visible") return null;
  const noun = kind === "thread" ? "discussion" : "reply";
  const text =
    status === "held"
      ? "Held for review — a community manager will check it soon. Other members can't see it yet."
      : status === "removed"
        ? `This ${noun} has been removed. Other members can't see it.`
        : "We're still checking this post. Other members can't see it yet.";
  return <p className={styles.note}>{text}</p>;
}
