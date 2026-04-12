import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { Employee } from '@/types';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;
const VERTICAL_GAP = 180;
const HORIZONTAL_GAP = 260;

interface TreeNode {
  employee: Employee;
  children: TreeNode[];
}

/**
 * Build forest of tree nodes from flat employee array.
 * Each root is an employee with managerId === null | undefined.
 */
function buildForest(employees: Employee[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create tree nodes
  for (const emp of employees) {
    map.set(emp._id, { employee: emp, children: [] });
  }

  // Link children to parents
  for (const emp of employees) {
    const node = map.get(emp._id)!;
    if (emp.managerId && map.has(emp.managerId)) {
      map.get(emp.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by order field for consistent layout
  for (const node of map.values()) {
    node.children.sort((a, b) => a.employee.order - b.employee.order);
  }

  return roots.sort((a, b) => a.employee.order - b.employee.order);
}

/**
 * Calculate the width of a subtree (number of leaf-level slots).
 */
function subtreeWidth(node: TreeNode): number {
  if (node.children.length === 0) {
    return 1;
  }
  return node.children.reduce((sum, child) => sum + subtreeWidth(child), 0);
}

/**
 * Recursively assign positions to nodes.
 * x is the left edge of the available slot; returns the nodes and edges.
 */
function layoutSubtree(
  node: TreeNode,
  x: number,
  y: number,
  nodes: Node[],
  edges: Edge[]
): number {
  const width = subtreeWidth(node);
  const totalWidth = width * HORIZONTAL_GAP;

  // Center this node within its allotted horizontal space
  const centerX = x + totalWidth / 2 - NODE_WIDTH / 2;

  const isVacant = node.employee.status === 'Open Req' || node.employee.status === 'Backfill';

  nodes.push({
    id: node.employee._id,
    type: isVacant ? 'vacant' : 'employee',
    position: { x: centerX, y },
    data: { ...node.employee, label: node.employee.name },
  });

  // Layout children
  let childX = x;
  for (const child of node.children) {
    const childWidth = subtreeWidth(child);
    const childSlotWidth = childWidth * HORIZONTAL_GAP;

    edges.push({
      id: `${node.employee._id}-${child.employee._id}`,
      source: node.employee._id,
      target: child.employee._id,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    });

    layoutSubtree(child, childX, y + VERTICAL_GAP, nodes, edges);
    childX += childSlotWidth;
  }

  return totalWidth;
}

/**
 * Layout the full forest. Multiple roots are placed side by side.
 */
function layoutTree(employees: Employee[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (employees.length === 0) {
    return { nodes, edges };
  }

  const roots = buildForest(employees);
  let offsetX = 0;

  for (const root of roots) {
    const width = subtreeWidth(root) * HORIZONTAL_GAP;
    layoutSubtree(root, offsetX, 0, nodes, edges);
    offsetX += width + HORIZONTAL_GAP; // extra gap between separate trees
  }

  return { nodes, edges };
}

/**
 * Custom hook that converts a flat Employee array into React Flow nodes and edges
 * with calculated tree layout positions.
 */
export function useTreeLayout(employees: Employee[]): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => layoutTree(employees), [employees]);
}
