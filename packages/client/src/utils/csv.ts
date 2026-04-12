import type { Employee } from '@/types';

const CSV_HEADERS: (keyof Employee)[] = [
  'name', 'title', 'department', 'level', 'location',
  'startDate', 'salary', 'equity', 'employmentType', 'status',
  'costCenter', 'hiringManager', 'recruiter', 'requisitionId',
];

export function exportToCSV(employees: Employee[], filename: string): void {
  const header = CSV_HEADERS.join(',');
  const rows = employees.map((emp) =>
    CSV_HEADERS.map((key) => {
      const value = emp[key];
      if (value === undefined || value === null) return '';
      const str = String(value);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export function parseCSV(text: string): Partial<Employee>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const entry: Record<string, unknown> = {};

    headers.forEach((header, i) => {
      const value = values[i]?.trim() ?? '';
      if (value === '') return;

      if (header === 'salary' || header === 'equity') {
        entry[header] = Number(value);
      } else {
        entry[header] = value;
      }
    });

    return entry as Partial<Employee>;
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  values.push(current);
  return values;
}
