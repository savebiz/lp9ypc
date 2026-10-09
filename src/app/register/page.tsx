"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Eye, EyeOff, Info, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Navbar";
import { PathIcon } from "@/components/ui/icons";
import { EMPLOYMENT_STATUS_OPTIONS, WORK_MODE_OPTIONS } from "@/lib/utils";
import { CAREER_GOAL_OPTIONS, suggestPathSlugs } from "@/lib/career-match";
import type { CareerGoal, CareerPath } from "@/types";
import styles from "./register.module.css";

// The first-stage form asks ONLY for the brief's list (CLAUDE.md, hard rule):
// full name, phone, email, area of residence, profession, employment status,
// career path interest, preferred work mode, consent — plus a password so the
// member can sign back in, and the ONE owner-approved optional question
// "What are you looking for?" (career goal). Do not add fields here; collect
// extras later via the profile page.

interface Form {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  area: string;
  profession: string;
  employmentStatus: string;
  workMode: string;
  careerGoal: CareerGoal | "";
  paths: string[];
  consent: boolean;
}
type Errors = Partial<Record<keyof Form, string>>;

const STEPS = ["Your details", "Your work", "Your career paths"];

const GOAL_OPTIONS: readonly { value: CareerGoal; label: string }[] = CAREER_GOAL_OPTIONS;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("password")) return "That password isn't accepted. Use at least 8 characters.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a few minutes and try again.";
  if (m.includes("fetch") || m.includes("network")) return "We couldn't reach the server. Check your connection and try again.";
  return "Something went wrong creating your account. Please try again.";
}

