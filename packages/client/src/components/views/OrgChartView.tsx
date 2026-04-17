import { useCallback, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Employee } from '@/types';
import { useOrgStore } from '@/stores/orgStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useTreeLayout } from '@/hooks/useTreeLayout';
import EmployeeCard from '@/components/nodes/EmployeeCard';
import VacantCard from '@/components/nodes/VacantCard';

interface OutletContext {
  filteredEmployees: Employee[];
  statusFilters: string[];
  searchQuery: string;
}

const nodeTypes: NodeTypes = {
  employee: EmployeeCard,
  vacant: VacantCard,
};

export default function OrgChartView() {
  const { filteredEmployees } = useOutletContext<OutletContext>();
  const moveEmployee = useOrgStore((s) => s.moveEmployee);
  const { selectedIds, toggleSelect, clearSelection } = useSelectionStore();

  // Compute layout from filtered employees
  const { nodes: layoutNodes, edges: layoutEdges } = useTreeLayout(filteredEmployees);

  // Apply selection state to nodes
  const nodesWithSelection = useMemo(
    () =>
      layoutNodes.map((node) => ({
        ...node,
        selected: selectedIds.has(node.id),
      })),
    [layoutNodes, selectedIds],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(nodesWithSelection);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Sync layout when employees or selection change
  useEffect(() => {
    setNodes(nodesWithSelection);
    setEdges(layoutEdges);
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
        // Don't change multi-selection on plain click — only open panel
      }
    },
    [toggleSelect],
  );

  // Click on canvas background clears selection
  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Drag-to-reparent: detect when a node is dropped onto another node
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      // Find intersecting nodes by checking position overlap
      const THRESHOLD = 60;
      const dropTarget = nodes.find((n) => {
        if (n.id === draggedNode.id) return false;
        const dx = Math.abs(n.position.x - draggedNode.position.x);
        const dy = Math.abs(n.position.y - draggedNode.position.y);
        return dx < THRESHOLD * 2 && dy < THRESHOLD;
      });

      if (dropTarget) {
        const draggedEmp = draggedNode.data as unknown as Employee;
        const targetEmp = dropTarget.data as unknown as Employee;

        // Prevent circular: can't reparent to self or already a child
        if (draggedEmp.managerId === targetEmp._id) return;

        const confirmed = window.confirm(
          `Move "${draggedEmp.name}" to report to "${targetEmp.name}"?`
        );

        if (confirmed) {
          moveEmployee(draggedEmp._id, targetEmp._id, draggedEmp.order);
        }
      }
    },
    [nodes, moveEmployee],
  );

  return (
    <div className="h-full w-full -m-6">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
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
    </div>
  );
}
