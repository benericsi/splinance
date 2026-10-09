import { useMemo } from 'react';
import { encode } from 'uqr';
import { cn } from '@/lib/utils';

/** Quiet zone around the code, in modules; scanners need it (the spec asks for 4). */
const QUIET_ZONE = 4;

/**
 * A QR code as one SVG path. Always black on white, also in dark mode: phone cameras read
 * dark-on-light reliably, inverted codes much less so.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { path, size } = useMemo(() => {
    const { data, size: modules } = encode(value, { border: 0 });
    let d = '';
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${String(x + QUIET_ZONE)} ${String(y + QUIET_ZONE)}h1v1h-1z`;
      });
    });
    return { path: d, size: modules + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={cn('rounded-lg bg-white', className)}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
