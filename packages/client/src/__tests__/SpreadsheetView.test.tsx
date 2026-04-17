import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Employee } from "@/types";

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  _id: "emp-1",
  scenarioId: "scen-1",
  name: "Alice Smith",
  title: "Engineer",
  department: "Engineering",
  level: "IC3",
  location: "NYC",
  employmentType: "FTE",
  status: "Active",
  order: 0,
  managerId: null,
  ...overrides,
});

const employees: Employee[] = [
  makeEmployee({ _id: "emp-1", name: "Alice Smith", title: "Engineer", status: "Active" }),
  makeEmployee({ _id: "emp-2", name: "Bob Jones", title: "Designer", department: "Design", status: "Planned" }),
  makeEmployee({ _id: "emp-3", name: "Charlie Brown", title: "PM", department: "Product", status: "Open Req" }),
  makeEmployee({ _id: "emp-4", name: "Diana Prince", title: "Manager", department: "Engineering", status: "Backfill" }),
  makeEmployee({ _id: "emp-5", name: "Eve Adams", title: "Senior Engineer", department: "Engineering", status: "Active" }),
];

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock useOrgStore — always provides the full employee list (for managerMap)
const mockUpdateEmployee = vi.fn();
vi.mock("@/stores/orgStore", () => ({
  useOrgStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees,
        updateEmployee: mockUpdateEmployee,
        selectedEmployee: null,
      };
      return selector ? selector(state) : state;
    },
    {
      setState: vi.fn(),
      getState: vi.fn(() => ({ employees, updateEmployee: mockUpdateEmployee, selectedEmployee: null })),
    },
  ),
}));

// Mock useOutletContext — returns filteredEmployees as provided per test
let outletContext: { filteredEmployees: Employee[]; statusFilters: string[]; searchQuery: string; isViewer: boolean };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useOutletContext: () => outletContext,
  };
});

// Mock AG Grid — lightweight mock that renders rows as divs
vi.mock("ag-grid-react", () => ({
  AgGridReact: (props: {
    rowData: Employee[];
    overlayNoRowsTemplate?: string;
  }) => {
    if (!props.rowData || props.rowData.length === 0) {
      return (
        <div data-testid="ag-grid-empty">
          <span>{props.overlayNoRowsTemplate?.replace(/<[^>]*>/g, "") ?? "No rows"}</span>
        </div>
      );
    }
    return (
      <div data-testid="ag-grid">
        {props.rowData.map((emp) => (
          <div key={emp._id} data-testid={`row-${emp._id}`}>
            <span data-testid={`name-${emp._id}`}>{emp.name}</span>
            <span data-testid={`status-${emp._id}`}>{emp.status}</span>
          </div>
        ))}
      </div>
    );
  },
}));

/* ------------------------------------------------------------------ */
/*  Import component AFTER mocks are defined                           */
/* ------------------------------------------------------------------ */

import SpreadsheetView from "../components/views/SpreadsheetView";

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SpreadsheetView filtering (Bug #4 fix)", () => {
  it("renders only Active employees when status filter is Active", () => {
    const filtered = employees.filter((e) => e.status === "Active");
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Active"],
      searchQuery: "",
      isViewer: false,
    };

    render(<SpreadsheetView />);

    // Active employees should be rendered
    expect(screen.getByTestId("row-emp-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-emp-5")).toBeInTheDocument();
    // Non-active should NOT be rendered
    expect(screen.queryByTestId("row-emp-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-emp-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-emp-4")).not.toBeInTheDocument();
  });

  it("renders all employees when all status filters are active", () => {
    outletContext = {
      filteredEmployees: employees,
      statusFilters: ["Active", "Planned", "Open Req", "Backfill"],
      searchQuery: "",
      isViewer: false,
    };

    render(<SpreadsheetView />);

    expect(screen.getByTestId("row-emp-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-emp-2")).toBeInTheDocument();
    expect(screen.getByTestId("row-emp-3")).toBeInTheDocument();
    expect(screen.getByTestId("row-emp-4")).toBeInTheDocument();
    expect(screen.getByTestId("row-emp-5")).toBeInTheDocument();
  });

  it("renders only employees matching a search query", () => {
    // Simulate search for "alice" — only emp-1 matches
    const filtered = employees.filter((e) =>
      e.name.toLowerCase().includes("alice"),
    );
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Active", "Planned", "Open Req", "Backfill"],
      searchQuery: "alice",
      isViewer: false,
    };

    render(<SpreadsheetView />);

    expect(screen.getByTestId("row-emp-1")).toBeInTheDocument();
    expect(screen.queryByTestId("row-emp-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-emp-3")).not.toBeInTheDocument();
  });

  it("renders employees matching combined status filter + search", () => {
    // Status filter = Active only + search = "engineer"
    const filtered = employees.filter(
      (e) =>
        e.status === "Active" &&
        (e.name.toLowerCase().includes("engineer") ||
          e.title.toLowerCase().includes("engineer")),
    );
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Active"],
      searchQuery: "engineer",
      isViewer: false,
    };

    render(<SpreadsheetView />);

    // Alice (Engineer, Active) and Eve (Senior Engineer, Active) match
    expect(screen.getByTestId("row-emp-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-emp-5")).toBeInTheDocument();
    // Others should not appear
    expect(screen.queryByTestId("row-emp-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-emp-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-emp-4")).not.toBeInTheDocument();
  });

  it("shows empty message when no employees match filters", () => {
    outletContext = {
      filteredEmployees: [],
      statusFilters: [],
      searchQuery: "",
      isViewer: false,
    };

    render(<SpreadsheetView />);

    expect(screen.getByTestId("ag-grid-empty")).toBeInTheDocument();
    expect(
      screen.getByText("No employees match the current filters."),
    ).toBeInTheDocument();
  });

  it("shows only Planned and Backfill employees when those filters are set", () => {
    const filtered = employees.filter(
      (e) => e.status === "Planned" || e.status === "Backfill",
    );
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Planned", "Backfill"],
      searchQuery: "",
      isViewer: false,
    };

    render(<SpreadsheetView />);

    expect(screen.getByTestId("row-emp-2")).toBeInTheDocument(); // Bob - Planned
    expect(screen.getByTestId("row-emp-4")).toBeInTheDocument(); // Diana - Backfill
    expect(screen.queryByTestId("row-emp-1")).not.toBeInTheDocument(); // Alice - Active
    expect(screen.queryByTestId("row-emp-3")).not.toBeInTheDocument(); // Charlie - Open Req
    expect(screen.queryByTestId("row-emp-5")).not.toBeInTheDocument(); // Eve - Active
  });

  it("returns all employees when filters are removed (all statuses re-enabled)", () => {
    // First, simulate a filtered view
    const filtered = employees.filter((e) => e.status === "Active");
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Active"],
      searchQuery: "",
      isViewer: false,
    };

    const { unmount } = render(<SpreadsheetView />);
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(2);
    unmount();

    // Now restore all filters
    outletContext = {
      filteredEmployees: employees,
      statusFilters: ["Active", "Planned", "Open Req", "Backfill"],
      searchQuery: "",
      isViewer: false,
    };

    render(<SpreadsheetView />);
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(5);
  });
});
