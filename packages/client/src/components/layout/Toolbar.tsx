import { useLocation } from 'react-router-dom';
import { Plus, Upload, Download, Search, Undo2, Redo2, Users, Keyboard, FileDown, Send } from 'lucide-react';
import { useOrgStore } from '@/stores/orgStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { exportToCSV, parseCSV } from '@/utils/csv';
import { cn } from '@/utils/cn';
import * as employeesApi from '@/api/employees';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import OverlaySelector from '@/components/panels/OverlaySelector';

const STATUS_OPTIONS = ['Active', 'Planned', 'Open Req', 'Backfill'] as const;

const viewNames: Record<string, string> = {
  '/': 'Org Chart',
  '/hierarchy': 'Hierarchy',
  '/spreadsheet': 'Spreadsheet',
  '/kanban': 'Kanban',
  '/compare': 'Compare',
  '/dashboard': 'Dashboard',
  '/approvals': 'Approvals',
};

interface ToolbarProps {
  onAddEmployee?: () => void;
  statusFilters: string[];
  onToggleStatus: (status: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Ref forwarded from AppShell so Cmd+K can focus the search bar */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Callback to open the keyboard shortcuts help dialog */
  onOpenShortcutsHelp?: () => void;
  /** Callback to open the org chart export dialog */
  onExportChart?: () => void;
  /** Callback to open the headcount request dialog */
  onSubmitHeadcountRequest?: () => void;
  /** When true, write controls (Add Employee, Import) are disabled */
  isViewer?: boolean;
}

export default function Toolbar({
  onAddEmployee,
  statusFilters,
  onToggleStatus,
  searchQuery,
  onSearchChange,
  searchInputRef,
  onExportChart,
  onOpenShortcutsHelp,
  onSubmitHeadcountRequest,
  isViewer = false,
}: ToolbarProps) {
  const location = useLocation();
  const { employees, currentScenario } = useOrgStore();
  const selectionCount = useSelectionStore((s) => s.selectedIds.size);
  const approvalChains = useApprovalStore((s) => s.chains);
  const hasApprovalChains = approvalChains.length > 0;
  const viewName = viewNames[location.pathname] ?? 'Org Chart';
  const { handleUndo, handleRedo, canUndo, canRedo } = useUndoRedo();

  const addEmployeeDisabled = isViewer || hasApprovalChains;
  const addEmployeeTitle = isViewer
    ? 'Viewers cannot add employees'
    : hasApprovalChains
      ? 'This org uses approval chains. Use "Request Hire" to submit a headcount request for approval.'
      : undefined;

  const handleAddEmployeeClick = () => {
    if (addEmployeeDisabled) return;
    onAddEmployee?.();
  };

  const handleExport = () => {
    exportToCSV(employees, `org-planner-${currentScenario?.name ?? 'export'}.csv`);
  };

  const handleImport = async () => {
    if (!currentScenario) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length > 0) {
        await employeesApi.bulkCreateEmployees(currentScenario._id, parsed);
        useOrgStore.getState().fetchEmployees(currentScenario._id);
      }
    };
    input.click();
  };

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
      <h2 className="text-lg font-semibold text-gray-800">{viewName}</h2>

      <div className="mx-4 h-6 w-px bg-gray-200" />

      <button
        onClick={handleAddEmployeeClick}
        disabled={addEmployeeDisabled}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors',
          addEmployeeDisabled
            ? 'cursor-not-allowed bg-gray-300'
            : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
        )}
        title={addEmployeeTitle}
        data-testid="add-employee-btn"
        data-approval-gated={hasApprovalChains ? 'true' : 'false'}
      >
        <Plus size={16} />
        Add Employee
      </button>

      {onSubmitHeadcountRequest && (
        <button
          onClick={onSubmitHeadcountRequest}
          disabled={isViewer}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-blue-300 px-3 py-1.5 text-sm font-medium transition-colors',
            isViewer
              ? 'cursor-not-allowed border-gray-200 text-gray-300'
              : 'text-blue-700 hover:bg-blue-50'
          )}
          title={isViewer ? 'Viewers cannot submit requests' : 'Submit a headcount request for approval'}
          data-testid="submit-request-toolbar-btn"
        >
          <Send size={14} />
          Request Hire
        </button>
      )}

      <div className="mx-2 h-6 w-px bg-gray-200" />

      {/* Undo / Redo buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          disabled={!canUndo()}
          title="Undo (⌘Z)"
          data-testid="undo-button"
          className={cn(
            'rounded-md p-1.5 transition-colors',
            canUndo()
              ? 'text-gray-700 hover:bg-gray-100'
              : 'cursor-not-allowed text-gray-300',
          )}
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo()}
          title="Redo (⌘⇧Z)"
          data-testid="redo-button"
          className={cn(
            'rounded-md p-1.5 transition-colors',
            canRedo()
              ? 'text-gray-700 hover:bg-gray-100'
              : 'cursor-not-allowed text-gray-300',
          )}
        >
          <Redo2 size={18} />
        </button>
      </div>

      {/* Selection count badge */}
      {selectionCount > 0 && (
        <>
          <div className="mx-2 h-6 w-px bg-gray-200" />
          <div
            className="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700"
            data-testid="toolbar-selection-count"
          >
            <Users size={14} />
            {selectionCount} selected
          </div>
        </>
      )}

      <div className="mx-2 h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-1">
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            onClick={() => onToggleStatus(status)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilters.includes(status)
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="relative">
        <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={searchInputRef as React.RefObject<HTMLInputElement>}
          type="text"
          placeholder="Search by name or title… (⌘K)"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          data-testid="search-input"
        />
      </div>

      <button
        onClick={handleImport}
        disabled={isViewer}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors',
          isViewer
            ? 'cursor-not-allowed text-gray-400'
            : 'text-gray-700 hover:bg-gray-50'
        )}
        title={isViewer ? 'Viewers cannot import data' : undefined}
      >
        <Upload size={16} />
        Import CSV
      </button>

      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <Download size={16} />
        Export CSV
      </button>

      {onExportChart && (
        <button
          onClick={onExportChart}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          data-testid="export-chart-button"
        >
          <FileDown size={16} />
          Export Chart
        </button>
      )}

      <OverlaySelector />

      {onOpenShortcutsHelp && (
        <button
          onClick={onOpenShortcutsHelp}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          title="Keyboard shortcuts (?)"
          data-testid="shortcuts-help-button"
        >
          <Keyboard size={18} />
        </button>
      )}
    </div>
  );
}
