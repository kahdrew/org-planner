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
  useReactFlow,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Employee } from '@/types';
import { useOrgStore } from '@/stores/orgStore';
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

  // Compute layout from filtered employees
  const { nodes: layoutNodes, edges: layoutEdges } = useTreeLayout(filteredEmployees);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Sync layout when employees change
  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

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
    [nodes, moveEmployee]
  );

  return (
    <div className="h-full w-full -m-6">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
