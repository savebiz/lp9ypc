"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Lock, Pencil, Pin, PinOff, Quote, Reply as ReplyIcon, ShieldAlert, ShieldCheck, Trash2, Unlock, EyeOff } from "lucide-react";
import ConfirmPanel from "./ConfirmPanel";
import EditForm, { type SavedEdit } from "./EditForm";
import JoinButton from "./JoinButton";
import LikeButton from "./LikeButton";
import PostMenu, { type MenuItem } from "./PostMenu";
import ReplyComposer, { type PostedReply } from "./ReplyComposer";
import { ReportForm } from "./ReportButton";
import ShareButton from "./ShareButton";
import {
  AuthorNote,
  CheckingChip,
  EditedMark,
  LockedBadge,
  ModerationNote,
  PinnedBadge,
  PostBody,
  RoleBadge,
  StatusBadge,
  TimeAgo,
} from "./PostBits";
import { moderate, type ModerateAction } from "./api";
import { isAfter, readSeen, writeSeen } from "./seen";
import { plural } from "./time";
import { toast } from "./Toast";
import { usePendingPoll } from "./usePendingPoll";
import styles from "./community.module.css";
import type { ModerationNotes } from "@/lib/moderation-notes";
import type { PostStatus } from "@/types";

// ── Data the server page passes in (plain, serialisable) ──────────────────

export interface ViewPost {
  id: string;
  authorId: string;
  body: string;
  status: PostStatus;
  needsReview: boolean;
  likeCount: number;
  editedAt: string | null;
  createdAt: string;
  /** Replies only. */
  parentId: string | null;
  depth: number;
  /** Set locally when a reply to a depth-2 reply was re-parented. */
  replyingTo?: string;
}

export interface ViewThread extends ViewPost {
  title: string;
  isPinned: boolean;
  isLocked: boolean;
}

interface Props {
  community: { id: string; slug: string; name: string };
  thread: ViewThread;
  replies: ViewPost[];
  names: Record<string, string>;
  badges: Record<string, "admin" | "manager">;
  liked: string[];
  reported: string[];
  /** Moderators only: reason/categories/who decided, by post id. */
  notes: Record<string, ModerationNotes>;
  viewer: { id: string; isMember: boolean; canModerate: boolean };
  repliesFailed: boolean;
  limitHit: boolean;
}

const VISIBLE_CHILDREN = 3;
const QUOTE_CHARS = 280;

/** First 280 characters, each line prefixed "> ", "…" if cut, then a blank line. */
export function quoteText(body: string): string {
  const chars = Array.from(body.trim());
  const cut = chars.length > QUOTE_CHARS;
  const text = chars.slice(0, QUOTE_CHARS).join("").trimEnd() + (cut ? "…" : "");
  return `${text.split("\n").map((l) => `> ${l}`).join("\n")}\n\n`;
}

// ── Reply tree ─────────────────────────────────────────────────────────────

interface TreeNode {
  id: string;
  /** null = a deleted reply that still has replies (D8 stub). */
  post: ViewPost | null;
  createdAt: string;
  children: TreeNode[];
}

