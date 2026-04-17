import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateExportFilename, type ExportOptions } from '@/utils/exportOrgChart';

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
