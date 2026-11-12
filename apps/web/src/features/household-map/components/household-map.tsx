import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Currency } from '@splinance/shared';
import { useNavigate } from '@tanstack/react-router';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/features/transactions/money';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { useTheme } from '@/lib/theme';
import {
  type HouseholdMap as HouseholdMapData,
  type MapNodeData,
  settleByDrop,
} from '../build-map';
import { MapNodeLink } from './map-node-link';

type CardNode = Node<{ node: MapNodeData; currency: Currency; householdId: string }, 'card'>;

/** On the person a dragged person is held over, when letting go there would settle up. */
const DROP_TARGET = 'rounded-xl ring-2 ring-ring';

/** Edges attach here; nothing can be connected by hand, so the handles are invisible. */
const HANDLE = '!pointer-events-none !size-px !min-h-0 !min-w-0 !border-0 !opacity-0';

function CardNodeView({ data }: NodeProps<CardNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" className={HANDLE} />
      <MapNodeLink node={data.node} householdId={data.householdId} currency={data.currency} />
      <Handle type="source" position={Position.Right} id="out" className={HANDLE} />
      {data.node.kind === 'member' && (
        // Debts run between people in one column: straight through the gap to a neighbour,
        // or from left side to left side around whoever stands between (the edge then bows
        // out away from the household links on the right).
        <>
          <Handle type="source" position={Position.Top} id="up-out" className={HANDLE} />
          <Handle type="target" position={Position.Top} id="down-in" className={HANDLE} />
          <Handle type="source" position={Position.Bottom} id="down-out" className={HANDLE} />
          <Handle type="target" position={Position.Bottom} id="up-in" className={HANDLE} />
          <Handle type="source" position={Position.Left} id="side-out" className={HANDLE} />
          <Handle type="target" position={Position.Left} id="side-in" className={HANDLE} />
        </>
      )}
    </>
  );
}

const NODE_TYPES = { card: CardNodeView };

// React Flow reads these; role tokens keep the canvas in step with both themes. Chrome
// stays neutral: a debt is a stronger line with its amount, not a color.
const CANVAS_STYLE = {
  '--xy-background-color': 'transparent',
  '--xy-edge-stroke': 'color-mix(in oklab, var(--muted-foreground) 60%, transparent)',
  '--xy-edge-stroke-width': '1.5',
  '--xy-edge-label-background-color': 'var(--background)',
  '--xy-edge-label-color': 'var(--foreground)',
  '--xy-controls-button-background-color': 'var(--card)',
  '--xy-controls-button-background-color-hover': 'var(--accent)',
  '--xy-controls-button-color': 'var(--foreground)',
  '--xy-controls-button-color-hover': 'var(--foreground)',
  '--xy-controls-button-border-color': 'var(--border)',
  '--xy-controls-box-shadow': 'none',
} as CSSProperties;

const DEBT_COLOR = 'var(--foreground)';

function toNodes(map: HouseholdMapData): CardNode[] {
  return map.nodes.map(({ id, x, y, ...node }) => ({
    id,
    type: 'card',
    position: { x, y },
    data: { node, currency: map.currency, householdId: map.householdId },
  }));
}

function toEdges(map: HouseholdMapData): Edge[] {
  return map.edges.map((edge) => {
    if (edge.kind === 'debt') {
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: `${edge.route ?? 'side'}-out`,
        targetHandle: `${edge.route ?? 'side'}-in`,
        label: formatMoney(edge.amount ?? 0, map.currency),
        // An SVG label, so no `data-amount` span: index.css blurs this class's text instead.
        className: 'amount-svg',
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
        labelStyle: { fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
        style: { stroke: DEBT_COLOR, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: DEBT_COLOR },
      };
    }
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: 'out',
      targetHandle: 'in',
      ...(edge.kind === 'pending' && { style: { strokeDasharray: '4 5' } }),
    };
  });
}

/**
 * The canvas: the only file that knows about React Flow, loaded on demand so the cards
 * view never pays for it. Every node is a link to its page; nodes can be moved around but
 * nothing is saved (a refetch updates what they say and keeps where they were dragged).
 * Dropping yourself on someone, or someone on you, opens settle up with them and puts the
 * dragged card back: a shortcut for what a click on that person does.
 */
export default function HouseholdMap({ map }: { map: HouseholdMapData }) {
  return (
    <ReactFlowProvider>
      <Canvas map={map} />
    </ReactFlowProvider>
  );
}

function Canvas({ map }: { map: HouseholdMapData }) {
  const { t } = useTranslation('map');
  const { resolved } = useTheme();
  const navigate = useNavigate();
  const { getIntersectingNodes } = useReactFlow<CardNode>();
  const [nodes, setNodes, onNodesChange] = useNodesState(toNodes(map));
  const [dropId, setDropId] = useState<string>();
  const dragOrigin = useRef<{ x: number; y: number }>(undefined);

  /** The node under the dragged one that it could settle with, and who that settles with. */
  const settleTarget = (dragged: CardNode) => {
    for (const onto of getIntersectingNodes(dragged)) {
      const userId = settleByDrop(dragged.data.node, onto.data.node);
      if (userId) return { nodeId: onto.id, userId };
    }
    return undefined;
  };

  useEffect(() => {
    setNodes((previous) => {
      const moved = new Map(previous.map((node) => [node.id, node]));
      return toNodes(map).map((node) => {
        const before = moved.get(node.id);
        return before ? { ...before, data: node.data } : node;
      });
    });
  }, [map, setNodes]);

  return (
    <section aria-label={t('canvas')} className="bg-muted/40 h-full">
      <ReactFlow
        nodes={nodes.map((node) =>
          node.id === dropId ? { ...node, className: DROP_TARGET } : node,
        )}
        edges={toEdges(map)}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, node) => {
          dragOrigin.current = node.position;
        }}
        onNodeDrag={(_, node) => {
          setDropId(settleTarget(node)?.nodeId);
        }}
        onNodeDragStop={(_, node) => {
          const target = settleTarget(node);
          const origin = dragOrigin.current;
          setDropId(undefined);
          if (!target) return;
          if (origin) {
            setNodes((current) =>
              current.map((item) => (item.id === node.id ? { ...item, position: origin } : item)),
            );
          }
          void navigate({
            to: '/h/$householdId/settle',
            params: { householdId: map.householdId },
            search: { view: 'map', with: target.userId },
            state: OPEN_MODAL_STATE,
          });
        }}
        // The links inside the nodes are the tab stops.
        nodesFocusable={false}
        colorMode={resolved}
        style={CANVAS_STYLE}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.4}
        maxZoom={1.5}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        // MIT licensed: the label is optional.
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}
