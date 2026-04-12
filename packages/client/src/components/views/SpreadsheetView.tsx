import { useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  ValueFormatterParams,
  ICellRendererParams,
  CellValueChangedEvent,
  SelectionChangedEvent,
  ValueParserParams,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useOrgStore } from '@/stores/orgStore';
import type { Employee } from '@/types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-blue-100 text-blue-700',
  Planned: 'bg-amber-100 text-amber-700',
  'Open Req': 'bg-green-100 text-green-700',
  Backfill: 'bg-purple-100 text-purple-700',
};

function StatusCellRenderer(params: ICellRendererParams) {
  const status = params.value as string;
  if (!status) return null;
  const colorClass =
    STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {status}
    </span>
  );
}

function currencyFormatter(params: ValueFormatterParams): string {
  if (params.value == null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(params.value);
}

function numberParser(params: ValueParserParams): number | null {
  const val = Number(params.newValue);
  return isNaN(val) ? null : val;
}

/* ------------------------------------------------------------------ */
/*  SpreadsheetView                                                    */
/* ------------------------------------------------------------------ */

export default function SpreadsheetView() {
  const { employees, updateEmployee } = useOrgStore();
  const gridRef = useRef<AgGridReact<Employee>>(null);

  /** Map of employee id → name for manager column display. */
  const managerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      map.set(emp._id, emp.name);
    }
    return map;
  }, [employees]);

  /* -- Column definitions ------------------------------------------- */

  const columnDefs = useMemo<ColDef<Employee>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Name',
        editable: true,
        filter: 'agTextColumnFilter',
        sort: 'asc',
        sortIndex: 1,
        pinned: 'left' as const,
        minWidth: 180,
      },
      {
        field: 'title',
        headerName: 'Title',
        editable: true,
        filter: 'agTextColumnFilter',
        minWidth: 180,
      },
      {
        field: 'department',
        headerName: 'Department',
        editable: true,
        filter: 'agTextColumnFilter',
        sort: 'asc',
        sortIndex: 0,
        minWidth: 140,
      },
      {
        field: 'level',
        headerName: 'Level',
        editable: true,
        filter: 'agTextColumnFilter',
        minWidth: 100,
      },
      {
        field: 'location',
        headerName: 'Location',
        editable: true,
        filter: 'agTextColumnFilter',
        minWidth: 130,
      },
      {
        field: 'employmentType',
        headerName: 'Employment Type',
        editable: true,
        filter: 'agTextColumnFilter',
        minWidth: 140,
      },
      {
        field: 'status',
        headerName: 'Status',
        editable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: StatusCellRenderer,
        minWidth: 120,
      },
      {
        field: 'salary',
        headerName: 'Salary',
        editable: true,
        filter: 'agNumberColumnFilter',
        valueFormatter: currencyFormatter,
        valueParser: numberParser,
        minWidth: 130,
      },
      {
        field: 'equity',
        headerName: 'Equity',
        editable: true,
        filter: 'agNumberColumnFilter',
        valueFormatter: currencyFormatter,
        valueParser: numberParser,
        minWidth: 130,
      },
      {
        field: 'costCenter',
        headerName: 'Cost Center',
        editable: true,
        filter: 'agTextColumnFilter',
        minWidth: 120,
      },
      {
        headerName: 'Manager',
        field: 'managerId',
        editable: false,
        filter: 'agTextColumnFilter',
        minWidth: 160,
        valueFormatter: (params: ValueFormatterParams<Employee>) => {
          if (!params.value) return '';
          return managerMap.get(params.value as string) ?? '';
        },
        filterValueGetter: (params) => {
          const managerId = params.data?.managerId;
          if (!managerId) return '';
          return managerMap.get(managerId) ?? '';
        },
      },
      {
        field: 'startDate',
        headerName: 'Start Date',
        editable: true,
        filter: 'agTextColumnFilter',
        minWidth: 120,
      },
      {
        field: 'requisitionId',
        headerName: 'Requisition ID',
        editable: true,
        filter: 'agTextColumnFilter',
        minWidth: 140,
      },
    ],
    [managerMap],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      flex: 1,
      minWidth: 100,
    }),
    [],
  );

  /* -- Event handlers ----------------------------------------------- */

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<Employee>) => {
      const { data, colDef, newValue } = event;
      if (data && colDef.field) {
        updateEmployee(data._id, { [colDef.field]: newValue });
      }
    },
    [updateEmployee],
  );

  const handleSelectionChanged = useCallback(
    (event: SelectionChangedEvent<Employee>) => {
      const selected = event.api.getSelectedRows();
      if (selected.length > 0) {
        useOrgStore.setState({ selectedEmployee: selected[0] });
      }
    },
    [],
  );

  /* -- Render ------------------------------------------------------- */

  return (
    <div className="ag-theme-alpine h-full w-full">
      <AgGridReact<Employee>
        ref={gridRef}
        rowData={employees}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowSelection="single"
        onCellValueChanged={handleCellValueChanged}
        onSelectionChanged={handleSelectionChanged}
        animateRows={true}
        getRowId={(params) => params.data._id}
      />
    </div>
  );
}
