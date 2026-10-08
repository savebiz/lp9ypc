import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getSession } from "@/lib/session";
import { MISSION, SITE } from "@/content/site";

export const metadata = { title: "About · LP9 YPC" };

const VALUES = [
  { title: "Real community.", body: "We meet in person and online. The people you connect with here are people you'll actually meet." },
  { title: "Career-first.", body: "Every event, opportunity and resource is chosen to move your career forward. No fluff." },
  { title: "Lift everyone up.", body: "Got the role? Send the ladder back. Sharing opportunities is how this club grows." },
];

const FAQS: [string, string][] = [
  ["Is YPC free to join?", "Yes. Registering on the platform is free."],
  ["Do I have to be a member of RCCG?", "No. YPC is open to young professionals in Lagos Province 9 and the surrounding area."],
  ["Where do the jobs come from?", "Jobs are shared by YPC coordinators. Each one links to the employer's or referrer's own application page. As with any job, check the employer's details before you share personal information, and never pay to apply."],
  ["Can I update my details later?", "Yes, anytime. Sign in, open your dashboard and choose Update profile. You can change your career paths and update preferences there too."],
  ["How do I find jobs in my field?", "On the Jobs page, tap a career path or use Filters to narrow by work mode, job type, experience and location."],
];

export default async function AboutPage() {
  const { user, userName, isAdmin } = await getSession();

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-narrow">
        <div className="page-head">
          <span className="eyebrow">About YPC</span>
          <h1 className="title-lg">A community of young professionals building each other up.</h1>
          <p className="lede">
            LP9 YPC is the Young Professionals Club of {SITE.parent}: a place to find work, grow your career,
            and belong to a community that shows up for each other.
          </p>
        </div>

        <div className="mission" style={{ margin: "8px 0 40px" }}>
          <span className="eyebrow">Our mission</span>
          <p style={{ marginTop: 8 }}>{MISSION}</p>
        </div>

        <section aria-labelledby="values-h" style={{ marginBottom: 48 }}>
          <h2 id="values-h" className="title-md" style={{ marginBottom: 16 }}>What we believe</h2>
          <div className="values">
            {VALUES.map((v) => (
              <div key={v.title} className="card card-cream">
                <h3 className="title-sm">{v.title}</h3>
                <p className="ink-2" style={{ marginTop: 6 }}>{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-h" style={{ marginBottom: 48, scrollMarginTop: 88 }}>
          <h2 id="faq-h" className="title-md" style={{ marginBottom: 16 }}>Questions</h2>
          <div className="faq">
            {FAQS.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="privacy" aria-labelledby="privacy-h" className="card card-cream" style={{ marginBottom: 48, scrollMarginTop: 88 }}>
          <h2 id="privacy-h" className="title-sm" style={{ marginBottom: 10 }}>Privacy &amp; your data</h2>
          <div className="stack ink-2">
            <p>
              We collect only what we need to run your membership and share relevant opportunities: your name, contact
              details, area or parish, profession, employment status, career interests and work preferences.
            </p>
            <p>
              Your details are visible only to you and to YPC coordinators who manage the platform. We don&apos;t sell or
              share your information with third parties. Jobs link out to other organisations&apos; sites, which have their
              own privacy policies.
            </p>
            <p>
              We only send you updates if you ticked &ldquo;Send me YPC updates&rdquo;. You can change that, or correct your
              details, anytime from your profile. To have your account deleted, email{" "}
              <a href={`mailto:${SITE.contactEmail}`} className="btn-link" style={{ minHeight: 0, padding: 0 }}>{SITE.contactEmail}</a>.
            </p>
          </div>
        </section>

        {!user && (
          <div className="cta-band" style={{ marginBottom: 24 }}>
            <h2>Ready to <span className="accent">join</span>?</h2>
            <p>Registration takes a few minutes.</p>
            <Link href="/register" className="btn btn-action btn-lg">Register now <ArrowRight size={20} aria-hidden="true" /></Link>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
