import type { Notification } from '@splinance/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Bell,
  CircleAlert,
  type LucideIcon,
  PiggyBank,
  Repeat,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/user-avatar';
import { today } from '@/features/transactions/dates';
import { useAuth } from '@/lib/auth-store';
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { describeNotification, notificationTarget, timeAgo } from '../describe';
import { useMarkRead, useSetNotificationSettings } from '../hooks';
import { notificationQueries } from '../queries';

/**
 * The bell next to the account menu: a badge with the unread count (polled), and the list
 * in a popover (a drawer on phones). Opening an item marks it read and goes to it.
 */
export function NotificationBell({ household }: { household: { id: string; name: string } }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);
  const { data: unread = 0 } = useQuery(notificationQueries.unreadCount());
  const label = unread > 0 ? `Notifications, ${String(unread)} unread` : 'Notifications';
  // As tall as the avatar beside it, with a soft fill so it reads as a control, not a glyph.
  const triggerClass = cn(
    buttonVariants({ variant: 'ghost', size: 'icon' }),
    'bg-muted/70 hover:bg-muted relative size-9 rounded-full [&_svg]:size-5',
  );
  const badge = unread > 0 && (
    <span
      aria-hidden
      className="bg-brand-red ring-background absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold text-white tabular-nums ring-2"
    >
      {unread > 9 ? '9+' : unread}
    </span>
  );
  const panel = (
    <NotificationPanel
      household={household}
      // The drawer has its own title; the popover's is the panel's first line.
      heading={
        isPhone ? null : (
          <PopoverTitle className="font-heading text-sm font-semibold">Notifications</PopoverTitle>
        )
      }
      onOpenItem={() => {
        setOpen(false);
      }}
    />
  );

  if (isPhone) {
    return (
      <>
        <button
          type="button"
          aria-label={label}
          className={triggerClass}
          onClick={() => {
            setOpen(true);
          }}
        >
          <Bell aria-hidden />
          {badge}
        </button>
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Notifications</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">{panel}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={label} className={triggerClass}>
        <Bell aria-hidden />
        {badge}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem]">
        {panel}
      </PopoverContent>
    </Popover>
  );
}

const STATE_ICONS: Partial<Record<Notification['type'], LucideIcon>> = {
  renewal_due: Repeat,
  renewal_missed: CircleAlert,
  budget_near: PiggyBank,
  budget_over: PiggyBank,
};

function NotificationIcon({ notification }: { notification: Notification }) {
  const { actor } = notification;
  if (actor) {
    return <UserAvatar user={{ id: actor.userId, displayName: actor.displayName }} size={28} />;
  }
  const Icon =
    notification.type === 'price_changed'
      ? (notification.amount ?? 0) > (notification.previousAmount ?? 0)
        ? TrendingUp
        : TrendingDown
      : (STATE_ICONS[notification.type] ?? Bell);
  return (
    <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

function NotificationPanel({
  household,
  heading,
  onOpenItem,
}: {
  household: { id: string; name: string };
  heading: ReactNode;
  onOpenItem: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = useQuery(notificationQueries.list());
  const settings = useQuery(notificationQueries.settings(household.id));
  const markRead = useMarkRead();
  const setSettings = useSetNotificationSettings();
  const now = today();
  const items = list.data?.notifications ?? [];
  const unread = list.data?.unread ?? 0;

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate({ input: { ids: [n.id] } });
    onOpenItem();
    void navigate(notificationTarget(n));
  };

  return (
    <div className="flex flex-col">
      <div className="flex min-h-10 items-center justify-between gap-3 px-4 pt-3 pb-2">
        {heading ?? <span />}
        {unread > 0 && (
          <button
            type="button"
            className="text-link text-xs hover:underline"
            disabled={markRead.isPending}
            onClick={() => {
              markRead.mutate({ input: { all: true } });
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {list.isPending ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm" role="status">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          Nothing new. Renewals, budget alerts and what others change show up here.
        </p>
      ) : (
        <ul aria-label="Notifications" className="border-t">
          {items.map((n) => {
            const { lead, rest, detail } = describeNotification(n, user?.id ?? '', now);
            const fresh = !n.readAt && !n.resolvedAt;
            return (
              <li key={n.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    open(n);
                  }}
                  className="hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full items-start gap-2.5 px-4 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
                >
                  <span
                    aria-label={fresh ? 'Unread' : undefined}
                    className={cn(
                      'mt-3 size-1.5 shrink-0 rounded-full',
                      fresh ? 'bg-link' : 'bg-transparent',
                    )}
                  />
                  <NotificationIcon notification={n} />
                  <span className={cn('min-w-0 flex-1', !fresh && 'text-muted-foreground')}>
                    <span className="block text-sm">
                      <span className={cn('font-medium', fresh && 'text-foreground')}>{lead}</span>
                      {rest}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {n.householdId !== household.id && `${n.householdName} · `}
                      {detail}
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {settings.data && (
        <label className="text-muted-foreground flex items-center gap-2.5 border-t px-4 py-2.5 text-xs">
          <input
            type="checkbox"
            checked={settings.data.activity}
            disabled={setSettings.isPending}
            onChange={(event) => {
              setSettings.mutate({
                householdId: household.id,
                settings: { activity: event.target.checked },
              });
            }}
            className="accent-primary size-3.5"
          />
          What others change in {household.name}
        </label>
      )}
    </div>
  );
}
