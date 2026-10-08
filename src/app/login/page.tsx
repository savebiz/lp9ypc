"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Navbar";
import { safeNextPath } from "@/lib/utils";

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox (and spam) for the link we sent.";
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "That email and password don't match. Please try again.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a few minutes and try again.";
  if (m.includes("fetch") || m.includes("network")) return "We couldn't reach the server. Check your connection and try again.";
  return "We couldn't sign you in. Please try again.";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = params.get("notice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    setError("");
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setLoading(false);
      return setError(friendly(err.message));
    }
    router.push(safeNextPath(params.get("next")));
    router.refresh();
  }

  return (
    <>
      <span className="eyebrow">Welcome back</span>
      <h1 className="title-lg" style={{ marginTop: 8 }}>Sign in.</h1>
      <p className="lede" style={{ margin: "8px 0 24px" }}>Use the email you registered with.</p>

      {notice === "confirmed" && (
        <div className="alert alert-ok" role="status" style={{ marginBottom: 20 }}>
          <CircleCheck size={18} aria-hidden="true" /> Your email is confirmed. Sign in to continue.
        </div>
      )}
      {notice === "link-expired" && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 20 }}>
          <CircleAlert size={18} aria-hidden="true" /> That link has expired or was already used. Try signing in — if your email isn&apos;t confirmed yet, register again to get a new link.
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 20 }}>
          <CircleAlert size={18} aria-hidden="true" /> {error}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">Password</label>
          <div className="input-wrap">
            <input id="password" className="input" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="icon-btn" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}>
              {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
        <button type="submit" className="btn btn-action btn-lg btn-block" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Signing in…</> : <>Sign in <ArrowRight size={20} aria-hidden="true" /></>}
        </button>
      </form>

      <p className="small ink-2" style={{ marginTop: 24, textAlign: "center" }}>
        Not a member yet? <Link href="/register" className="btn-link" style={{ minHeight: 0 }}>Join YPC</Link>
      </p>
      <p className="small" style={{ marginTop: 4, textAlign: "center" }}>
        <Link href="/forgot-password" className="btn-link">Forgotten your password?</Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <header className="auth-top"><div className="wrap"><Logo /></div></header>
      <main id="main" className="auth-main">
        <div className="wrap wrap-form">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
