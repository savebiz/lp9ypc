export interface CareerPath {
  id: string;
  name: string;
  slug: string;
  icon: string;
  created_at: string;
}

// Mirrors supabase/migrations/20261008120000_initial_schema.sql
// and 20261009120000_community_agents.sql
export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string;
  area_of_residence: string | null;
  parish_unit: string | null;
  profession: string | null;
  employment_status: EmploymentStatus | null;
  preferred_work_mode: "remote" | "onsite" | "hybrid" | "any" | null;
  career_goal: CareerGoal | null;
  consent_updates: boolean;
  role: "member" | "admin";
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  work_mode: "remote" | "onsite" | "hybrid" | null;
  engagement_type: "full-time" | "part-time" | "contract" | "internship" | "graduate-trainee" | null;
  experience_level: "entry" | "mid" | "senior" | null;
  deadline: string | null;
  description: string | null;
  career_path_id: string | null;
  application_link: string;
  salary_range: string | null;
  is_active: boolean;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
  career_paths?: CareerPath;
  // Phase 2: scraper review queue
  source_id?: string | null;
  source_page_url?: string | null;
  dedupe_key?: string | null;
  review_status?: ReviewStatus;
  // Migration 4: the Apply link is a referral link (members see a small note)
  is_referral?: boolean;
}

export interface SavedJob {
  id: string;
  member_id: string;
  job_id: string;
  created_at: string;
  jobs?: Job;
}

export interface Announcement {
  id: string;
  title: string;
  content: string | null;
  is_active: boolean;
  posted_by: string | null;
  created_at: string;
  // Phase 2: News & events portal (database defaults: scope 'province', kind 'announcement')
  scope: AnnouncementScope;
  scope_label: string | null;
  kind: "announcement" | "event";
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  link_url: string | null;
  // Migration 5: event flyer (public URL in the event-flyers bucket) + alt text
  image_url?: string | null;
  image_alt?: string | null;
}

export interface MemberCareerPath {
  id: string;
  member_id: string;
  career_path_id: string;
  created_at: string;
  career_paths?: CareerPath;
}

export type EmploymentStatus = "employed" | "self-employed" | "unemployed" | "student" | "other";
export type WorkMode = "remote" | "onsite" | "hybrid";
export type EngagementType = "full-time" | "part-time" | "contract" | "internship" | "graduate-trainee";
export type ExperienceLevel = "entry" | "mid" | "senior";

// ── Phase 2 ──────────────────────────────────────────────────────────────

export type CareerGoal = "grow" | "switch" | "explore";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type AnnouncementScope = "parish" | "province" | "region" | "national";
export type PostStatus = "pending" | "visible" | "held" | "removed";

export interface JobSource {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  notes: string | null;
  last_run_at: string | null;
  last_status: "ok" | "error" | "blocked" | "empty" | null;
  last_error: string | null;
  jobs_found: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CareerPathSuggestion {
  id: string;
  member_id: string;
  career_path_id: string;
  kind: "match" | "switch";
  reason: string | null;
  sources: { title: string; url: string }[];
  status: "new" | "added" | "dismissed";
  created_at: string;
  updated_at: string;
  career_paths?: CareerPath;
}

export interface ProfessionResearch {
  id: string;
  profession_key: string;
  profession_label: string;
  summary: string | null;
  matches: { slug: string; reason: string }[];
  switch_options: { slug: string; reason: string }[];
  sources: { title: string; url: string }[];
  status: "pending" | "done" | "error";
  error: string | null;
  researched_at: string | null;
  created_at: string;
}

export interface CareerPathCandidate {
  id: string;
  name: string;
  rationale: string | null;
  evidence: { title: string; url: string }[];
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: "career" | "interest";
  career_path_id: string | null;
  /** Career communities: the career-path slug (render with <PathIcon>). Interest: a lucide icon key. */
  icon: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityOverview {
  community_id: string;
  member_count: number;
  thread_count: number;
  last_activity_at: string | null;
}

export interface CommunityMember {
  community_id: string;
  member_id: string;
  role: "member" | "manager";
  joined_at: string;
}

/** Public-safe author name: first name + last initial. Members only. */
export interface MemberDirectoryEntry {
  id: string;
  display_name: string;
}

interface PostModeration {
  status: PostStatus;
  needs_review: boolean;
  moderation_reason: string | null;
  moderation_categories: string[];
  moderated_by: "agent" | "human" | null;
}

export interface Thread extends PostModeration {
  id: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  // Phase 3 (migration 20261010120000_community_social)
  like_count: number;
  edited_at: string | null;
}

export interface Reply extends PostModeration {
  id: string;
  thread_id: string;
  community_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  // Phase 3: replies to replies (depth 0-2), likes, edit marker
  parent_id: string | null;
  /** Migration 5: the reply actually answered (may differ from parent_id after re-parenting). */
  reply_to_id: string | null;
  depth: number;
  like_count: number;
  edited_at: string | null;
}

/** One member's like on a post (Phase 3). community_id is set by the database. */
export interface PostLike {
  member_id: string;
  target_type: "thread" | "reply";
  target_id: string;
  community_id: string;
  created_at: string;
}

export interface Report {
  id: string;
  community_id: string;
  target_type: "thread" | "reply";
  target_id: string;
  reporter_id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export type ModerationAction =
  | "allow" | "hold" | "remove" | "restore" | "pin" | "unpin" | "lock" | "unlock"
  | "delete_own" | "report_resolve" | "report_dismiss" | "flag";

export interface ModerationLogEntry {
  id: string;
  community_id: string | null;
  target_type: "thread" | "reply" | null;
  target_id: string | null;
  actor_type: "agent" | "human" | "system";
  actor_id: string | null;
  action: ModerationAction;
  reason: string | null;
  created_at: string;
}

export interface AgentRun {
  id: string;
  agent: "job_scraper" | "career_research" | "moderation_sweep";
  status: "running" | "ok" | "error" | "skipped";
  started_at: string;
  finished_at: string | null;
  items_processed: number;
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
  error: string | null;
  details: Record<string, unknown>;
}

/** Migration 5: permanent record of sensitive admin actions (admins read; server writes). */
export interface AdminAuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
