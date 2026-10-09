"use client";

import { useEffect, useState } from "react";

// One toast per page. Any community component calls `toast("…")`; the page
// renders <ToastHost /> once. Living outside the calling component means the
// message survives that component unmounting after router.refresh().

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

export function toast(message: string) {
  listeners.forEach((l) => l(message));
}

export function ToastHost() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listener: Listener = (m) => {
      setMessage(m);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), 2800);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // The live region is always in the DOM so screen readers announce changes.
  return (
    <div role="status" aria-live="polite">
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
