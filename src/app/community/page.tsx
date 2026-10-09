import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CommunityCard from "@/components/community/CommunityCard";
import { CommunityIcon } from "@/components/community/CommunityIcon";
import { ToastHost } from "@/components/community/Toast";
import { plural } from "@/components/community/time";
import styles from "@/components/community/community.module.css";
import { getSession } from "@/lib/session";
import type { Community, CommunityMember, CommunityOverview } from "@/types";

export const metadata = { title: "Communities · LP9 YPC" };

type DirectoryCommunity = Pick<Community, "id" | "slug" | "name" | "description" | "kind" | "icon">;

export default async function CommunityDirectoryPage() {
  const { supabase, user, userName, isAdmin } = await getSession();

  const [communitiesRes, overviewRes, mineRes] = await Promise.all([
    supabase
      .from("communities")
      .select("id, slug, name, description, kind, icon")
      .eq("is_active", true)
      .order("name"),
    supabase.from("community_overview").select("community_id, member_count, thread_count, last_activity_at"),
    user
      ? supabase.from("community_members").select("community_id, role").eq("member_id", user.id)
      : Promise.resolve({ data: [] as Pick<CommunityMember, "community_id" | "role">[], error: null }),
  ]);

  const loadFailed = !!communitiesRes.error;
  const communities = (communitiesRes.data ?? []) as DirectoryCommunity[];
  const overview = new Map(
    ((overviewRes.data ?? []) as CommunityOverview[]).map((o) => [o.community_id, o]),
  );
  const myRoles = new Map(
    ((mineRes.data ?? []) as Pick<CommunityMember, "community_id" | "role">[]).map((m) => [m.community_id, m.role]),
  );

  const career = communities.filter((c) => c.kind === "career");
  const interest = communities.filter((c) => c.kind === "interest");
  const mine = communities.filter((c) => myRoles.has(c.id));
  const userId = user?.id ?? null;

  const grid = (list: DirectoryCommunity[]) => (
    <ul className={styles.grid}>
      {list.map((c) => (
        <li key={c.id}>
          <CommunityCard
            community={c}
            overview={overview.get(c.id)}
            userId={userId}
            joined={myRoles.has(c.id)}
            isManager={myRoles.get(c.id) === "manager"}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap" style={{ paddingBottom: 24 }}>
        <div className="page-head">
          <span className="eyebrow">Communities</span>
          <h1 className="title-lg">Find your people.</h1>
          <p className="lede">
            Join a career community to swap advice and opportunities, or an interest community to connect beyond work.
          </p>
        </div>

        {!user && (
          <section className={`card card-cream ${styles.ctaCard}`} aria-labelledby="cta-h">
            <h2 id="cta-h">Join YPC to take part</h2>
            <p className="ink-2">
              Anyone can browse the communities. Members can join them, read the discussions and start their own.
            </p>
            <div className={styles.ctaActions}>
              <Link href="/register" className="btn btn-action">Join YPC</Link>
              <Link href="/login?next=/community" className="btn btn-ghost">Sign in</Link>
            </div>
          </section>
        )}

        {loadFailed ? (
          <div className="empty" style={{ marginTop: 24 }} role="status">
            We couldn&apos;t load the communities right now. Please try again in a moment.
          </div>
        ) : communities.length === 0 ? (
          <div className="empty" style={{ marginTop: 24 }}>
            No communities yet. YPC coordinators are setting them up — check back soon.
          </div>
        ) : (
          <>
            {user && (
              <section className={styles.section} aria-labelledby="yours-h" style={{ marginTop: 8 }}>
                <div className={styles.sectionHead}>
                  <h2 id="yours-h">Your communities</h2>
                </div>
                {mine.length === 0 ? (
                  <p className="ink-2">
                    You haven&apos;t joined any communities yet. Pick one or two below — you can leave anytime.
                  </p>
                ) : (
                  <ul className={styles.yours}>
                    {mine.map((c) => {
                      const o = overview.get(c.id);
                      return (
                        <li key={c.id}>
                          <Link href={`/community/${c.slug}`} className={styles.yoursLink}>
                            <span className="icon-tile"><CommunityIcon community={c} /></span>
                            <span className={styles.yoursText}>
                              <span className={styles.yoursName}>{c.name}</span>
                              <span className="small muted">
                                {myRoles.get(c.id) === "manager" ? (
                                  <><ShieldCheck size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> You manage this · </>
                                ) : null}
                                {o ? plural(o.thread_count, "discussion") : "Open"}
                              </span>
                            </span>
                            <ChevronRight size={20} aria-hidden="true" className="muted" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {career.length > 0 && (
              <section className={styles.section} aria-labelledby="career-h">
                <div className={styles.sectionHead}>
                  <h2 id="career-h">Career communities</h2>
                  <p>One for each YPC career path — opportunities, advice and conversation with people in your field.</p>
                </div>
                {grid(career)}
              </section>
            )}

            {interest.length > 0 && (
              <section className={styles.section} aria-labelledby="interest-h">
                <div className={styles.sectionHead}>
                  <h2 id="interest-h">Interest communities</h2>
                  <p>Faith, fitness, the arts, giving back and more.</p>
                </div>
                {grid(interest)}
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
      <ToastHost />
    </>
  );
}
