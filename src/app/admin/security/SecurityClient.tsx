"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Copy, KeyRound, Loader2, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { cleanCode, groupKey, mfaMessage, qrImageSrc } from "./mfa-ui";

export interface FactorSummary {
  id: string;
  name: string;
  createdAt: string;
}

interface Props {
  factors: FactorSummary[];
  /** This session has entered a code (aal2). */
  confirmed: boolean;
  required: boolean;
}

type Pending = { factorId: string; qr: string | null; secret: string };

export default function SecurityClient({ factors, confirmed, required }: Props) {
  const router = useRouter();
  const hasFactor = factors.length > 0;
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"" | "start" | "verify" | "cancel" | "remove">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // The setup key lives only in this component's state (never stored or logged).
  useEffect(() => {
    if (pending) codeRef.current?.focus();
  }, [pending]);

  async function startSetup() {
    setBusy("start");
    setError("");
    setDone("");
    const supabase = createClient();
    // Clear any half-finished set-up from before (allowed without a code).
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const added = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator app (${added})`,
      issuer: "LP9 YPC",
    });
    setBusy("");
    if (err || !data) return setError(mfaMessage(err));
    setCode("");
    setPending({ factorId: data.id, qr: qrImageSrc(data.totp.qr_code), secret: data.totp.secret });
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (code.length !== 6) return setError("Enter the 6-digit code from your app.");
    setBusy("verify");
    setError("");
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId: pending.factorId, code });
    setBusy("");
    if (err) return setError(mfaMessage(err));
    setPending(null);
    setCode("");
    setDone("Two-step sign-in is on. Next time you sign in, we'll ask for a code from your app.");
    router.refresh();
  }

  async function cancelSetup() {
    if (!pending) return;
    setBusy("cancel");
    await createClient().auth.mfa.unenroll({ factorId: pending.factorId });
    setBusy("");
    setPending(null);
    setCode("");
    setError("");
  }

  async function remove(factorId: string) {
    setBusy("remove");
    setError("");
    setDone("");
    const { error: err } = await createClient().auth.mfa.unenroll({ factorId });
    setBusy("");
    setConfirmRemove(null);
    if (err) return setError(mfaMessage(err));
    setDone("That app was removed.");
    router.refresh();
  }

  async function copyKey() {
    if (!pending) return;
    try {
      await navigator.clipboard.writeText(pending.secret.replace(/\s+/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const messages = (
    <>
      {error && (
        <div className="alert alert-error" role="alert">
          <CircleAlert size={18} aria-hidden="true" /> <span>{error}</span>
        </div>
      )}
      {done && (
        <div className="alert alert-ok" role="status">
          <CircleCheck size={18} aria-hidden="true" /> <span>{done}</span>
        </div>
      )}
    </>
  );

  // An app is set up but this sign-in hasn't entered a code: Supabase won't
  // allow changes until it has, so send them to the code step first.
  if (hasFactor && !confirmed) {
    return (
      <section className="card stack-sm" aria-labelledby="code-title">
        {messages}
        <h2 id="code-title" className="title-sm">Enter your code to make changes</h2>
        <p className="ink-2">
          Your authenticator app is set up. To add or remove an app, first enter the 6-digit code it shows.
        </p>
        <Link href="/admin/security/verify?next=/admin/security" className="btn btn-action btn-block">
          <KeyRound size={18} aria-hidden="true" /> Enter my code
        </Link>
      </section>
    );
  }

  return (
    <div className="stack">
      {messages}

      {pending ? (
        <section className="card card-white stack" aria-labelledby="setup-title">
          <h2 id="setup-title" className="title-sm">Add LP9 YPC to your app</h2>
          <ol className="stack-sm" style={{ paddingLeft: 20, margin: 0 }}>
            <li>Open your authenticator app and choose <strong>Add</strong> (often a + button).</li>
            <li>Scan this code with your phone&apos;s camera from inside the app.</li>
          </ol>
          {pending.qr ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              {/* An SVG in <img> can't run scripts; the source is checked in qrImageSrc(). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pending.qr}
                alt="QR code for your authenticator app"
                width={208}
                height={208}
                style={{ background: "#fff", padding: 12, borderRadius: 12, border: "1px solid var(--line)" }}
              />
            </div>
          ) : (
            <p className="hint">The QR code couldn&apos;t be shown. Type the key below instead.</p>
          )}
          <div className="stack-sm">
            <p className="small ink-2">Can&apos;t scan it? Choose &ldquo;Enter a setup key&rdquo; in the app and type this key:</p>
            <div className="row-wrap">
              <code
                aria-label="Setup key"
                style={{ fontSize: 16, letterSpacing: "0.04em", wordBreak: "break-all", padding: "8px 12px", background: "var(--cream)", borderRadius: 8 }}
              >
                {groupKey(pending.secret)}
              </code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyKey}>
                <Copy size={16} aria-hidden="true" /> {copied ? "Copied" : "Copy key"}
              </button>
            </div>
            <p className="hint">Keep this key private. Anyone with it can make your codes.</p>
          </div>

          <form onSubmit={confirmSetup} noValidate className="stack-sm">
            <div className="field">
              <label className="label" htmlFor="setup-code">6-digit code from your app</label>
              <input
                ref={codeRef}
                id="setup-code"
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                aria-invalid={!!error}
                aria-describedby="setup-code-hint"
              />
              <p id="setup-code-hint" className="hint">The code changes every 30 seconds.</p>
            </div>
            <p className="hint">When you confirm, you&apos;ll be signed out on your other devices.</p>
            <button type="submit" className="btn btn-action btn-lg btn-block" disabled={busy !== ""}>
              {busy === "verify" ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Checking…</> : <>Confirm and turn on</>}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={cancelSetup} disabled={busy !== ""}>
              {busy === "cancel" ? "Cancelling…" : "Cancel"}
            </button>
          </form>
        </section>
      ) : hasFactor ? (
        <section className="card stack-sm" aria-labelledby="apps-title">
          <h2 id="apps-title" className="title-sm">Your authenticator apps</h2>
          <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {factors.map((f) => (
              <li key={f.id} className="list-item" style={{ flexWrap: "wrap" }}>
                <Smartphone size={20} aria-hidden="true" style={{ marginTop: 2 }} />
                <div className="grow">
                  <p style={{ fontWeight: 600 }}>{f.name || "Authenticator app"}</p>
                  <p className="small ink-2">Added {formatDate(f.createdAt)}</p>
                </div>
                {confirmRemove === f.id ? (
                  <div className="stack-sm" style={{ flexBasis: "100%" }}>
                    <p className="small" role="status">
                      {factors.length === 1
                        ? required
                          ? "Remove your only app? You'll need to set one up again before you can use the admin tools."
                          : "Remove your only app? You'll sign in with just your password."
                        : "Remove this app? Its codes will stop working."}
                    </p>
                    <div className="row-wrap">
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(f.id)} disabled={busy !== ""}>
                        {busy === "remove" ? "Removing…" : "Yes, remove"}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(null)} disabled={busy !== ""}>
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(f.id)} aria-label={`Remove ${f.name || "authenticator app"}`}>
                    <Trash2 size={16} aria-hidden="true" /> Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {factors.length === 1 && (
            <p className="hint">
              Tip: add a second device too (for example a spare phone). If you lose your only one, you&apos;ll be locked out of the admin tools until the tech team removes it.
            </p>
          )}
          <button type="button" className="btn btn-solid btn-block" onClick={startSetup} disabled={busy !== ""}>
            {busy === "start" ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Starting…</> : <>Add another device</>}
          </button>
        </section>
      ) : (
        <section className="card stack-sm" aria-labelledby="start-title">
          <h2 id="start-title" className="title-sm">
            <ShieldCheck size={20} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Set it up in about 2 minutes
          </h2>
          <ol className="stack-sm" style={{ paddingLeft: 20, margin: 0 }}>
            <li>Install an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator (free).</li>
            <li>Tap <strong>Start set-up</strong> and scan the code we show you.</li>
            <li>Type the 6-digit code from the app to confirm.</li>
          </ol>
          <button type="button" className="btn btn-action btn-lg btn-block" onClick={startSetup} disabled={busy !== ""}>
            {busy === "start" ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Starting…</> : <>Start set-up</>}
          </button>
        </section>
      )}
    </div>
  );
}
