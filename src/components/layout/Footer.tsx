import Link from "next/link";
import { FigureMark } from "@/components/ui/YPCMark";
import { MISSION, SITE } from "@/content/site";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="row" style={{ color: "#fff", marginBottom: 12 }}>
              <FigureMark size={30} color="var(--citrus)" />
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 18 }}>LP9 YPC</span>
            </div>
            <p style={{ maxWidth: "38ch" }}>{MISSION}</p>
          </div>
          <div>
            <h2>Explore</h2>
            <ul>
              <li><Link href="/jobs">Jobs board</Link></li>
              <li><Link href="/register">Join YPC</Link></li>
              <li><Link href="/about">About YPC</Link></li>
              <li><Link href="/about#faq">FAQs</Link></li>
            </ul>
          </div>
          <div>
            <h2>Support</h2>
            <ul>
              <li><a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a></li>
              <li><Link href="/about#privacy">Privacy &amp; data</Link></li>
              <li><Link href="/login">Member sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} LP9 YPC · A ministry of {SITE.parent}</span>
        </div>
      </div>
    </footer>
  );
}
