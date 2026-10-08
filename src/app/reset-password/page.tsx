"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Navbar";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // The reset link signs the member in via /auth/callback before landing here.
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setReady(data.user ? "ok" : "no-session"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setSaving(true);
    setError("");
    const { error: err } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (err) return setError("We couldn't update your password. Request a new reset link and try again.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <header className="auth-top"><div className="wrap"><Logo /></div></header>
      <main id="main" className="auth-main">
        <div className="wrap wrap-form">
          <h1 className="title-lg">Choose a new password.</h1>
          {ready === "checking" && <p className="row muted" style={{ marginTop: 16 }}><Loader2 size={18} className="spin" aria-hidden="true" /> Checking your link…</p>}
          {ready === "no-session" && (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="alert alert-error" role="alert"><CircleAlert size={18} aria-hidden="true" /> This reset link has expired or was opened on a different device.</div>
              <Link href="/forgot-password" className="btn btn-solid">Send a new link</Link>
            </div>
          )}
          {ready === "ok" && (
            <form onSubmit={onSubmit} noValidate style={{ marginTop: 20 }}>
              {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}><CircleAlert size={18} aria-hidden="true" /> {error}</div>}
              <div className="field">
                <label className="label" htmlFor="password">New password</label>
                <span className="hint">At least 8 characters.</span>
                <div className="input-wrap">
                  <input id="password" className="input" type={showPw ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="icon-btn" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}>
                    {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-action btn-lg btn-block" disabled={saving}>
                {saving ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : "Save new password"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
