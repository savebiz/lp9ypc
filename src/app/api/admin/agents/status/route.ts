/**
 * GET /api/admin/agents/status — admins only.
 * Response: { ok: true, gemini, serviceRole, cronSecret, model }
 * Booleans say whether each secret is SET; values are never returned.
 */
import { GEMINI_MODEL, getGeminiKey } from "@/lib/agents/gemini";
import { json, requireAdmin } from "@/app/api/_lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  return json({
    ok: true,
    gemini: getGeminiKey() !== null,
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    cronSecret: Boolean(process.env.CRON_SECRET?.trim()),
    model: GEMINI_MODEL,
  });
}
