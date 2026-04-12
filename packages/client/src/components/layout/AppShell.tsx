import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Toolbar from './Toolbar';
import HeadcountSummary from '@/components/panels/HeadcountSummary';
import EmployeeDetailPanel from '@/components/panels/EmployeeDetailPanel';
import BudgetPanel from '@/components/panels/BudgetPanel';
import { useOrgStore } from '@/stores/orgStore';

export default function AppShell() {
  const { currentOrg, currentScenario, employees, selectedEmployee, selectEmployee, fetchOrgs, fetchScenarios, fetchEmployees } = useOrgStore();

  const [statusFilters, setStatusFilters] = useState<string[]>(['Active', 'Planned', 'Open Req', 'Backfill']);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    if (currentOrg) {
      fetchScenarios(currentOrg._id);
    }
  }, [currentOrg, fetchScenarios]);

  useEffect(() => {
    if (currentScenario) {
      fetchEmployees(currentScenario._id);
    }
  }, [currentScenario, fetchEmployees]);

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

  const handleClosePanel = () => {
    setShowNewEmployee(false);
    selectEmployee(null);
  };

  const showDetailPanel = showNewEmployee || selectedEmployee !== null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onToggleBudget={() => setBudgetOpen(!budgetOpen)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Toolbar
          statusFilters={statusFilters}
          onToggleStatus={handleToggleStatus}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onAddEmployee={() => { setShowNewEmployee(true); selectEmployee(null); }}
        />

        <main className="flex-1 overflow-auto bg-gray-50">
          <Outlet context={{ filteredEmployees, statusFilters, searchQuery }} />
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
    </div>
  );
}
