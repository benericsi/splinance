/**
 * Geometry for the overview's small charts (`Gauge`, `Ring`). Pure, so the shapes are
 * tested without a browser. The fill itself is drawn by motion's `pathLength` (0..1 of
 * the path), which is why these only describe the track.
 */

/** A ratio as much of an arc as can be drawn: 0 to 1, anything else clamped, NaN as 0. */
export function arcFill(ratio: number): number {
  if (!Number.isFinite(ratio)) return ratio === Infinity ? 1 : 0;
  return Math.min(1, Math.max(0, ratio));
}

export interface GaugeGeometry {
  /** The upper half circle, left to right, so a fill grows clockwise from the left end. */
  d: string;
  viewBox: string;
}

/**
 * A half circle gauge `width` wide drawn with a `stroke` thick line: the line's round caps
 * stay inside the box, so nothing is clipped at the ends or the top.
 */
export function gaugeGeometry(width: number, stroke: number): GaugeGeometry {
  const r = (width - stroke) / 2;
  const cy = r + stroke / 2;
  const left = stroke / 2;
  const right = width - stroke / 2;
  return {
    d: `M ${String(left)} ${String(cy)} A ${String(r)} ${String(r)} 0 0 1 ${String(right)} ${String(cy)}`,
    viewBox: `0 0 ${String(width)} ${String(cy + stroke / 2)}`,
  };
}

export interface RingGeometry {
  center: number;
  r: number;
  viewBox: string;
}

/** A full circle `size` across with a `stroke` thick line, inside the box. */
export function ringGeometry(size: number, stroke: number): RingGeometry {
  return {
    center: size / 2,
    r: (size - stroke) / 2,
    viewBox: `0 0 ${String(size)} ${String(size)}`,
  };
}
