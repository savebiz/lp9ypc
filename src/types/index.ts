export interface CareerPath {
  id: string;
  name: string;
  slug: string;
  icon: string;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  area_of_residence: string | null;
  parish_unit: string | null;
  profession: string | null;
  employment_status: string | null;
  preferred_work_mode: string | null;
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
  created_at: string;
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
