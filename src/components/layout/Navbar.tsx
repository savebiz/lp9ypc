"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FigureMark } from "@/components/ui/YPCMark";
import { cn } from "@/lib/utils";

interface NavbarProps {
  user?: { id: string; email?: string } | null;
  isAdmin?: boolean;
  userName?: string;
}

export default function Navbar({ user, isAdmin, userName }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const onPage = (p: string) => pathname === p;
  const initials = userName ? userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";
  const firstName = userName?.split(" ")[0] ?? "Member";

  return (
    <nav className="top">
      <div className="wrap nav-row">
        {/* Logo */}
        <Link href="/" className="logo">
          <FigureMark size={36} color="#1936FF" />
          <span style={{ fontSize: 17, lineHeight: 1.05 }}>
            YPC<br />
            <span style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".08em", color: "#666" }}>LAGOS PROVINCE 9</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="nav-links">
          <Link href="/jobs" className={onPage("/jobs") ? "on" : ""}>Jobs</Link>
          <Link href="/about" className={onPage("/about") ? "on" : ""}>About</Link>
          {user && <Link href="/dashboard" className={onPage("/dashboard") ? "on" : ""}>Dashboard</Link>}
          {isAdmin && <Link href="/admin" className={onPage("/admin") ? "on" : ""}>Admin</Link>}
        </div>

        {/* Desktop CTA */}
        <div className="nav-cta">
          {user ? (
            <>
              <button onClick={handleSignOut} className="btn btn-ghost" style={{ padding: "10px 18px", fontSize: 14 }}>
                Sign out
              </button>
              <Link href="/dashboard" className="btn btn-accent" style={{ padding: "10px 18px", fontSize: 14, gap: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, background: "var(--ink)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </span>
                {firstName}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost" style={{ padding: "10px 18px", fontSize: 14 }}>Sign in</Link>
              <Link href="/register" className="btn btn-accent">
                Join free in 2 mins
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></svg>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="nav-hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{ borderTop: "1px solid var(--line)", background: "var(--paper)", padding: "12px 20px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[{ href: "/jobs", label: "Jobs" }, { href: "/about", label: "About" }].map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}
                style={{ padding: "12px 16px", borderRadius: 12, fontWeight: 500, fontSize: 15, background: pathname === href ? "var(--cream)" : "transparent" }}>
                {label}
              </Link>
            ))}
            {user && <Link href="/dashboard" onClick={() => setMobileOpen(false)} style={{ padding: "12px 16px", borderRadius: 12, fontWeight: 500, fontSize: 15, background: pathname === "/dashboard" ? "var(--cream)" : "transparent" }}>Dashboard</Link>}
            {isAdmin && <Link href="/admin" onClick={() => setMobileOpen(false)} style={{ padding: "12px 16px", borderRadius: 12, fontWeight: 500, fontSize: 15 }}>Admin</Link>}
            <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />
            {user ? (
              <button onClick={() => { setMobileOpen(false); handleSignOut(); }}
                style={{ padding: "12px 16px", borderRadius: 12, fontWeight: 500, fontSize: 15, textAlign: "left", color: "#666" }}>
                Sign out
              </button>
            ) : (
              <>
                <Link href="/login" onClick={() => setMobileOpen(false)} style={{ padding: "12px 16px", borderRadius: 12, fontWeight: 500, fontSize: 15 }}>Sign in</Link>
                <Link href="/register" onClick={() => setMobileOpen(false)} className="btn btn-accent" style={{ marginTop: 8, justifyContent: "center" }}>
                  Join free in 2 mins
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
