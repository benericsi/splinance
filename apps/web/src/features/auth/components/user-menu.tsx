import type { User } from '@splinance/shared';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '../hooks';

export function UserMenu({ user }: { user: User }) {
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="text-foreground font-medium">{user.displayName}</div>
            <div className="text-muted-foreground truncate text-xs font-normal">{user.email}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-4 px-2 py-1">
          <span className="text-sm">Theme</span>
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={logout.isPending}
          onClick={() => {
            logout.mutate();
          }}
        >
          <LogOut aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
