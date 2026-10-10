"use client";

import { useEffect, useState } from "react";
import { isAfter, readSeen } from "./seen";
import styles from "./community.module.css";

/**
 * Board row pill: shown when the thread has activity after this member last
 * opened it. Never shown for a thread they haven't opened (first visit isn't "new").
 */
export default function NewActivityPill({ threadId, lastActivityAt }: { threadId: string; lastActivityAt: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(isAfter(lastActivityAt, readSeen(threadId)));
  }, [threadId, lastActivityAt]);
  if (!show) return null;
  return <span className={styles.newPill}>New activity</span>;
}
