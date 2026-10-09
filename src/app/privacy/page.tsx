import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getSession } from "@/lib/session";
import { SITE } from "@/content/site";
import styles from "./privacy.module.css";

export const metadata = { title: "Privacy policy · LP9 YPC" };

// Keep every statement here true to the code. If a feature, provider or data
// flow changes, update this page and LAST_UPDATED in the same change.
const LAST_UPDATED = { iso: "2026-10-09", label: "9 October 2026" };

const SECTIONS = [
  { id: "who-we-are", title: "Who we are" },
  { id: "what-we-collect", title: "What we collect" },
  { id: "why", title: "Why we use it" },
  { id: "who-can-see", title: "Who can see what" },
  { id: "ai-assistants", title: "AI assistants" },
  { id: "providers", title: "Service providers and international transfers" },
  { id: "retention", title: "How long we keep it" },
  { id: "your-rights", title: "Your rights" },
  { id: "security", title: "Security" },
  { id: "age", title: "Age" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact us" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

async function readSession() {
  try {
    return await getSession();
  } catch (err) {
    unstable_rethrow(err);
    return null; // The policy must always be readable, even if sign-in is down.
  }
}

export default async function PrivacyPage() {
  const session = await readSession();
  const email = SITE.contactEmail;
  const mail = <a href={`mailto:${email}`}>{email}</a>;

  return (
    <>
      <Navbar user={session?.user ?? null} isAdmin={session?.isAdmin ?? false} userName={session?.userName ?? ""} />
      <main id="main" className="wrap wrap-narrow">
        <div className="page-head">
          <span className="eyebrow">Privacy policy</span>
          <h1 className="title-lg">How we look after your data.</h1>
          <p className="lede">
            This page explains, in plain English, what LP9 YPC collects, why we use it, who can see it, and the
            choices you have.
          </p>
          <p className={`small muted ${styles.updated}`}>
            Last updated: <time dateTime={LAST_UPDATED.iso}>{LAST_UPDATED.label}</time>
          </p>
        </div>

        <section aria-labelledby="short-h" className={`card card-cream ${styles.summary}`}>
          <h2 id="short-h" className="title-sm" style={{ marginBottom: 12 }}>The short version</h2>
          <ul className="ink-2">
            <li>We collect only what we need to run your membership and help you find work.</li>
            <li>We don&apos;t sell your data, and employers never receive it from us.</li>
            <li>We use only the cookies that keep you signed in. No advertising or analytics trackers.</li>
            <li>
              Our AI assistants run on Google&apos;s Gemini service. They help check posts, research career paths
              and draft job listings. People make the final decisions.
            </li>
            <li>You can see, correct or delete your data. Just email {mail}.</li>
          </ul>
        </section>

        <nav aria-labelledby="toc-h" className={`card ${styles.toc}`}>
          <h2 id="toc-h" className="title-sm">On this page</h2>
          <ol>
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  <span className={styles.tocNum} aria-hidden="true">{i + 1}.</span>
                  <span className={styles.tocText}>{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="who-we-are">
          <p>
            LP9 YPC is the Young Professionals Club of {SITE.parent}. We run this platform so members can register,
            choose career paths, find jobs, follow club news and take part in communities.
          </p>
          <p>
            LP9 YPC is responsible for the personal data collected through this platform. We&apos;ve written this
            policy with Nigeria&apos;s Data Protection Act 2023 (the NDPA) in mind.
          </p>
          <p>Questions about your data? Email {mail}.</p>
        </Section>

        <Section id="what-we-collect">
          <h3>When you register</h3>
          <ul>
            <li>Your full name, phone number and email address</li>
            <li>Your area of residence or parish / unit</li>
            <li>Your profession or field of work, and your employment status</li>
            <li>The career paths you&apos;re interested in</li>
            <li>Your preferred work mode: remote, on-site, hybrid or any (optional)</li>
            <li>What you&apos;re looking for: to grow in your field, switch to a new field, or not sure yet (optional)</li>
            <li>Whether you&apos;d like to receive YPC updates</li>
          </ul>
          <p>
            You also create a password. It&apos;s handled by our sign-in provider, stored in a scrambled form, and
            never visible to us.
          </p>

          <h3>If you choose to add them later</h3>
          <p>Optional profile details, such as your parish or unit and a short bio.</p>

          <h3>As you use the platform</h3>
          <ul>
            <li>Jobs you save</li>
            <li>Career path suggestions we make for you, and whether you add or dismiss them</li>
            <li>Communities you join</li>
            <li>Posts and replies you write, and reports you make about other posts</li>
            <li>Moderation records about your posts, for example if a post was held for review, and why</li>
          </ul>

          <h3>Cookies and technical logs</h3>
          <p>We use only the essential cookies that keep you signed in. We don&apos;t use advertising or analytics trackers.</p>
          <p>
            Like most websites, our hosting and database providers keep short-term technical logs, such as IP
            address, browser type and the pages requested, to keep the service secure and working.
          </p>
          <p>We never ask for your date of birth, home address, ID numbers or bank details.</p>
        </Section>

        <Section id="why">
          <p>
            The law asks us to have a clear reason (a &ldquo;lawful basis&rdquo;) for each way we use your data.
            Here they are.
          </p>
          <ul className={styles.pairs}>
            <Pair title="To run your membership" basis="Needed for your membership">
              Create and secure your account, show your dashboard, show you relevant jobs and career paths, and let
              you take part in communities. This includes service emails, like confirming your email address or
              resetting your password.
            </Pair>
            <Pair title="To keep communities safe" basis="Our legitimate interests">
              Check posts for scams, abuse and personal details, handle reports, and prevent misuse of the platform.
            </Pair>
            <Pair title="To understand and plan for the club" basis="Our legitimate interests">
              For example, counting how many members chose each career path, so coordinators can plan events and
              share the right opportunities.
            </Pair>
            <Pair title="To send you club updates" basis="Your consent">
              Job alerts, workshops and club news by email or WhatsApp, only if you ticked &ldquo;Send me YPC
              updates&rdquo;. You can withdraw your consent at any time by unticking it on your profile page. It
              won&apos;t affect your membership.
            </Pair>
            <Pair title="To meet legal obligations" basis="Legal obligation">
              If the law requires us to keep or share information.
            </Pair>
          </ul>
          <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>
        </Section>

        <Section id="who-can-see">
          <ul className={styles.pairs}>
            <Pair title="You">
              Everything in your profile, at any time. You can update most of it yourself from your dashboard.
            </Pair>
            <Pair title="YPC coordinators (admins)">
              Members&apos; profiles and career paths, and community activity, so they can run the club. They can
              export the member list from the admin dashboard. Admin access is given by hand, only to YPC
              coordinators.
            </Pair>
            <Pair title="Community managers">
              Members chosen to look after a community. In the community they manage, they see who has joined, posts
              and replies (including held and removed ones), reports and moderation records. They see your display name, not
              your email, phone number or other profile details.
            </Pair>
            <Pair title="Other members">
              Signed-in members see your display name, which is your first name and last initial (like &ldquo;Ada
              O.&rdquo;), on your posts and replies. They
              can&apos;t see your email, phone number or other profile details. People who aren&apos;t signed in
              can&apos;t see community posts.
            </Pair>
            <Pair title="Employers">
              Never receive your data from us. When you tap Apply, you go to the employer&apos;s or referrer&apos;s
              own website. Anything you share there is covered by their privacy policy, not ours.
            </Pair>
          </ul>
          <p>
            When you report a post, that community&apos;s managers and YPC admins can see the report, including that
            it came from you. The member you reported can&apos;t see who reported them.
          </p>
          <p>
            We also use a few service providers to run the platform (see{" "}
            <a href="#providers">service providers</a>), and we&apos;ll share data with authorities only if the law
            requires it.
          </p>
        </Section>

        <Section id="ai-assistants">
          <p>
            We use three AI assistants to help the people who run the platform. They run on Google&apos;s Gemini
            API, so <strong>Google is our AI provider</strong>. The assistants suggest; people decide.
          </p>

          <h3>Moderation assistant</h3>
          <p>
            Checks each community post and reply before it appears. If it spots a possible problem, such as a scam,
            harassment or someone&apos;s phone number, it holds the post and flags it for a human community manager
            to review.
          </p>
          <p>
            It receives the post&apos;s text (and its title, for a new discussion) and the community&apos;s name. It
            does <strong>not</strong> receive your name, email, phone number or any other profile details. If the
            assistant is unavailable, a post may appear straight away and be checked shortly afterwards.
          </p>

          <h3>Career assistant</h3>
          <p>
            Researches career paths for the professions members enter, so we can suggest paths that fit. It uses
            only the profession text, for example &ldquo;quantity surveyor&rdquo;, and never your name or anything
            else about you. It uses Google Search to find up-to-date information, and Google stores these
            search-based requests for up to 30 days.
          </p>
          <p>
            Its suggestions are only suggestions: you choose whether to add a path. Any new career path it proposes
            is reviewed by a YPC admin before it&apos;s added.
          </p>

          <h3>Jobs assistant</h3>
          <p>
            Reads public job pages that YPC coordinators choose, and drafts job listings from them. It doesn&apos;t
            receive any member data. A coordinator checks every listing before it appears.
          </p>

          <h3>People make the final decisions</h3>
          <ul>
            <li>Community managers decide what happens to held posts.</li>
            <li>Coordinators approve every job the assistant drafts.</li>
            <li>You decide whether to add a suggested career path.</li>
            <li>Admins approve any new career path.</li>
          </ul>

          <h3>How Google handles this data</h3>
          <p>
            We use Google&apos;s paid Gemini API service. Under Google&apos;s terms for that service, Google says it
            doesn&apos;t use our prompts or its responses to improve its products, and keeps them for a limited time
            to detect abuse. Search-based requests from the career assistant are kept for up to 30 days, as
            described above. This processing happens outside Nigeria.
          </p>
        </Section>

        <Section id="providers">
          <p>We use three companies to run the platform. They handle data for us so the service can work:</p>
          <ul>
            <li>
              <strong>Supabase</strong>: our database and sign-in service. It stores your account and the
              information described above, and sends sign-in emails, like confirming your email address or
              resetting your password.
            </li>
            <li><strong>Vercel</strong>: hosts the website.</li>
            <li>
              <strong>Google</strong>: provides the AI assistants described in{" "}
              <a href="#ai-assistants">AI assistants</a>.
            </li>
          </ul>
          <p>
            Their servers are outside Nigeria, so your data is transferred to, and stored in, other countries. We
            send each provider only what it needs to do its job. If you have questions about these transfers, email{" "}
            {mail}.
          </p>
        </Section>

        <Section id="retention">
          <ul>
            <li>We keep your account data for as long as your account is active.</li>
            <li>
              If you ask us to delete your account, we delete your profile. Your saved jobs, career paths,
              suggestions, community memberships, posts, replies and reports are deleted with it.
            </li>
            <li>
              When you delete one of your own posts, it disappears from the community straight away. A copy stays in
              our records, visible only to that community&apos;s managers and YPC admins, until your account is
              deleted. The same applies to posts a manager removes. If you&apos;d like a post fully erased sooner,
              email us.
            </li>
            <li>
              Short moderation records (the action taken and the reason) may be kept after a post is gone, so
              managers can see a community&apos;s history. Once your account is deleted, they&apos;re no longer
              linked to you.
            </li>
            <li>
              Copies in our providers&apos; backups and logs are cleared on their normal schedules. How Google
              handles AI requests is described in <a href="#ai-assistants">AI assistants</a>.
            </li>
            <li>We don&apos;t currently delete inactive accounts automatically. If that changes, we&apos;ll update this page.</li>
          </ul>
        </Section>

        <Section id="your-rights">
          <p>Under the NDPA, you have the right to:</p>
          <ul>
            <li><strong>See your data</strong>: ask for a copy of the personal data we hold about you.</li>
            <li>
              <strong>Correct it</strong>: update most details yourself on your profile page, or ask us to fix
              anything else.
            </li>
            <li><strong>Delete it</strong>: ask us to delete your account and data.</li>
            <li>
              <strong>Withdraw consent</strong>: stop club updates at any time by unticking &ldquo;Send me YPC
              updates&rdquo; on your profile page.
            </li>
            <li>
              <strong>Object, or ask us to limit</strong> how we use your data where we rely on our legitimate
              interests.
            </li>
            <li><strong>Take it with you</strong>: ask for your data in a common, machine-readable format.</li>
            <li>
              <strong>Ask a person to review a decision</strong>: an AI assistant can hold a post, but only a person
              makes the final decision. If you disagree with a moderation decision, you can appeal (see our{" "}
              <Link href="/guidelines#appeals">community guidelines</Link>).
            </li>
            <li>
              <strong>Complain</strong> to the Nigeria Data Protection Commission (NDPC) at{" "}
              <a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer">ndpc.gov.ng</a> if you think
              we&apos;ve mishandled your data. We&apos;d like the chance to put things right first, but you can
              contact the NDPC at any time.
            </li>
          </ul>
          <h3>How to use your rights</h3>
          <p>
            Email {mail} from the email address you registered with, and tell us what you&apos;d like. We may need
            to confirm it&apos;s you before we act. We&apos;ll reply as soon as we can, and within the time the law
            requires.
          </p>
        </Section>

        <Section id="security">
          <ul>
            <li>Your connection to the platform is encrypted (HTTPS).</li>
            <li>
              Our database has access rules, so members can see only their own profile, only coordinators can see
              the member list, and only a community&apos;s managers can see who has joined it.
            </li>
            <li>Community posts are saved by our server only after checks, never directly from your browser.</li>
            <li>Passwords are stored in scrambled form by our sign-in provider.</li>
            <li>Admin access is given by hand, only to YPC coordinators.</li>
          </ul>
          <p>
            No system is perfectly secure. If something happens that puts your data at risk, we&apos;ll tell you,
            and the Nigeria Data Protection Commission where the law requires. Please keep your password private,
            and don&apos;t share personal details in posts.
          </p>
        </Section>

        <Section id="age">
          <p>
            LP9 YPC is for adults aged 18 and over. Please don&apos;t register if you&apos;re under 18. If we learn
            that an account belongs to someone under 18, we&apos;ll delete it.
          </p>
        </Section>

        <Section id="changes">
          <p>
            If we change how we use your data, we&apos;ll update this page and the &ldquo;Last updated&rdquo; date at
            the top. If a change is significant, we&apos;ll also let members know on the platform.
          </p>
        </Section>

        <Section id="contact">
          <p>For any question about this policy or your data, email {mail}.</p>
          <p>
            See also our <Link href="/guidelines">community guidelines</Link>.
          </p>
        </Section>

        <p className={styles.back}>
          <a href="#main" className="btn-link">Back to top</a>
        </p>
      </main>
      <Footer />
    </>
  );
}

function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const index = SECTIONS.findIndex((s) => s.id === id);
  const headingId = `${id}-h`;
  return (
    <section id={id} aria-labelledby={headingId} className={styles.section}>
      <h2 id={headingId} className="title-sm">
        {index + 1}. {SECTIONS[index].title}
      </h2>
      <div className={styles.prose}>{children}</div>
    </section>
  );
}

function Pair({ title, basis, children }: { title: string; basis?: string; children: React.ReactNode }) {
  return (
    <li className={styles.pair}>
      <h3>{title}</h3>
      <p>{children}</p>
      {basis && (
        <span className={styles.basis}>
          <span className="sr-only">Lawful basis: </span>
          {basis}
        </span>
      )}
    </li>
  );
}
