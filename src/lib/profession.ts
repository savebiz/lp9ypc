/**
 * Normalises a free-text profession into a stable key, so "Accountant",
 * " accountant ", and "ACCOUNTANT." share one research record.
 * Shared by the career-research agent and the instant keyword matcher.
 */
export function normalizeProfession(profession: string | null | undefined): string {
  return (profession ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#&/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
