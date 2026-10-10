import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import FeedbackForm, { type FeedbackTarget } from "@/components/feedback/FeedbackForm";
import { isFeedbackKind, sameSitePath } from "@/components/feedback/feedback";
import { getSession } from "@/lib/session";
import { SITE } from "@/content/site";
import type { FeedbackKind } from "@/types";

export const metadata = { title: "Feedback · LP9 YPC" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = {
  job?: string | string[];
  event?: string | string[];
  path?: string | string[];
  kind?: string | string[];
  /** The page the member came from (footer link); same-site paths only. */
  from?: string | string[];
};

/** ?from= as a safe same-site path (never a sign-in or feedback page), else null. */
function fromPath(params: Params): string | null {
  const path = sameSitePath(one(params.from));
  if (!path || /^\/(feedback|login|register)(\/|\?|$)/.test(path)) return null;
  return path;
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type SessionClient = Awaited<ReturnType<typeof getSession>>["supabase"];

/**
 * The item the feedback is about, from ?job=, ?event= or ?path= (career path
 * id). Looked up with the member's session, so RLS decides what they can see.
 * Unknown or invalid ids are simply ignored.
 */
async function findTarget(supabase: SessionClient, params: Params): Promise<FeedbackTarget | null> {
  const job = one(params.job);
  const event = one(params.event);
  const path = one(params.path);

  if (job && UUID.test(job)) {
    const { data } = await supabase.from("jobs").select("id, title").eq("id", job).maybeSingle();
    const row = data as { id: string; title: string } | null;
    if (row) return { type: "job", id: row.id, title: row.title, href: `/jobs/${row.id}` };
  }
  if (event && UUID.test(event)) {
    const { data } = await supabase.from("announcements").select("id, title").eq("id", event).maybeSingle();
    const row = data as { id: string; title: string } | null;
    if (row) return { type: "announcement", id: row.id, title: row.title, href: "/news" };
  }
  if (path && UUID.test(path)) {
    const { data } = await supabase.from("career_paths").select("id, name, slug").eq("id", path).maybeSingle();
    const row = data as { id: string; name: string; slug: string } | null;
    if (row) return { type: "career_path", id: row.id, title: row.name, href: `/jobs?path=${encodeURIComponent(row.slug)}` };
  }
  return null;
}

/** This page's own URL (only the params we understand), for "sign in and come back". */
function selfPath(params: Params): string {
  const q = new URLSearchParams();
  for (const key of ["job", "event", "path"] as const) {
    const v = one(params[key]);
    if (v && UUID.test(v)) q.set(key, v);
  }
  const kind = one(params.kind);
  if (isFeedbackKind(kind)) q.set("kind", kind);
  const from = fromPath(params);
  if (from) q.set("from", from);
  const s = q.toString();
  return s ? `/feedback?${s}` : "/feedback";
}

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, user, userName, isAdmin } = await getSession();
  const email = SITE.contactEmail;

  if (!user) {
    return (
      <>
        <Navbar user={null} isAdmin={false} userName="" />
        <main id="main" className="wrap wrap-form">
          <div className="page-head">
            <span className="eyebrow">Feedback</span>
            <h1 className="title-lg">Spotted a problem or have an idea?</h1>
            <p className="lede">Please sign in to tell us, so we can let you know what happens next.</p>
          </div>
          <div className="card stack-sm">
            <Link href={`/login?next=${encodeURIComponent(selfPath(params))}`} className="btn btn-action btn-block">
              Sign in
            </Link>
            <p className="small ink-2" style={{ textAlign: "center" }}>
              or email <a href={`mailto:${email}`}>{email}</a>
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const target = await findTarget(supabase, params);
  const kindParam = one(params.kind);
  const initialKind: FeedbackKind | null = isFeedbackKind(kindParam) ? kindParam : null;

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-form">
        <FeedbackForm target={target} initialKind={initialKind} from={fromPath(params)} />
      </main>
      <Footer />
    </>
  );
}
