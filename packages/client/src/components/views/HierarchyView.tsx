import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import { ChevronRight, GripVertical, Users, Clock } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useScheduledChangeStore } from '@/stores/scheduledChangeStore';
import { cn } from '@/utils/cn';
import type { Employee } from '@/types';
import InlineEditableField from '@/components/inline/InlineEditableField';
import type { InlineEditableFieldHandle } from '@/components/inline/InlineEditableField';
import { isInputElement } from '@/hooks/useKeyboardShortcuts';
import SubtreeMoveConfirmDialog from '@/components/bulk/SubtreeMoveConfirmDialog';
import { isDescendant, getSubtreeSize, getDescendantIds } from '@/utils/subtreeUtils';

interface OutletContext {
  filteredEmployees: Employee[];
  statusFilters: string[];
  searchQuery: string;
  isViewer: boolean;
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

/** Editable field names for a hierarchy row */
type RowField = 'name' | 'title' | 'department' | 'level';

/** Deterministic field order for Tab traversal */
const ROW_FIELD_ORDER: RowField[] = ['name', 'title', 'department', 'level'];

function validateName(value: string): string | null {
  if (!value.trim()) return 'Name is required';
  return null;
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (employee: Employee) => void;
  activeId: string | null;
  onInlineEdit: (id: string, field: string, value: string) => void;
  onMultiSelect: (employee: Employee, event: React.MouseEvent) => void;
  multiSelectedIds: Set<string>;
  orderedIds: string[];
  /** IDs of nodes that belong to the subtree currently being dragged */
  draggingDescendantIds: Set<string>;
  /** When true, disable drag and inline editing (viewer role) */
  isViewer: boolean;
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
  activeId,
  onInlineEdit,
  onMultiSelect,
  multiSelectedIds,
  orderedIds,
  draggingDescendantIds,
  isViewer,
}: TreeRowProps) {
  const { employee } = node;
  const hasChildren = node.children.length > 0;
  const isExpanded = !collapsed.has(employee._id);
  const isSelected = selectedId === employee._id;
  const isMultiSelected = multiSelectedIds.has(employee._id);
  const hasPendingChanges = useScheduledChangeStore((s) => s.hasPendingChanges(employee._id));
  const [isInlineEditing, setIsInlineEditing] = useState(false);

  // Refs for each editable field to enable Tab traversal
  const fieldRefs = useRef<Record<RowField, InlineEditableFieldHandle | null>>({
    name: null,
    title: null,
    department: null,
    level: null,
  });

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
    disabled: isViewer || isInlineEditing,
  });

  const isOver = over?.id === employee._id && activeId !== employee._id;
  const isDraggedSubtreeMember = draggingDescendantIds.has(employee._id);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: `${depth * 24 + 12}px`,
  };

  const handleEditStart = useCallback(() => {
    setIsInlineEditing(true);
  }, []);

  const handleEditEnd = useCallback(() => {
    setIsInlineEditing(false);
  }, []);

  const handleSave = useCallback(
    (field: string, value: string) => {
      onInlineEdit(employee._id, field, value);
    },
    [employee._id, onInlineEdit],
  );

  const handleTab = useCallback((field: RowField, shiftKey: boolean) => {
    const currentIndex = ROW_FIELD_ORDER.indexOf(field);
    if (currentIndex === -1) return;
    const nextIndex = shiftKey ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex >= 0 && nextIndex < ROW_FIELD_ORDER.length) {
      const nextField = ROW_FIELD_ORDER[nextIndex];
      // Use setTimeout to allow current field's save/blur to complete before activating next
      setTimeout(() => {
        fieldRefs.current[nextField]?.startEditing();
      }, 0);
    }
  }, []);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors',
          isMultiSelected && 'bg-blue-100 ring-2 ring-blue-400',
          isSelected && !isMultiSelected && 'bg-blue-50 ring-1 ring-blue-200',
          isOver && 'bg-blue-100 ring-2 ring-blue-400',
          isDragging && 'opacity-40',
          isDraggedSubtreeMember && !isDragging && 'bg-blue-50 ring-1 ring-blue-300 opacity-70',
          !isSelected && !isMultiSelected && !isOver && !isDragging && !isDraggedSubtreeMember && 'hover:bg-gray-50',
        )}
        onClick={(e) => {
          if (!isInlineEditing) {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isModKey = isMac ? e.metaKey : e.ctrlKey;
            if (isModKey || e.shiftKey) {
              onMultiSelect(employee, e);
            } else {
              onSelect(employee);
            }
          }
        }}
      >
        {/* Drag handle */}
        {!isViewer && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className={cn(
              'shrink-0 cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing',
              isInlineEditing && 'pointer-events-none opacity-30',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </button>
        )}

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
            <InlineEditableField
              ref={(el) => { fieldRefs.current.name = el; }}
              value={employee.name}
              fieldName="name"
              onSave={(v) => handleSave('name', v)}
              validate={validateName}
              displayClassName="truncate font-medium text-gray-900"
              inputClassName="text-sm font-medium"
              testIdPrefix="hierarchy-inline"
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
              onTab={(shiftKey) => handleTab('name', shiftKey)}
              disabled={isViewer}
            />
            {hasChildren && (
              <span className="text-xs text-gray-400">
                ({node.children.length})
              </span>
            )}
          </div>
          <InlineEditableField
            ref={(el) => { fieldRefs.current.title = el; }}
            value={employee.title}
            fieldName="title"
            onSave={(v) => handleSave('title', v)}
            displayClassName="truncate text-xs text-gray-500"
            inputClassName="text-xs"
            testIdPrefix="hierarchy-inline"
            onEditStart={handleEditStart}
            onEditEnd={handleEditEnd}
            onTab={(shiftKey) => handleTab('title', shiftKey)}
            disabled={isViewer}
          />
        </div>

        {/* Department */}
        <div className="hidden w-28 shrink-0 md:block">
          <InlineEditableField
            ref={(el) => { fieldRefs.current.department = el; }}
            value={employee.department}
            fieldName="department"
            onSave={(v) => handleSave('department', v)}
            displayClassName="truncate text-sm text-gray-500"
            inputClassName="text-sm"
            testIdPrefix="hierarchy-inline"
            onEditStart={handleEditStart}
            onEditEnd={handleEditEnd}
            onTab={(shiftKey) => handleTab('department', shiftKey)}
            disabled={isViewer}
          />
        </div>

        {/* Level */}
        <div className="hidden w-16 shrink-0 lg:block">
          <InlineEditableField
            ref={(el) => { fieldRefs.current.level = el; }}
            value={employee.level}
            fieldName="level"
            onSave={(v) => handleSave('level', v)}
            displayClassName="truncate text-sm text-gray-500"
            inputClassName="text-sm"
            testIdPrefix="hierarchy-inline"
            onEditStart={handleEditStart}
            onEditEnd={handleEditEnd}
            onTab={(shiftKey) => handleTab('level', shiftKey)}
            disabled={isViewer}
          />
        </div>

        {/* Pending change indicator */}
        {hasPendingChanges && (
          <span
            className="shrink-0 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600"
            title="Has pending scheduled changes"
            data-testid="pending-change-indicator"
          >
            <Clock size={10} className="mr-0.5" />
            Pending
          </span>
        )}

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
                onInlineEdit={onInlineEdit}
                onMultiSelect={onMultiSelect}
                multiSelectedIds={multiSelectedIds}
                orderedIds={orderedIds}
                draggingDescendantIds={draggingDescendantIds}
                isViewer={isViewer}
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

function DragOverlayContent({ employee, subtreeSize }: { employee: Employee; subtreeSize: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-white px-4 py-2 shadow-lg ring-1 ring-gray-200">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
        {getInitials(employee.name)}
      </div>
      <div>
        <div className="font-medium text-gray-900">{employee.name}</div>
        <div className="text-xs text-gray-500">{employee.title}</div>
      </div>
      {subtreeSize > 1 && (
        <div className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          <Users size={12} />
          <span>+{subtreeSize - 1}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HierarchyView                                                     */
/* ------------------------------------------------------------------ */

export default function HierarchyView() {
  const { filteredEmployees, isViewer } = useOutletContext<OutletContext>();
  const { employees, selectedEmployee, moveEmployee, updateEmployee } = useOrgStore();
  const { selectedIds, toggleSelect, rangeSelect, clearSelection } = useSelectionStore();

  // Tracks which nodes are *collapsed* – everything is expanded by default.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Subtree move confirmation dialog state
  const [pendingMove, setPendingMove] = useState<{
    draggedEmp: Employee;
    targetEmp: Employee;
    subtreeSize: number;
  } | null>(null);

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

  // Compute subtree size and descendant IDs for the actively dragged node
  const activeSubtreeSize = useMemo(
    () => (activeId ? getSubtreeSize(activeId, employees) : 1),
    [activeId, employees],
  );

  const draggingDescendantIds = useMemo(
    () => (activeId ? getDescendantIds(activeId, employees) : new Set<string>()),
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
    clearSelection();
    // Set lastClickedId so it serves as the anchor for subsequent Shift+Click range selection
    useSelectionStore.setState({ lastClickedId: employee._id });
  }, [clearSelection]);

  const handleMultiSelect = useCallback(
    (employee: Employee, event: React.MouseEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModKey = isMac ? event.metaKey : event.ctrlKey;

      if (event.shiftKey) {
        rangeSelect(employee._id, sortableIds);
      } else if (isModKey) {
        toggleSelect(employee._id);
      }
    },
    [sortableIds, toggleSelect, rangeSelect],
  );

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

        // Cycle detection: prevent dropping onto own descendant
        if (isDescendant(draggedEmp._id, targetEmp._id, employees)) {
          return; // silently reject cycle-creating drop
        }

        // Already reports to this target — no-op
        if (draggedEmp.managerId === targetEmp._id) {
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
      }
    },
    [moveEmployee, employees],
  );

  // Handle subtree move confirmation
  const handleConfirmMove = useCallback(() => {
    if (!pendingMove) return;
    moveEmployee(
      pendingMove.draggedEmp._id,
      pendingMove.targetEmp._id,
      0,
    );
    setPendingMove(null);
  }, [pendingMove, moveEmployee]);

  const handleCancelMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const handleInlineEdit = useCallback(
    (id: string, field: string, value: string) => {
      updateEmployee(id, { [field]: value });
    },
    [updateEmployee],
  );

  /* -- Arrow key navigation ----------------------------------------- */

  /** Build a map of id → TreeNode for quick lookup */
  const nodeMap = useMemo(() => {
    const map = new Map<string, TreeNode>();
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        map.set(n.employee._id, n);
        walk(n.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);

  /** Find the parent id of a given employee id in the tree */
  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>();
    const walk = (nodes: TreeNode[], parentId: string | null) => {
      for (const n of nodes) {
        map.set(n.employee._id, parentId);
        walk(n.children, n.employee._id);
      }
    };
    walk(tree, null);
    return map;
  }, [tree]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (isInputElement(e.target)) return;

      const currentId = selectedEmployee?._id ?? null;
      if (!currentId && !['ArrowDown'].includes(e.key)) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (!currentId) {
            // Select the first visible row
            if (sortableIds.length > 0) {
              const first = employees.find((emp) => emp._id === sortableIds[0]);
              if (first) handleSelect(first);
            }
          } else {
            const idx = sortableIds.indexOf(currentId);
            if (idx >= 0 && idx < sortableIds.length - 1) {
              const nextId = sortableIds[idx + 1];
              const next = employees.find((emp) => emp._id === nextId);
              if (next) handleSelect(next);
            }
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (!currentId) break;
          const idx = sortableIds.indexOf(currentId);
          if (idx > 0) {
            const prevId = sortableIds[idx - 1];
            const prev = employees.find((emp) => emp._id === prevId);
            if (prev) handleSelect(prev);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (!currentId) break;
          const node = nodeMap.get(currentId);
          if (node && node.children.length > 0) {
            if (collapsed.has(currentId)) {
              // Expand the node
              handleToggle(currentId);
            } else {
              // Move to first child
              const firstChild = node.children[0];
              if (firstChild) handleSelect(firstChild.employee);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (!currentId) break;
          const node = nodeMap.get(currentId);
          if (node && node.children.length > 0 && !collapsed.has(currentId)) {
            // Collapse the node
            handleToggle(currentId);
          } else {
            // Move to parent
            const parentId = parentMap.get(currentId);
            if (parentId) {
              const parent = employees.find((emp) => emp._id === parentId);
              if (parent) handleSelect(parent);
            }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedEmployee, sortableIds, employees, collapsed, nodeMap, parentMap, handleSelect, handleToggle]);

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
              onInlineEdit={handleInlineEdit}
              onMultiSelect={handleMultiSelect}
              multiSelectedIds={selectedIds}
              orderedIds={sortableIds}
              draggingDescendantIds={draggingDescendantIds}
              isViewer={isViewer}
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
          <DragOverlayContent employee={activeEmployee} subtreeSize={activeSubtreeSize} />
        ) : null}
      </DragOverlay>

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
    </DndContext>
  );
}
