import type { User } from '@splinance/shared';
import { Facehash } from 'facehash';
import { cn } from '@/lib/utils';

// Muted, mid-tone colors: calm for a finance app, still distinct at 24px.
const AVATAR_COLORS = ['#0f766e', '#0e7490', '#4f46e5', '#7c3aed', '#be185d', '#b45309', '#15803d'];

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
    />
  );
}
