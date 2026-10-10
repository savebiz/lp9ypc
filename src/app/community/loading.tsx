import styles from "@/components/community/community.module.css";

// Shown instantly while the communities directory loads (slow mobile data).
export default function Loading() {
  return (
    <>
      <div className={styles.skelNav} aria-hidden="true" />
      <main id="main" className="wrap" style={{ paddingBottom: 24 }} aria-busy="true">
        <p className="sr-only" role="status">Loading communities…</p>
        <div className="page-head" aria-hidden="true">
          <span className={`${styles.skel} ${styles.skelLine}`} style={{ width: 110 }} />
          <span className={`${styles.skel} ${styles.skelTitle}`} style={{ marginTop: 12 }} />
          <span className={`${styles.skel} ${styles.skelLine}`} style={{ marginTop: 12, width: "90%" }} />
        </div>
        <ul className={styles.grid} aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <span className={`${styles.skel} ${styles.skelBlock}`} style={{ height: 150 }} />
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
