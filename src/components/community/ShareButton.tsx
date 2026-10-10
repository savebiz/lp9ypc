"use client";

import { Share2 } from "lucide-react";
import { toast } from "./Toast";
import styles from "./community.module.css";

interface Props {
  slug: string;
  threadId: string;
  /** Set for a reply: the link jumps to it. */
  replyId?: string;
  threadTitle: string;
  communityName: string;
}

/**
 * Share a visible post (community-feature-spec §7). Only the thread title
 * goes in the payload — never reply text. Readers must sign in as members.
 */
export default function ShareButton({ slug, threadId, replyId, threadTitle, communityName }: Props) {
  async function share() {
    const url = `${window.location.origin}/community/${slug}/t/${threadId}${replyId ? `#reply-${replyId}` : ""}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: threadTitle,
          text: `A discussion in ${communityName} on LP9 YPC. You'll need to sign in as a YPC member to read it.`,
          url,
        });
      } catch (e) {
        if ((e as { name?: string } | null)?.name !== "AbortError") await copy(url);
      }
      return;
    }
    await copy(url);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Only YPC members can open it.");
    } catch {
      toast("Couldn't copy the link. You can copy it from your browser's address bar.");
    }
  }

  return (
    <button type="button" className={styles.actionBtn} onClick={share}>
      <Share2 size={18} aria-hidden="true" /> Share
    </button>
  );
}
