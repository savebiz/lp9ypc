/** Plain loading state, so the two-step sign-in pages don't flash the dashboard skeleton. */
export default function SecurityLoading() {
  return (
    <main id="main" className="wrap wrap-form" aria-busy="true" style={{ paddingTop: 32 }}>
      <p className="muted" role="status">Loading…</p>
    </main>
  );
}
