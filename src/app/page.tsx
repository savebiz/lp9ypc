import Link from "next/link";
import { ArrowRight, Briefcase, Compass, Megaphone, Search } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { HeroLogoArt } from "@/components/ui/YPCMark";
import { PathIcon } from "@/components/ui/icons";
import { getSession } from "@/lib/session";
import { BENEFITS, HERO, MISSION, STEPS, VISION } from "@/content/site";
import EventCard from "@/components/news/EventCard";
import AnnouncementItem from "@/components/news/AnnouncementItem";
import { NEWS_COLUMNS, type NewsItem } from "@/components/news/news";
import type { CareerPath } from "@/types";

const BENEFIT_ICONS = { jobs: Briefcase, paths: Compass, community: Megaphone } as const;

// Short inspiration cards (approved by Victor, 2026-10-10).
const INSPIRATION = [
  { lead: "Show", accent: "up.", body: "Opportunities find people who are in the room. Come to the meet-ups, join a community." },
  { lead: "Grow on", accent: "purpose.", body: "Pick a career path and take one small step this month." },
  { lead: "Lift as you", accent: "climb.", body: "Seen a good role? Share it. Someone in the club is looking." },
];

export default async function LandingPage() {
  const { supabase, user, userName, isAdmin } = await getSession();

  const now = new Date().toISOString();
  const [annRes, eventsRes, pathsRes] = await Promise.all([
    supabase.from("announcements").select(NEWS_COLUMNS).eq("is_active", true).eq("kind", "announcement")
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("announcements").select(NEWS_COLUMNS).eq("is_active", true).eq("kind", "event")
      .or(`starts_at.gte."${now}",ends_at.gte."${now}"`).order("starts_at", { ascending: true }).limit(2),
    supabase.from("career_paths").select("*").order("name"),
  ]);
  const announcements = (annRes.data ?? []) as unknown as NewsItem[];
  const events = (eventsRes.data ?? []) as unknown as NewsItem[];
  const careerPaths = (pathsRes.data ?? []) as CareerPath[];

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main">
        {/* ── Hero (the one loud screen) ───────────────────────── */}
        <section className="hero">
          <div className="wrap" style={{ position: "relative" }}>
            <HeroLogoArt />
            <div style={{ position: "relative", zIndex: 1, maxWidth: 720 }}>
              <span className="eyebrow">{HERO.eyebrow}</span>
              <h1 style={{ marginTop: 16 }}>
                Your career.<br />
                Your <span style={{ whiteSpace: "nowrap" }}><span className="hl">community</span>.</span><br />
                <span className="text-blue">Your move.</span>
              </h1>
              <p className="lede">{HERO.summary}</p>
              <div className="hero-actions">
                {user ? (
                  <Link href="/dashboard" className="btn btn-action btn-lg">
                    Go to my dashboard <ArrowRight size={20} aria-hidden="true" />
                  </Link>
                ) : (
                  <Link href="/register" className="btn btn-action btn-lg">
                    Register now <ArrowRight size={20} aria-hidden="true" />
                  </Link>
                )}
                <Link href="/jobs" className="btn btn-ghost btn-lg">View jobs</Link>
              </div>
              <p className="hero-meta small ink-2">
                New here? <Link href="/about" className="btn-link" style={{ minHeight: 0 }}>Learn about YPC</Link>
              </p>
            </div>
          </div>
        </section>

        {/* ── Find your next role (search → /jobs?q=) ─────────── */}
        <section className="wrap" aria-labelledby="find-title" style={{ paddingBottom: 32 }}>
          <div className="find-role">
            <h2 id="find-title">Find your next role</h2>
            <p>Search jobs shared by YPC coordinators. Every job has one tap to apply.</p>
            <form action="/jobs" method="get" role="search">
              <div className="search">
                <Search size={20} aria-hidden="true" />
                <label htmlFor="home-job-search" className="sr-only">Search jobs</label>
                <input
                  id="home-job-search"
                  name="q"
                  className="input"
                  type="search"
                  placeholder="Job title, organisation or location"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>
              <button type="submit" className="btn btn-solid">Search jobs</button>
            </form>
          </div>
        </section>

        {/* ── News & events ────────────────────────────────────── */}
        {(events.length > 0 || announcements.length > 0) && (
          <section className="wrap" aria-labelledby="news-title" style={{ paddingBottom: 16 }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <h2 id="news-title" className="eyebrow">News &amp; events</h2>
              <Link href="/news" className="btn-link">See all news &amp; events</Link>
            </div>
            <div className="stack">
              {events.length > 0 && (
                <div className="announcements">
                  {events.map((e) => <EventCard key={e.id} event={e} compact />)}
                </div>
              )}
              {announcements.length > 0 && (
                <div className="announcements">
                  {announcements.map((a) => <AnnouncementItem key={a.id} item={a} compact />)}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Mission + what the platform offers ───────────────── */}
        <section className="section wrap" aria-labelledby="offer-title">
          <div className="vm" style={{ marginBottom: 48 }}>
            <div className="mission">
              <h2 className="eyebrow">Our vision</h2>
              <p style={{ marginTop: 8 }}>{VISION}</p>
            </div>
            <div className="mission blue">
              <h2 className="eyebrow">Our mission</h2>
              <p style={{ marginTop: 8 }}>{MISSION}</p>
            </div>
          </div>
          <h2 id="offer-title" className="title-md" style={{ marginBottom: 20 }}>What you get as a member</h2>
          <div className="benefits">
            {BENEFITS.map((b) => {
              const Icon = BENEFIT_ICONS[b.icon];
              return (
                <div key={b.title} className="benefit">
                  <span className="icon-tile"><Icon size={22} aria-hidden="true" /></span>
                  <div>
                    <h3>{b.title}</h3>
                    <p>{b.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {!user && (
            <div className="join-row">
              <p>Registration takes a few minutes.</p>
              <Link href="/register" className="btn btn-action">
                Join YPC <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        {/* ── Inspiration ──────────────────────────────────────── */}
        <section className="wrap" aria-labelledby="inspire-title" style={{ paddingBottom: 48 }}>
          <h2 id="inspire-title" className="sr-only">What we believe</h2>
          <div className="inspire">
            {INSPIRATION.map((c) => (
              <div key={c.accent} className="inspire-card">
                <h3>{c.lead} <span>{c.accent}</span></h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Career paths ─────────────────────────────────────── */}
        {careerPaths.length > 0 && (
          <section className="wrap" aria-labelledby="paths-title" style={{ paddingBottom: 48 }}>
            <div className="section-head">
              <span className="eyebrow">Career paths</span>
              <h2 id="paths-title" className="title-md">Find your field.</h2>
              <p className="lede">Tap a path to see its jobs, or join to follow the paths you care about.</p>
            </div>
            <div className="row-wrap">
              {careerPaths.map((cp) => (
                <Link key={cp.id} href={`/jobs?path=${cp.slug}`} className="chip-btn">
                  <PathIcon slug={cp.slug} size={16} className="text-blue" />
                  {cp.name}
                </Link>
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <Link href={user ? "/dashboard/profile#paths" : "/register"} className="btn btn-ghost">
                Join a career path <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="wrap" aria-labelledby="how-title" style={{ paddingBottom: 48 }}>
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2 id="how-title" className="title-md">Three steps. A few minutes.</h2>
          </div>
          <ol className="steps" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <div className="n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── CTA band (loud) ──────────────────────────────────── */}
        {!user && (
          <section className="wrap" aria-labelledby="cta-title">
            <div className="cta-band">
              <h2 id="cta-title">Ready to make your <span className="accent">next move</span>?</h2>
              <p>Join the LP9 Young Professionals Club. It only takes a few minutes.</p>
              <Link href="/register" className="btn btn-action btn-lg">
                Register now <ArrowRight size={20} aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
