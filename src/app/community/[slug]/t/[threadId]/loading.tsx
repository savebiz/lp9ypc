import styles from "@/components/community/community.module.css";

// Shown instantly while a discussion loads.
export default function Loading() {
  return (
    <>
      <div className={styles.skelNav} aria-hidden="true" />
      <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }} aria-busy="true">
        <p className="sr-only" role="status">Loading the discussion…</p>
        <div aria-hidden="true">
          <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 28, width: 160 }} />
          <div className={`${styles.post} ${styles.postLead}`}>
            <span className={`${styles.skel} ${styles.skelTitle}`} />
            <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 12, width: 180 }} />
            <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 20 }} />
            <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 10 }} />
            <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 10, width: "70%" }} />
          </div>
          <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 36, width: 120, height: 24 }} />
          <ol className={styles.replies} style={{ marginTop: 16 }}>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span className={`${styles.skel} ${styles.skelBlock}`} style={{ height: 110 }} />
              </li>
            ))}
          </ol>
        </div>
      </main>
    </>
  );
}
