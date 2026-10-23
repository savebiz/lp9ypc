/** Shared helpers for the two-step sign-in screens (browser side). */

/** A calm, specific message for a Supabase Auth MFA error. Never shows raw errors. */
export function mfaMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  const code = error?.code ?? "";
  const m = (error?.message ?? "").toLowerCase();
  if (code === "mfa_verification_failed" || m.includes("invalid totp") || m.includes("invalid code")) {
    return "That code didn't match. Codes change every 30 seconds, so enter the newest one from your app.";
  }
  if (code === "mfa_challenge_expired") return "That took a little too long. Enter the newest code and try again.";
  if (code === "over_request_rate_limit" || error?.status === 429 || m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  if (code === "insufficient_aal" || m.includes("aal2")) return "Enter your current 6-digit code first, then try again.";
  if (code === "mfa_totp_enroll_not_enabled" || code === "mfa_totp_verify_not_enabled") {
    return "Authenticator apps aren't switched on for this site yet. Please tell the tech team.";
  }
  if (code === "too_many_enrolled_mfa_factors") return "You've added the most apps allowed. Remove one first.";
  if (m.includes("fetch") || m.includes("network")) return "We couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

/** Digits only, at most 6 (people often paste "123 456"). */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/**
 * Safe <img> source for the QR code Supabase returns on enrol (an SVG,
 * usually already prefixed "data:image/svg+xml;utf-8,"). Shown only in an
 * <img>, where SVG can't run scripts; re-encoded so characters like "#"
 * can't break the data URI. Null if it isn't an SVG.
 */
export function qrImageSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const prefix = /^data:image\/svg\+xml;(?:utf-?8|charset=utf-?8),/i.exec(raw);
  let svg = prefix ? raw.slice(prefix[0].length) : raw;
  if (/^%3C/i.test(svg)) {
    try {
      svg = decodeURIComponent(svg);
    } catch {
      return null;
    }
  }
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** "ABCD EFGH IJKL" so the setup key is easier to type. */
export function groupKey(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}
