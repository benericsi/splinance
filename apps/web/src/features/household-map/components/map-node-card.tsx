import type { Currency } from '@splinance/shared';
import { Ellipsis, Landmark, Lock, type LucideIcon, Mail, Repeat } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HouseholdAvatar } from '@/components/household-avatar';
import { UserAvatar } from '@/components/user-avatar';
import { BudgetBar } from '@/features/budgets/components/budget-bar';
import { budgetNote } from '@/features/budgets/status';
import { expiresIn } from '@/features/invites/format';
import { dueLabel } from '@/features/recurring/view';
import { formatMoney } from '@/features/transactions/money';
import { cn } from '@/lib/utils';
import type { MapNodeData } from '../build-map';

type Tone = 'neutral' | 'positive' | 'negative' | 'warning';

const TONE: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function Card({
  title,
  status,
  tone = 'neutral',
  lead,
  icon: Icon,
  iconLabel,
  ghost = false,
  children,
}: {
  title: string;
  status: string;
  tone?: Tone;
  /** An avatar, left of the text. */
  lead?: ReactNode;
  /** What kind of thing this is, top right. */
  icon?: LucideIcon;
  /** Set when the icon says something the text does not (private). */
  iconLabel?: string;
  /** Dashed and see-through: not really there (yet). */
  ghost?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        // Inside a link (`group`), the border answers the pointer.
        'group-hover:border-foreground/30 w-52 rounded-xl border px-3 py-2.5 text-sm transition-colors',
        ghost ? 'border-dashed' : 'bg-card shadow-xs',
      )}
    >
      <div className="flex items-center gap-2.5">
        {lead}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p className={cn('truncate text-xs', TONE[tone])}>{status}</p>
        </div>
        {Icon && (
          <Icon
            className="text-muted-foreground size-4 shrink-0 self-start"
            {...(iconLabel ? { role: 'img', 'aria-label': iconLabel } : { 'aria-hidden': true })}
          />
        )}
      </div>
      {children}
    </div>
  );
}

/** One thing on the household map: who or what it is, and how it is doing, in a line. */
export function MapNodeCard({ node, currency }: { node: MapNodeData; currency: Currency }) {
  const { t } = useTranslation('map');

  switch (node.kind) {
    case 'household':
      return (
        <Card
          title={node.household.name}
          status={t('household.members', { count: node.memberCount })}
          lead={<HouseholdAvatar household={node.household} size={32} decorative />}
        />
      );
    case 'member': {
      const amount = formatMoney(Math.abs(node.net), currency);
      const status = node.former
        ? t('member.left')
        : node.net === 0
          ? t('member.settled')
          : node.net > 0
            ? t(node.isViewer ? 'member.youOwed' : 'member.owed', { amount })
            : t(node.isViewer ? 'member.youOwe' : 'member.owes', { amount });
      return (
        <Card
          title={node.isViewer ? t('you', { name: node.displayName }) : node.displayName}
          status={status}
          tone={node.former || node.net === 0 ? 'neutral' : node.net > 0 ? 'positive' : 'negative'}
          lead={<UserAvatar user={{ id: node.userId, displayName: node.displayName }} size={32} />}
        />
      );
    }
    case 'bank':
      return (
        <Card
          title={t(`sources.${node.source}`)}
          status={node.daysAgo === 0 ? t('bank.today') : t('bank.days', { count: node.daysAgo })}
          tone={node.stale ? 'warning' : 'neutral'}
          icon={Landmark}
        />
      );
    case 'recurring':
      return (
        <Card
          title={node.name}
          status={capitalize(dueLabel(node))}
          tone={node.daysUntil < 0 ? 'negative' : 'neutral'}
          icon={node.private ? Lock : Repeat}
          {...(node.private && { iconLabel: t('recurring.private') })}
        />
      );
    case 'more':
      return (
        <Card
          title={t('recurring.more', { count: node.count })}
          status={t('recurring.moreHint')}
          icon={Ellipsis}
          ghost
        />
      );
    case 'budget':
      return (
        <Card
          title={
            node.name === null ? t('budget.unknown') : t('budget.title', { category: node.name })
          }
          status={budgetNote(node.budget, currency)}
          tone={node.status === 'over' ? 'negative' : 'neutral'}
        >
          <div className="mt-2">
            <BudgetBar budget={node.budget} />
          </div>
        </Card>
      );
    case 'invite':
      return (
        <Card
          title={t('invite.title')}
          status={t('invite.expires', { when: expiresIn(node.expiresAt) })}
          icon={Mail}
          ghost
        />
      );
  }
}
