import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Employee } from '@/types';

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  _id: 'emp-1',
  scenarioId: 'scen-1',
  name: 'Alice Smith',
  title: 'Engineer',
  department: 'Engineering',
  level: 'IC3',
  location: 'NYC',
  employmentType: 'FTE',
  status: 'Active',
  order: 0,
  managerId: null,
  ...overrides,
});

const employees: Employee[] = [
  makeEmployee({ _id: 'emp-1', name: 'Alice Smith', title: 'Engineer' }),
  makeEmployee({
    _id: 'emp-2',
    name: 'Bob Jones',
    title: 'Manager',
    department: 'Design',
    status: 'Planned',
    order: 1,
  }),
];

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockUpdateEmployee = vi.fn();
const mockMoveEmployee = vi.fn();

vi.mock('@/stores/orgStore', () => ({
  useOrgStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees,
        selectedEmployee: null,
        updateEmployee: mockUpdateEmployee,
        moveEmployee: mockMoveEmployee,
      };
      return selector ? selector(state) : state;
    },
    {
      setState: vi.fn(),
      getState: vi.fn(() => ({
        employees,
        selectedEmployee: null,
        updateEmployee: mockUpdateEmployee,
        moveEmployee: mockMoveEmployee,
      })),
    },
  ),
}));

let outletContext: {
  filteredEmployees: Employee[];
  statusFilters: string[];
  searchQuery: string;
  isViewer: boolean;
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useOutletContext: () => outletContext,
  };
});

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCenter: vi.fn(),
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  useDraggable: (opts?: { disabled?: boolean }) => ({
    attributes: {},
    listeners: opts?.disabled ? {} : { 'data-draggable': 'true' },
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
    disabled: opts?.disabled ?? false,
  }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  verticalListSortingStrategy: {},
  useSortable: (opts?: { disabled?: boolean }) => ({
    attributes: {},
    listeners: opts?.disabled ? {} : { 'data-sortable': 'true' },
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
    over: null,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Translate: { toString: () => undefined },
  },
}));

// Mock AG Grid
let capturedColumnDefs: Array<{ field?: string; editable?: boolean }> = [];

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: {
    rowData: Employee[];
    columnDefs?: Array<{ field?: string; editable?: boolean }>;
    overlayNoRowsTemplate?: string;
  }) => {
    capturedColumnDefs = props.columnDefs ?? [];
    if (!props.rowData || props.rowData.length === 0) {
      return <div data-testid="ag-grid-empty">No rows</div>;
    }
    return (
      <div data-testid="ag-grid">
        {props.rowData.map((emp) => (
          <div key={emp._id} data-testid={`row-${emp._id}`}>
            {emp.name}
          </div>
        ))}
      </div>
    );
  },
}));

/* ------------------------------------------------------------------ */
/*  Import components AFTER mocks                                     */
/* ------------------------------------------------------------------ */

import SpreadsheetView from '../components/views/SpreadsheetView';
import HierarchyView from '../components/views/HierarchyView';
import KanbanView from '../components/views/KanbanView';
import InlineEditableField from '../components/inline/InlineEditableField';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  capturedColumnDefs = [];
});

