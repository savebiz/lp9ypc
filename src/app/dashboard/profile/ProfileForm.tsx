"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PathIcon } from "@/components/ui/icons";
import { EMPLOYMENT_STATUS_OPTIONS, WORK_MODE_OPTIONS } from "@/lib/utils";
import { CAREER_GOAL_OPTIONS } from "@/lib/career-match";
import type { CareerGoal, CareerPath, Profile } from "@/types";

interface Props {
  profile: Profile;
  careerPaths: CareerPath[];
  initialPathIds: string[];
}

export default function ProfileForm({ profile, careerPaths, initialPathIds }: Props) {
  const router = useRouter();
  const [f, setF] = useState({
    full_name: profile.full_name ?? "",
    phone: profile.phone ?? "",
    area_of_residence: profile.area_of_residence ?? "",
    parish_unit: profile.parish_unit ?? "",
    profession: profile.profession ?? "",
    employment_status: profile.employment_status ?? "",
    preferred_work_mode: profile.preferred_work_mode ?? "",
    career_goal: (profile.career_goal ?? "") as CareerGoal | "",
    consent_updates: !!profile.consent_updates,
    bio: profile.bio ?? "",
  });
  const [paths, setPaths] = useState<string[]>(initialPathIds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }));
    setResult(null);
  }

  function togglePath(id: string) {
    setPaths((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setResult(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.full_name.trim().length < 2) errs.full_name = "Enter your full name";
    const digits = f.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) errs.phone = "Enter a valid phone number";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`p-${Object.keys(errs)[0]}`)?.focus();
      return;
    }

    setSaving(true);
    setResult(null);
    const supabase = createClient();

    // Only columns members are allowed to update (the database enforces this too).
    const { error } = await supabase.from("profiles").update({
      full_name: f.full_name.trim(),
      phone: f.phone.trim(),
      area_of_residence: f.area_of_residence,
      parish_unit: f.parish_unit,
      profession: f.profession,
      employment_status: f.employment_status || null,
      preferred_work_mode: f.preferred_work_mode || null,
      career_goal: f.career_goal || null,
      consent_updates: f.consent_updates,
      bio: f.bio,
    }).eq("id", profile.id);

    let pathError = null;
    if (!error) {
      const removed = initialPathIds.filter((id) => !paths.includes(id));
      const added = paths.filter((id) => !initialPathIds.includes(id));
      if (removed.length) {
        const r = await supabase.from("member_career_paths").delete().eq("member_id", profile.id).in("career_path_id", removed);
        pathError = r.error;
      }
      if (!pathError && added.length) {
        const r = await supabase.from("member_career_paths").insert(added.map((id) => ({ member_id: profile.id, career_path_id: id })));
        pathError = r.error;
      }
    }

    setSaving(false);
    if (error || pathError) {
      setResult({ ok: false, msg: "We couldn't save your changes. Please check your connection and try again." });
      return;
    }
    setResult({ ok: true, msg: "Your profile is saved." });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="stack-lg">
      <section className="panel" aria-labelledby="details-h">
        <h2 id="details-h" className="title-sm" style={{ marginBottom: 16 }}>Your details</h2>
        <div className="field">
          <span className="label">Email</span>
          <p className="ink-2" style={{ overflowWrap: "anywhere" }}>{profile.email}</p>
        </div>
        <TextField id="full_name" label="Full name" value={f.full_name} onChange={(v) => set("full_name", v)} error={errors.full_name} autoComplete="name" />
        <TextField id="phone" label="Phone number (WhatsApp)" type="tel" value={f.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" />
        <TextField id="area_of_residence" label="Area of residence" value={f.area_of_residence} onChange={(v) => set("area_of_residence", v)} />
        <TextField id="parish_unit" label="Parish / unit" optional value={f.parish_unit} onChange={(v) => set("parish_unit", v)} />
        <TextField id="profession" label="Profession or field of work" value={f.profession} onChange={(v) => set("profession", v)} autoComplete="organization-title" />
        <div className="field">
          <label className="label" htmlFor="p-employment_status">Employment status</label>
          <select id="p-employment_status" className="input" value={f.employment_status} onChange={(e) => set("employment_status", e.target.value)}>
            <option value="">Choose one</option>
            {EMPLOYMENT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="p-preferred_work_mode">Preferred work mode <span className="opt">(optional)</span></label>
          <select id="p-preferred_work_mode" className="input" value={f.preferred_work_mode} onChange={(e) => set("preferred_work_mode", e.target.value)}>
            <option value="">No preference</option>
            {WORK_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="p-bio">Short bio <span className="opt">(optional)</span></label>
          <textarea id="p-bio" className="input" maxLength={1000} value={f.bio} onChange={(e) => set("bio", e.target.value)}
            placeholder="A line or two about you and what you're looking for." />
        </div>
      </section>

      <section className="panel" id="paths" aria-labelledby="paths-h" style={{ scrollMarginTop: 88 }}>
        <h2 id="paths-h" className="title-sm">Your career paths</h2>
        <div className="field" style={{ marginTop: 16 }}>
          <label className="label" htmlFor="p-career_goal">What are you looking for? <span className="opt">(optional)</span></label>
          <span className="hint" id="ph-career_goal">We use this to suggest paths you could grow in or move into.</span>
          <select id="p-career_goal" className="input" aria-describedby="ph-career_goal" value={f.career_goal}
            onChange={(e) => set("career_goal", e.target.value as CareerGoal | "")}>
            <option value="">Not set</option>
            {CAREER_GOAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <p className="ink-2" style={{ margin: "0 0 16px" }}>Pick one or more paths. We use these to show you the most relevant jobs first.</p>
        <div className="options" role="group" aria-labelledby="paths-h">
          {careerPaths.map((cp) => {
            const on = paths.includes(cp.id);
            return (
              <button key={cp.id} type="button" role="checkbox" aria-checked={on} className={`option checkbox${on ? " on" : ""}`} onClick={() => togglePath(cp.id)}>
                <span className="box" aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                <PathIcon slug={cp.slug} size={20} className="option-icon" />
                <span>{cp.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel" aria-labelledby="consent-h">
        <h2 id="consent-h" className="title-sm" style={{ marginBottom: 12 }}>Updates</h2>
        <label className="check-row">
          <input type="checkbox" checked={f.consent_updates} onChange={(e) => set("consent_updates", e.target.checked)} />
          <span>
            <strong>Send me YPC updates</strong>
            <span className="hint" style={{ display: "block", marginTop: 2 }}>Job alerts, workshops and club news by email or WhatsApp.</span>
          </span>
        </label>
      </section>

      <div className="stack">
        {result && (
          <div className={`alert ${result.ok ? "alert-ok" : "alert-error"}`} role={result.ok ? "status" : "alert"}>
            {result.ok ? <CircleCheck size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />} {result.msg}
          </div>
        )}
        <button type="submit" className="btn btn-action btn-lg btn-block" disabled={saving}>
          {saving ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Saving…</> : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function TextField({ id, label, value, onChange, error, optional, type = "text", autoComplete }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; optional?: boolean; type?: string; autoComplete?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={`p-${id}`}>
        {label} {optional && <span className="opt">(optional)</span>}
      </label>
      <input id={`p-${id}`} className="input" type={type} value={value} maxLength={120} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `pe-${id}` : undefined} />
      {error && <span className="field-error" id={`pe-${id}`}><CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2 }} /> {error}</span>}
    </div>
  );
}
