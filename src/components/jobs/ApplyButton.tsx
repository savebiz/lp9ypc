"use client";

import { ArrowUpRight } from "lucide-react";
import { hostnameOf, isExpired, safeHttpUrl } from "@/lib/utils";

/** Where the Apply button was tapped (apply_clicks.source). */
export type ApplySource = "card" | "detail" | "dashboard" | "welcome";

/**
 * Counts a tap on Apply without touching the navigation: no preventDefault, no
 * await, and any failure is swallowed. sendBeacon queues the request even as
 * the page moves on; fetch keepalive is the fallback. The link opens either way.
 */
function countApplyTap(jobId: string, source: ApplySource): void {
  let body = "";
  try {
    body = JSON.stringify({ jobId, source });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon("/api/apply-tap", new Blob([body], { type: "application/json" }))) return;
    }
  } catch {
    // Some browsers refuse a JSON beacon; fall through to fetch.
  }
  try {
    void fetch("/api/apply-tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // Counting is best effort; never get in the way of applying.
  }
}

/**
 * The single most important interaction on the platform: one tap, straight
 * to the application/referral page, with the destination shown underneath so
 * there's no confusion about where it goes. It stays a plain link; the tap
 * count rides alongside it.
 */
export default function ApplyButton({
  jobId,
  link,
  deadline,
  title,
  source = "card",
  size = "md",
  hint = true,
  referral = false,
}: {
  jobId: string;
  link: string;
  deadline: string | null;
  title: string;
  /** Where this button sits, for the weekly "applying members" count. */
  source?: ApplySource;
  size?: "md" | "lg";
  hint?: boolean;
  /** The link is a referral link (admin-ticked); say so honestly under the button. */
  referral?: boolean;
}) {
  const href = safeHttpUrl(link);

  if (isExpired(deadline)) {
    return <div className="job-closed" role="status">Applications closed</div>;
  }
  if (!href) {
    // Can't happen for rows created after the schema migration (the database
    // rejects non-http links); kept so a bad legacy row never renders a dead button.
    return <div className="job-closed" role="status">Application link unavailable</div>;
  }

  return (
    <div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`btn btn-action btn-block${size === "lg" ? " btn-lg" : ""}`}
        aria-label={`Apply for ${title} (opens ${hostnameOf(href)} in a new tab)`}
        onClick={() => countApplyTap(jobId, source)}
        onAuxClick={(e) => {
          if (e.button === 1) countApplyTap(jobId, source);
        }}
      >
        Apply now <ArrowUpRight size={20} aria-hidden="true" />
      </a>
      {hint && (
        <p className="apply-hint">
          {referral ? <>Referral link via YPC · </> : null}Opens {hostnameOf(href)} in a new tab
        </p>
      )}
    </div>
  );
}
