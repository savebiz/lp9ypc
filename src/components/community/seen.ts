// "New since last visit" (community-feature-spec §9): the time a member last
// opened a thread, kept only in this browser. Every access is wrapped — the
// board and thread page work fine without it (private windows, blocked storage).

const key = (threadId: string) => `lp9:seen:${threadId}`;

export function readSeen(threadId: string): string | null {
  try {
    const v = window.localStorage.getItem(key(threadId));
    return v && !Number.isNaN(new Date(v).getTime()) ? v : null;
  } catch {
    return null;
  }
}

export function writeSeen(threadId: string, at: string = new Date().toISOString()): void {
  try {
    window.localStorage.setItem(key(threadId), at);
  } catch {
    // Storage unavailable: nothing to remember.
  }
}

/** True when `date` is later than `seen` (both ISO strings). */
export function isAfter(date: string | null | undefined, seen: string | null): boolean {
  if (!date || !seen) return false;
  return new Date(date).getTime() > new Date(seen).getTime();
}
