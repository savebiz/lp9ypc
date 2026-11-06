"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import JobCard from "@/components/jobs/JobCard";
import JoinButton from "@/components/community/JoinButton";
import { ToastHost } from "@/components/community/Toast";
import { CommunityIcon } from "@/components/community/CommunityIcon";
import type { JobCardJob } from "@/components/jobs/card-data";
import type { Community } from "@/types";
import styles from "./Welcome.module.css";

export interface WelcomeCommunity {
  community: Pick<Community, "id" | "slug" | "name" | "kind" | "icon">;
  joined: boolean;
  isManager: boolean;
}

interface Props {
  userId: string;
  firstName: string;
  /** Up to 3 live jobs on the member's career paths. */
  jobs: JobCardJob[];
  /** Communities for the member's career paths, plus YPC Lounge. */
  communities: WelcomeCommunity[];
  hasPaths: boolean;
}

/** Shown once per member per device; remembered in localStorage (no schema change). */
export function welcomeSeenKey(userId: string): string {
  return `lp9ypc:welcome-seen:${userId}`;
}

/**
 * The first screen after sign-up (/dashboard?welcome=1): three short steps
 * that show the club's value straight away. Server-rendered so it appears
 * without waiting for JavaScript on slow connections.
 */
export default function WelcomePanel({ userId, firstName, jobs, communities, hasPaths }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const closing = useRef(false);
  const checked = useRef(false);

  function close(moveFocus: boolean) {
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    router.replace("/dashboard", { scroll: false });
    if (moveFocus) document.getElementById("dashboard-h")?.focus();
  }

  useEffect(() => {
    // Once per mount (React's development double-run would otherwise see its own mark).
    if (checked.current) return;
    checked.current = true;
    try {
      const key = welcomeSeenKey(userId);
      if (window.localStorage.getItem(key)) {
        closing.current = true;
        setOpen(false);
        router.replace("/dashboard", { scroll: false });
        return;
      }
      window.localStorage.setItem(key, new Date().toISOString());
    } catch {
      // Private browsing / storage blocked: just show it this time.
    }
  }, [userId, router]);

  if (!open) return null;

  return (
    <section className={`panel ${styles.welcome}`} aria-labelledby="welcome-h">
      <div className={styles.head}>
        <h2 id="welcome-h" className={styles.title}>Welcome to YPC, {firstName}.</h2>
        <button type="button" className="icon-btn" onClick={() => close(true)} aria-label="Close the welcome message">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <p className="ink-2">Your account is ready. Here are three things to do first.</p>

      <ol className={styles.steps}>
        <li className={styles.step}>
          <h3 className={styles.stepTitle}>Apply for a job on your career paths</h3>
          {jobs.length > 0 ? (
            <div className="jobs-list" style={{ gridTemplateColumns: "1fr", paddingBottom: 0 }}>
              {jobs.map((j) => (
                <JobCard key={j.id} job={j} showDescription={false} applySource="welcome" />
              ))}
            </div>
          ) : (
            <p className="ink-2">
              {hasPaths
                ? "There are no open jobs on your career paths right now. New ones are added every week."
                : "Choose your career paths so we can show you the most relevant jobs."}{" "}
              <Link href={hasPaths ? "/jobs" : "/dashboard/profile#paths"} className="btn-link">
                {hasPaths ? "See all jobs" : "Choose your career paths"}
              </Link>
            </p>
          )}
        </li>

        <li className={styles.step}>
          <h3 className={styles.stepTitle}>Join your communities</h3>
          {communities.length > 0 ? (
            <ul className={styles.communities}>
              {communities.map(({ community: c, joined, isManager }) => (
                <li key={c.id} className={styles.community}>
                  <span className="icon-tile" aria-hidden="true">
                    <CommunityIcon community={c} size={20} />
                  </span>
                  <Link href={`/community/${encodeURIComponent(c.slug)}`} className={styles.communityName}>
                    {c.name}
                  </Link>
                  <JoinButton
                    communityId={c.id}
                    slug={c.slug}
                    name={c.name}
                    userId={userId}
                    initialJoined={joined}
                    isManager={isManager}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="ink-2">
              <Link href="/community" className="btn-link">Browse the communities</Link>
            </p>
          )}
        </li>

        <li className={styles.step}>
          <h3 className={styles.stepTitle}>Get jobs every Monday</h3>
          <p className={`ink-2 ${styles.whatsapp}`}>
            <MessageCircle size={20} aria-hidden="true" className="text-blue" />
            <span>Ask your parish YPC champion to add you to the club&apos;s WhatsApp group.</span>
          </p>
        </li>
      </ol>

      <button type="button" className="btn btn-solid btn-block" onClick={() => close(true)}>
        Go to my dashboard
      </button>
      <ToastHost />
    </section>
  );
}
