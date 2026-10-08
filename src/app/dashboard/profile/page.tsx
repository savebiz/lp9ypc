"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { EMPLOYMENT_STATUS_OPTIONS, WORK_MODE_OPTIONS } from "@/lib/utils";
import type { Profile } from "@/types";

interface ProfileForm {
  full_name: string;
  phone: string;
  area_of_residence: string;
  parish_unit: string;
  profession: string;
  employment_status: string;
  preferred_work_mode: string;
  bio: string;
}

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileForm>();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single() as { data: Profile | null };
      if (profile) {
        reset({
          full_name: profile.full_name ?? "",
          phone: profile.phone ?? "",
          area_of_residence: profile.area_of_residence ?? "",
          parish_unit: profile.parish_unit ?? "",
          profession: profile.profession ?? "",
          employment_status: profile.employment_status ?? "",
          preferred_work_mode: profile.preferred_work_mode ?? "",
          bio: profile.bio ?? "",
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function onSubmit(data: ProfileForm) {
    setSaving(true);
    setError("");
    setSaved(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: err } = await supabase.from("profiles").update({
      ...data,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    if (err) { setError(err.message); setSaving(false); return; }
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-brand-700" size={32} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-700 mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        <div className="card p-6">
          <h1 className="text-xl font-bold text-slate-900 mb-1">Edit Profile</h1>
          <p className="text-sm text-slate-500 mb-6">Keep your information up to date.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
          )}
          {saved && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
              <CheckCircle size={16} /> Profile updated successfully!
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Full Name *</label>
              <input {...register("full_name", { required: "Required" })} className="input-field" />
              {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
            </div>
            <div>
              <label className="label">Phone Number *</label>
              <input {...register("phone", { required: "Required" })} type="tel" className="input-field" />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            </div>
            <div>
              <label className="label">Area / Location</label>
              <input {...register("area_of_residence")} className="input-field" placeholder="e.g. Ikeja" />
            </div>
            <div>
              <label className="label">Parish / Unit</label>
              <input {...register("parish_unit")} className="input-field" placeholder="e.g. Holy Cross Parish" />
            </div>
            <div>
              <label className="label">Profession / Field</label>
              <input {...register("profession")} className="input-field" placeholder="e.g. Software Engineer" />
            </div>
            <div>
              <label className="label">Employment Status</label>
              <select {...register("employment_status")} className="input-field">
                <option value="">Select status</option>
                {EMPLOYMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Preferred Work Mode</label>
              <select {...register("preferred_work_mode")} className="input-field">
                <option value="">Select preference</option>
                {WORK_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Short Bio <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea {...register("bio")} className="input-field min-h-[80px] resize-none" rows={3} placeholder="Tell the community a bit about yourself…" />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? <><Loader2 size={18} className="animate-spin" /> Saving…</> : "Save Changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
