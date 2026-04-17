import type { Employee } from '@/types';

/**
 * Get all descendant IDs of a given employee in the hierarchy tree.
 * Uses BFS to walk all children, grandchildren, etc.
 */
export function getDescendantIds(employeeId: string, employees: Employee[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [employeeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = employees.filter((e) => e.managerId === currentId);
    for (const child of children) {
      if (!descendants.has(child._id)) {
        descendants.add(child._id);
        queue.push(child._id);
      }
    }
  }

  return descendants;
}

/**
 * Given a set of selected employee IDs, returns the set of all IDs
 * that should be excluded from the manager dropdown to prevent
 * self-referential or cyclic manager assignments.
 *
 * Excluded IDs = selected IDs + all descendants of selected IDs.
 */
export function getInvalidManagerIds(
  selectedIds: Set<string>,
  employees: Employee[],
): Set<string> {
  const invalidIds = new Set<string>(selectedIds);

  for (const selectedId of selectedIds) {
    const descendants = getDescendantIds(selectedId, employees);
    for (const descId of descendants) {
      invalidIds.add(descId);
    }
  }

  return invalidIds;
}
