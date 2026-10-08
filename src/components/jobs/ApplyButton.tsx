import { ArrowUpRight } from "lucide-react";
import { hostnameOf, isExpired, safeHttpUrl } from "@/lib/utils";

/**
 * The single most important interaction on the platform: one tap, straight
 * to the application/referral page, with the destination shown underneath so
 * there's no confusion about where it goes.
 */
export default function ApplyButton({
  link,
  deadline,
  title,
  size = "md",
  hint = true,
}: {
  link: string;
  deadline: string | null;
  title: string;
  size?: "md" | "lg";
  hint?: boolean;
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
      >
        Apply now <ArrowUpRight size={20} aria-hidden="true" />
      </a>
      {hint && <p className="apply-hint">Opens {hostnameOf(href)} in a new tab</p>}
    </div>
  );
}
