import type { Currency } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import type { MapNodeData } from '../build-map';
import { MapNodeCard } from './map-node-card';

/**
 * A node as the way to its page or dialog: a real link, so Tab and Enter work and nothing
 * on the map needs a pointer. People open settle up with them; the viewer's own card and
 * people they cannot settle with stay plain cards.
 */
export function MapNodeLink({
  node,
  householdId,
  currency,
}: {
  node: MapNodeData;
  householdId: string;
  currency: Currency;
}) {
  const card = <MapNodeCard node={node} currency={currency} />;
  const link = {
    // The canvas moves the node; the browser must not start dragging the link itself.
    draggable: false,
    className:
      'group focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-[3px]',
  } as const;
  const params = { householdId };

  switch (node.kind) {
    case 'household':
    case 'invite':
      return (
        <Link to="/h/$householdId/settings" params={params} {...link}>
          {card}
        </Link>
      );
    case 'member':
      return node.canSettle ? (
        <Link
          to="/h/$householdId/settle"
          params={params}
          search={{ view: 'map', with: node.userId }}
          state={OPEN_MODAL_STATE}
          {...link}
        >
          {card}
        </Link>
      ) : (
        card
      );
    case 'bank':
      return (
        <Link to="/h/$householdId/transactions/import" params={params} {...link}>
          {card}
        </Link>
      );
    case 'recurring':
      return (
        <Link
          to="/h/$householdId/recurring/$seriesId"
          params={{ householdId, seriesId: node.seriesId }}
          state={OPEN_MODAL_STATE}
          {...link}
        >
          {card}
        </Link>
      );
    case 'more':
      return (
        <Link to="/h/$householdId/recurring" params={params} {...link}>
          {card}
        </Link>
      );
    case 'budget':
      return (
        <Link to="/h/$householdId/budgets" params={params} {...link}>
          {card}
        </Link>
      );
  }
}
