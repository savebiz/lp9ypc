import styles from "@/components/community/community.module.css";

// Shown instantly while a community board loads.
export default function Loading() {
  return (
    <>
      <div className={styles.skelNav} aria-hidden="true" />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }} aria-busy="true">
        <p className="sr-only" role="status">Loading discussions…</p>
        <div aria-hidden="true">
          <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 28, width: 140 }} />
          <span className={`${styles.skel} ${styles.skelTitle}`} style={{ marginTop: 24 }} />
          <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 14, width: "85%" }} />
          <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 14, width: "60%" }} />
          <span className={`${styles.skel} ${styles.skelBlock}`} style={{ marginTop: 32, height: 52, borderRadius: 999 }} />
          <ul className={styles.threads} style={{ marginTop: 32 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i}>
                <span className={`${styles.skel} ${styles.skelBlock}`} style={{ height: 76 }} />
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
