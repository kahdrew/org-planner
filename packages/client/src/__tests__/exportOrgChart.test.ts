import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateExportFilename, type ExportOptions, type ExportContext } from '@/utils/exportOrgChart';
import type { Employee } from '@/types';

describe('generateExportFilename', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16'));
  });

  it('generates PNG filename with scenario name and date', () => {
    const result = generateExportFilename('Base Scenario', 'png');
    expect(result).toBe('org-planner-Base-Scenario-2026-04-16.png');
  });

  it('generates PDF filename with scenario name and date', () => {
    const result = generateExportFilename('Q2 Plan', 'pdf');
    expect(result).toBe('org-planner-Q2-Plan-2026-04-16.pdf');
  });

  it('handles scenario names with special characters', () => {
    const result = generateExportFilename('Test / Scenario (v2)', 'png');
    expect(result).toBe('org-planner-Test---Scenario--v2--2026-04-16.png');
  });

  it('uses "export" as fallback when scenario name is empty', () => {
    const result = generateExportFilename('', 'pdf');
    expect(result).toBe('org-planner-export-2026-04-16.pdf');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('ExportOptions type', () => {
  it('accepts valid export options for PNG', () => {
    const options: ExportOptions = {
      format: 'png',
      includeSalary: true,
      department: 'all',
    };
    expect(options.format).toBe('png');
    expect(options.includeSalary).toBe(true);
  });

  it('accepts valid export options for PDF with orientation', () => {
    const options: ExportOptions = {
      format: 'pdf',
      includeSalary: false,
      department: 'Engineering',
      orientation: 'landscape',
    };
    expect(options.format).toBe('pdf');
    expect(options.orientation).toBe('landscape');
  });
});

describe('ExportContext type', () => {
  it('defines the export context interface with all required fields', () => {
    const mockEmployee: Employee = {
      _id: 'emp-1',
      scenarioId: 'scen-1',
      name: 'Alice',
      title: 'Engineer',
      department: 'Engineering',
      level: 'IC3',
      location: 'Remote',
      salary: 120000,
      equity: 30000,
      employmentType: 'FTE',
      status: 'Active',
      managerId: null,
      order: 0,
    };

    const context: ExportContext = {
      employees: [mockEmployee],
      fitView: vi.fn(),
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport: vi.fn(),
    };

    expect(context.employees).toHaveLength(1);
    expect(context.employees[0].department).toBe('Engineering');
    expect(context.fitView).toBeDefined();
    expect(context.getViewport).toBeDefined();
    expect(context.setViewport).toBeDefined();
  });

  it('fitView is called with padding and duration options', () => {
    const fitViewMock = vi.fn();
    const context: ExportContext = {
      employees: [],
      fitView: fitViewMock,
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport: vi.fn(),
    };

    context.fitView({ padding: 0.2, duration: 0 });
    expect(fitViewMock).toHaveBeenCalledWith({ padding: 0.2, duration: 0 });
  });

  it('getViewport returns viewport state for later restoration', () => {
    const getViewportMock = vi.fn().mockReturnValue({ x: 100, y: 200, zoom: 0.5 });
    const context: ExportContext = {
      employees: [],
      fitView: vi.fn(),
      getViewport: getViewportMock,
      setViewport: vi.fn(),
    };

    const viewport = context.getViewport();
    expect(viewport).toEqual({ x: 100, y: 200, zoom: 0.5 });
  });

  it('setViewport restores viewport to saved state', () => {
    const setViewportMock = vi.fn();
    const context: ExportContext = {
      employees: [],
      fitView: vi.fn(),
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport: setViewportMock,
    };

    context.setViewport({ x: 100, y: 200, zoom: 0.5 }, { duration: 0 });
    expect(setViewportMock).toHaveBeenCalledWith(
      { x: 100, y: 200, zoom: 0.5 },
      { duration: 0 },
    );
  });
});
