"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FEEDBACK_COPY } from "./feedback";

/**
 * The footer's "Tell us" link. It passes the current page as ?from= so the
 * team knows which page the feedback is about (document.referrer doesn't
 * change on client-side navigation, so it can't be used for this).
 */
export default function FooterFeedbackLink() {
  const pathname = usePathname();
  const from = pathname && pathname !== "/feedback" ? pathname : null;
  return (
    <Link href={from ? `/feedback?from=${encodeURIComponent(from)}` : "/feedback"} prefetch={false}>
      {FEEDBACK_COPY.footerLink}
    </Link>
  );
}
