import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Toolbar from './Toolbar';
import HeadcountSummary from '@/components/panels/HeadcountSummary';
import EmployeeDetailPanel from '@/components/panels/EmployeeDetailPanel';
import BudgetPanel from '@/components/panels/BudgetPanel';
import MembersPanel from '@/components/panels/MembersPanel';
import BulkOperationsToolbar from '@/components/bulk/BulkOperationsToolbar';
import KeyboardShortcutsHelp from '@/components/help/KeyboardShortcutsHelp';
import ExportDialog from '@/components/panels/ExportDialog';
import DeleteConfirmDialog from '@/components/bulk/DeleteConfirmDialog';
import PendingChangesPanel from '@/components/panels/PendingChangesPanel';
import { useOrgStore } from '@/stores/orgStore';
import { useUndoRedoStore } from '@/stores/undoRedoStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { useScheduledChangeStore } from '@/stores/scheduledChangeStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { exportOrgChart, type ExportOptions } from '@/utils/exportOrgChart';

export default function AppShell() {
  const { currentOrg, currentScenario, employees, selectedEmployee, selectEmployee, removeEmployee, bulkDeleteEmployees, fetchOrgs, fetchScenarios, fetchEmployees } = useOrgStore();

  const setActiveScenario = useUndoRedoStore((s) => s.setActiveScenario);

  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const selectedIds = useSelectionStore((s) => s.selectedIds);

  const fetchMyRole = useInvitationStore((s) => s.fetchMyRole);
  const resetRole = useInvitationStore((s) => s.resetRole);
  const currentRole = useInvitationStore((s) => s.currentRole);

  const fetchScheduledChanges = useScheduledChangeStore((s) => s.fetchScheduledChanges);
  const clearScheduledChanges = useScheduledChangeStore((s) => s.clearChanges);

  const [statusFilters, setStatusFilters] = useState<string[]>(['Active', 'Planned', 'Open Req', 'Backfill']);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingChangesOpen, setPendingChangesOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- Delete selected employee(s) via keyboard ---
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size > 0 || selectedEmployee) {
      setDeleteConfirmOpen(true);
    }
  }, [selectedIds, selectedEmployee]);

  const handleConfirmDelete = useCallback(async () => {
    if (selectedIds.size > 0) {
      const ids = Array.from(selectedIds);
      await bulkDeleteEmployees(ids);
      clearSelection();
    } else if (selectedEmployee) {
      await removeEmployee(selectedEmployee._id);
    }
    setDeleteConfirmOpen(false);
  }, [selectedIds, selectedEmployee, bulkDeleteEmployees, removeEmployee, clearSelection]);

  // --- Close panels ---
  const handleClosePanel = useCallback(() => {
    setShowNewEmployee(false);
    selectEmployee(null);
    setBudgetOpen(false);
  }, [selectEmployee]);

  // --- Export chart handler ---
  const handleExportChart = useCallback(async (options: ExportOptions) => {
    setIsExporting(true);
    try {
      await exportOrgChart(currentScenario?.name ?? 'export', options);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
      setExportDialogOpen(false);
    }
  }, [currentScenario]);

  // Compute unique departments from employees
  const departments = useMemo(() => {
    const deptSet = new Set(employees.map((e) => e.department).filter(Boolean));
    return Array.from(deptSet).sort();
  }, [employees]);

  // --- Keyboard shortcuts ---
  useKeyboardShortcuts({
    searchInputRef,
    onOpenShortcutsHelp: () => setShortcutsHelpOpen((prev) => !prev),
    onDeleteSelected: handleDeleteSelected,
    onClosePanel: handleClosePanel,
  });

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    if (currentOrg) {
      fetchScenarios(currentOrg._id);
      fetchMyRole(currentOrg._id);
    } else {
      resetRole();
    }
  }, [currentOrg, fetchScenarios, fetchMyRole, resetRole]);

  useEffect(() => {
    if (currentScenario) {
      fetchEmployees(currentScenario._id);
      fetchScheduledChanges(currentScenario._id);
      setActiveScenario(currentScenario._id);
    } else {
      setActiveScenario(null);
      clearScheduledChanges();
    }
    // Clear selection when scenario changes
    clearSelection();
  }, [currentScenario, fetchEmployees, fetchScheduledChanges, setActiveScenario, clearSelection, clearScheduledChanges]);

  const handleToggleStatus = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const filteredEmployees = employees.filter((emp) => {
    if (!statusFilters.includes(emp.status)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return emp.name.toLowerCase().includes(q) || emp.title.toLowerCase().includes(q);
    }
    return true;
  });

  const showDetailPanel = showNewEmployee || selectedEmployee !== null;

  // Determine delete dialog details
  const deleteCount = selectedIds.size > 0 ? selectedIds.size : selectedEmployee ? 1 : 0;
  const deleteEmployeeName = (() => {
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      return employees.find((e) => e._id === id)?.name;
    }
    if (selectedIds.size === 0 && selectedEmployee) {
      return selectedEmployee.name;
    }
    return undefined;
  })();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        onToggleBudget={() => setBudgetOpen(!budgetOpen)}
        onToggleMembers={() => setMembersOpen(!membersOpen)}
        onTogglePendingChanges={() => setPendingChangesOpen(!pendingChangesOpen)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Toolbar
          statusFilters={statusFilters}
          onToggleStatus={handleToggleStatus}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onAddEmployee={() => { setShowNewEmployee(true); selectEmployee(null); }}
          searchInputRef={searchInputRef}
          onExportChart={() => setExportDialogOpen(true)}
          onOpenShortcutsHelp={() => setShortcutsHelpOpen(true)}
          isViewer={currentRole === 'viewer'}
        />

        <BulkOperationsToolbar />

        <main className="flex-1 overflow-auto bg-gray-50">
          <Outlet context={{ filteredEmployees, statusFilters, searchQuery, isViewer: currentRole === 'viewer' }} />
        </main>

        <HeadcountSummary />
      </div>

      {showDetailPanel && (
        <EmployeeDetailPanel
          employee={selectedEmployee}
          isNew={showNewEmployee}
          onClose={handleClosePanel}
        />
      )}

      <BudgetPanel open={budgetOpen} onClose={() => setBudgetOpen(false)} />

      <MembersPanel open={membersOpen} onClose={() => setMembersOpen(false)} />

      <PendingChangesPanel open={pendingChangesOpen} onClose={() => setPendingChangesOpen(false)} />

      <KeyboardShortcutsHelp
        open={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
      />

      {deleteConfirmOpen && (
        <DeleteConfirmDialog
          count={deleteCount}
          employeeName={deleteEmployeeName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExportChart}
        departments={departments}
        isExporting={isExporting}
      />
    </div>
  );
}