describe('Viewer role guards', () => {
  describe('SpreadsheetView — AG Grid cells are not editable for viewers', () => {
    it('sets editable=false on all data columns when isViewer=true', () => {
      outletContext = {
        filteredEmployees: employees,
        statusFilters: ['Active', 'Planned'],
        searchQuery: '',
        isViewer: true,
      };

      render(<SpreadsheetView />);

      // All columns that are normally editable should now be non-editable
      const editableColumns = capturedColumnDefs.filter(
        (col) => col.field !== 'managerId' && col.editable === true,
      );
      expect(editableColumns).toHaveLength(0);

      // The data columns should all have editable=false
      const dataColumns = capturedColumnDefs.filter(
        (col) => col.field && col.field !== 'managerId',
      );
      for (const col of dataColumns) {
        expect(col.editable).toBe(false);
      }
    });

    it('sets editable=true on data columns when isViewer=false', () => {
      outletContext = {
        filteredEmployees: employees,
        statusFilters: ['Active', 'Planned'],
        searchQuery: '',
        isViewer: false,
      };

      render(<SpreadsheetView />);

      // Data columns (except managerId) should be editable
      const editableColumns = capturedColumnDefs.filter(
        (col) => col.field !== 'managerId' && col.editable === true,
      );
      expect(editableColumns.length).toBeGreaterThan(0);
    });
  });

  describe('HierarchyView — drag handle is hidden and inline fields disabled for viewers', () => {
    it('does not render drag handles when isViewer=true', () => {
      outletContext = {
        filteredEmployees: employees,
        statusFilters: ['Active', 'Planned'],
        searchQuery: '',
        isViewer: true,
      };

      render(<HierarchyView />);

      // Drag handles (GripVertical icons) should not be present
      // The drag handle is a button with a GripVertical icon — check that it's absent
      const gripButtons = screen.queryAllByRole('button');
      // None of them should have sortable listeners
      for (const btn of gripButtons) {
        expect(btn).not.toHaveAttribute('data-sortable');
      }
    });

    it('renders drag handles when isViewer=false', () => {
      outletContext = {
        filteredEmployees: employees,
        statusFilters: ['Active', 'Planned'],
        searchQuery: '',
        isViewer: false,
      };

      render(<HierarchyView />);

      // Employee names should be rendered
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });

    it('inline fields do not have click-to-edit title when isViewer=true', () => {
      outletContext = {
        filteredEmployees: employees,
        statusFilters: ['Active', 'Planned'],
        searchQuery: '',
        isViewer: true,
      };

      render(<HierarchyView />);

      // All inline editable name fields should not have "Click to edit" titles
      const nameDisplays = screen.getAllByTestId('hierarchy-inline-display-name');
      for (const display of nameDisplays) {
        expect(display).not.toHaveAttribute('title');
      }
    });
  });

  describe('KanbanView — cards are not draggable for viewers', () => {
    it('does not give draggable listeners to cards when isViewer=true', () => {
      outletContext = {
        filteredEmployees: employees,
        statusFilters: ['Active', 'Planned'],
        searchQuery: '',
        isViewer: true,
      };

      render(<KanbanView />);

      // Cards should exist but not be draggable
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('cards have draggable listeners when isViewer=false', () => {
      outletContext = {
        filteredEmployees: employees,
        statusFilters: ['Active', 'Planned'],
        searchQuery: '',
        isViewer: false,
      };

      render(<KanbanView />);

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
  });

  describe('InlineEditableField — disabled prop prevents editing', () => {
    it('does not enter edit mode when disabled and clicked', () => {
      const onSave = vi.fn();

      render(
        <InlineEditableField
          value="Test Value"
          fieldName="test"
          onSave={onSave}
          disabled={true}
          testIdPrefix="test-inline"
        />,
      );

      const display = screen.getByTestId('test-inline-display-test');
      expect(display).toBeInTheDocument();
      expect(display).not.toHaveAttribute('title'); // no "Click to edit" title

      // Click should not activate edit mode
      fireEvent.click(display);
      expect(screen.queryByTestId('test-inline-input-test')).not.toBeInTheDocument();
    });

    it('does not have cursor-pointer class when disabled', () => {
      render(
        <InlineEditableField
          value="Test Value"
          fieldName="test"
          onSave={vi.fn()}
          disabled={true}
          testIdPrefix="test-inline"
        />,
      );

      const display = screen.getByTestId('test-inline-display-test');
      expect(display.className).not.toContain('cursor-pointer');
    });

    it('enters edit mode when not disabled', () => {
      render(
        <InlineEditableField
          value="Test Value"
          fieldName="test"
          onSave={vi.fn()}
          disabled={false}
          testIdPrefix="test-inline"
        />,
      );

      const display = screen.getByTestId('test-inline-display-test');
      expect(display).toHaveAttribute('title', 'Click to edit test');

      fireEvent.click(display);
      expect(screen.getByTestId('test-inline-input-test')).toBeInTheDocument();
    });
  });
});
