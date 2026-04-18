import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type NodeTypes,
  type OnSelectionChangeFunc,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Employee } from '@/types';
import { useOrgStore } from '@/stores/orgStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useExportStore } from '@/stores/exportStore';
import { useTreeLayout } from '@/hooks/useTreeLayout';
import EmployeeCard from '@/components/nodes/EmployeeCard';
import VacantCard from '@/components/nodes/VacantCard';
import SubtreeMoveConfirmDialog from '@/components/bulk/SubtreeMoveConfirmDialog';
import OverlayLegend from '@/components/panels/OverlayLegend';
import { isDescendant, getSubtreeSize, getDescendantIds } from '@/utils/subtreeUtils';

interface OutletContext {
  filteredEmployees: Employee[];
  statusFilters: string[];
  searchQuery: string;
  isViewer: boolean;
}

const nodeTypes: NodeTypes = {
  employee: EmployeeCard,
  vacant: VacantCard,
};

export default function OrgChartView() {
  return (
    <ReactFlowProvider>
      <OrgChartViewInner />
    </ReactFlowProvider>
  );
}

function OrgChartViewInner() {
  const { filteredEmployees, isViewer } = useOutletContext<OutletContext>();
  const employees = useOrgStore((s) => s.employees);
  const reactFlowInstance = useReactFlow();
  const moveEmployee = useOrgStore((s) => s.moveEmployee);
  const { selectedIds, toggleSelect, clearSelection, selectAll } = useSelectionStore();

  // Track whether we are programmatically updating React Flow selection to avoid loops
  const isSyncingFromStore = useRef(false);

  // Subtree move confirmation dialog state
  const [pendingMove, setPendingMove] = useState<{
    draggedEmp: Employee;
    targetEmp: Employee;
    subtreeSize: number;
  } | null>(null);

  // Register the React Flow instance in the export store so AppShell can pass
  // it to the export utility for department filtering and fitView support.
  const setExportContext = useExportStore((s) => s.setExportContext);
  useEffect(() => {
    setExportContext({
      employees,
      fitView: (opts) => reactFlowInstance.fitView(opts),
      getViewport: () => reactFlowInstance.getViewport(),
      setViewport: (vp, opts) => reactFlowInstance.setViewport(vp, opts),
    });
    return () => setExportContext(null);
  }, [employees, reactFlowInstance, setExportContext]);

  // Track which node is being dragged for subtree visual feedback
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  // Compute descendant IDs of the currently dragged node for visual feedback
  const draggingDescendantIds = useMemo(() => {
    if (!draggingNodeId) return new Set<string>();
    return getDescendantIds(draggingNodeId, employees);
  }, [draggingNodeId, employees]);

  // Compute layout from filtered employees
  const { nodes: layoutNodes, edges: layoutEdges } = useTreeLayout(filteredEmployees);

  // Layout-only data for each node. We intentionally DO NOT include the
  // `selected` state here — selection is managed by React Flow's internal
  // node state (driven by clicks/lasso) and mirrored to our store via
  // `onSelectionChange`. Previously we rebuilt nodes on every store change
  // (including selection) and passed them to `setNodes`, which immediately
  // clobbered React Flow's transient lasso selection before
  // `onSelectionChange` had a chance to propagate it to our store — that
  // broke VAL-MULTI-003 (lasso/marquee selection).
  const nodesWithLayout = useMemo(
    () =>
      layoutNodes.map((node) => ({
        ...node,
        data: { ...node.data, _chartEmployees: filteredEmployees },
        className:
          draggingNodeId && draggingDescendantIds.has(node.id)
            ? 'ring-2 ring-blue-400 ring-offset-1 opacity-70'
            : undefined,
      })),
    [layoutNodes, filteredEmployees, draggingNodeId, draggingDescendantIds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(nodesWithLayout);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Sync structural/layout changes but preserve each node's current
  // `selected` state so React Flow's internal selection (from click/lasso)
  // is not clobbered when unrelated renders occur.
  useEffect(() => {
    setNodes((prev) => {
      const prevSelected = new Map(prev.map((n) => [n.id, n.selected ?? false]));
      return nodesWithLayout.map((n) => ({
        ...n,
        selected: prevSelected.get(n.id) ?? false,
      }));
    });
    setEdges(layoutEdges);
  }, [nodesWithLayout, layoutEdges, setNodes, setEdges]);

  // Push store-driven selection changes (click, Cmd+A) into React Flow.
  // Guarded with a ref so we don't infinitely ping-pong with
  // `onSelectionChange` when the store change originated from React Flow.
  useEffect(() => {
    isSyncingFromStore.current = true;
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        const shouldBe = selectedIds.has(n.id);
        if (n.selected !== shouldBe) {
          changed = true;
          return { ...n, selected: shouldBe };
        }
        return n;
      });
      return changed ? next : prev;
    });
    requestAnimationFrame(() => {
      isSyncingFromStore.current = false;
    });
  }, [selectedIds, setNodes]);

  // Handle node clicks for multi-select
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const employee = node.data as unknown as Employee;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModKey = isMac ? event.metaKey : event.ctrlKey;

      if (isModKey) {
        // Cmd/Ctrl+Click: toggle selection
        toggleSelect(employee._id);
      } else {
        // Plain click: select this employee only (and open detail panel)
        useOrgStore.setState({ selectedEmployee: employee });
        clearSelection();
        // Set lastClickedId as anchor for future Shift+Click range selection
        useSelectionStore.setState({ lastClickedId: employee._id });
      }
    },
    [toggleSelect, clearSelection],
  );

  // Click on canvas background clears selection
  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Sync React Flow's built-in selection (click, box / lasso / marquee) into
  // our selectionStore. We only push IDs into the store when they actually
  // differ from what we already have, and we ignore events that originate
  // from our own store → RF sync to avoid an infinite loop.
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (isSyncingFromStore.current) return;

      const rfSelectedIds = selectedNodes.map((n) => n.id);
      const rfSet = new Set(rfSelectedIds);
      const current = useSelectionStore.getState().selectedIds;

      // Skip if nothing changed to avoid redundant updates.
      if (
        rfSet.size === current.size &&
        rfSelectedIds.every((id) => current.has(id))
      ) {
        return;
      }

      if (rfSelectedIds.length > 0) {
        selectAll(rfSelectedIds);
      } else if (current.size > 0) {
        // Lasso/click that results in zero selection should clear the store
        // so indicators and bulk toolbars update correctly.
        clearSelection();
      }
    },
    [selectAll, clearSelection],
  );

  // Track drag start to show subtree visual feedback
  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      setDraggingNodeId(draggedNode.id);
    },
    [],
  );

  // Drag-to-reparent: detect when a node is dropped onto another node
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      // Use React Flow's getIntersectingNodes for reliable drop target detection.
      // This properly handles coordinate systems and bounding boxes, unlike manual
      // position comparison which can miss targets due to stale state or threshold issues.
      const intersecting = reactFlowInstance.getIntersectingNodes(draggedNode);
      const dropTarget = intersecting.find((n) => n.id !== draggedNode.id);

      // Clear dragging state after detection (order matters — clearing before
      // detection would trigger a re-render that resets node positions)
      setDraggingNodeId(null);

      if (dropTarget) {
        const draggedEmp = draggedNode.data as unknown as Employee;
        const targetEmp = dropTarget.data as unknown as Employee;

        // Prevent circular: can't reparent to self or already a child
        if (draggedEmp.managerId === targetEmp._id) {
          // Already reports to this manager, reset positions
          setNodes(nodesWithLayout);
          return;
        }

        // Cycle detection: prevent dropping onto own descendant
        if (isDescendant(draggedEmp._id, targetEmp._id, employees)) {
          // Show brief visual rejection — cannot create cycle
          setNodes(nodesWithLayout);
          return;
        }

        // Calculate subtree size for confirmation dialog
        const subtreeSize = getSubtreeSize(draggedEmp._id, employees);

        // Show confirmation dialog with affected count
        setPendingMove({
          draggedEmp,
          targetEmp,
          subtreeSize,
        });
      } else {
        // No drop target — reset positions
        setNodes(nodesWithLayout);
      }
    },
    [reactFlowInstance, employees, nodesWithLayout, setNodes],
  );

  // Handle subtree move confirmation
  const handleConfirmMove = useCallback(() => {
    if (!pendingMove) return;
    moveEmployee(
      pendingMove.draggedEmp._id,
      pendingMove.targetEmp._id,
      pendingMove.draggedEmp.order,
    );
    setPendingMove(null);
  }, [pendingMove, moveEmployee]);

  const handleCancelMove = useCallback(() => {
    setPendingMove(null);
    // Reset node positions
    setNodes(nodesWithLayout);
  }, [nodesWithLayout, setNodes]);

  return (
    <div className="relative h-full w-full -m-6">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStart={isViewer ? undefined : handleNodeDragStart}
        onNodeDragStop={isViewer ? undefined : handleNodeDragStop}
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes}
        nodesDraggable={!isViewer}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
        multiSelectionKeyCode={navigator.platform?.toUpperCase().indexOf('MAC') >= 0 ? 'Meta' : 'Control'}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-left"
          nodeStrokeWidth={3}
          pannable
          zoomable
          style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
      </ReactFlow>

      {/* Overlay legend sits over the top-right corner of the canvas and
          is only rendered when an overlay is active (render is driven by
          the overlay store inside the component). */}
      <div className="pointer-events-none absolute right-4 top-4 z-10">
        <OverlayLegend />
      </div>

      {/* Subtree move confirmation dialog */}
      {pendingMove && (
        <SubtreeMoveConfirmDialog
          employeeName={pendingMove.draggedEmp.name}
          targetName={pendingMove.targetEmp.name}
          subtreeSize={pendingMove.subtreeSize}
          onConfirm={handleConfirmMove}
          onCancel={handleCancelMove}
        />
      )}
    </div>
  );
}
