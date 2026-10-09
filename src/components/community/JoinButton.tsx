"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "./Toast";
import styles from "./community.module.css";

interface Props {
  communityId: string;
  slug: string;
  name: string;
  /** Null when signed out: the button becomes a sign-in link. */
  userId: string | null;
  initialJoined: boolean;
  /** Managers can't leave from here (they'd lose the role); admins reassign. */
  isManager?: boolean;
  /** "card" = directory card (small); "page" = community page (primary action). */
  variant?: "card" | "page";
}

export default function JoinButton({
  communityId,
  slug,
  name,
  userId,
  initialJoined,
  isManager = false,
  variant = "card",
}: Props) {
  const router = useRouter();
  const [joined, setJoined] = useState(initialJoined || isManager);
  const [busy, setBusy] = useState(false);
  const page = variant === "page";

  if (!userId) {
    return (
      <Link
        href={`/login?next=/community/${slug}`}
        className={page ? "btn btn-action" : "btn btn-ghost btn-sm"}
        aria-label={`Sign in to join ${name}`}
      >
        Join
      </Link>
    );
  }

  const uid: string = userId;

  if (isManager) {
    return (
      <span className="status admin">
        <ShieldCheck size={14} aria-hidden="true" style={{ marginRight: 4 }} />
        {page ? "You manage this community" : "Manager"}
      </span>
    );
  }

  async function join() {
    setBusy(true);
    setJoined(true); // optimistic
    const { error } = await createClient()
      .from("community_members")
      .insert({ community_id: communityId, member_id: uid });
    setBusy(false);
    // 23505 = already a member (e.g. joined in another tab) — that's fine.
    if (error && error.code !== "23505") {
      setJoined(false);
      toast("Couldn't join just now — please try again.");
      return;
    }
    toast(`You joined ${name}.`);
    router.refresh();
  }

  async function leave() {
    setBusy(true);
    setJoined(false); // optimistic
    const { error } = await createClient()
      .from("community_members")
      .delete()
      .eq("community_id", communityId)
      .eq("member_id", uid);
    setBusy(false);
    if (error) {
      setJoined(true);
      toast("Couldn't leave just now — please try again.");
      return;
    }
    toast(`You left ${name}.`);
    router.refresh();
  }

  if (!joined) {
    return (
      <button
        type="button"
        className={page ? "btn btn-action" : "btn btn-solid btn-sm"}
        onClick={join}
        disabled={busy}
        aria-label={page ? undefined : `Join ${name}`}
      >
        {busy && <Loader2 size={16} className="spin" aria-hidden="true" />}
        {page ? "Join this community" : "Join"}
      </button>
    );
  }

  return (
    <span className={styles.joinState}>
      <span className="status ok">
        <Check size={14} aria-hidden="true" style={{ marginRight: 4 }} />
        {page ? "You're a member" : "Joined"}
      </span>
      <button
        type="button"
        className="btn-link"
        onClick={leave}
        disabled={busy}
        aria-label={`Leave ${name}`}
      >
        {busy && <Loader2 size={14} className="spin" aria-hidden="true" />}
        Leave
      </button>
    </span>
  );
}
