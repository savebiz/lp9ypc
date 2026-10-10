import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { hostnameOf, safeHttpUrl } from "@/lib/utils";
import ScopeBadge from "./ScopeBadge";
import Flyer from "./Flyer";
import { eventWhen, flyerOf, type NewsItem } from "./news";
import styles from "./EventCard.module.css";

interface EventCardProps {
  event: NewsItem;
  /** Heading level for the event title (default 3: under a section h2). */
  headingLevel?: 2 | 3 | 4;
  /** Shorter card for the landing page / dashboard: details clamp to two lines. */
  compact?: boolean;
  /**
   * How to show the event's flyer, if it has one. "thumb": small portrait
   * thumbnail under the date tile. "full": full-width image across the top of
   * the card. Default: "thumb" when compact, otherwise "full".
   */
  flyer?: "thumb" | "full";
}

/**
 * One upcoming event: a date tile (day + month), weekday and time in Lagos
 * time, title, where it's from, location, details, and "More info" only when
 * the event has a real web link. If the event has a flyer it's shown too;
 * tapping it opens the whole flyer.
 */
export default function EventCard({ event, headingLevel = 3, compact = false, flyer }: EventCardProps) {
  const when = eventWhen(event.starts_at, event.ends_at);
  const href = safeHttpUrl(event.link_url);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const titleId = `event-${event.id}`;
  const location = event.location?.trim();
  const details = event.content?.trim();
  const image = flyerOf(event);
  const flyerVariant = flyer ?? (compact ? "thumb" : "full");

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.side}>
        {when ? (
          <div className={styles.date} aria-hidden="true">
            <span className={styles.day}>{when.day}</span>
            <span className={styles.month}>{when.month}</span>
            {when.year && <span className={styles.year}>{when.year}</span>}
          </div>
        ) : (
          <div className={`${styles.date} ${styles.noDate}`} aria-hidden="true">
            <CalendarDays size={26} />
          </div>
        )}
        {image && flyerVariant === "thumb" && (
          <Flyer src={image.src} alt={image.alt} title={event.title} variant="thumb" />
        )}
      </div>

      <div className={styles.body}>
        <Heading id={titleId} className={styles.title}>{event.title}</Heading>

        {when ? (
          <p className={styles.when}>
            <time dateTime={when.iso}>
              <span aria-hidden="true">{when.line}</span>
              <span className="sr-only">{when.spoken} (Lagos time)</span>
            </time>
          </p>
        ) : (
          <p className={styles.when}>Date to be confirmed</p>
        )}

        <div>
          <ScopeBadge scope={event.scope} label={event.scope_label} />
        </div>

        {location && (
          <p className={styles.meta}>
            <MapPin size={16} aria-hidden="true" />
            <span><span className="sr-only">Location: </span>{location}</span>
          </p>
        )}

        {/* With a full flyer, the flyer replaces the write-up: it already carries
            the details, and its alt text gives them to screen-reader users. */}
        {image && flyerVariant === "full" ? (
          <Flyer src={image.src} alt={image.alt} title={event.title} variant="full" className={styles.flyerInline} />
        ) : (
          details && <p className={`${styles.details}${compact ? ` ${styles.clamp}` : ""}`}>{details}</p>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-link ${styles.more}`}
            aria-label={`More info about ${event.title} (opens ${hostnameOf(href)} in a new tab)`}
          >
            More info <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}
