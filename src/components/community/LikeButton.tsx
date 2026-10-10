"use client";

import { useRef, useState } from "react";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "./Toast";
import { plural } from "./time";
import styles from "./community.module.css";

interface Props {
  kind: "thread" | "reply";
  id: string;
  count: number;
  liked: boolean;
  /** "can" = a button; "own" = your own post (count only, D1); "join" = not a member yet (hint on tap). */
  mode: "can" | "own" | "join";
  userId: string;
  communityName: string;
}

/**
 * Like toggle (community-feature-spec §3). Writes straight to post_likes with
 * the browser client; RLS only allows likes on visible posts in your
 * communities. Optimistic, reverted on error; taps are ignored while a
 * request is in flight.
 */
export default function LikeButton({ kind, id, count: initialCount, liked: initialLiked, mode, userId, communityName }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [src, setSrc] = useState({ initialLiked, initialCount });
  const busy = useRef(false);

  // Fresh server data (router.refresh) replaces local state.
  if (src.initialLiked !== initialLiked || src.initialCount !== initialCount) {
    setSrc({ initialLiked, initialCount });
    setLiked(initialLiked);
    setCount(initialCount);
  }

  if (mode === "own") {
    if (count <= 0) return null;
    const label = plural(count, "like");
    return (
      <span className={styles.likeStatic} aria-label={label} role="img">
        <Heart size={18} aria-hidden="true" /> <span aria-hidden="true">{count}</span>
      </span>
    );
  }

  const label = `Like, ${plural(count, "like")}`;

  if (mode === "join") {
    return (
      <button
        type="button"
        className={styles.actionBtn}
        aria-disabled="true"
        aria-label={label}
        onClick={() => toast(`Join ${communityName} to like and reply.`)}
      >
        <Heart size={18} aria-hidden="true" /> {count > 0 ? count : "Like"}
      </button>
    );
  }

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    const next = !liked;
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));

    const supabase = createClient();
    let failed = false;
    try {
      if (next) {
        // community_id and created_at are set by the database.
        const { error } = await supabase.from("post_likes").insert({ member_id: userId, target_type: kind, target_id: id });
        failed = !!error && error.code !== "23505"; // already liked = fine
      } else {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("member_id", userId)
          .eq("target_type", kind)
          .eq("target_id", id);
        failed = !!error;
      }
    } catch {
      failed = true;
    }
    if (failed) {
      setLiked(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
      toast("Couldn't save your like. Please try again.");
    }
    busy.current = false;
  }

  return (
    <button
      type="button"
      className={`${styles.actionBtn}${liked ? ` ${styles.liked}` : ""}`}
      aria-pressed={liked}
      aria-label={label}
      onClick={toggle}
    >
      <Heart size={18} aria-hidden="true" fill={liked ? "var(--coral-ink)" : "none"} /> {count > 0 ? count : "Like"}
    </button>
  );
}
