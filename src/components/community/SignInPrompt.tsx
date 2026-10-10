"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./community.module.css";

/**
 * What a signed-out visitor sees on a shared discussion link: no content and
 * no title (community-feature-spec §7). Sign in returns them to the same
 * place, including a #reply- anchor when there is one.
 */
export default function SignInPrompt({ path }: { path: string }) {
  const [next, setNext] = useState(path);
  useEffect(() => {
    const hash = window.location.hash;
    if (/^#reply-[0-9a-f-]{36}$/i.test(hash)) setNext(path + hash);
  }, [path]);

  return (
    <section className={`card card-cream ${styles.ctaCard}`} style={{ marginTop: 16 }} aria-labelledby="members-h">
      <h1 id="members-h" className="title-sm">Someone shared a YPC discussion with you</h1>
      <p className="ink-2">
        Discussions are for YPC members. Sign in to read it and join in. New to YPC? Registering takes a few minutes.
      </p>
      <div className={styles.ctaActions}>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-action">Sign in</Link>
        <Link href="/register" className="btn btn-ghost">Join YPC</Link>
      </div>
    </section>
  );
}
