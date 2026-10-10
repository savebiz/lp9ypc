import type { CSSProperties } from "react";

const block = (style: CSSProperties): CSSProperties => ({ display: "block", background: "var(--line)", borderRadius: "var(--r-input)", ...style });

/** Shown while the jobs list loads. Mirrors the real page: heading, search bar, job cards with an Apply button. */
export default function JobsLoading() {
  return (
    <main id="main" className="wrap" aria-busy="true">
      <p className="sr-only" role="status">Loading jobs…</p>
      <div className="page-head" aria-hidden="true">
        <span className="eyebrow">Jobs &amp; opportunities</span>
        <h1 className="title-lg">Find your next role.</h1>
        <span style={block({ height: 18, width: "min(460px, 95%)", marginTop: 8 })} />
      </div>
      <div className="stack" aria-hidden="true">
        <span style={block({ height: 48 })} />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card stack-sm">
            <span style={block({ height: 20, width: "65%" })} />
            <span style={block({ height: 16, width: "40%" })} />
            <span style={block({ height: 16, width: "55%" })} />
            <span style={block({ height: 48, width: 140, borderRadius: "var(--r-pill)", marginTop: 4 })} />
          </div>
        ))}
      </div>
    </main>
  );
}
