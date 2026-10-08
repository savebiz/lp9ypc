import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No deadline";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function isDeadlineSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const deadline = new Date(dateStr);
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

export function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Remote",
  onsite: "On-site",
  hybrid: "Hybrid",
};

export const ENGAGEMENT_LABELS: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  "graduate-trainee": "Graduate Trainee",
};

export const LEVEL_LABELS: Record<string, string> = {
  entry: "Entry Level",
  mid: "Mid Level",
  senior: "Senior",
};

export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "employed", label: "Employed" },
  { value: "self-employed", label: "Self-Employed" },
  { value: "unemployed", label: "Unemployed / Job Seeking" },
  { value: "student", label: "Student" },
  { value: "other", label: "Other" },
];

export const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "any", label: "Open to Any" },
];
