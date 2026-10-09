import { renderGradient } from '@outpacelabs/avatars';
import { BRAND_COLORS } from '@splinance/shared';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Brand palette minus cream (too close to light backgrounds), like user avatars.
const GRADIENT_COLORS = [
  BRAND_COLORS.blue,
  BRAND_COLORS.green,
  BRAND_COLORS.red,
  BRAND_COLORS.orange,
  BRAND_COLORS.pink,
  BRAND_COLORS.sky,
  BRAND_COLORS.mustard,
];

// Drawn once at a fixed resolution and scaled with CSS. The library varies the level of
// detail with the display size (fewer colors when small), which made one household look
// different in the switcher, the menu and the settings card; a fixed `displaySize` keeps
// it identical everywhere. The blur is baked in, so edges stay crisp at any size.
const RENDER_SIZE = 128;
const DETAIL_SIZE = 32;

interface HouseholdAvatarProps {
  household: { id: string; name: string };
  size?: number;
  className?: string;
  /** Hide from assistive tech when the name is already shown next to it. */
  decorative?: boolean;
}

/**
 * The only place that knows about @outpacelabs/avatars. A mesh gradient in brand colors,
 * seeded with the household id: stable across renames and distinct between households.
 * Rounded square, so households never look like people (round user avatars).
 */
export function HouseholdAvatar({
  household,
  size = 32,
  className,
  decorative = false,
}: HouseholdAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderGradient(canvasRef.current, household.id, {
      colors: GRADIENT_COLORS,
      displaySize: DETAIL_SIZE,
    });
  }, [household.id]);

  return (
    <canvas
      ref={canvasRef}
      width={RENDER_SIZE}
      height={RENDER_SIZE}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': household.name })}
      title={decorative ? undefined : household.name}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.25) }}
      className={cn('block shrink-0', className)}
    />
  );
}
