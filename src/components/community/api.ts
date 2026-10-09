// Calls to the community API routes (see docs/phase-2-contracts.md).
// Every failure comes back as a calm, member-safe sentence — never a raw error.

import type { ModerationAction } from "@/types";

export type ModerateAction = Exclude<ModerationAction, "allow" | "flag">;

export interface ModerateRequest {
  action: ModerateAction;
  targetType?: "thread" | "reply";
  targetId?: string;
  reportId?: string;
  reason?: string;
}

/** Response of POST /api/community/threads and /api/community/replies. */
export interface PostResult {
  ok: true;
  id: string;
  status: "visible" | "held";
  message: string;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

interface Fallbacks {
  /** 403 without a server message. */
  forbidden?: string;
  /** 503: the service-role key isn't configured yet. */
  unavailable?: string;
}

function serverMessage(json: unknown): string | null {
  if (json && typeof json === "object" && "error" in json) {
    const e = (json as { error: unknown }).error;
    if (typeof e === "string" && e.trim()) return e.trim().slice(0, 300);
  }
  return null;
}

function friendly(status: number, server: string | null, fb: Fallbacks): string {
  switch (status) {
    case 0:
      return NETWORK_ERROR;
    case 400:
      return server ?? "Please check what you wrote and try again.";
    case 401:
      return "Your session has ended. Please sign in again.";
    case 403:
      return server ?? fb.forbidden ?? "You don't have permission to do that here.";
    case 404:
      return server ?? "That post isn't available any more.";
    case 429:
      return "You've posted a lot in the last few minutes. Please take a short break, then try again.";
    case 503:
      return fb.unavailable ?? "This isn't switched on yet — we're still finishing the setup. Please try again later.";
    default:
      return "Something went wrong on our side. Please try again in a moment.";
  }
}

export async function postJson<T>(url: string, body: unknown, fallbacks: Fallbacks = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Not JSON (e.g. a platform error page) — handled below by status.
  }

  const okFlag = !!json && typeof json === "object" && (json as { ok?: unknown }).ok === true;
  if (res.ok && okFlag) return { ok: true, status: res.status, data: json as T };

  const status = res.ok ? 500 : res.status;
  return { ok: false, status, error: friendly(status, serverMessage(json), fallbacks) };
}

export function moderate(req: ModerateRequest) {
  return postJson<{ ok: true }>("/api/community/moderate", req, {
    forbidden: "Only this community's managers can do that.",
    unavailable: "Moderation tools aren't switched on yet. Please try again later.",
  });
}
