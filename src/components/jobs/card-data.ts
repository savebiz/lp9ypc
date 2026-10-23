import type { CareerPath, Job } from "@/types";

/**
 * Exactly the job fields a JobCard (and its ApplyButton / "Link not working?"
 * link) shows. Lists and the dashboard select only these, never `*`, so members
 * on mobile data don't download columns nobody sees.
 */
export type JobCardJob = Pick<
  Job,
  | "id"
  | "title"
  | "company"
  | "location"
  | "work_mode"
  | "engagement_type"
  | "deadline"
  | "application_link"
  | "salary_range"
  | "created_at"
  | "is_referral"
> & {
  description?: Job["description"];
  career_paths?: Pick<CareerPath, "name" | "slug"> | null;
};

/** Card columns without the description (cards rendered with showDescription={false}). */
export const JOB_CARD_COMPACT_COLUMNS: string =
  "id, title, company, location, work_mode, engagement_type, deadline, application_link, salary_range, created_at, is_referral, career_paths(name, slug)";

/** Card columns including the two-line description shown on /jobs. */
export const JOB_CARD_COLUMNS: string = `${JOB_CARD_COMPACT_COLUMNS}, description`;
