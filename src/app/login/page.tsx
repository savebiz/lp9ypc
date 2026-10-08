"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { createClient } from "@/lib/supabase/client";
import { FigureMark } from "@/components/ui/YPCMark";

interface LoginForm { email: string; password: string; }

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  async function onSubmit(data: LoginForm) {
    setLoading(true); setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (err) { setError(err.message); setLoading(false); return; }
    router.push("/dashboard"); router.refresh();
  }

  const ArrowR = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px" }}>
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40, fontWeight: 700, letterSpacing: "-0.02em", textDecoration: "none", color: "var(--ink)" }}>
        <FigureMark size={36} color="#1936FF" />
        <span style={{ fontSize: 17, lineHeight: 1.05 }}>YPC<br /><span style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".08em", color: "#666" }}>LAGOS PROVINCE 9</span></span>
      </Link>

      <div className="login-wrap" style={{ width: "100%" }}>
        <span className="pill accent">Welcome back</span>
        <h2 style={{ marginTop: 16 }}>Sign in.</h2>
        <p style={{ color: "#666", marginBottom: 24, fontSize: 16 }}>Use the email you registered with.</p>

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FFF0EE", border: "1px solid #FFD6D0", color: "var(--coral)", fontSize: 14, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={`field${errors.email ? " err" : ""}`}>
            <label>Email</label>
            <input {...register("email", { required: "Required" })} type="email" placeholder="you@example.com" autoComplete="email" />
            {errors.email && <div className="err-msg">{errors.email.message}</div>}
          </div>
          <div className={`field${errors.password ? " err" : ""}`}>
            <label>Password</label>
            <div style={{ position: "relative" }}>
              <input {...register("password", { required: "Required" })} type={showPw ? "text" : "password"} placeholder="••••••••" autoComplete="current-password" style={{ paddingRight: 48 }} />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#999", padding: 4 }}>
                {showPw ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
            {errors.password && <div className="err-msg">{errors.password.message}</div>}
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8, opacity: loading ? .7 : 1 }}>
            {loading ? "Signing in…" : <> Sign in <ArrowR /></>}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 14, color: "#666", textAlign: "center" }}>
          No account?{" "}
          <Link href="/register" style={{ color: "var(--blue)", fontWeight: 600 }}>Register free</Link>
        </p>
      </div>
    </div>
  );
}
