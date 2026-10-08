"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Navbar";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Enter the email you registered with.");
    setLoading(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setLoading(false);
    // Same message whether or not the account exists, so this page can't be
    // used to discover who is registered.
    if (err && /rate limit|too many/i.test(err.message)) return setError("Too many attempts. Please wait a few minutes and try again.");
    setSent(true);
  }

  return (
    <div className="auth-shell">
      <header className="auth-top"><div className="wrap"><Logo /></div></header>
      <main id="main" className="auth-main">
        <div className="wrap wrap-form">
          {sent ? (
            <div className="success" role="status">
              <div className="badge"><MailCheck size={30} aria-hidden="true" /></div>
              <h1 className="title-sm">Check your email</h1>
              <p className="ink-2" style={{ marginTop: 10 }}>
                If <strong>{email.trim()}</strong> is registered, we&apos;ve sent a link to reset your password. Check your spam folder too.
              </p>
              <Link href="/login" className="btn btn-ghost" style={{ marginTop: 20 }}>Back to sign in</Link>
            </div>
          ) : (
            <>
              <h1 className="title-lg">Reset your password.</h1>
              <p className="lede" style={{ margin: "8px 0 24px" }}>Enter your email and we&apos;ll send you a reset link.</p>
              {error && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}><CircleAlert size={18} aria-hidden="true" /> {error}</div>}
              <form onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-action btn-lg btn-block" disabled={loading}>
                  {loading ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : "Send reset link"}
                </button>
              </form>
              <p className="small ink-2" style={{ marginTop: 24, textAlign: "center" }}>
                Remembered it? <Link href="/login" className="btn-link" style={{ minHeight: 0 }}>Sign in</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
