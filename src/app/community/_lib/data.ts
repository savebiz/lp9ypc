import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Community, CommunityMember, Thread } from "@/types";

// Server-only data helpers for the community pages. Every helper tolerates a
// failed query (returns empty / flags the error) so pages can show a calm
// message instead of crashing.

export type ServerClient = Awaited<ReturnType<typeof createClient>>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isSlug = (s: string) => s.length <= 60 && SLUG.test(s);
export const isUuid = (s: string) => UUID.test(s);

export const COMMUNITY_COLUMNS = "id, slug, name, description, kind, career_path_id, icon, is_active, created_by, created_at, updated_at";

/**
 * An active community by slug. Cached per request so generateMetadata and the
 * page share one query. `failed` = the database couldn't be reached.
 */
export const loadCommunity = cache(async (slug: string): Promise<{ community: Community | null; failed: boolean }> => {
  if (!isSlug(slug)) return { community: null, failed: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { community: null, failed: true };
  return { community: (data as Community | null) ?? null, failed: false };
});

export const THREAD_COLUMNS =
  "id, community_id, author_id, title, body, status, needs_review, moderation_reason, moderation_categories, moderated_by, is_pinned, is_locked, reply_count, last_activity_at, created_at, updated_at";

export const REPLY_COLUMNS =
  "id, thread_id, community_id, author_id, body, status, needs_review, moderation_reason, moderation_categories, moderated_by, created_at, updated_at";

/**
 * One thread by id, as the signed-in viewer is allowed to see it (RLS hides
 * other people's held/removed posts unless the viewer moderates). Cached per
 * request for generateMetadata + page.
 */
export const loadThread = cache(async (threadId: string): Promise<{ thread: Thread | null; failed: boolean }> => {
  if (!isUuid(threadId)) return { thread: null, failed: false };
  const supabase = await createClient();
  const { data, error } = await supabase.from("threads").select(THREAD_COLUMNS).eq("id", threadId).maybeSingle();
  if (error) return { thread: null, failed: true };
  return { thread: (data as Thread | null) ?? null, failed: false };
});

/** id → "Ada O." from member_directory (signed-in members only). Missing ids fall back to "Member". */
export async function displayNames(supabase: ServerClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("member_directory").select("id, display_name").in("id", unique);
  return new Map(((data ?? []) as { id: string; display_name: string }[]).map((r) => [r.id, r.display_name]));
}

export function nameOf(names: Map<string, string>, id: string | null | undefined): string {
  return (id && names.get(id)) || "Member";
}

/**
 * The viewer's relationship to a community plus its managers.
 * Managers are read from community_members (RLS lets members read their own rows and every community's manager rows).
 */
export async function viewerAndManagers(
  supabase: ServerClient,
  communityId: string,
  userId: string,
): Promise<{ role: CommunityMember["role"] | null; managerIds: string[] }> {
  const { data } = await supabase
    .from("community_members")
    .select("member_id, role")
    .eq("community_id", communityId)
    .or(`role.eq.manager,member_id.eq.${userId}`);
  const rows = (data ?? []) as Pick<CommunityMember, "member_id" | "role">[];
  const mine = rows.find((r) => r.member_id === userId);
  return {
    role: mine?.role ?? null,
    managerIds: rows.filter((r) => r.role === "manager").map((r) => r.member_id),
  };
}

/** The viewer's role in one community (null = not a member). */
export async function viewerRole(
  supabase: ServerClient,
  communityId: string,
  userId: string,
): Promise<CommunityMember["role"] | null> {
  const { data } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("member_id", userId)
    .maybeSingle();
  return ((data as { role: CommunityMember["role"] } | null)?.role) ?? null;
}
