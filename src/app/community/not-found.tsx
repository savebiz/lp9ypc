import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getSession } from "@/lib/session";

export default async function CommunityNotFound() {
  const { user, userName, isAdmin } = await getSession();
  return (
    <>
      <Navbar user={user} isAdmin={isAdmin} userName={userName} />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }}>
        <div className="page-head">
          <span className="eyebrow">Communities</span>
          <h1 className="title-md" style={{ marginTop: 8 }}>We couldn&apos;t find that.</h1>
          <p className="lede">
            The community or discussion may have been removed, or the link may be wrong.
          </p>
        </div>
        <Link href="/community" className="btn btn-solid">See all communities</Link>
      </main>
      <Footer />
    </>
  );
}
