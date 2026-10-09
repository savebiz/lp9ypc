import {
  BookOpen,
  Church,
  Dumbbell,
  HandHeart,
  HeartPulse,
  MessageCircle,
  Music,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PathIcon } from "@/components/ui/icons";
import type { Community } from "@/types";

// Interest communities store a lucide key in `icon`; career communities store
// their career-path slug (rendered with the shared PathIcon set).
const INTEREST_ICONS: Record<string, LucideIcon> = {
  "message-circle": MessageCircle,
  church: Church,
  dumbbell: Dumbbell,
  music: Music,
  "hand-heart": HandHeart,
  "heart-pulse": HeartPulse,
  "book-open": BookOpen,
};

export function CommunityIcon({
  community,
  size = 22,
  className,
}: {
  community: Pick<Community, "kind" | "icon">;
  size?: number;
  className?: string;
}) {
  if (community.kind === "career") return <PathIcon slug={community.icon} size={size} className={className} />;
  const Icon = INTEREST_ICONS[community.icon] ?? Users;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
