import Link from "next/link";
import { MessagesSquare, Users } from "lucide-react";
import { CommunityIcon } from "./CommunityIcon";
import JoinButton from "./JoinButton";
import { plural } from "./time";
import styles from "./community.module.css";
import type { Community, CommunityOverview } from "@/types";

interface Props {
  community: Pick<Community, "id" | "slug" | "name" | "description" | "kind" | "icon">;
  overview?: CommunityOverview;
  userId: string | null;
  joined: boolean;
  isManager: boolean;
}

export default function CommunityCard({ community, overview, userId, joined, isManager }: Props) {
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <span className="icon-tile">
          <CommunityIcon community={community} />
        </span>
        <div>
          <h3 className={styles.cardName}>
            <Link href={`/community/${community.slug}`} className={styles.stretched}>
              {community.name}
            </Link>
          </h3>
          {community.description && <p className={styles.cardDesc}>{community.description}</p>}
        </div>
      </div>

      <div className={styles.cardFoot}>
        {overview ? (
          <p className={styles.counts}>
            <span><Users size={15} aria-hidden="true" /> {plural(overview.member_count, "member")}</span>
            <span><MessagesSquare size={15} aria-hidden="true" /> {plural(overview.thread_count, "discussion")}</span>
          </p>
        ) : (
          <span />
        )}
        <JoinButton
          communityId={community.id}
          slug={community.slug}
          name={community.name}
          userId={userId}
          initialJoined={joined}
          isManager={isManager}
        />
      </div>
    </article>
  );
}
