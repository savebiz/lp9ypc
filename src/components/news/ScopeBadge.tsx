import type { AnnouncementScope } from "@/types";
import { SCOPE_NAMES } from "./news";
import styles from "./ScopeBadge.module.css";

/**
 * Where a news item or event comes from: Parish / Provincial / Regional /
 * National, plus the optional `scope_label` (e.g. "Jesus House Parish").
 */
export default function ScopeBadge({ scope, label }: { scope: AnnouncementScope; label?: string | null }) {
  // The database default is 'province'; fall back to it for any legacy row.
  const level: AnnouncementScope = scope in SCOPE_NAMES ? scope : "province";
  const extra = label?.trim();

  return (
    <span className={styles.wrap}>
      <span className={`${styles.badge} ${styles[level]}`}>{SCOPE_NAMES[level]}</span>
      {extra && <span className={styles.label}>{extra}</span>}
    </span>
  );
}
