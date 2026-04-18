/**
 * Builds a deterministic, token-efficient org context for the AI prompt.
 *
 * The goal is to give Claude enough structure to answer data and what-if
 * questions accurately without dumping raw Mongo documents (which include
 * internal fields and huge blobs like `metadata`). The format is stable
 * so snapshot tests can assert on it.
 */

import type { IEmployee } from "../models/Employee";

export interface OrgContextOptions {
  /** Max employees to include in detail. Hard cap to keep prompt tokens bounded. */
  maxEmployees?: number;
  scenarioName?: string;
  orgName?: string;
}

/**
 * Shape of a single employee entry in the AI context. Intentionally flat
 * and string-valued so the prompt remains readable to Claude and auditable
 * to humans reading test snapshots.
 */
export interface AiEmployeeContext {
  id: string;
  name: string;
  title: string;
  department: string;
  level: string;
  location: string;
  status: string;
  employmentType: string;
  salary: number | null;
  equity: number | null;
  managerId: string | null;
  managerName: string | null;
}

/**
 * Compact a list of Mongo employee docs into structured rows the model
 * can reason about. `managerName` is resolved so prompts like "Who
 * reports to Alice?" can be answered without Claude having to chase
 * managerId references across rows.
 */
export function buildEmployeeContext(
  employees: Array<Pick<
    IEmployee,
    | "name"
    | "title"
    | "department"
    | "level"
    | "location"
    | "status"
    | "employmentType"
    | "salary"
    | "equity"
    | "managerId"
  > & { _id: unknown }>,
  opts: OrgContextOptions = {},
): AiEmployeeContext[] {
  const max = opts.maxEmployees ?? 500;
  const idToName = new Map<string, string>();
  for (const e of employees) {
    idToName.set(String(e._id), e.name);
  }
  return employees.slice(0, max).map((e) => {
    const managerIdStr = e.managerId ? String(e.managerId) : null;
    return {
      id: String(e._id),
      name: e.name,
      title: e.title,
      department: e.department,
      level: e.level,
      location: e.location,
      status: e.status,
      employmentType: e.employmentType,
      salary: typeof e.salary === "number" ? e.salary : null,
      equity: typeof e.equity === "number" ? e.equity : null,
      managerId: managerIdStr,
      managerName: managerIdStr ? idToName.get(managerIdStr) ?? null : null,
    };
  });
}

/**
 * Aggregate department-level summary so the model can answer "how many
 * employees in Engineering" without scanning the flat list token-by-token.
 */
export interface DepartmentSummary {
  department: string;
  headcount: number;
  totalSalary: number;
}

export function summarizeDepartments(
  employees: AiEmployeeContext[],
): DepartmentSummary[] {
  const map = new Map<string, DepartmentSummary>();
  for (const e of employees) {
    const bucket = map.get(e.department) ?? {
      department: e.department,
      headcount: 0,
      totalSalary: 0,
    };
    bucket.headcount += 1;
    bucket.totalSalary += e.salary ?? 0;
    map.set(e.department, bucket);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.department.localeCompare(b.department),
  );
}

/**
 * Compose a system prompt that gives Claude the persona, constraints, and
 * org context it needs. IMPORTANT: the prompt explicitly tells the model
 * it is read-only — any apparent "action" in the response is a
 * recommendation only.
 */
export function buildSystemPrompt(
  employees: AiEmployeeContext[],
  opts: OrgContextOptions = {},
): string {
  const departments = summarizeDepartments(employees);
  const totalHeadcount = employees.length;
  const totalSalary = employees.reduce((sum, e) => sum + (e.salary ?? 0), 0);

  const header = [
    "You are the Org Planner AI assistant — a read-only analyst that helps",
    "people explore organization data, model what-if scenarios, and propose",
    "restructuring recommendations.",
    "",
    "IMPORTANT RULES:",
    "1. You CANNOT mutate data. Any change you describe is a *suggestion* only.",
    "2. Base every factual claim on the provided org context below. If the",
    "   answer cannot be derived from that context, say you do not have",
    "   enough information rather than inventing data.",
    "3. When asked about cost impact, show the numbers and formulas you used.",
    "4. Prefer concise bullet points for analysis; use prose for narrative",
    "   explanations and recommendations.",
  ].join("\n");

  const meta = [
    `Organization: ${opts.orgName ?? "(unnamed)"}`,
    `Scenario: ${opts.scenarioName ?? "(unnamed)"}`,
    `Total employees in scenario: ${totalHeadcount}`,
    `Total annual salary across scenario: $${totalSalary.toLocaleString()}`,
  ].join("\n");

  const deptBlock = departments.length
    ? [
        "Department summary:",
        ...departments.map(
          (d) =>
            `- ${d.department}: ${d.headcount} employees, $${d.totalSalary.toLocaleString()} total salary`,
        ),
      ].join("\n")
    : "Department summary: (no employees in scenario)";

  const employeeBlock = employees.length
    ? [
        "Employees (JSON list, one entry per row):",
        ...employees.map((e) => JSON.stringify(e)),
      ].join("\n")
    : "Employees: (none)";

  return [header, "", meta, "", deptBlock, "", employeeBlock].join("\n");
}