export default function RegisterPage() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    fullName: "", email: "", phone: "", password: "", area: "", profession: "",
    employmentStatus: "", workMode: "", careerGoal: "", paths: [], consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([]);
  const [pathsState, setPathsState] = useState<"loading" | "ready" | "error">("loading");

  async function loadPaths() {
    setPathsState("loading");
    const { data, error } = await createClient().from("career_paths").select("*").order("name");
    if (error || !data?.length) return setPathsState("error");
    setCareerPaths(data as CareerPath[]);
    setPathsState("ready");
  }

  useEffect(() => { loadPaths(); }, []);
  // Move focus to the new step's heading so screen readers announce it — but
  // not on first load, where the browser's default focus is better.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function togglePath(id: string) {
    set("paths", form.paths.includes(id) ? form.paths.filter((p) => p !== id) : [...form.paths, id]);
  }

  function chooseGoal(goal: CareerGoal) {
    const nextGoal = form.careerGoal === goal ? "" : goal;
    set("careerGoal", nextGoal);
    // "Not sure yet" makes paths optional, so clear a stale "choose a path" error.
    if (nextGoal === "explore" && errors.paths) setErrors((e) => ({ ...e, paths: undefined }));
  }

  // Instant keyword match on the profession from step 2 (no network). The
  // career-research agent adds richer suggestions to the dashboard later.
  const pathGroups = useMemo(() => {
    const bySlug = new Map(careerPaths.map((cp) => [cp.slug, cp]));
    const suggested = suggestPathSlugs(form.profession)
      .map((slug) => bySlug.get(slug))
      .filter((cp): cp is CareerPath => !!cp);
    const suggestedIds = new Set(suggested.map((cp) => cp.id));
    const others = careerPaths.filter((cp) => !suggestedIds.has(cp.id));
    if (suggested.length === 0) {
      return [{ key: "all", title: form.careerGoal === "switch" ? "Paths you could move into" : "All career paths", paths: careerPaths }];
    }
    if (form.careerGoal === "switch") {
      return [
        { key: "move", title: "Paths you could move into", paths: others },
        { key: "related", title: "Related to your current work", paths: suggested },
      ];
    }
    return [
      { key: "suggested", title: "Suggested from your profession", paths: suggested },
      { key: "others", title: "All other career paths", paths: others },
    ];
  }, [careerPaths, form.profession, form.careerGoal]);

  function validate(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      if (form.fullName.trim().length < 2) e.fullName = "Enter your full name";
      if (!EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address";
      const digits = form.phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) e.phone = "Enter a valid phone number, e.g. 0803 000 0000";
      if (form.password.length < 8) e.password = "Use at least 8 characters";
    }
    if (s === 1) {
      if (!form.area.trim()) e.area = "Tell us where you live or your parish";
      if (!form.profession.trim()) e.profession = "Tell us your profession or field";
      if (!form.employmentStatus) e.employmentStatus = "Choose one";
    }
    if (s === 2 && form.paths.length === 0 && form.careerGoal !== "explore") {
      e.paths = "Choose at least one career path, or pick “Not sure yet” above";
    }
    return e;
  }

  async function next(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    if (step < 2) return setStep(step + 1);
    await submit();
  }

  async function submit() {
    setSubmitting(true);
    setServerError("");
    const supabase = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard?welcome=1")}`;

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: callback,
        // Read by the database's signup trigger, which validates every value
        // and never accepts a role from here.
        data: {
          full_name: form.fullName.trim(),
          phone: form.phone.trim(),
          area_of_residence: form.area.trim(),
          profession: form.profession.trim(),
          employment_status: form.employmentStatus,
          preferred_work_mode: form.workMode || null,
          career_goal: form.careerGoal || null,
          consent_updates: form.consent,
          career_path_ids: form.paths,
        },
      },
    });

    setSubmitting(false);
    if (error) return setServerError(friendlyAuthError(error.message));

    if (data.session) {
      router.push("/dashboard?welcome=1");
      router.refresh();
    } else {
      // Email confirmation is on: the account exists but must be confirmed first.
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <Shell>
        <div className="success" role="status">
          <div className="badge"><MailCheck size={30} aria-hidden="true" /></div>
          <h1 className="title-sm" tabIndex={-1}>Check your email</h1>
          <p className="ink-2" style={{ marginTop: 10 }}>
            We sent a confirmation link to <strong>{form.email.trim()}</strong>. Tap it to activate your account,
            then you&apos;ll land on your dashboard.
          </p>
          <p className="small muted" style={{ marginTop: 10 }}>Can&apos;t see it? Check your spam or promotions folder.</p>
          <Link href="/login" className="btn btn-ghost" style={{ marginTop: 20 }}>Go to sign in</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="step-label">Step {step + 1} of 3 · {STEPS[step]}</p>
      <div className="progress" aria-hidden="true">
        {STEPS.map((_, i) => <span key={i} className={i <= step ? "on" : ""} />)}
      </div>

      <form onSubmit={next} noValidate style={{ marginTop: 20 }}>
        {step === 0 && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="title-lg">Join YPC.</h1>
            <p className="lede" style={{ margin: "8px 0 24px" }}>A few details to get you started. It takes about two minutes.</p>
            <Field id="fullName" label="Full name" error={errors.fullName}>
              <input id="f-fullName" className="input" value={form.fullName} onChange={(e) => set("fullName", e.target.value)}
                autoComplete="name" maxLength={120} aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "e-fullName" : undefined} />
            </Field>
            <Field id="email" label="Email" error={errors.email}>
              <input id="f-email" className="input" type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                autoComplete="email" maxLength={320} aria-invalid={!!errors.email} aria-describedby={errors.email ? "e-email" : undefined} />
            </Field>
            <Field id="phone" label="Phone number (WhatsApp)" error={errors.phone}>
              <input id="f-phone" className="input" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                autoComplete="tel" placeholder="0803 000 0000" maxLength={32} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "e-phone" : undefined} />
            </Field>
            <Field id="password" label="Create a password" hint="At least 8 characters. You'll use this to sign in." error={errors.password}>
              <div className="input-wrap">
                <input id="f-password" className="input" type={showPw ? "text" : "password"} value={form.password}
                  onChange={(e) => set("password", e.target.value)} autoComplete="new-password"
                  aria-invalid={!!errors.password} aria-describedby={`h-password${errors.password ? " e-password" : ""}`} />
                <button type="button" className="icon-btn" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw}>
                  {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="title-lg">Your work.</h1>
            <p className="lede" style={{ margin: "8px 0 24px" }}>This helps us share the right opportunities with you.</p>
            <Field id="area" label="Area of residence or parish / unit" error={errors.area}>
              <input id="f-area" className="input" value={form.area} onChange={(e) => set("area", e.target.value)}
                placeholder="e.g. Ikeja, or your parish" maxLength={120} aria-invalid={!!errors.area} aria-describedby={errors.area ? "e-area" : undefined} />
            </Field>
            <Field id="profession" label="Profession or field of work" error={errors.profession}>
              <input id="f-profession" className="input" value={form.profession} onChange={(e) => set("profession", e.target.value)}
                autoComplete="organization-title" placeholder="e.g. Accountant, Software developer" maxLength={120}
                aria-invalid={!!errors.profession} aria-describedby={errors.profession ? "e-profession" : undefined} />
            </Field>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 20px" }} aria-describedby={errors.employmentStatus ? "e-employmentStatus" : undefined}>
              <legend className="label" style={{ marginBottom: 8 }} id="f-employmentStatus" tabIndex={-1}>Employment status</legend>
              <div className="options two" role="radiogroup" aria-labelledby="f-employmentStatus">
                {EMPLOYMENT_STATUS_OPTIONS.map((o) => (
                  <Option key={o.value} type="radio" on={form.employmentStatus === o.value} onClick={() => set("employmentStatus", o.value)}>
                    {o.label}
                  </Option>
                ))}
              </div>
              {errors.employmentStatus && <FieldError id="employmentStatus" msg={errors.employmentStatus} />}
            </fieldset>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 8 }} id="l-workMode">
                Preferred work mode <span className="opt">(optional)</span>
              </legend>
              <div className="options two" role="radiogroup" aria-labelledby="l-workMode">
                {WORK_MODE_OPTIONS.map((o) => (
                  <Option key={o.value} type="radio" on={form.workMode === o.value}
                    onClick={() => set("workMode", form.workMode === o.value ? "" : o.value)}>
                    {o.label}
                  </Option>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="title-lg">Your career paths.</h1>
            <p className="lede" style={{ margin: "8px 0 24px" }}>Pick one or more. You can change these anytime.</p>

            <fieldset className={styles.goal}>
              <legend className="label" id="l-careerGoal">
                What are you looking for? <span className="opt">(optional)</span>
              </legend>
              <div className="options" role="radiogroup" aria-labelledby="l-careerGoal">
                {GOAL_OPTIONS.map((o) => (
                  <Option key={o.value} type="radio" on={form.careerGoal === o.value} onClick={() => chooseGoal(o.value)}>
                    {o.label}
                  </Option>
                ))}
              </div>
              {form.careerGoal === "explore" && (
                <div className="alert alert-info" role="status" style={{ marginTop: 12 }}>
                  <Info size={18} aria-hidden="true" />
                  <span>No problem — skip for now; we&apos;ll suggest paths on your dashboard.</span>
                </div>
              )}
            </fieldset>

            <fieldset className={styles.paths} aria-describedby={errors.paths ? "e-paths" : undefined}>
              <legend className="sr-only" id="f-paths" tabIndex={-1}>
                Career paths{form.careerGoal === "explore" ? " (optional)" : ""}
              </legend>
              {pathsState === "loading" && <p className="row muted"><Loader2 size={18} className="spin" aria-hidden="true" /> Loading career paths…</p>}
              {pathsState === "error" && (
                <div className="alert alert-error" role="alert">
                  <CircleAlert size={18} aria-hidden="true" />
                  <span>
                    We couldn&apos;t load the career paths.{" "}
                    <button type="button" className="btn-link" style={{ minHeight: 0, color: "inherit" }} onClick={loadPaths}>Try again</button>
                  </span>
                </div>
              )}
              {pathsState === "ready" && pathGroups.filter((g) => g.paths.length > 0).map((g) => (
                <div key={g.key} className={styles.group} role="group" aria-labelledby={`g-${g.key}`}>
                  <h2 id={`g-${g.key}`} className={styles.groupTitle}>{g.title}</h2>
                  <div className="options">
                    {g.paths.map((cp) => (
                      <Option key={cp.id} type="checkbox" on={form.paths.includes(cp.id)} onClick={() => togglePath(cp.id)}
                        icon={<PathIcon slug={cp.slug} size={20} className="option-icon" />}>
                        {cp.name}
                      </Option>
                    ))}
                  </div>
                </div>
              ))}
              {errors.paths && <div style={{ marginTop: 10 }}><FieldError id="paths" msg={errors.paths} /></div>}
            </fieldset>

            <div className="card card-cream" style={{ marginTop: 24 }}>
              <label className="check-row">
                <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
                <span>
                  <strong>Send me YPC updates</strong>
                  <span className="hint" style={{ display: "block", marginTop: 2 }}>
                    Job alerts, workshops and club news by email or WhatsApp. Optional. You can change this anytime.
                  </span>
                </span>
              </label>
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>
              By creating an account you agree to how we handle your data in our{" "}
              <Link href="/privacy" className="btn-link" style={{ minHeight: 0, padding: 0 }}>privacy notice</Link>.
            </p>
          </>
        )}

        {serverError && (
          <div className="alert alert-error" role="alert" style={{ marginTop: 20 }}>
            <CircleAlert size={18} aria-hidden="true" />
            <span>
              {serverError}
              {serverError.includes("Sign in") && <> <Link href="/login" className="btn-link" style={{ minHeight: 0, color: "inherit" }}>Go to sign in</Link></>}
            </span>
          </div>
        )}

        <div className="form-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={submitting}>
              <ArrowLeft size={18} aria-hidden="true" /> Back
            </button>
          ) : <span />}
          <button type="submit" className="btn btn-action btn-lg" disabled={submitting || (step === 2 && pathsState !== "ready" && form.careerGoal !== "explore")}>
            {submitting ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Creating your account…</>
              : step === 2 ? <>Create my account <Check size={20} aria-hidden="true" /></>
              : <>Continue <ArrowRight size={20} aria-hidden="true" /></>}
          </button>
        </div>
      </form>

      <p className="small ink-2" style={{ marginTop: 24, textAlign: "center" }}>
        Already a member? <Link href="/login" className="btn-link" style={{ minHeight: 0 }}>Sign in</Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <header className="auth-top"><div className="wrap"><Logo /></div></header>
      <main id="main" className="auth-main"><div className="wrap wrap-form">{children}</div></main>
    </div>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label" htmlFor={`f-${id}`}>{label}</label>
      {hint && <span className="hint" id={`h-${id}`}>{hint}</span>}
      {children}
      {error && <FieldError id={id} msg={error} />}
    </div>
  );
}

function FieldError({ id, msg }: { id: string; msg: string }) {
  return (
    <span className="field-error" id={`e-${id}`}>
      <CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2 }} /> {msg}
    </span>
  );
}

function Option({ type, on, onClick, icon, children }: { type: "radio" | "checkbox"; on: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" role={type} aria-checked={on} className={`option ${type}${on ? " on" : ""}`} onClick={onClick}>
      <span className="box" aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
      {icon}
      <span>{children}</span>
    </button>
  );
}
