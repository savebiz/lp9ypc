/**
 * POST /api/apply-tap — counts one tap on Apply (docs/stage-2-contracts.md, A).
 *
 * Called by ApplyButton with navigator.sendBeacon, AFTER the browser has
 * already started opening the job link, so nothing here can delay or block an
 * application. The member never sees this response: it is always a quick 204,
 * whether the tap was counted, ignored as a repeat, or refused.
 *
 * Origin check → capped body → valid { jobId, source } → per-IP+job de-dupe
 * (10 minutes, in memory, best effort) → 204 now; then, after the response
 * (Next's after()): member_id from the verified session (null for visitors),
 * the job must be live and approved, insert into apply_clicks with the service
 * role. If migration 20261106120000 isn't applied yet the insert quietly does
 * nothing.
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkOrigin, requireServiceRole } from "@/app/api/_lib/http";
import { readJsonBody } from "@/app/api/_lib/guards";
import { createClient } from "@/lib/supabase/server";
import { APPLY_TAP_MAX_BYTES, TapDeduper, clientIp, isMissingRelation, parseApplyTap, type ApplySource } from "./tap";

export const dynamic = "force-dynamic";

const deduper = new TapDeduper();
let warnedMissing = false;

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (checkOrigin(req)) return noContent();

  const body = await readJsonBody(req, { maxBytes: APPLY_TAP_MAX_BYTES });
  if (!body.ok) return noContent();
  const tap = parseApplyTap(body.data);
  if (!tap) return noContent();

  if (!deduper.shouldCount(`${clientIp(req.headers)}|${tap.jobId}`)) return noContent();

  const service = requireServiceRole();
  if (service.response) return noContent();

  // Read the cookies now (request scope); the network calls happen after the response.
  let session: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    session = await createClient();
  } catch {
    session = null;
  }

  try {
    after(() => recordTap(service.admin, session, tap.jobId, tap.source));
  } catch {
    // after() unavailable here: count inline rather than lose the tap; still answers 204.
    await recordTap(service.admin, session, tap.jobId, tap.source);
  }
  return noContent();
}

async function recordTap(
  admin: SupabaseClient,
  session: Awaited<ReturnType<typeof createClient>> | null,
  jobId: string,
  source: ApplySource,
): Promise<void> {
  try {
    let memberId: string | null = null;
    if (session) {
      const { data } = await session.auth.getUser().catch(() => ({ data: { user: null } }));
      memberId = data.user?.id ?? null;
    }

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .eq("is_active", true)
      .eq("review_status", "approved")
      .maybeSingle();
    if (jobError || !job) return;

    const { error } = await admin.from("apply_clicks").insert({ job_id: jobId, member_id: memberId, source });
    if (!error) return;
    if (isMissingRelation(error)) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn("[apply-tap] apply_clicks isn't set up yet (migration 20261106120000); taps aren't counted.");
      }
      return;
    }
    // 23503: the member's profile or the job vanished in between — nothing to count.
    if (error.code !== "23503") console.error(`[apply-tap] could not record a tap (code ${error.code ?? "unknown"})`);
  } catch {
    console.error("[apply-tap] could not record a tap");
  }
}
