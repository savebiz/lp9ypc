// Landing-page and About copy in one place, so it can be updated without
// touching layout code. Keep every claim here true: no invented numbers,
// testimonials or features that don't exist yet.
//
// VISION approved by Victor on 2026-10-10. MISSION is the existing footer line.

export const SITE = {
  name: "LP9 YPC",
  fullName: "Young Professionals Club",
  parent: "RCCG Lagos Province 9",
  contactEmail: "lp9ypc@gmail.com",
};

export const HERO = {
  eyebrow: "RCCG Lagos Province 9 · Young Professionals",
  summary:
    "A community for young professionals in Lagos Province 9. Find jobs, join a career path, and grow together.",
};

export const VISION =
  "A community of young professionals in Lagos Province 9 who grow in faith, do excellent work and lift each other up.";

export const MISSION =
  "Connecting, equipping and empowering young professionals across Lagos Province 9.";

export const BENEFITS = [
  {
    icon: "jobs",
    title: "Jobs and opportunities",
    body: "Roles shared by YPC coordinators. Tap Apply and go straight to the application page.",
  },
  {
    icon: "paths",
    title: "Career paths",
    body: "Pick the fields you care about so you see the opportunities that fit you first.",
  },
  {
    icon: "community",
    title: "Community updates",
    body: "Workshops, meet-ups and announcements from the club, in one place.",
  },
] as const;

export const STEPS = [
  { title: "Register", body: "A short form: your contact details, your work, and how you like to work." },
  { title: "Pick your paths", body: "Choose one or more career paths. You can change them anytime." },
  { title: "Apply in one tap", body: "Browse and filter jobs, then tap Apply to open the application page." },
];
