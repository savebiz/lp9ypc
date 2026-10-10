"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Expand, X } from "lucide-react";
import styles from "./Flyer.module.css";

interface FlyerProps {
  src: string;
  alt: string;
  /** Title of the event/announcement, shown as the viewer's heading. */
  title: string;
  /**
   * "thumb": small fixed-size portrait thumbnail (landing page, dashboard).
   * "full": full-width image across the card (the /news page).
   */
  variant?: "thumb" | "full";
  className?: string;
}

/**
 * An event flyer. Tapping it opens the whole flyer in a modal dialog (native
 * <dialog>: Escape closes it, focus stays inside, and focus goes back to the
 * flyer button when it closes). Plain <img> on purpose: no remote-domain
 * config needed, lazy-loaded, with width/height so the page doesn't jump.
 */
export default function Flyer({ src, alt, title, variant = "thumb", className }: FlyerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Stop the page scrolling behind the open viewer.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${variant === "full" ? styles.full : styles.thumb}${className ? ` ${className}` : ""}`}
        onClick={show}
        aria-haspopup="dialog"
      >
        <img
          src={src}
          alt={alt}
          width={variant === "full" ? 800 : 160}
          height={variant === "full" ? 1000 : 200}
          loading="lazy"
          decoding="async"
          className={styles.img}
        />
        <span className="sr-only">(view the full flyer)</span>
        {variant === "full" && (
          <span className={styles.hint} aria-hidden="true">
            <Expand size={16} /> View flyer
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={headingId}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onClick={(e) => {
          // A tap on the dark backdrop (the dialog element itself) closes it.
          if (e.target === e.currentTarget) hide();
        }}
      >
        <div className={styles.panel}>
          <div className={styles.bar}>
            <h2 id={headingId} className={styles.heading}>{title}</h2>
            <button type="button" className={`icon-btn ${styles.close}`} onClick={hide} aria-label="Close flyer">
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.frame}>
            {open && <img src={src} alt={alt} className={styles.fullImg} decoding="async" />}
          </div>
          <a href={src} target="_blank" rel="noopener noreferrer" className={`btn-link ${styles.newTab}`}>
            Open image in a new tab <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </div>
      </dialog>
    </>
  );
}
