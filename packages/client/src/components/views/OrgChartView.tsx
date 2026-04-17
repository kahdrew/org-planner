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

  // Apply selection state and drag visual feedback to nodes
  const nodesWithSelection = useMemo(
    () =>
      layoutNodes.map((node) => ({
        ...node,
        selected: selectedIds.has(node.id),
        className:
          draggingNodeId && draggingDescendantIds.has(node.id)
            ? 'ring-2 ring-blue-400 ring-offset-1 opacity-70'
            : undefined,
      })),
    [layoutNodes, selectedIds, draggingNodeId, draggingDescendantIds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(nodesWithSelection);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Sync layout when employees or selection change
  useEffect(() => {
    isSyncingFromStore.current = true;
    setNodes(nodesWithSelection);
    setEdges(layoutEdges);
    // Reset the flag after React Flow processes the update
    requestAnimationFrame(() => {
      isSyncingFromStore.current = false;
    });
  }, [nodesWithSelection, layoutEdges, setNodes, setEdges]);

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

  // Sync React Flow's built-in selection (lasso/marquee) with our selectionStore
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      // Skip if we're syncing from store → React Flow (avoids infinite loop)
      if (isSyncingFromStore.current) return;

      const rfSelectedIds = selectedNodes.map((n) => n.id);

      // Only update store when the selection comes from React Flow's box/marquee selection
      // (not from our own click handlers which already update the store)
      if (rfSelectedIds.length > 0) {
        selectAll(rfSelectedIds);
      }
    },
    [selectAll],
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
          setNodes(nodesWithSelection);
          return;
        }

        // Cycle detection: prevent dropping onto own descendant
        if (isDescendant(draggedEmp._id, targetEmp._id, employees)) {
          // Show brief visual rejection — cannot create cycle
          setNodes(nodesWithSelection);
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
        setNodes(nodesWithSelection);
      }
    },
    [reactFlowInstance, employees, nodesWithSelection, setNodes],
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
    setNodes(nodesWithSelection);
  }, [nodesWithSelection, setNodes]);

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
