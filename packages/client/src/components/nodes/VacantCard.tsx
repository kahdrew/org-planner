import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { Plus } from 'lucide-react';
import type { Employee } from '@/types';
import { cn } from '@/utils/cn';
import { useOrgStore } from '@/stores/orgStore';

const STATUS_BADGE: Record<string, string> = {
  'Open Req': 'bg-green-50 text-green-700',
  Planned: 'bg-amber-50 text-amber-700',
  Backfill: 'bg-purple-50 text-purple-700',
};

type VacantNodeData = Employee & { label?: string };

function VacantCard({ data, selected }: NodeProps & { data: VacantNodeData }) {
  const employee = data as Employee;

  const handleClick = () => {
    useOrgStore.setState({ selectedEmployee: employee });
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'w-[220px] cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/80 shadow-sm transition-shadow hover:shadow-md',
        selected && 'ring-2 ring-blue-500 ring-offset-1'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-2 !h-2" />

      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-white text-gray-400">
            <Plus size={16} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-500">
              {employee.name || 'Open Position'}
            </p>
            <p className="truncate text-xs text-gray-400">{employee.title}</p>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <span className="truncate">{employee.department}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              STATUS_BADGE[employee.status] ?? 'bg-gray-100 text-gray-500'
            )}
          >
            {employee.status}
          </span>
          {employee.level && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {employee.level}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-300 !w-2 !h-2" />
    </div>
  );
}

export default memo(VacantCard);
