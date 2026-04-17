import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  useDroppable,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useOrgStore } from '@/stores/orgStore';
import { cn } from '@/utils/cn';
import type { Employee } from '@/types';

type GroupBy = 'department' | 'status';

interface OutletContext {
  filteredEmployees: Employee[];
  isViewer: boolean;
}

const ALL_STATUSES: Employee['status'][] = ['Active', 'Planned', 'Open Req', 'Backfill'];

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 border-green-200',
  Planned: 'bg-blue-100 text-blue-700 border-blue-200',
  'Open Req': 'bg-amber-100 text-amber-700 border-amber-200',
  Backfill: 'bg-purple-100 text-purple-700 border-purple-200',
};

const STATUS_DOT: Record<string, string> = {
  Active: 'bg-green-500',
  Planned: 'bg-blue-500',
  'Open Req': 'bg-amber-500',
  Backfill: 'bg-purple-500',
};

const EMP_TYPE_LABELS: Record<string, string> = {
  FTE: 'FTE',
  Contractor: 'CTR',
  Intern: 'INT',
};

/* ------------------------------------------------------------------ */
/*  Droppable Column                                                  */
/* ------------------------------------------------------------------ */
function DroppableColumn({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-lg border bg-gray-100',
        isOver ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200',
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
        <h3 className="truncate text-sm font-semibold text-gray-700">{title}</h3>
        <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
          {count}
        </span>
      </div>

      <div
        className="flex-1 space-y-2 overflow-y-auto p-2"
        style={{ maxHeight: 'calc(100vh - 240px)' }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Draggable Card                                                    */
/* ------------------------------------------------------------------ */
function DraggableCard({
  employee,
  onClick,
  disabled,
}: {
  employee: Employee;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: employee._id,
    data: { employee },
    disabled,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded-md border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md',
        !disabled && 'cursor-grab active:cursor-grabbing',
        isDragging && 'z-50 opacity-50 shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{employee.name}</p>
          <p className="truncate text-xs text-gray-500">{employee.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[employee.status] ?? 'bg-gray-400')} />
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight',
              STATUS_COLORS[employee.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
            )}
          >
            {employee.status}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium">{employee.level}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5">
          {EMP_TYPE_LABELS[employee.employmentType] ?? employee.employmentType}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KanbanView                                                        */
/* ------------------------------------------------------------------ */
export default function KanbanView() {
  const { filteredEmployees, isViewer } = useOutletContext<OutletContext>();
  const updateEmployee = useOrgStore((s) => s.updateEmployee);
  const [groupBy, setGroupBy] = useState<GroupBy>('department');

  // Require a small distance before starting drag so clicks still work
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const columns = useMemo(() => {
    const map = new Map<string, Employee[]>();

    // Pre-populate status columns so empty ones are still visible
    if (groupBy === 'status') {
      for (const s of ALL_STATUSES) {
        map.set(s, []);
      }
    }

    for (const emp of filteredEmployees) {
      const key = groupBy === 'department' ? emp.department : emp.status;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(emp);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEmployees, groupBy]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const employeeId = active.id as string;
    const targetColumn = over.id as string;
    const employee = filteredEmployees.find((e) => e._id === employeeId);
    if (!employee) return;

    const currentValue = groupBy === 'department' ? employee.department : employee.status;
    if (currentValue === targetColumn) return;

    const update =
      groupBy === 'department'
        ? { department: targetColumn }
        : { status: targetColumn as Employee['status'] };

    await updateEmployee(employeeId, update);
  };

  const handleSelectEmployee = (employee: Employee) => {
    useOrgStore.setState({ selectedEmployee: employee });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Group-by toggle */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">Group by:</span>
        <div className="flex overflow-hidden rounded-md border border-gray-300">
          <button
            onClick={() => setGroupBy('department')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium transition-colors',
              groupBy === 'department'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            Department
          </button>
          <button
            onClick={() => setGroupBy('status')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium transition-colors',
              groupBy === 'status'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            Status
          </button>
        </div>
      </div>

      {/* Board */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {columns.length === 0 && (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
              No employees to display
            </div>
          )}

          {columns.map(([columnName, employees]) => (
            <DroppableColumn
              key={columnName}
              id={columnName}
              title={columnName}
              count={employees.length}
            >
              {employees.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">No employees</p>
              ) : (
                employees.map((emp) => (
                  <DraggableCard
                    key={emp._id}
                    employee={emp}
                    onClick={() => handleSelectEmployee(emp)}
                    disabled={isViewer}
                  />
                ))
              )}
            </DroppableColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
