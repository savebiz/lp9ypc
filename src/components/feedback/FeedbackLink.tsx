import Link from "next/link";
import styles from "./FeedbackLink.module.css";

interface Props {
  href: string;
  /** Visible text, e.g. "Link not working?" */
  children: string;
  /** Fuller name for screen readers; must start with the visible text. */
  label?: string;
  className?: string;
}

/**
 * A small, quiet text link to the feedback form (under Apply, on event cards).
 * Deliberately low-key so it never competes with the citrus Apply button,
 * but still a 44px tap target.
 */
export default function FeedbackLink({ href, children, label, className }: Props) {
  return (
    <Link href={href} className={`${styles.link}${className ? ` ${className}` : ""}`} aria-label={label} prefetch={false}>
      {children}
    </Link>
  );
}
