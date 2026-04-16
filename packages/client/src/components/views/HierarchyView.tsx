import { useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, GripVertical } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { cn } from '@/utils/cn';
import type { Employee } from '@/types';

interface OutletContext {
  filteredEmployees: Employee[];
  statusFilters: string[];
  searchQuery: string;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TreeNode {
  employee: Employee;
  children: TreeNode[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-blue-100 text-blue-700',
  Planned: 'bg-amber-100 text-amber-700',
  'Open Req': 'bg-green-100 text-green-700',
  Backfill: 'bg-purple-100 text-purple-700',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Build a tree from a flat array of employees. */
function buildTree(employees: Employee[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const emp of employees) {
    map.set(emp._id, { employee: emp, children: [] });
  }

  for (const emp of employees) {
    const node = map.get(emp._id)!;
    if (emp.managerId && map.has(emp.managerId)) {
      map.get(emp.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.employee.order - b.employee.order);
    for (const node of nodes) sortChildren(node.children);
  };
  sortChildren(roots);

  return roots;
}

/** Flatten visible tree ids for the SortableContext. */
function flattenIds(nodes: TreeNode[], collapsed: Set<string>): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    result.push(node.employee._id);
    if (!collapsed.has(node.employee._id)) {
      result.push(...flattenIds(node.children, collapsed));
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  TreeRow                                                            */
/* ------------------------------------------------------------------ */

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (employee: Employee) => void;
  activeId: string | null;
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
  activeId,
}: TreeRowProps) {
  const { employee } = node;
  const hasChildren = node.children.length > 0;
  const isExpanded = !collapsed.has(employee._id);
  const isSelected = selectedId === employee._id;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    over,
  } = useSortable({
    id: employee._id,
    data: { employee },
  });

  const isOver = over?.id === employee._id && activeId !== employee._id;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: `${depth * 24 + 12}px`,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors',
          isSelected && 'bg-blue-50 ring-1 ring-blue-200',
          isOver && 'bg-blue-100 ring-2 ring-blue-400',
          isDragging && 'opacity-40',
          !isSelected && !isOver && !isDragging && 'hover:bg-gray-50',
        )}
        onClick={() => onSelect(employee)}
      >
        {/* Drag handle */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </button>

        {/* Expand / collapse chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(employee._id);
          }}
          className={cn(
            'shrink-0',
            hasChildren
              ? 'text-gray-500 hover:text-gray-700'
              : 'invisible',
          )}
        >
          <ChevronRight
            size={16}
            className={cn(
              'transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
          />
        </button>

        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
          {getInitials(employee.name)}
        </div>

        {/* Name + title */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900">
              {employee.name}
            </span>
            {hasChildren && (
              <span className="text-xs text-gray-400">
                ({node.children.length})
              </span>
            )}
          </div>
          <div className="truncate text-xs text-gray-500">{employee.title}</div>
        </div>

        {/* Department */}
        <span className="hidden w-28 shrink-0 truncate text-sm text-gray-500 md:block">
          {employee.department}
        </span>

        {/* Level */}
        <span className="hidden w-16 shrink-0 truncate text-sm text-gray-500 lg:block">
          {employee.level}
        </span>

        {/* Status badge */}
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
            STATUS_COLORS[employee.status] ?? 'bg-gray-100 text-gray-600',
          )}
        >
          {employee.status}
        </span>
      </div>

      {/* Children – animated via CSS grid rows */}
      {hasChildren && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            {node.children.map((child) => (
              <TreeRow
                key={child.employee._id}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                selectedId={selectedId}
                onSelect={onSelect}
                activeId={activeId}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  DragOverlayContent                                                 */
/* ------------------------------------------------------------------ */

function DragOverlayContent({ employee }: { employee: Employee }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-white px-4 py-2 shadow-lg ring-1 ring-gray-200">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
        {getInitials(employee.name)}
      </div>
      <div>
        <div className="font-medium text-gray-900">{employee.name}</div>
        <div className="text-xs text-gray-500">{employee.title}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HierarchyView                                                     */
/* ------------------------------------------------------------------ */

export default function HierarchyView() {
  const { filteredEmployees } = useOutletContext<OutletContext>();
  const { employees, selectedEmployee, moveEmployee } = useOrgStore();

  // Tracks which nodes are *collapsed* – everything is expanded by default.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(filteredEmployees), [filteredEmployees]);
  const sortableIds = useMemo(
    () => flattenIds(tree, collapsed),
    [tree, collapsed],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const activeEmployee = useMemo(
    () => (activeId ? employees.find((e) => e._id === activeId) ?? null : null),
    [activeId, employees],
  );

  /* -- callbacks ---------------------------------------------------- */

  const handleToggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((employee: Employee) => {
    useOrgStore.setState({ selectedEmployee: employee });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const draggedEmp = active.data.current?.employee as Employee | undefined;
      const targetEmp = over.data.current?.employee as Employee | undefined;
      if (!draggedEmp || !targetEmp) return;

      if (
        draggedEmp.managerId === targetEmp.managerId &&
        draggedEmp.managerId !== undefined
      ) {
        // Same parent → reorder among siblings
        moveEmployee(
          draggedEmp._id,
          draggedEmp.managerId ?? null,
          targetEmp.order,
        );
      } else {
        // Different parent → reparent under target
        moveEmployee(draggedEmp._id, targetEmp._id, 0);
      }
    },
    [moveEmployee],
  );

  /* -- render ------------------------------------------------------- */

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortableIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0.5">
          {tree.map((node) => (
            <TreeRow
              key={node.employee._id}
              node={node}
              depth={0}
              collapsed={collapsed}
              onToggle={handleToggle}
              selectedId={selectedEmployee?._id ?? null}
              onSelect={handleSelect}
              activeId={activeId}
            />
          ))}
          {filteredEmployees.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              No employees match the current filters.
            </div>
          )}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeEmployee ? (
          <DragOverlayContent employee={activeEmployee} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
