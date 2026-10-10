/**
 * Admin audit trail (docs/phase-3-contracts.md, Phase 3.1 addendum).
 * Only server routes write admin_audit, with the service-role client.
 * Never put member contact details (email, phone, names) in `details`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEntry {
  actorId: string;
  /** e.g. "member.role_change", "job_source.run" */
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

/** Records one admin action. Never throws; logs only an error code on failure. */
export async function writeAudit(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await admin.from("admin_audit").insert({
      actor_id: entry.actorId,
      action: entry.action.slice(0, 60),
      target_type: entry.targetType ? entry.targetType.slice(0, 40) : null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? {},
    });
    if (error) console.error(`[audit] write failed for ${entry.action} (${error.code ?? "unknown"})`);
  } catch {
    console.error(`[audit] write failed for ${entry.action} (exception)`);
  }
}
