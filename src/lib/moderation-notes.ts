/**
 * Moderation notes (the reason a post was held, its categories, and whether the
 * assistant or a human decided) are hidden from members by column grants.
 * Moderators read them through the post_moderation_notes() database function,
 * which only returns rows for communities the caller can moderate.
 */

export interface ModerationNotes {
  moderation_reason: string | null;
  moderation_categories: string[];
  moderated_by: "agent" | "human" | null;
}

export const NO_NOTES: ModerationNotes = { moderation_reason: null, moderation_categories: [], moderated_by: null };

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/** id → notes for the given posts. Empty when the caller can't moderate them (or on error). */
export async function fetchModerationNotes(
  supabase: RpcClient,
  kind: "thread" | "reply",
  ids: string[],
): Promise<Map<string, ModerationNotes>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("post_moderation_notes", { p_kind: kind, p_ids: ids });
  if (error || !Array.isArray(data)) return new Map();
  return new Map(
    (data as Record<string, unknown>[]).map((r) => [
      String(r.id),
      {
        moderation_reason: typeof r.moderation_reason === "string" ? r.moderation_reason : null,
        moderation_categories: Array.isArray(r.moderation_categories) ? (r.moderation_categories as string[]) : [],
        moderated_by: r.moderated_by === "agent" || r.moderated_by === "human" ? r.moderated_by : null,
      },
    ]),
  );
}

/** Returns the posts with their moderation notes merged in (or empty notes). */
export async function withModerationNotes<T extends { id: string }>(
  supabase: RpcClient,
  kind: "thread" | "reply",
  posts: T[],
): Promise<(T & ModerationNotes)[]> {
  const notes = await fetchModerationNotes(supabase, kind, posts.map((p) => p.id));
  return posts.map((p) => ({ ...p, ...(notes.get(p.id) ?? NO_NOTES) }));
}
