import Link from "next/link";
import type { FeedbackStatus, MyFeedback } from "@/types";
import { formatDate } from "@/lib/utils";
import { FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS } from "./feedback";
import styles from "./FeedbackPanel.module.css";

const STATUS_CLASS: Record<FeedbackStatus, string> = {
  new: "status admin",
  looking: "status admin",
  fixed: "status ok",
  not_now: "status off",
};

function shorten(s: string, max = 120): string {
  const chars = Array.from(s.trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : chars.join("");
}

/**
 * "Your feedback" on the dashboard: the member's latest items from the
 * my_feedback view (never the internal admin note). Renders nothing when
 * there's nothing to show.
 */
export default function FeedbackPanel({ items }: { items: MyFeedback[] }) {
  if (items.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="feedback-h">
      <div className="panel-head">
        <h2 id="feedback-h">Your feedback</h2>
        <Link href="/feedback" className="btn-link">Send feedback</Link>
      </div>
      <ul className={styles.list}>
        {items.map((f) => (
          <li key={f.id} className={styles.item}>
            <div className={styles.top}>
              <span className={styles.kind}>{FEEDBACK_KIND_LABELS[f.kind] ?? "Feedback"}</span>
              <span className={STATUS_CLASS[f.status] ?? "status"}>
                <span className="sr-only">Status: </span>
                {FEEDBACK_STATUS_LABELS[f.status] ?? f.status}
              </span>
            </div>
            {f.message && <p className={styles.note}>{shorten(f.message)}</p>}
            {f.status === "not_now" && f.public_reason && (
              <p className={styles.reason}>
                <span className={styles.reasonLabel}>From the YPC team:</span> {f.public_reason}
              </p>
            )}
            <p className="small muted">
              Sent <time dateTime={f.created_at}>{formatDate(f.created_at)}</time>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
