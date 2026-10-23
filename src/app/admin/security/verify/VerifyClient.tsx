"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cleanCode, mfaMessage } from "../mfa-ui";

interface Props {
  factors: { id: string; name: string }[];
  /** Already checked on the server: an /admin path. */
  next: string;
}

export default function VerifyClient({ factors, next }: Props) {
  const router = useRouter();
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code from your app.");
    setLoading(true);
    setError("");
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setLoading(false);
      setCode("");
      return setError(mfaMessage(err));
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      {error && (
        <div className="alert alert-error" role="alert">
          <CircleAlert size={18} aria-hidden="true" /> <span>{error}</span>
        </div>
      )}

      {factors.length > 1 && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Which device?</legend>
          <div className="stack-sm">
            {factors.map((f) => (
              <label key={f.id} className="check-row">
                <input type="radio" name="factor" value={f.id} checked={factorId === f.id} onChange={() => setFactorId(f.id)} />
                <span>{f.name || "Authenticator app"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="field">
        <label className="label" htmlFor="mfa-code">6-digit code</label>
        <input
          id="mfa-code"
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          autoFocus
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          aria-invalid={!!error}
          aria-describedby="mfa-code-hint"
        />
        <p id="mfa-code-hint" className="hint">The code changes every 30 seconds. Use the newest one.</p>
      </div>

      <button type="submit" className="btn btn-action btn-lg btn-block" disabled={loading}>
        {loading ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Checking…</> : <>Continue <ArrowRight size={20} aria-hidden="true" /></>}
      </button>

      <p className="hint">
        Lost your phone? Ask another admin or the tech team to remove the old app from your account. Then sign in and set it up again.
      </p>
    </form>
  );
}
