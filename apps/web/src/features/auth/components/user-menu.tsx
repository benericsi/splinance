import type { User } from '@splinance/shared';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { useEndDemo } from '@/features/demo/hooks';
import { useLogout } from '../hooks';

export function UserMenu({ user }: { user: User }) {
  const logout = useLogout();
  const endDemo = useEndDemo();
  const [confirmingEnd, setConfirmingEnd] = useState(false);

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
            <div className="text-muted-foreground truncate text-xs font-normal">
              {__DEMO_SITE__ ? 'Demo account' : user.email}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-4 px-2 py-1">
          <span className="text-sm">Theme</span>
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        {__DEMO_SITE__ ? (
          // Demo accounts have no password: leaving means the household is gone.
          <DropdownMenuItem
            onClick={() => {
              setConfirmingEnd(true);
            }}
          >
            <LogOut aria-hidden />
            End demo
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate();
            }}
          >
            <LogOut aria-hidden />
            Log out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
      {__DEMO_SITE__ && (
        <ConfirmDialog
          open={confirmingEnd}
          onOpenChange={setConfirmingEnd}
          title="End the demo?"
          description="This deletes the demo household for good. You can start a new one any time."
          confirmLabel="End demo"
          pendingLabel="Ending…"
          destructive
          pending={endDemo.isPending}
          onConfirm={() => {
            endDemo.mutate();
          }}
        />
      )}
    </DropdownMenu>
  );
}
