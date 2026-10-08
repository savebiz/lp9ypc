"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FigureMark } from "@/components/ui/YPCMark";
import type { CareerPath } from "@/types";

interface FormData {
  first: string; last: string; email: string; phone: string; password: string;
  paths: string[]; headline: string; area: string;
}

type Err = Partial<Record<keyof FormData | "paths", string>>;

const SIDE_TEXT = [
  "First, the basics. We'll use your email for sign-in and your phone for event reminders only.",
  "Tell us where you're going. Your paths shape what jobs and mentors you'll see.",
  "Almost done. A 1-line headline helps mentors and recruiters recognise you.",
];

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({ first: "", last: "", email: "", phone: "", password: "", paths: [], headline: "", area: "" });
  const [err, setErr] = useState<Err>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([]);
  const [showPw, setShowPw] = useState(false);
  const [serverErr, setServerErr] = useState("");

  useEffect(() => {
    supabase.from("career_paths").select("*").order("name").then(({ data }) => setCareerPaths(data ?? []));
  }, []);

  function validate(): boolean {
    const e: Err = {};
    if (step === 0) {
      if (!form.first.trim()) e.first = "Required";
      if (!form.last.trim()) e.last = "Required";
      if (!form.email) e.email = "Required";
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = "Use a valid email";
      if (!form.phone) e.phone = "Required";
      else if (form.phone.replace(/\D/g, "").length < 10) e.phone = "Phone too short";
      if (!form.password) e.password = "Required";
      else if (form.password.length < 6) e.password = "At least 6 characters";
    }
    if (step === 1 && form.paths.length === 0) e.paths = "Pick at least one path";
    setErr(e);
    return Object.keys(e).length === 0;
  }

  function setF(k: keyof FormData, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  function togglePath(id: string) {
    setForm((f) => ({ ...f, paths: f.paths.includes(id) ? f.paths.filter((x) => x !== id) : [...f.paths, id] }));
  }

  async function next() {
    if (!validate()) return;
    if (step < 2) { setStep((s) => s + 1); return; }
    await submit();
  }

  async function submit() {
    setLoading(true); setServerErr("");
    const fullName = `${form.first} ${form.last}`;

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: fullName,
          phone: form.phone,
          area_of_residence: form.area,
          profession: form.headline,
          consent_updates: true,
        },
      },
    });

    if (signUpErr) { setServerErr(signUpErr.message); setLoading(false); return; }

    // Save career paths if any
    if (form.paths.length > 0 && signUpData.user) {
      const cpRows = form.paths.flatMap((slug) => {
        const cp = careerPaths.find((c) => c.slug === slug || c.id === slug);
        return cp ? [{ member_id: signUpData.user!.id, career_path_id: cp.id }] : [];
      });
      if (cpRows.length) await supabase.from("member_career_paths").insert(cpRows);
    }

    setDone(true);
    setTimeout(() => router.push("/dashboard?welcome=1"), 1600);
  }

  const ArrowR = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>;
  const ArrowL = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m11 5-7 7 7 7"/></svg>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      {/* Mini nav */}
      <div style={{ padding: "20px 36px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)", fontWeight: 700, letterSpacing: "-0.02em" }}>
          <FigureMark size={32} color="#1936FF" />
          <span style={{ fontSize: 15, lineHeight: 1.05 }}>YPC<br /><span style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".08em", color: "#666" }}>LAGOS PROVINCE 9</span></span>
        </Link>
      </div>

      <div className="wrap form-wrap">
        {/* Left panel */}
        <div className="form-side">
          <div>
            <span className="pill accent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>
              Register
            </span>
            <h2 style={{ marginTop: 24 }}>Welcome in.<br /><span className="ac">Let&apos;s build your profile.</span></h2>
            <p>{done ? "You're in. Hang tight — we're spinning up your dashboard." : SIDE_TEXT[step]}</p>
            <div className="progress">
              <span className={step >= 0 ? "on" : ""} />
              <span className={step >= 1 ? "on" : ""} />
              <span className={step >= 2 ? "on" : ""} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "rgba(255,255,255,.6)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            12 new members joined this week
          </div>
        </div>

        {/* Right: form */}
        <div className="form-body">
          {done ? (
            <div className="success-card">
              <div style={{ width: 64, height: 64, borderRadius: 32, background: "var(--mint)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7.5"/></svg>
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: "8px 0" }}>You&apos;re a YPC member</h3>
              <p style={{ color: "#555", margin: 0 }}>Redirecting to your dashboard…</p>
            </div>
          ) : (
            <>
              <div className="step-lbl">Step {step + 1} of 3</div>

              {serverErr && (
                <div style={{ padding: "12px 16px", borderRadius: 12, background: "#FFF0EE", border: "1px solid #FFD6D0", color: "var(--coral)", fontSize: 14, marginBottom: 16 }}>
                  {serverErr}
                </div>
              )}

              {/* Step 0: Basics */}
              {step === 0 && (
                <>
                  <h3>The basics.</h3>
                  <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>This is all we need to get you in the door.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className={`field${err.first ? " err" : ""}`}>
                      <label>First name</label>
                      <input value={form.first} onChange={(e) => setF("first", e.target.value)} placeholder="Ada" />
                      {err.first && <div className="err-msg">{err.first}</div>}
                    </div>
                    <div className={`field${err.last ? " err" : ""}`}>
                      <label>Last name</label>
                      <input value={form.last} onChange={(e) => setF("last", e.target.value)} placeholder="Okafor" />
                      {err.last && <div className="err-msg">{err.last}</div>}
                    </div>
                  </div>
                  <div className={`field${err.email ? " err" : ""}`}>
                    <label>Email</label>
                    <input value={form.email} type="email" onChange={(e) => setF("email", e.target.value)} placeholder="ada@example.com" autoComplete="email" />
                    {err.email && <div className="err-msg">{err.email}</div>}
                  </div>
                  <div className={`field${err.phone ? " err" : ""}`}>
                    <label>Phone (WhatsApp)</label>
                    <input value={form.phone} onChange={(e) => setF("phone", e.target.value)} placeholder="+234 803 000 0000" type="tel" />
                    {err.phone && <div className="err-msg">{err.phone}</div>}
                  </div>
                  <div className={`field${err.password ? " err" : ""}`}>
                    <label>Create a password</label>
                    <div style={{ position: "relative" }}>
                      <input value={form.password} type={showPw ? "text" : "password"} onChange={(e) => setF("password", e.target.value)} placeholder="Min. 6 characters" style={{ paddingRight: 48 }} />
                      <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#999", padding: 4 }}>
                        {showPw
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                      </button>
                    </div>
                    {err.password && <div className="err-msg">{err.password}</div>}
                  </div>
                </>
              )}

              {/* Step 1: Career paths */}
              {step === 1 && (
                <>
                  <h3>Pick your paths.</h3>
                  <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>Up to 3. You can change these anytime.</p>
                  <div className="path-grid">
                    {careerPaths.map((cp) => (
                      <button key={cp.id} type="button"
                        className={`path-chk${form.paths.includes(cp.id) ? " on" : ""}`}
                        onClick={() => togglePath(cp.id)}>
                        <span>{cp.icon}</span>
                        <span>{cp.name}</span>
                      </button>
                    ))}
                  </div>
                  {err.paths && <div className="err-msg" style={{ marginTop: 12 }}>{err.paths}</div>}
                  <div style={{ marginTop: 12, fontSize: 13, color: "#888" }}>{form.paths.length} of 3 selected</div>
                </>
              )}

              {/* Step 2: Headline */}
              {step === 2 && (
                <>
                  <h3>Last bit — your headline.</h3>
                  <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>One line. How would you introduce yourself at an IRL meetup?</p>
                  <div className="field">
                    <label>Headline / profession</label>
                    <input value={form.headline} onChange={(e) => setF("headline", e.target.value)} placeholder="Junior frontend dev exploring fintech" />
                  </div>
                  <div className="field">
                    <label>Area / Parish <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
                    <input value={form.area} onChange={(e) => setF("area", e.target.value)} placeholder="e.g. Ikeja, Surulere" />
                  </div>
                </>
              )}

              <div className="form-actions">
                {step > 0 ? (
                  <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} type="button">
                    <ArrowL /> Back
                  </button>
                ) : <div />}
                <button className="btn btn-primary" onClick={next} disabled={loading}>
                  {loading ? "Creating account…" : step === 2 ? <>Finish & join <ArrowR /></> : <>Continue <ArrowR /></>}
                </button>
              </div>
            </>
          )}
          <p style={{ marginTop: 24, fontSize: 14, color: "#666", textAlign: "center" }}>
            Already a member?{" "}
            <Link href="/login" style={{ color: "var(--blue)", fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
