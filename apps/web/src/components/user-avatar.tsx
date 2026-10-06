import { cn } from '@/lib/utils';
import type { User } from '@splinance/shared';
import { BRAND_COLORS } from '@splinance/shared';
import { Facehash } from 'facehash';

// Brand palette minus cream (too close to light backgrounds to read as an avatar).
const AVATAR_COLORS = [
  BRAND_COLORS.blue,
  BRAND_COLORS.green,
  BRAND_COLORS.red,
  BRAND_COLORS.orange,
  BRAND_COLORS.pink,
  BRAND_COLORS.sky,
  BRAND_COLORS.mustard,
];

interface UserAvatarProps {
  user: Pick<User, 'id' | 'displayName'>;
  size?: number;
  className?: string;
}

/**
 * The only place that knows about facehash, so the library can be swapped or vendored.
 * Seeded with the user id (stable across renames, unique for equal names); facehash would
 * take the initial from the seed, so it is hidden and the name is exposed as a label instead.
 */
export function UserAvatar({ user, size = 32, className }: UserAvatarProps) {
  return (
    <Facehash
      name={user.id}
      size={size}
      variant="gradient"
      colors={AVATAR_COLORS}
      showInitial={false}
      role="img"
      aria-label={user.displayName}
      title={user.displayName}
      className={cn('shrink-0 overflow-hidden rounded-full', className)}
      enableBlink
    />
  );
}
