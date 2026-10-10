import type { CSSProperties } from "react";

const block = (style: CSSProperties): CSSProperties => ({ display: "block", background: "var(--line)", borderRadius: "var(--r-input)", ...style });

/** Shown while the member dashboard loads. Plain grey shapes — no animation. */
export default function DashboardLoading() {
  return (
    <main id="main" className="wrap wrap-narrow" style={{ paddingBottom: 24 }} aria-busy="true">
      <p className="sr-only" role="status">Loading your dashboard…</p>
      <div className="page-head" aria-hidden="true">
        <span style={block({ height: 14, width: 120 })} />
        <span style={block({ height: 34, width: "min(360px, 85%)", marginTop: 10 })} />
        <span style={block({ height: 18, width: "min(460px, 95%)", marginTop: 10 })} />
      </div>
      <div className="stack" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card stack-sm">
            <span style={block({ height: 20, width: "50%" })} />
            <span style={block({ height: 16, width: "90%" })} />
            <span style={block({ height: 16, width: "70%" })} />
            <span style={block({ height: 48, width: 160, borderRadius: "var(--r-pill)", marginTop: 4 })} />
          </div>
        ))}
      </div>
    </main>
  );
}
