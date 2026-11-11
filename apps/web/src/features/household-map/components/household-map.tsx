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
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Currency } from '@splinance/shared';
import { type CSSProperties, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/features/transactions/money';
import { useTheme } from '@/lib/theme';
import type { HouseholdMap as HouseholdMapData, MapNodeData } from '../build-map';
import { MapNodeCard } from './map-node-card';

type CardNode = Node<{ node: MapNodeData; currency: Currency }, 'card'>;

/** Edges attach here; nothing can be connected by hand, so the handles are invisible. */
const HANDLE = '!pointer-events-none !size-px !min-h-0 !min-w-0 !border-0 !opacity-0';

function CardNodeView({ data }: NodeProps<CardNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" className={HANDLE} />
      <MapNodeCard node={data.node} currency={data.currency} />
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
    data: { node, currency: map.currency },
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
 * view never pays for it. Nodes can be moved around but nothing is saved; a refetch
 * updates what the nodes say and keeps where they were dragged.
 */
export default function HouseholdMap({ map }: { map: HouseholdMapData }) {
  const { t } = useTranslation('map');
  const { resolved } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState(toNodes(map));

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
    <section
      aria-label={t('canvas')}
      className="bg-muted/40 h-[min(70vh,40rem)] overflow-hidden rounded-xl border"
    >
      <ReactFlow
        nodes={nodes}
        edges={toEdges(map)}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        colorMode={resolved}
        style={CANVAS_STYLE}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.4}
        maxZoom={1.5}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        // The page scrolls with the wheel; zoom is on the buttons, pinch and ctrl+wheel.
        zoomOnScroll={false}
        preventScrolling={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}
