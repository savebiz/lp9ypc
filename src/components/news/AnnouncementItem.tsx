import { ArrowUpRight } from "lucide-react";
import { hostnameOf, safeHttpUrl } from "@/lib/utils";
import ScopeBadge from "./ScopeBadge";
import { formatNewsDate, type NewsItem } from "./news";
import styles from "./AnnouncementItem.module.css";

interface AnnouncementItemProps {
  item: NewsItem;
  /** Heading level for the title (default 3: under a section h2). */
  headingLevel?: 2 | 3 | 4;
  /** Shorter version for the landing page / dashboard: text clamps to two lines. */
  compact?: boolean;
}

/** One announcement: title, text, where it's from, the date posted, and an optional link. */
export default function AnnouncementItem({ item, headingLevel = 3, compact = false }: AnnouncementItemProps) {
  const href = safeHttpUrl(item.link_url);
  const posted = formatNewsDate(item.created_at);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const titleId = `announcement-${item.id}`;
  const content = item.content?.trim();

  return (
    <article className="announcement" aria-labelledby={titleId}>
      <div className={styles.body}>
        <Heading id={titleId} className={styles.title}>{item.title}</Heading>
        {content && <p className={`${styles.content}${compact ? ` ${styles.clamp}` : ""}`}>{content}</p>}
        <div className={styles.meta}>
          <ScopeBadge scope={item.scope} label={item.scope_label} />
          {posted && (
            <time className={styles.time} dateTime={item.created_at}>
              <span className="sr-only">Posted </span>{posted}
            </time>
          )}
        </div>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-link ${styles.more}`}
            aria-label={`More info about ${item.title} (opens ${hostnameOf(href)} in a new tab)`}
          >
            More info <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}
