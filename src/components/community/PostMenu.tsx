"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import styles from "./community.module.css";

export interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface Props {
  items: MenuItem[];
  /** The ⋯ button, so panels opened from the menu can return focus to it. */
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * The ⋯ "More actions" menu (community-feature-spec §3). Closes on Escape,
 * Tab and outside tap; focus returns to the ⋯ button. Arrow keys move
 * between items.
 */
export default function PostMenu({ items, buttonRef }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const itemEls = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  // Keep the menu on screen at 375px: open to the left when there's no room on the right.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setAlignRight(rect.left + 224 > window.innerWidth - 16);
  }, [open, buttonRef]);

  useEffect(() => {
    if (!open) return;
    itemEls()[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    const els = itemEls();
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div ref={wrapRef} className={styles.menuWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.actionBtn}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          role="menu"
          aria-label="More actions"
          className={`${styles.menu}${alignRight ? ` ${styles.menuRight}` : ""}`}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`${styles.menuItem}${item.danger ? ` ${styles.menuDanger}` : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
