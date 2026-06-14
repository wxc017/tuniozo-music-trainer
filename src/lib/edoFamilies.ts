// ── Fifth-tuning family grouping for EDO pickers ────────────────────
// Shared by Tonal Audiation (App.tsx) and Lumatone Intervals so both group
// their EDO buttons the same way — by where each EDO's best fifth lands on the
// flattone → meantone → pythagorean → schismatic → superpyth spectrum.

export const FIFTH_FAMILY_BANDS: { fam: string; color: string; lo: number; hi: number }[] = [
  { fam: "FLATTONE",    color: "#9ad0ff", lo: 0,     hi: 694.5 },
  { fam: "MEANTONE",    color: "#cfe6ff", lo: 694.5, hi: 700.5 },
  { fam: "PYTHAGOREAN", color: "#e6cfa0", lo: 700.5, hi: 703.0 },
  { fam: "SCHISMATIC",  color: "#cfe6cf", lo: 703.0, hi: 706.0 },
  { fam: "SUPERPYTH",   color: "#e6a0c0", lo: 706.0, hi: 9999 },
];

/** Cents of an EDO's best (nearest) fifth. */
export const fifthCentsOf = (edo: number): number =>
  (Math.round(edo * Math.log2(1.5)) / edo) * 1200;

/** Group EDOs into fifth-tuning families (in spectrum order); empty bands are
 *  dropped.  EDOs stay in the order they appear in `edos` within each band. */
export function groupEdosByFamily(
  edos: number[],
): { fam: string; color: string; edos: number[] }[] {
  return FIFTH_FAMILY_BANDS
    .map(b => ({
      fam: b.fam,
      color: b.color,
      edos: edos.filter(e => { const c = fifthCentsOf(e); return c >= b.lo && c < b.hi; }),
    }))
    .filter(g => g.edos.length > 0);
}
