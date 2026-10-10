import styles from "./admin.module.css";

/** Shown while the admin dashboard loads its data (it reads many tables at once). */
export default function AdminLoading() {
  return (
    <main id="main" className="wrap" style={{ paddingBottom: 96 }} aria-busy="true">
      <p className="sr-only" role="status">Loading the admin dashboard…</p>
      <div className="page-head" aria-hidden="true">
        <span className="eyebrow">Admin</span>
        <h1 className="title-lg">Club dashboard</h1>
        <span className={styles.skel} style={{ height: 18, width: "min(520px, 90%)", marginTop: 8 }} />
      </div>
      <div className="stack" aria-hidden="true">
        <div className={`tabs ${styles.tabs}`}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={styles.skel} style={{ height: 44, flex: "1 1 calc(50% - 4px)", minWidth: 100 }} />
          ))}
        </div>
        <div className="stats">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="stat">
              <span className={styles.skel} style={{ height: 32, width: 56 }} />
              <span className={styles.skel} style={{ height: 14, width: "80%", marginTop: 8 }} />
            </div>
          ))}
        </div>
        <div className="card stack-sm">
          <span className={styles.skel} style={{ height: 20, width: 200 }} />
          {Array.from({ length: 4 }, (_, i) => <span key={i} className={styles.skel} style={{ height: 48 }} />)}
        </div>
      </div>
    </main>
  );
}
