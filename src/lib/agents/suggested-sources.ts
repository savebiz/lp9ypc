/**
 * Job pages Admin can add with one tap ("Suggested sources" in the Job sources
 * tab). Nothing here is inserted automatically: an admin chooses to add them.
 *
 * Each entry was checked on 2026-10-10 with a read-only fetch using our bot
 * user agent (LP9YPC-JobBot): robots.txt allows the path, the page loads, and
 * we recorded how the job finder reads it:
 *   - "structured": RSS feed or schema.org JobPosting data, read without AI
 *     (works even while the Gemini key has no billing);
 *   - "ai": a normal listing page, needs the Gemini AI reader.
 *
 * Pure data, no imports, safe for client components.
 */
export interface SuggestedSource {
  name: string;
  url: string;
  why: string;
  method: "structured" | "ai";
}

export const SUGGESTED_SOURCES: SuggestedSource[] = [
  {
    name: "Hot Nigerian Jobs (RSS feed)",
    url: "https://www.hotnigerianjobs.com/feed/rss.xml",
    why: "Long-running Nigerian job board with daily Lagos and nationwide vacancies. Its feed lists the newest jobs with links to each one, so we can read it without AI.",
    method: "structured",
  },
  {
    name: "We Work Remotely (RSS feed)",
    url: "https://weworkremotely.com/remote-jobs.rss",
    why: "One of the largest remote-job boards. Good for tech, design, marketing and support roles open to people working from Nigeria.",
    method: "structured",
  },
  {
    name: "Remotive (RSS feed)",
    url: "https://remotive.com/remote-jobs/feed",
    why: "Curated remote jobs across software, sales, customer support and more. Feed includes company and link for every job.",
    method: "structured",
  },
  {
    name: "Himalayas remote jobs (RSS feed)",
    url: "https://himalayas.app/jobs/rss",
    why: "Remote jobs from companies hiring worldwide, with clear company names and direct job links.",
    method: "structured",
  },
  {
    name: "MyJobMag: jobs in Lagos",
    url: "https://www.myjobmag.com/jobs-location/lagos",
    why: "Popular Nigerian job site with many Lagos vacancies from banks, FMCGs and SMEs. The listing page has no structured data, so it needs the AI reader.",
    method: "ai",
  },
  {
    name: "Jobberman: latest jobs",
    url: "https://www.jobberman.com/jobs",
    why: "Nigeria's best-known job board. The listing page has no structured data or public job feed, so it needs the AI reader.",
    method: "ai",
  },
];
