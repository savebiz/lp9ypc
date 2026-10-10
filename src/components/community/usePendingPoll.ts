"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PostStatus } from "@/types";

const INTERVAL_MS = 2_000;
const WINDOW_MS = 30_000;

/**
 * While the author's own post is 'pending', re-read its status with the
 * browser client (authors can read their own pending rows) every 2 s for up
 * to 30 s (phase-3-contracts, community-feature-spec §6). Stops on unmount
 * and when the tab is hidden; resumes once when the tab is shown again.
 *
 * Returns "checking" while polling, "still" after the window ran out.
 * `onResolved` is called once with the new status when it changes.
 * `restartKey` restarts the window (e.g. after an edit).
 */
export function usePendingPoll(
  kind: "thread" | "reply",
  id: string,
  pending: boolean,
  onResolved: (status: PostStatus) => void,
  restartKey?: string | null,
): "checking" | "still" {
  const [phase, setPhase] = useState<"checking" | "still">("checking");
  const resolvedRef = useRef(onResolved);
  useEffect(() => {
    resolvedRef.current = onResolved;
  });

  useEffect(() => {
    if (!pending) return;
    const table = kind === "thread" ? "threads" : "replies";
    let supabase: ReturnType<typeof createClient> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let resumedOnce = false;
    let deadline = Date.now() + WINDOW_MS;
    setPhase("checking");

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const tick = async () => {
      timer = null;
      if (stopped || document.visibilityState === "hidden") return;
      try {
        supabase ??= createClient();
        const { data } = await supabase.from(table).select("status").eq("id", id).maybeSingle();
        if (stopped) return;
        const status = (data as { status?: PostStatus } | null)?.status;
        if (status && status !== "pending") {
          stopped = true;
          resolvedRef.current(status);
          return;
        }
      } catch {
        // A failed read just waits for the next tick.
      }
      if (stopped) return;
      if (Date.now() >= deadline) {
        setPhase("still");
        return;
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };

    const onVisibility = () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        clear();
      } else if (!timer && !resumedOnce) {
        resumedOnce = true;
        deadline = Date.now() + WINDOW_MS;
        setPhase("checking");
        void tick();
      }
    };

    timer = setTimeout(tick, INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [kind, id, pending, restartKey]);

  return phase;
}
