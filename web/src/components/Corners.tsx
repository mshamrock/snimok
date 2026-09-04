/**
 * Viewfinder corners: the one decorative motif of the Darkroom design.
 * Place inside a `relative` container. `size` in px, `inset` offsets the
 * corners outward (negative) or inward (positive).
 */
export function Corners({
  size = 14,
  inset = -6,
  className = "",
}: {
  size?: number;
  inset?: number;
  className?: string;
}) {
  const s = `${size}px`;
  const o = `${inset}px`;
  const base = `pointer-events-none absolute border-accent ${className}`;
  return (
    <>
      <span aria-hidden className={`${base} border-t-2 border-l-2`} style={{ width: s, height: s, top: o, left: o }} />
      <span aria-hidden className={`${base} border-t-2 border-r-2`} style={{ width: s, height: s, top: o, right: o }} />
      <span aria-hidden className={`${base} border-b-2 border-l-2`} style={{ width: s, height: s, bottom: o, left: o }} />
      <span aria-hidden className={`${base} border-b-2 border-r-2`} style={{ width: s, height: s, bottom: o, right: o }} />
    </>
  );
}