function buildTree(replies: ViewPost[]): TreeNode[] {
  const sorted = [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nodes = new Map<string, TreeNode>();
  for (const r of sorted) nodes.set(r.id, { id: r.id, post: r, createdAt: r.createdAt, children: [] });
  const roots: TreeNode[] = [];
  for (const r of sorted) {
    const node = nodes.get(r.id)!;
    if (!r.parentId) {
      roots.push(node);
      continue;
    }
    let parent = nodes.get(r.parentId);
    if (!parent) {
      parent = { id: r.parentId, post: null, createdAt: r.createdAt, children: [] };
      nodes.set(r.parentId, parent);
      roots.push(parent);
    }
    parent.children.push(node);
  }
  return roots.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

// ── Shared context for every post card ────────────────────────────────────

type Panel = null | "delete" | "report" | { action: ModerateAction };

interface Ctx {
  community: Props["community"];
  thread: ViewThread;
  viewer: Props["viewer"];
  canReply: boolean;
  nameOf: (id: string) => string;
  badges: Props["badges"];
  notes: Props["notes"];
  liked: Set<string>;
  reported: Set<string>;
  lastSeen: string | null;
  composer: { target: string; prefill?: string; seq: number } | null;
  editing: string | null;
  focusId: string | null;
  highlight: string | null;
  drafts: React.RefObject<Record<string, string>>;
  openComposer: (target: string, prefill?: string) => void;
  closeComposer: () => void;
  setEditing: (id: string | null) => void;
  onReplyPosted: (target: ViewPost | null, reply: PostedReply) => void;
  onStatus: (kind: "thread" | "reply", id: string, status: PostStatus) => void;
  onEdited: (kind: "thread" | "reply", id: string, edit: SavedEdit) => void;
  onDeleted: (kind: "thread" | "reply", id: string) => void;
  onReported: (id: string) => void;
  clearFocus: () => void;
}

export default function ThreadView(props: Props) {
  const router = useRouter();
  const { community, viewer } = props;

  // Server data, replaced whenever the page re-renders (router.refresh).
  const [src, setSrc] = useState({ thread: props.thread, replies: props.replies, liked: props.liked, reported: props.reported });
  const [thread, setThread] = useState(props.thread);
  const [replies, setReplies] = useState(props.replies);
  const [reported, setReported] = useState(() => new Set(props.reported));
  if (src.thread !== props.thread || src.replies !== props.replies || src.liked !== props.liked || src.reported !== props.reported) {
    setSrc({ thread: props.thread, replies: props.replies, liked: props.liked, reported: props.reported });
    setThread(props.thread);
    setReplies(props.replies);
    setReported(new Set(props.reported));
  }
  const liked = useMemo(() => new Set(props.liked), [props.liked]);

  const [composer, setComposer] = useState<Ctx["composer"]>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const drafts = useRef<Record<string, string>>({});

  const nameOf = useCallback((id: string) => props.names[id] || "Member", [props.names]);
  const canReply =
    viewer.isMember && (thread.status === "visible" || viewer.canModerate) && (!thread.isLocked || viewer.canModerate);

  // "New since last visit": read the old time, then remember this visit.
  useEffect(() => {
    setLastSeen(readSeen(thread.id));
    writeSeen(thread.id);
  }, [thread.id]);

  // #reply-{id}: open its branch, scroll to it and highlight it briefly.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash.startsWith("reply-")) return;
    const id = hash.slice(6);
    const byId = new Map(props.replies.map((r) => [r.id, r]));
    const ancestors: string[] = [];
    let cur = byId.get(id);
    while (cur?.parentId) {
      ancestors.push(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    setCollapsed((s) => new Set([...s].filter((x) => !ancestors.includes(x))));
    setExpanded((s) => new Set([...s, ...ancestors]));
    const raf = requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ block: "center" });
      setHighlight(id);
    });
    const timer = setTimeout(() => setHighlight(null), 2400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePost = useCallback((kind: "thread" | "reply", id: string, patch: Partial<ViewThread>) => {
    if (kind === "thread") setThread((t) => (t.id === id ? { ...t, ...patch } : t));
    else setReplies((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const ctx: Ctx = {
    community,
    thread,
    viewer,
    canReply,
    nameOf,
    badges: props.badges,
    notes: props.notes,
    liked,
    reported,
    lastSeen,
    composer,
    editing,
    focusId,
    highlight,
    drafts,
    openComposer: (target, prefill) => {
      if (prefill !== undefined) drafts.current[target] = prefill;
      setComposer((c) => ({ target, prefill, seq: (c?.seq ?? 0) + 1 }));
    },
    closeComposer: () => setComposer(null),
    setEditing,
    onReplyPosted: (target, reply) => {
      let parentId: string | null = null;
      let depth = 0;
      let replyingTo: string | undefined;
      if (target) {
        if (target.depth >= 2) {
          parentId = target.parentId;
          depth = 2;
          replyingTo = nameOf(target.authorId);
        } else {
          parentId = target.id;
          depth = target.depth + 1;
        }
      }
      const now = new Date().toISOString();
      setReplies((rs) => [
        ...rs,
        {
          id: reply.id,
          authorId: viewer.id,
          body: reply.body,
          status: reply.status,
          needsReview: false,
          likeCount: 0,
          editedAt: null,
          createdAt: now,
          parentId,
          depth,
          replyingTo,
        },
      ]);
      if (parentId) {
        const open = parentId;
        setCollapsed((s) => new Set([...s].filter((x) => x !== open)));
        setExpanded((s) => new Set([...s, open]));
      }
      setComposer(null);
      setFocusId(reply.id);
      writeSeen(thread.id);
    },
    onStatus: (kind, id, status) => {
      updatePost(kind, id, { status });
      if (status === "visible") {
        toast("Your post is live.");
        writeSeen(thread.id);
      }
    },
    onEdited: (kind, id, edit) => {
      updatePost(kind, id, {
        body: edit.body,
        ...(edit.title !== undefined ? { title: edit.title } : {}),
        editedAt: edit.editedAt,
        status: edit.status,
        needsReview: false,
      });
      setEditing(null);
      setFocusId(id);
    },
    onDeleted: (kind, id) => {
      if (kind === "thread") {
        router.push(`/community/${community.slug}`);
        setTimeout(() => toast("Deleted."), 700);
        return;
      }
      setReplies((rs) => rs.filter((r) => r.id !== id));
      toast("Deleted.");
      router.refresh();
    },
    onReported: (id) => setReported((s) => new Set([...s, id])),
    clearFocus: () => setFocusId(null),
  };

  const tree = useMemo(() => buildTree(replies), [replies]);
  const visibleCount = replies.filter((r) => r.status === "visible").length;

  const toggleCollapse = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderNodes = (nodes: TreeNode[], parent: TreeNode | null): React.ReactNode => {
    const limit = parent && !expanded.has(parent.id) ? VISIBLE_CHILDREN : nodes.length;
    const shown = nodes.slice(0, limit);
    const more = nodes.length - shown.length;
    return (
      <>
        {shown.map((node) => {
          const descendants = countDescendants(node);
          const isCollapsed = collapsed.has(node.id);
          return (
            <li key={node.id}>
              {node.post ? (
                <PostCard
                  kind="reply"
                  post={node.post}
                  ctx={ctx}
                  descendants={descendants}
                  collapsed={isCollapsed}
                  onToggleCollapse={() => toggleCollapse(node.id)}
                />
              ) : (
                <DeletedStub id={node.id} descendants={descendants} collapsed={isCollapsed} onToggleCollapse={() => toggleCollapse(node.id)} />
              )}
              {node.children.length > 0 && !isCollapsed && (
                <ol className={styles.children} aria-label="Replies">
                  {renderNodes(node.children, node)}
                </ol>
              )}
            </li>
          );
        })}
        {more > 0 && parent && (
          <li>
            <button
              type="button"
              className={`btn-link ${styles.textBtn}`}
              onClick={() => setExpanded((s) => new Set([...s, parent.id]))}
            >
              Show {plural(more, "more reply", "more replies")}
            </button>
          </li>
        )}
      </>
    );
  };

  return (
    <>
      <PostCard kind="thread" post={thread} ctx={ctx} descendants={0} collapsed={false} onToggleCollapse={() => undefined} />

      <section className={styles.section} aria-labelledby="replies-h">
        <div className={styles.sectionHead}>
          <h2 id="replies-h">{plural(visibleCount, "reply", "replies")}</h2>
        </div>
        {props.repliesFailed ? (
          <div className="empty" role="status">We couldn&apos;t load the replies right now. Please try again in a moment.</div>
        ) : replies.length === 0 ? (
          <p className="ink-2">{canReply ? "No replies yet. Be the first to reply." : "No replies yet."}</p>
        ) : (
          <ol className={styles.replies}>{renderNodes(tree, null)}</ol>
        )}
        {props.limitHit && <p className="small ink-2" style={{ marginTop: 12 }}>Showing the first 300 replies.</p>}
      </section>

      <div className={styles.section} style={{ marginTop: 24 }}>
        {canReply ? (
          <ReplyComposer
            threadId={thread.id}
            note={thread.isLocked ? "This discussion is locked for members. As a moderator you can still reply." : undefined}
            onPosted={(reply) => ctx.onReplyPosted(null, reply)}
          />
        ) : thread.isLocked ? (
          <p className="card card-cream ink-2 row" style={{ alignItems: "flex-start" }}>
            <Lock size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
            <span>This discussion is locked. You can still read it, but new replies are closed.</span>
          </p>
        ) : thread.status !== "visible" ? (
          <p className="card card-cream ink-2">
            {thread.status === "removed"
              ? "This discussion has been removed, so replies are closed."
              : "Replies open once this discussion has been approved."}
          </p>
        ) : (
          <div className={`card card-cream ${styles.ctaCard}`}>
            <p>
              <strong>Join to reply.</strong>{" "}
              <span className="ink-2">Join {community.name} to reply here and start your own discussions.</span>
            </p>
            <div>
              <JoinButton
                communityId={community.id}
                slug={community.slug}
                name={community.name}
                userId={viewer.id}
                initialJoined={false}
                variant="page"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── One post (the thread lead or a reply) ──────────────────────────────────

interface CardProps {
  kind: "thread" | "reply";
  post: ViewPost | ViewThread;
  ctx: Ctx;
  descendants: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const MOD_SUCCESS: Partial<Record<ModerateAction, string>> = {
  restore: "Published — members can see it now.",
  hold: "Held — hidden from members for now.",
  remove: "Removed.",
  pin: "Pinned to the top.",
  unpin: "Unpinned.",
  lock: "Locked — no new replies.",
  unlock: "Unlocked — members can reply again.",
};

function PostCard({ kind, post, ctx, descendants, collapsed, onToggleCollapse }: CardProps) {
  const router = useRouter();
  const isLead = kind === "thread";
  const lead = isLead ? (post as ViewThread) : null;
  const { viewer, thread, community } = ctx;
  const own = post.authorId === viewer.id;
  const visible = post.status === "visible";
  const threadVisible = thread.status === "visible";
  const name = ctx.nameOf(post.authorId);
  const editing = ctx.editing === post.id;
  const composerOpen = ctx.composer?.target === post.id;
  const noun = isLead ? "discussion" : "reply";

  const [panel, setPanel] = useState<Panel>(null);
  const articleRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const replyBtnRef = useRef<HTMLButtonElement>(null);

  const phase = usePendingPoll(
    kind,
    post.id,
    own && post.status === "pending",
    (s) => ctx.onStatus(kind, post.id, s),
    post.editedAt,
  );

  const { focusId, clearFocus } = ctx;
  useEffect(() => {
    if (focusId !== post.id) return;
    articleRef.current?.focus({ preventScroll: true });
    articleRef.current?.scrollIntoView({ block: "nearest" });
    clearFocus();
  }, [focusId, clearFocus, post.id]);

  const closePanel = () => {
    setPanel(null);
    requestAnimationFrame(() => menuBtnRef.current?.focus());
  };

  async function runModeration(action: ModerateAction, reason = ""): Promise<string | null> {
    const res = await moderate({ action, targetType: kind, targetId: post.id, ...(reason ? { reason } : {}) });
    if (!res.ok) return res.error;
    setPanel(null);
    toast(MOD_SUCCESS[action] ?? "Done.");
    router.refresh();
    return null;
  }

  // ⋯ menu, in the spec's order, only what applies.
  const items: MenuItem[] = [];
  if (visible && ctx.canReply && !editing) {
    items.push({ key: "quote", label: "Quote", icon: <Quote size={18} aria-hidden="true" />, onSelect: () => ctx.openComposer(post.id, quoteText(post.body)) });
  }
  const lockedForMe = !isLead && thread.isLocked && !viewer.canModerate;
  const firstCheck = post.status === "pending" && !post.editedAt; // the server refuses edits until the first check is done
  if (own && post.status !== "removed" && !editing && !lockedForMe && !firstCheck) {
    items.push({ key: "edit", label: "Edit", icon: <Pencil size={18} aria-hidden="true" />, onSelect: () => ctx.setEditing(post.id) });
  }
  if (own && post.status !== "removed") {
    items.push({ key: "delete", label: "Delete", icon: <Trash2 size={18} aria-hidden="true" />, onSelect: () => setPanel("delete"), danger: true });
  }
  if (!own && !viewer.canModerate && visible && !ctx.reported.has(post.id)) {
    items.push({ key: "report", label: "Report", icon: <Flag size={18} aria-hidden="true" />, onSelect: () => setPanel("report") });
  }
  if (viewer.canModerate) {
    const immediate = (action: ModerateAction) => async () => {
      const err = await runModeration(action);
      if (err) toast(err);
    };
    if (post.status !== "visible") {
      items.push({
        key: "restore",
        label: post.status === "removed" ? "Restore" : "Publish",
        icon: <ShieldCheck size={18} aria-hidden="true" />,
        onSelect: immediate("restore"),
      });
    }
    if (post.status === "visible") {
      items.push({ key: "hold", label: "Hold for review", icon: <ShieldAlert size={18} aria-hidden="true" />, onSelect: () => setPanel({ action: "hold" }) });
    }
    if (post.status !== "removed") {
      items.push({ key: "remove", label: "Remove", icon: <EyeOff size={18} aria-hidden="true" />, onSelect: () => setPanel({ action: "remove" }), danger: true });
    }
    if (lead) {
      items.push(
        lead.isPinned
          ? { key: "unpin", label: "Unpin", icon: <PinOff size={18} aria-hidden="true" />, onSelect: immediate("unpin") }
          : { key: "pin", label: "Pin to top", icon: <Pin size={18} aria-hidden="true" />, onSelect: immediate("pin") },
        lead.isLocked
          ? { key: "unlock", label: "Unlock replies", icon: <Unlock size={18} aria-hidden="true" />, onSelect: immediate("unlock") }
          : { key: "lock", label: "Lock replies", icon: <Lock size={18} aria-hidden="true" />, onSelect: () => setPanel({ action: "lock" }) },
      );
    }
  }

  // Status chip (only the author and moderators ever see non-visible posts).
  const chip =
    post.status === "pending" ? <CheckingChip pulse={own && phase === "checking"} /> : <StatusBadge status={post.status} />;

  const note = viewer.canModerate ? (
    <ModerationNote
      post={{
        status: post.status,
        needs_review: post.needsReview,
        ...(ctx.notes[post.id] ?? { moderation_reason: null, moderation_categories: [], moderated_by: null }),
      }}
    />
  ) : own && post.status === "pending" ? (
    <p className={styles.note} role="status">
      {phase === "checking"
        ? "Posted. We're doing a quick check before others can see it."
        : "Still checking — it'll appear for others soon."}
    </p>
  ) : own ? (
    <AuthorNote status={post.status} kind={kind} />
  ) : null;

  const isNew = !isLead && !own && isAfter(post.createdAt, ctx.lastSeen);
  const showBadges = isLead ? lead!.isPinned || lead!.isLocked || !visible : !visible;

  const likeMode: "can" | "own" | "join" = own ? "own" : viewer.isMember ? "can" : "join";
  const showLike = visible && threadVisible;
  const showReply = visible && ctx.canReply;
  const showShare = visible && threadVisible;

  const meta = (
    <p className={styles.postMeta} style={isLead ? undefined : { marginTop: 0 }}>
      <span className={`${styles.metaItem} ${styles.author}`}>
        {name}
        {own ? " (you)" : ""}
        <RoleBadge role={ctx.badges[post.authorId]} />
      </span>
      <span className={styles.metaItem}>
        <TimeAgo date={post.createdAt} />
      </span>
      <EditedMark editedAt={post.editedAt} />
      {isNew && <span className={styles.newLabel}>New</span>}
    </p>
  );

  return (
    <article
      ref={articleRef}
      id={isLead ? undefined : `reply-${post.id}`}
      tabIndex={-1}
      className={[
        styles.post,
        isLead ? styles.postLead : "",
        // Your own post waiting for its check keeps the normal card (the chip and note say enough).
        !visible && !(own && post.status === "pending") ? styles.postHidden : "",
        ctx.highlight === post.id ? styles.highlight : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={isLead ? "thread-title" : undefined}
      aria-label={isLead ? undefined : `Reply from ${name}`}
    >
      {/* ⋯ sits top-right of the card, so Like · Reply · Share stay on one row at 320px. */}
      <div className={styles.cardHead}>
        <div className={styles.cardHeadMain}>
          {showBadges && (
            <div className={styles.badges}>
              {lead?.isPinned && <PinnedBadge />}
              {lead?.isLocked && <LockedBadge />}
              {chip}
            </div>
          )}
          {lead ? (
            <h1 id="thread-title" className={editing ? "sr-only" : styles.postTitle}>
              {lead.title}
            </h1>
          ) : (
            meta
          )}
        </div>
        <PostMenu items={items} buttonRef={menuBtnRef} />
      </div>
      {lead && meta}

      {note}

      {post.replyingTo && !editing && <p className={styles.replyingLine}>Replying to {post.replyingTo}</p>}

      {editing ? (
        <EditForm
          kind={kind}
          id={post.id}
          initialTitle={lead?.title}
          initialBody={post.body}
          onCancel={() => {
            ctx.setEditing(null);
            requestAnimationFrame(() => menuBtnRef.current?.focus());
          }}
          onSaved={(edit) => ctx.onEdited(kind, post.id, edit)}
        />
      ) : (
        <PostBody text={post.body} className={isLead ? undefined : styles.replyBody} />
      )}

      {!editing && (
        <div className={styles.actions}>
          {showLike && (
            <LikeButton
              kind={kind}
              id={post.id}
              count={post.likeCount}
              liked={ctx.liked.has(post.id)}
              mode={likeMode}
              userId={viewer.id}
              communityName={community.name}
            />
          )}
          {showReply && (
            <button
              ref={replyBtnRef}
              type="button"
              className={styles.actionBtn}
              aria-expanded={composerOpen}
              onClick={() => (composerOpen ? ctx.closeComposer() : ctx.openComposer(post.id))}
            >
              <ReplyIcon size={18} aria-hidden="true" /> Reply
            </button>
          )}
          {showShare && (
            <ShareButton
              slug={community.slug}
              threadId={thread.id}
              replyId={isLead ? undefined : post.id}
              threadTitle={thread.title}
              communityName={community.name}
            />
          )}
          {descendants > 0 && (
            <button type="button" className={`btn-link ${styles.textBtn}`} aria-expanded={!collapsed} onClick={onToggleCollapse}>
              {collapsed ? `Show replies (${descendants})` : `Hide replies (${descendants})`}
            </button>
          )}
        </div>
      )}

      {panel === "delete" && (
        <ConfirmPanel
          title={isLead ? "Delete this discussion?" : "Delete this reply?"}
          body={
            isLead
              ? "It will be removed for everyone, along with its replies. This can't be undone."
              : "It will be removed for everyone. Replies to it will stay."
          }
          confirmLabel="Delete"
          cancelLabel="Keep it"
          danger
          defaultFocus="cancel"
          onCancel={closePanel}
          onConfirm={async () => {
            const res = await moderate({ action: "delete_own", targetType: kind, targetId: post.id });
            if (!res.ok) return res.error;
            setPanel(null);
            ctx.onDeleted(kind, post.id);
            return null;
          }}
        />
      )}
      {panel === "report" && (
        <ReportForm
          targetType={kind}
          targetId={post.id}
          communityId={community.id}
          userId={viewer.id}
          onCancel={closePanel}
          onDone={() => {
            ctx.onReported(post.id);
            closePanel();
          }}
        />
      )}
      {panel && typeof panel === "object" && (
        <ConfirmPanel
          title={
            panel.action === "lock" ? "Lock this discussion?" : panel.action === "hold" ? `Hold this ${noun}?` : `Remove this ${noun}?`
          }
          body={
            panel.action === "lock"
              ? "Members can still read it, but new replies will be closed."
              : panel.action === "hold"
                ? "It will be hidden from members until a moderator restores it."
                : "Members won't see it any more. The author and moderators still can, and a moderator can restore it."
          }
          confirmLabel={panel.action === "lock" ? "Lock" : panel.action === "hold" ? "Hold" : "Remove"}
          danger={panel.action === "remove"}
          askReason
          onCancel={closePanel}
          onConfirm={(reason) => runModeration(panel.action, reason)}
        />
      )}

      {composerOpen && (
        <ReplyComposer
          key={ctx.composer?.seq}
          threadId={thread.id}
          parentId={isLead ? undefined : post.id}
          replyingTo={name}
          initialText={ctx.composer?.prefill ?? ctx.drafts.current[post.id] ?? ""}
          onDraftChange={(text) => {
            ctx.drafts.current[post.id] = text;
          }}
          onCancel={() => {
            ctx.closeComposer();
            requestAnimationFrame(() => (replyBtnRef.current ?? menuBtnRef.current)?.focus());
          }}
          onPosted={(reply) => ctx.onReplyPosted(isLead ? null : post, reply)}
        />
      )}
    </article>
  );
}

/** D8: a deleted reply that still has replies under it. No action bar. */
function DeletedStub({
  id,
  descendants,
  collapsed,
  onToggleCollapse,
}: {
  id: string;
  descendants: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <div id={`reply-${id}`} className={`${styles.post} ${styles.postStub}`}>
      <p className={styles.postMeta} style={{ marginTop: 0 }}>Deleted reply</p>
      <p className={styles.stubBody}>This reply was deleted.</p>
      {descendants > 0 && (
        <div className={styles.actions}>
          <button type="button" className={`btn-link ${styles.textBtn}`} aria-expanded={!collapsed} onClick={onToggleCollapse}>
            {collapsed ? `Show replies (${descendants})` : `Hide replies (${descendants})`}
          </button>
        </div>
      )}
    </div>
  );
}
