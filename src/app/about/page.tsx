import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { HeroFigures } from "@/components/ui/YPCMark";

export default async function AboutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  let userName = "";
  if (user) {
    const { data: p } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).single();
    isAdmin = p?.role === "admin";
    userName = p?.full_name ?? "";
  }

  const ArrowR = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>;

  return (
    <div>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />

      <div className="wrap">
        {/* Hero */}
        <section className="about-hero">
          <div>
            <span className="eyebrow">About YPC</span>
            <h1 className="display" style={{ fontSize: 72, margin: "12px 0 24px" }}>
              We&apos;re a community<br />of young pros<br />
              <span style={{ color: "var(--coral)" }}>building each other up.</span>
            </h1>
            <p style={{ fontSize: 18, color: "#444", lineHeight: 1.6, maxWidth: 540 }}>
              LP9 YPC is the Young Professionals Club of Lagos Province 9 — a chapter under RCCG dedicated to helping young people find work, mentors, and a community that actually shows up.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <HeroFigures color="var(--ink)" accent="var(--accent)" size={360} />
          </div>
        </section>

        {/* Values */}
        <section>
          <span className="eyebrow">What we believe</span>
          <h2 className="section display" style={{ marginBottom: 32 }}>Three values.<br />Non-negotiable.</h2>
          <div className="value-grid">
            <div className="value-card">
              <h3>Real community.</h3>
              <p style={{ color: "#555", margin: 0, lineHeight: 1.6 }}>We meet in person every month. No bots, no fake hype. The people in your DMs are people you&apos;ll meet for jollof.</p>
            </div>
            <div className="value-card" style={{ background: "var(--blue)", color: "#fff", borderColor: "transparent" }}>
              <h3>Career-first.</h3>
              <p style={{ color: "rgba(255,255,255,.85)", margin: 0, lineHeight: 1.6 }}>Every event, mentor, and resource is built to move your career forward. No fluff. No paid promos pretending to be advice.</p>
            </div>
            <div className="value-card" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "transparent" }}>
              <h3>Lift everyone up.</h3>
              <p style={{ margin: 0, lineHeight: 1.6 }}>You got the role? Send the ladder back. Mentorship is how this club stays alive. Pay it forward.</p>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="block" id="faq">
          <div className="big-cta" style={{ background: "var(--cream)", color: "var(--ink)" }}>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
              FAQs — <span style={{ color: "var(--blue)" }}>quick ones.</span>
            </h2>
            <div className="faq-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 32, textAlign: "left" }}>
              {[
                ["Is YPC free?", "Yes — membership is free. Some workshops have material costs but the core platform is free forever."],
                ["Do I have to be in RCCG?", "No. YPC is open to all young professionals in Lagos Province 9 and the surrounding area."],
                ["How do you vet the jobs?", "Every employer is reviewed by a YPC team member before they can post. We reject spam, MLMs, and roles below market."],
                ["What's the age range?", "We focus on 21–35, but ages flex if you're in the early stages of your career."],
                ["Can I update my profile later?", "Yes, anytime. Log in, go to your dashboard, and click Settings."],
                ["How do I find jobs for my field?", "Use the career path filters on the Jobs page to see only roles relevant to your discipline."],
              ].map(([q, a], i) => (
                <div key={i} style={{ padding: 24, background: "#fff", borderRadius: 18, border: "1px solid var(--line)", textAlign: "left" }}>
                  <h4 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 8px", color: "var(--ink)" }}>{q}</h4>
                  <p style={{ margin: 0, color: "#555", fontSize: 14, lineHeight: 1.55 }}>{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" style={{ paddingBottom: 80 }}>
          <div style={{ padding: 32, background: "var(--cream)", borderRadius: 20, border: "1px solid var(--line)" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 12px" }}>Privacy & Data Notice</h2>
            <p style={{ color: "#555", lineHeight: 1.7, margin: 0, fontSize: 14 }}>
              LP9 YPC collects only the information necessary to manage your membership and connect you with relevant opportunities. Your data is stored securely and never shared with third parties without your consent. You may update or delete your information at any time through your dashboard. By registering, you consent to receive relevant career and community updates from LP9 YPC.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section style={{ paddingBottom: 80, textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 48, letterSpacing: "-0.03em", margin: "0 0 12px" }}>Ready to get started?</h2>
          <p style={{ color: "#555", marginBottom: 28, fontSize: 16 }}>Free forever. Registration takes under two minutes.</p>
          <Link href="/register" className="btn btn-accent" style={{ fontSize: 16, padding: "16px 28px" }}>
            Join free in 2 mins <ArrowR />
          </Link>
        </section>
      </div>

      <Footer />
    </div>
  );
}
