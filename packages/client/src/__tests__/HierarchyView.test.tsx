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
  makeEmployee({ _id: "emp-1", name: "Alice Smith", title: "Engineer", status: "Active", order: 0 }),
  makeEmployee({ _id: "emp-2", name: "Bob Jones", title: "Designer", department: "Design", status: "Planned", order: 1 }),
  makeEmployee({ _id: "emp-3", name: "Charlie Brown", title: "PM", department: "Product", status: "Open Req", order: 2 }),
  makeEmployee({ _id: "emp-4", name: "Diana Prince", title: "Manager", department: "Engineering", status: "Backfill", order: 3 }),
  makeEmployee({ _id: "emp-5", name: "Eve Adams", title: "Senior Engineer", department: "Engineering", status: "Active", order: 4 }),
];

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockMoveEmployee = vi.fn();

vi.mock("@/stores/orgStore", () => ({
  useOrgStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      const state = {
        employees,
        selectedEmployee: null,
        moveEmployee: mockMoveEmployee,
      };
      return selector ? selector(state) : state;
    },
    {
      setState: vi.fn(),
      getState: vi.fn(() => ({
        employees,
        selectedEmployee: null,
        moveEmployee: mockMoveEmployee,
      })),
    },
  ),
}));

// Mock useOutletContext — returns filteredEmployees as provided per test
let outletContext: { filteredEmployees: Employee[]; statusFilters: string[]; searchQuery: string };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useOutletContext: () => outletContext,
  };
});

// Mock @dnd-kit/core — lightweight mock to avoid sortable context errors
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
    over: null,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Translate: {
      toString: () => undefined,
    },
  },
}));

/* ------------------------------------------------------------------ */
/*  Import component AFTER mocks are defined                           */
/* ------------------------------------------------------------------ */

import HierarchyView from "../components/views/HierarchyView";

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HierarchyView filtering", () => {
  it("renders only Active employees when status filter is Active", () => {
    const filtered = employees.filter((e) => e.status === "Active");
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Active"],
      searchQuery: "",
    };

    render(<HierarchyView />);

    // Active employees should be rendered
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Eve Adams")).toBeInTheDocument();
    // Non-active should NOT be rendered
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie Brown")).not.toBeInTheDocument();
    expect(screen.queryByText("Diana Prince")).not.toBeInTheDocument();
  });

  it("renders all employees when all status filters are active", () => {
    outletContext = {
      filteredEmployees: employees,
      statusFilters: ["Active", "Planned", "Open Req", "Backfill"],
      searchQuery: "",
    };

    render(<HierarchyView />);

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Charlie Brown")).toBeInTheDocument();
    expect(screen.getByText("Diana Prince")).toBeInTheDocument();
    expect(screen.getByText("Eve Adams")).toBeInTheDocument();
  });

  it("renders only employees matching a search query", () => {
    const filtered = employees.filter((e) =>
      e.name.toLowerCase().includes("alice"),
    );
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Active", "Planned", "Open Req", "Backfill"],
      searchQuery: "alice",
    };

    render(<HierarchyView />);

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie Brown")).not.toBeInTheDocument();
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
    };

    render(<HierarchyView />);

    // Alice (Engineer, Active) and Eve (Senior Engineer, Active) match
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Eve Adams")).toBeInTheDocument();
    // Others should not appear
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie Brown")).not.toBeInTheDocument();
    expect(screen.queryByText("Diana Prince")).not.toBeInTheDocument();
  });

  it("shows empty message when no employees match filters", () => {
    outletContext = {
      filteredEmployees: [],
      statusFilters: [],
      searchQuery: "",
    };

    render(<HierarchyView />);

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
    };

    render(<HierarchyView />);

    expect(screen.getByText("Bob Jones")).toBeInTheDocument(); // Planned
    expect(screen.getByText("Diana Prince")).toBeInTheDocument(); // Backfill
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument(); // Active
    expect(screen.queryByText("Charlie Brown")).not.toBeInTheDocument(); // Open Req
    expect(screen.queryByText("Eve Adams")).not.toBeInTheDocument(); // Active
  });

  it("returns all employees when filters are removed (all statuses re-enabled)", () => {
    // First, simulate a filtered view
    const filtered = employees.filter((e) => e.status === "Active");
    outletContext = {
      filteredEmployees: filtered,
      statusFilters: ["Active"],
      searchQuery: "",
    };

    const { unmount } = render(<HierarchyView />);
    // Should only show 2 Active employees
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Eve Adams")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
    unmount();

    // Now restore all filters
    outletContext = {
      filteredEmployees: employees,
      statusFilters: ["Active", "Planned", "Open Req", "Backfill"],
      searchQuery: "",
    };

    render(<HierarchyView />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Charlie Brown")).toBeInTheDocument();
    expect(screen.getByText("Diana Prince")).toBeInTheDocument();
    expect(screen.getByText("Eve Adams")).toBeInTheDocument();
  });
});
