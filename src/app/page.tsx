import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { HeroFigures } from "@/components/ui/YPCMark";
import type { Announcement, CareerPath } from "@/types";

const SPOTLIGHTS = [
  { name: "Tunde A.", role: "PM at Paystack", quote: "YPC connected me with my first mentor — eight months later I shipped my first product feature.", initials: "TA" },
  { name: "Ngozi E.", role: "Designer at Flutterwave", quote: "The CV clinic literally changed the way I introduce myself. I get callbacks now.", initials: "NE" },
  { name: "Femi B.", role: "Analyst, Sterling Bank", quote: "I came for the jobs, stayed for the people. Found my closest friends here.", initials: "FB" },
];

const PATH_COLORS: Record<string, string> = {
  "tech-product": "#1936FF",
  "business-entrepreneurship": "#FF5C4D",
  "creative-industries": "#FFD400",
  "engineering-pm": "#9BE7B1",
  "finance-accounting": "#0A1AD6",
  "health-wellness": "#FF8FA3",
  "human-resources": "#A78BFA",
  "law-compliance": "#0B0F2C",
  "media-communications": "#F97316",
  "public-sector": "#10B981",
};

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isAdmin = false;
  let userName = "";
  if (user) {
    const { data: p } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
    isAdmin = p?.role === "admin";
    userName = p?.full_name ?? "";
  }

  const { data: announcements } = await supabase
    .from("announcements").select("*").eq("is_active", true)
    .order("created_at", { ascending: false }).limit(3) as { data: Announcement[] | null };

  const { data: careerPaths } = await supabase
    .from("career_paths").select("*").order("name") as { data: CareerPath[] | null };

  const ArrowR = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>
  );

  return (
    <div>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />

      {/* Hero */}
      <section className="hero wrap">
        <div className="hero-figure" style={{ position: "absolute", top: 40, right: 40, opacity: .85, pointerEvents: "none" }}>
          <HeroFigures color="#1936FF" accent="#FFD400" size={420} />
        </div>
        <div className="hero-grid">
          <div style={{ position: "relative", zIndex: 2 }}>
            <span className="pill" style={{ marginBottom: 24 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>
              LP9 · Lagos Province 9
            </span>
            <h1 className="display">
              Your career.<br />
              Your <span className="hl">community</span>.<br />
              <span className="coral">Your move.</span>
            </h1>
            <p>The community-first career platform for young professionals in Lagos. Find jobs that fit, mentors who get you, and people who lift everyone up.</p>
            <div className="hero-actions">
              <Link href="/register" className="btn btn-accent">
                Join free in 2 mins <ArrowR />
              </Link>
              <Link href="/jobs" className="btn btn-ghost">Browse jobs first</Link>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="hero-stats">
          <div className="stat">
            <div className="num">500<span style={{ color: "var(--blue)" }}>+</span></div>
            <div className="lbl">Active members</div>
          </div>
          <div className="stat b">
            <div className="num">200+</div>
            <div className="lbl">Vetted jobs this year</div>
          </div>
          <div className="stat c">
            <div className="num">10</div>
            <div className="lbl">Career paths to explore</div>
          </div>
        </div>
      </section>

      {/* Announcements */}
      {announcements && announcements.length > 0 && (
        <section className="block wrap" style={{ paddingTop: 48, paddingBottom: 48 }}>
          <span className="eyebrow">Announcements</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {announcements.map((a) => (
              <div key={a.id} style={{ padding: "16px 20px", borderRadius: 16, background: "var(--cream)", border: "1px solid var(--line)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 4, borderRadius: 2, background: "var(--blue)", alignSelf: "stretch", flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{a.title}</p>
                  {a.content && <p style={{ margin: "4px 0 0", fontSize: 14, color: "#555" }}>{a.content}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Why YPC */}
      <section className="block wrap">
        <span className="eyebrow">Why YPC</span>
        <h2 className="section display">Everything you need<br />to make your next move.</h2>
        <div className="why" style={{ marginTop: 48 }}>
          <div className="why-card b">
            <div className="ic" style={{ color: "var(--accent)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3>Belong.</h3>
            <p>500+ young pros across 10 career paths. We meet IRL and online — events, panels, study groups.</p>
          </div>
          <div className="why-card y">
            <div className="ic">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>
            </div>
            <h3>Get hired.</h3>
            <p>Curated jobs, internships, and gigs. One-tap apply — your YPC profile travels with you.</p>
          </div>
          <div className="why-card">
            <div className="ic">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6M12 16v6M22 12h-6M8 12H2M19 5l-4 4M9 15l-4 4M19 19l-4-4M9 9 5 5"/></svg>
            </div>
            <h3>Level up.</h3>
            <p>Mentor matching, CV clinics, and resources tailored to your path. Stuck? We&apos;ve been there.</p>
          </div>
        </div>
      </section>

      {/* Career Paths */}
      {careerPaths && careerPaths.length > 0 && (
        <section className="block wrap">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 32 }}>
            <div>
              <span className="eyebrow">Career Paths</span>
              <h2 className="section display">Pick yours.<br />We&apos;ll do the rest.</h2>
            </div>
            <p className="sub" style={{ margin: 0 }}>Your paths shape your jobs feed, mentor matches, and event recs.</p>
          </div>
          <div className="paths-row">
            {careerPaths.map((cp) => (
              <Link key={cp.id} href={`/jobs?path=${cp.slug}`} className="path-tile">
                <span className="dot" style={{ background: PATH_COLORS[cp.slug] ?? "#1936FF" }} />
                <span>{cp.name}</span>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <Link href="/register" className="btn btn-primary">
              Choose your path <ArrowR />
            </Link>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="block wrap">
        <span className="eyebrow">How it works</span>
        <h2 className="section display">Three steps.<br />Maybe four minutes.</h2>
        <div className="steps" style={{ marginTop: 48 }}>
          {[
            { n: "01", t: "Register", d: "A short form. No essays, no LinkedIn screenshots. You're done in under 2 minutes." },
            { n: "02", t: "Pick your paths", d: "Choose 1–3 career areas. Your feed and matches calibrate to what you picked." },
            { n: "03", t: "Apply & grow", d: "Tap apply on jobs, RSVP to events, request a mentor — all from one dashboard." },
          ].map(({ n, t, d }) => (
            <div key={n} className="step">
              <div className="n">{n}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="block wrap">
        <span className="eyebrow">Voices</span>
        <h2 className="section display">From members who showed up.</h2>
        <div className="why" style={{ marginTop: 48 }}>
          {SPOTLIGHTS.map((s, i) => (
            <div key={i} className="why-card" style={{
              background: i === 1 ? "var(--coral)" : i === 2 ? "var(--ink)" : "var(--cream)",
              color: i >= 1 ? "#fff" : "var(--ink)",
              borderColor: "transparent",
              minHeight: 280,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "auto" }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: i === 0 ? "var(--blue)" : "var(--accent)", color: i === 0 ? "#fff" : "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "var(--font-display)" }}>{s.initials}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 13, opacity: .7 }}>{s.role}</div>
                </div>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.01em", marginTop: 32 }}>&ldquo;{s.quote}&rdquo;</p>
            </div>
          ))}
        </div>
      </section>

      {/* Big CTA */}
      <section className="block wrap">
        <div className="big-cta">
          <h2>Ready to make<br />your <span className="accent">next move</span>?</h2>
          <p>Free forever. No spam. Just opportunities, people, and the occasional jollof at our IRL hangs.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/register" className="btn btn-accent">
              Join free in 2 mins <ArrowR />
            </Link>
            <Link href="/jobs" className="btn" style={{ background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,.3)" }}>
              See jobs first
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
