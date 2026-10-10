import Link from "next/link";
import { Bookmark, BookmarkCheck, CalendarClock, Clock, MapPin } from "lucide-react";
import type { Job } from "@/types";
import ApplyButton from "@/components/jobs/ApplyButton";
import FeedbackLink from "@/components/feedback/FeedbackLink";
import { FEEDBACK_COPY } from "@/components/feedback/feedback";
import { PathIcon } from "@/components/ui/icons";
import {
  ENGAGEMENT_LABELS,
  WORK_MODE_LABELS,
  closesLabel,
  isDeadlineSoon,
  isExpired,
  isNew,
  shortPathName,
  timeAgo,
} from "@/lib/utils";

interface JobCardProps {
  job: Job;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
  showDescription?: boolean;
}

export default function JobCard({ job, isSaved, onToggleSave, showDescription = true }: JobCardProps) {
  const soon = isDeadlineSoon(job.deadline);

  return (
    <article className="job" aria-labelledby={`job-${job.id}`}>
      <div className="job-top">
        <span className="org-tile" aria-hidden="true">{job.company.trim().charAt(0).toUpperCase()}</span>
        <div>
          <h3 className="job-title" id={`job-${job.id}`}>
            <Link href={`/jobs/${job.id}`}>{job.title}</Link>
            {isNew(job.created_at) && <span className="new-tag">NEW</span>}
          </h3>
          <p className="job-org">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
        </div>
        {onToggleSave && (
          <button
            type="button"
            className={`icon-btn${isSaved ? " on" : ""}`}
            onClick={() => onToggleSave(job.id)}
            aria-pressed={isSaved}
            aria-label={isSaved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}
          >
            {isSaved ? <BookmarkCheck size={22} /> : <Bookmark size={22} />}
          </button>
        )}
      </div>

      <div className="row-wrap">
        {job.work_mode && <span className="chip">{WORK_MODE_LABELS[job.work_mode]}</span>}
        {job.engagement_type && <span className="chip">{ENGAGEMENT_LABELS[job.engagement_type]}</span>}
        {job.career_paths && (
          <span className="chip">
            <PathIcon slug={job.career_paths.slug} size={14} className="text-blue" />
            {shortPathName(job.career_paths.name)}
          </span>
        )}
      </div>

      {showDescription && job.description && <p className="job-desc">{job.description}</p>}

      <div className="job-facts">
        {job.salary_range && <span className="salary">{job.salary_range}</span>}
        <span className={soon ? "soon" : undefined}>
          <CalendarClock size={15} aria-hidden="true" /> {closesLabel(job.deadline)}
        </span>
        <span><Clock size={15} aria-hidden="true" /> {timeAgo(job.created_at)}</span>
        {!job.location && job.work_mode === "remote" && (
          <span><MapPin size={15} aria-hidden="true" /> Anywhere</span>
        )}
      </div>

      <ApplyButton link={job.application_link} deadline={job.deadline} title={job.title} referral={!!job.is_referral} />
      {!isExpired(job.deadline) && (
        <FeedbackLink
          href={`/feedback?job=${job.id}&kind=link`}
          label={`${FEEDBACK_COPY.jobLink} Tell us about the Apply link for ${job.title}`}
        >
          {FEEDBACK_COPY.jobLink}
        </FeedbackLink>
      )}
    </article>
  );
}
