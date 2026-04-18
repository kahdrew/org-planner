import { useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  ValueFormatterParams,
  ICellRendererParams,
  CellValueChangedEvent,
  SelectionChangedEvent,
  ValueParserParams,
  RowClickedEvent,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { useOrgStore } from '@/stores/orgStore';
import { useSelectionStore } from '@/stores/selectionStore';
import type { Employee } from '@/types';

interface OutletContext {
  filteredEmployees: Employee[];
  statusFilters: string[];
  searchQuery: string;
  isViewer: boolean;
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
  const { filteredEmployees, isViewer } = useOutletContext<OutletContext>();
  const { employees, updateEmployee } = useOrgStore();
  const { selectedIds, toggleSelect, rangeSelect } = useSelectionStore();
  const gridRef = useRef<AgGridReact<Employee>>(null);

  /** Map of employee id → name for manager column display (uses all employees so names resolve even for filtered-out managers). */
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
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        sort: 'asc',
        sortIndex: 1,
        pinned: 'left' as const,
        minWidth: 180,
      },
      {
        field: 'title',
        headerName: 'Title',
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        minWidth: 180,
      },
      {
        field: 'department',
        headerName: 'Department',
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        sort: 'asc',
        sortIndex: 0,
        minWidth: 140,
      },
      {
        field: 'level',
        headerName: 'Level',
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        minWidth: 100,
      },
      {
        field: 'location',
        headerName: 'Location',
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        minWidth: 130,
      },
      {
        field: 'employmentType',
        headerName: 'Employment Type',
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        minWidth: 140,
      },
      {
        field: 'status',
        headerName: 'Status',
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        cellRenderer: StatusCellRenderer,
        minWidth: 120,
      },
      {
        field: 'salary',
        headerName: 'Salary',
        editable: !isViewer,
        filter: 'agNumberColumnFilter',
        valueFormatter: currencyFormatter,
        valueParser: numberParser,
        minWidth: 130,
      },
      {
        field: 'equity',
        headerName: 'Equity',
        editable: !isViewer,
        filter: 'agNumberColumnFilter',
        valueFormatter: currencyFormatter,
        valueParser: numberParser,
        minWidth: 130,
      },
      {
        field: 'costCenter',
        headerName: 'Cost Center',
        editable: !isViewer,
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
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        minWidth: 120,
      },
      {
        field: 'requisitionId',
        headerName: 'Requisition ID',
        editable: !isViewer,
        filter: 'agTextColumnFilter',
        minWidth: 140,
      },
    ],
    [managerMap, isViewer],
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

  /** Ordered list of employee IDs for range selection */
  const orderedIds = useMemo(
    () => filteredEmployees.map((e) => e._id),
    [filteredEmployees],
  );

  const handleRowClicked = useCallback(
    (event: RowClickedEvent<Employee>) => {
      if (!event.data) return;
      const nativeEvent = event.event as MouseEvent | undefined;
      if (!nativeEvent) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModKey = isMac ? nativeEvent.metaKey : nativeEvent.ctrlKey;

      if (nativeEvent.shiftKey) {
        rangeSelect(event.data._id, orderedIds);
      } else if (isModKey) {
        toggleSelect(event.data._id);
      } else {
        // Plain click: clear multi-selection but retain this row as the
        // anchor for subsequent Shift+Click range selection (VAL-MULTI-002).
        useSelectionStore.getState().clearSelection();
        useSelectionStore.setState({ lastClickedId: event.data._id });
      }
    },
    [orderedIds, toggleSelect, rangeSelect],
  );

  /**
   * AG Grid does not fire `onRowClicked` when cell editing starts (the cell
   * intercepts the click). To ensure the anchor is always set — even when
   * the user clicks directly on a cell to begin inline editing — establish
   * the anchor in the grid's capture-phase click listener as well.
   */
  const handleGridMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.shiftKey) return;
      const rowEl = (event.target as HTMLElement).closest('[row-id]');
      const rowId = rowEl?.getAttribute('row-id');
      if (rowId) {
        useSelectionStore.setState({ lastClickedId: rowId });
      }
    },
    [],
  );

  /* -- Render ------------------------------------------------------- */

  return (
    <div
      className="ag-theme-alpine h-full w-full"
      onMouseDownCapture={handleGridMouseDown}
    >
      <AgGridReact<Employee>
        ref={gridRef}
        rowData={filteredEmployees}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowSelection="single"
        onCellValueChanged={handleCellValueChanged}
        onSelectionChanged={handleSelectionChanged}
        onRowClicked={handleRowClicked}
        animateRows={true}
        getRowId={(params) => params.data._id}
        getRowClass={(params) =>
          params.data && selectedIds.has(params.data._id)
            ? 'bg-blue-100'
            : undefined
        }
        overlayNoRowsTemplate="<span class='ag-overlay-no-rows-center'>No employees match the current filters.</span>"
      />
    </div>
  );
}
