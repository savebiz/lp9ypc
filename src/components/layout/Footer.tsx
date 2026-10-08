import Link from "next/link";
import { FigureMark } from "@/components/ui/YPCMark";

export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="logo" style={{ color: "#fff", marginBottom: 14 }}>
              <FigureMark size={32} color="var(--accent)" />
              <span style={{ fontSize: 17 }}>YPC <span style={{ opacity: .6, fontWeight: 400 }}>Lagos Province 9</span></span>
            </div>
            <p style={{ color: "rgba(255,255,255,.7)", maxWidth: 300, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Connecting, equipping, and empowering young professionals across Lagos Province 9.
            </p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li><Link href="/jobs">Jobs Board</Link></li>
              <li><Link href="/register">Register</Link></li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/login">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h4>Community</h4>
            <ul>
              <li><a href="#">Events</a></li>
              <li><a href="#">Mentorship</a></li>
              <li><a href="#">Resources</a></li>
              <li><Link href="/about#faq">FAQs</Link></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><a href="mailto:info@lp9ypc.org">info@lp9ypc.org</a></li>
              <li><a href="#">Instagram</a></li>
              <li><a href="#">LinkedIn</a></li>
              <li><a href="#">WhatsApp Group</a></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <div>© {new Date().getFullYear()} LP9 YPC · A ministry of RCCG Lagos Province 9</div>
          <div>Built by <a href="#" style={{ color: "rgba(255,255,255,.7)" }}>Havilah Labs</a></div>
        </div>
      </div>
    </footer>
  );
}
