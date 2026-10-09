"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FigureMark } from "@/components/ui/YPCMark";
import { firstName } from "@/lib/utils";

interface NavbarProps {
  user?: { id: string; email?: string } | null;
  isAdmin?: boolean;
  userName?: string;
}

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="LP9 YPC home">
      <FigureMark size={34} />
      <span className="logo-text">
        YPC
        <small>LAGOS PROVINCE 9</small>
      </span>
    </Link>
  );
}

export default function Navbar({ user, isAdmin, userName }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const links = [
    { href: "/jobs", label: "Jobs" },
    { href: "/community", label: "Community" },
    { href: "/news", label: "News & events" },
    { href: "/about", label: "About" },
    ...(user ? [{ href: "/dashboard", label: "My dashboard" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  const current = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" : undefined;

  return (
    <header className="nav">
      <div className="wrap nav-row">
        <Logo />

        <nav className="nav-links" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)}>{l.label}</Link>
          ))}
        </nav>

        <div className="nav-cta">
          {user ? (
            <>
              <span className="small ink-2">Hi, {firstName(userName)}</span>
              <button onClick={signOut} className="btn btn-ghost btn-sm">Sign out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
              <Link href="/register" className="btn btn-solid btn-sm">Join YPC</Link>
            </>
          )}
        </div>

        <button
          className="icon-btn nav-burger"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <nav id="mobile-menu" className="wrap nav-menu" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)} onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
          {user ? (
            <button onClick={signOut}><LogOut size={18} aria-hidden="true" /> Sign out</button>
          ) : (
            <>
              <Link href="/login" onClick={() => setOpen(false)}>Sign in</Link>
              <Link href="/register" className="btn btn-solid btn-block" onClick={() => setOpen(false)}>Join YPC</Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}
