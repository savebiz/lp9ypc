import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ArrowRight, Ban, HandHeart, Heart, LockKeyhole, MessagesSquare, ShieldAlert, type LucideIcon } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getSession } from "@/lib/session";
import { SITE } from "@/content/site";
import styles from "./guidelines.module.css";

export const metadata = { title: "Community guidelines · LP9 YPC" };

// Matches the moderation policy (lp9-community-moderation skill) and the
// moderation flow in /api/community/*. Keep them in step.
// Stable anchors other pages can link to: #be-kind, #keep-it-relevant,
// #no-scams, #protect-privacy, #no-harassment, #look-out, #moderation,
// #reporting, #appeals.

async function readSession() {
  try {
    return await getSession();
  } catch (err) {
    unstable_rethrow(err);
    return null; // The guidelines must always be readable, even if sign-in is down.
  }
}

export default async function GuidelinesPage() {
  const session = await readSession();
  const email = SITE.contactEmail;
  const mail = <a href={`mailto:${email}`}>{email}</a>;

  const rules: { id: string; icon: LucideIcon; title: React.ReactNode; body: React.ReactNode }[] = [
    {
      id: "be-kind",
      icon: Heart,
      title: "Be kind",
      body: (
        <>
          <p>
            Disagree with ideas, not people. Assume the best of each other, and remember there&apos;s a real person
            behind every post.
          </p>
          <p>
            When you reply, answer the person kindly, even if you think they&apos;re wrong. If you quote someone, quote
            them fairly. Use likes to encourage each other; you can&apos;t like your own posts, and only the number of
            likes is shown, never who liked.
          </p>
        </>
      ),
    },
    {
      id: "keep-it-relevant",
      icon: MessagesSquare,
      title: "Keep it relevant",
      body: (
        <p>
          Post in the community that fits your topic. Opportunities, questions, advice and encouragement are all
          welcome. Please don&apos;t spam or keep repeating the same promotion.
        </p>
      ),
    },
    {
      id: "no-scams",
      icon: ShieldAlert,
      title: <>No scams, &ldquo;pay to apply&rdquo; or money requests</>,
      body: (
        <>
          <p>
            Never ask members for money, fees, bank details or &ldquo;investments&rdquo;. No pyramid schemes, MLM,
            or crypto and forex pitches.
          </p>
          <p>A real employer never asks you to pay to apply. If you see that, report it.</p>
        </>
      ),
    },
    {
      id: "protect-privacy",
      icon: LockKeyhole,
      title: "Protect privacy",
      body: (
        <>
          <p>
            Don&apos;t post phone numbers, home addresses or ID numbers, yours or anyone else&apos;s. When you share
            a job, link to its official application page.
          </p>
          <p>
            Discussions are for YPC members only. You&apos;re welcome to share a link with someone; they&apos;ll need
            to sign in as a member to read it. Please ask before sharing a screenshot of someone else&apos;s post
            outside YPC.
          </p>
        </>
      ),
    },
    {
      id: "no-harassment",
      icon: Ban,
      title: "No harassment, hate or sexual content",
      body: (
        <p>
          No insults, threats or bullying. No put-downs based on tribe, religion, gender, disability or anything
          else. No sexual content of any kind.
        </p>
      ),
    },
    {
      id: "look-out",
      icon: HandHeart,
      title: "Look out for each other",
      body: (
        <>
          <p>
            If a post makes you worried about someone, report it so a community manager can check in with care.
            Posts that suggest someone may be at risk are held for a manager. That&apos;s not to punish anyone; it&apos;s
            so a person can reach out.
          </p>
          <p>
            Going through a hard time yourself? You&apos;re not alone. Talk to a community manager or the YPC team
            at {mail}. If anyone is in immediate danger, call <strong>112</strong>, Nigeria&apos;s emergency number.
          </p>
        </>
      ),
    },
  ];

  return (
    <>
      <Navbar user={session?.user ?? null} isAdmin={session?.isAdmin ?? false} userName={session?.userName ?? ""} />
      <main id="main" className="wrap wrap-narrow">
        <div className="page-head">
          <span className="eyebrow">Community guidelines</span>
          <h1 className="title-lg">Look out for each other.</h1>
          <p className="lede">
            Our communities are where YPC members share opportunities, ask questions and encourage each other. A few
            simple guidelines keep them safe, useful and kind.
          </p>
        </div>

        <section aria-labelledby="rules-h">
          <h2 id="rules-h" className="sr-only">The guidelines</h2>
          <ul role="list" className={styles.rules}>
            {rules.map((r) => {
              const Icon = r.icon;
              return (
                <li key={r.id} id={r.id} className={styles.rule}>
                  <span className="icon-tile"><Icon size={22} aria-hidden="true" /></span>
                  <div className={styles.ruleBody}>
                    <h3>{r.title}</h3>
                    {r.body}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="moderation" aria-labelledby="moderation-h" className={styles.section}>
          <h2 id="moderation-h" className="title-sm">How moderation works</h2>
          <ol role="list" className={styles.steps}>
            <li className={styles.step}>
              <h3>Every post is checked first</h3>
              <p>
                An AI moderation assistant reads each new post, reply and edit before other members can see it. You&apos;ll
                see your post straight away marked &ldquo;Checking…&rdquo;; most are cleared within a few seconds.
              </p>
            </li>
            <li className={styles.step}>
              <h3>Anything it&apos;s unsure about waits for a person</h3>
              <p>
                The post is held for a community manager, and you&apos;ll see &ldquo;Held for review — a community
                manager will check it soon.&rdquo; Being held doesn&apos;t mean you did anything wrong.
              </p>
            </li>
            <li className={styles.step}>
              <h3>Managers make the final call</h3>
              <p>
                They can publish a held post, keep it held or remove it. They can also pin or lock discussions.
              </p>
            </li>
          </ol>
          <div className={styles.prose} style={{ marginTop: 16 }}>
            <p>If the assistant is ever unavailable, posts may appear straight away and be checked shortly afterwards.</p>
            <p>
              The assistant sees only the post and the community&apos;s name, never your name or contact details.
              Read more in our <Link href="/privacy#ai-assistants">privacy policy</Link>.
            </p>
          </div>
        </section>

        <section id="reporting" aria-labelledby="reporting-h" className={styles.section}>
          <h2 id="reporting-h" className="title-sm">Reporting a post</h2>
          <div className={styles.prose}>
            <p>
              See something that breaks these guidelines? Use <strong>Report</strong> on the post and say briefly
              what&apos;s wrong. Your report goes to that community&apos;s managers and the YPC admins. The person you
              report isn&apos;t told who reported them.
            </p>
            <p>
              You can edit or delete your own posts at any time. Edited posts are marked &ldquo;edited&rdquo; and are
              checked again before others can see the new version, so please don&apos;t use edits to change the meaning
              of a post people have already replied to.
            </p>
            <p>
              Managers may hold or remove posts that break these guidelines. For serious or repeated problems, the
              YPC team may get in touch with you.
            </p>
          </div>
        </section>

        <section id="appeals" aria-labelledby="appeals-h" className={styles.section}>
          <h2 id="appeals-h" className="title-sm">Think we got it wrong?</h2>
          <div className={styles.prose}>
            <p>
              Email {mail} with the community&apos;s name, roughly when you posted, and why you think the decision
              should change. A different manager or a YPC admin, not the person who made the original decision, will
              review it.
            </p>
          </div>
        </section>

        <div className={`stack ${styles.end}`}>
          <p className={styles.prose}>
            These guidelines sit alongside our <Link href="/privacy">privacy policy</Link>, which explains what data
            we hold and who can see it.
          </p>
          <p>
            <Link href="/community" className="btn btn-ghost">
              Browse communities <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
