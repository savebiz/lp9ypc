import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { CommunityIcon } from "@/components/community/CommunityIcon";
import type { Community } from "@/types";
import styles from "./dashboard.module.css";

export interface MyCommunity {
  community: Community;
  role: "member" | "manager";
}

/** "Your communities" on the member dashboard. Server-rendered; no interactivity. */
export default function CommunitiesPanel({ communities }: { communities: MyCommunity[] }) {
  return (
    <section className="panel" aria-labelledby="communities-h">
      <div className="panel-head">
        <h2 id="communities-h">Your communities</h2>
        {communities.length > 0 && <Link href="/community" className="btn-link">Browse all</Link>}
      </div>
      {communities.length === 0 ? (
        <div className="stack-sm">
          <p className="ink-2">Join a community to swap advice, opportunities and encouragement with members who share your field or interests.</p>
          <div style={{ paddingTop: 8 }}>
            <Link href="/community" className="btn btn-solid btn-sm"><Users size={18} aria-hidden="true" /> Find your community</Link>
          </div>
        </div>
      ) : (
        <ul className={styles.communityList}>
          {communities.map(({ community: c, role }) => (
            <li key={c.id}>
              <Link href={`/community/${encodeURIComponent(c.slug)}`} className={styles.communityLink}>
                <span className="icon-tile" aria-hidden="true">
                  <CommunityIcon community={c} size={20} />
                </span>
                <span className={styles.communityName}>
                  {c.name}
                  {role === "manager" && <span className="status admin" style={{ marginLeft: 8 }}>Manager</span>}
                </span>
                <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
