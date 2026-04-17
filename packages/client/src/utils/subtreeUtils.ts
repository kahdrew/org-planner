import type { Employee } from '@/types';

/**
 * Get all descendant IDs (direct and indirect reports) for a given employee.
 */
export function getDescendantIds(employeeId: string, employees: Employee[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [employeeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const emp of employees) {
      if (emp.managerId === currentId && !descendants.has(emp._id)) {
        descendants.add(emp._id);
        queue.push(emp._id);
      }
    }
  }

  return descendants;
}

/**
 * Check whether `targetId` is a descendant of `sourceId`.
 * Used for cycle detection: prevents dropping a node onto one of its own descendants.
 */
export function isDescendant(
  sourceId: string,
  targetId: string,
  employees: Employee[],
): boolean {
  if (sourceId === targetId) return true;
  const descendants = getDescendantIds(sourceId, employees);
  return descendants.has(targetId);
}

/**
 * Get the total size of the subtree rooted at the given employee
 * (including the employee itself).
 */
export function getSubtreeSize(employeeId: string, employees: Employee[]): number {
  return getDescendantIds(employeeId, employees).size + 1;
}

/**
 * Check if an employee has any direct reports (i.e., is a manager).
 */
export function hasDirectReports(employeeId: string, employees: Employee[]): boolean {
  return employees.some((emp) => emp.managerId === employeeId);
}

/**
 * Get the direct report count for an employee.
 */
export function getDirectReportCount(employeeId: string, employees: Employee[]): number {
  return employees.filter((emp) => emp.managerId === employeeId).length;
}
