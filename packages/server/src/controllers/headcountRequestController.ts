import { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import HeadcountRequest, {
  IHeadcountRequest,
  IEmployeeRequestData,
} from "../models/HeadcountRequest";
import ApprovalChain, { IApprovalChain } from "../models/ApprovalChain";
import Scenario from "../models/Scenario";
import Employee, { IEmployee } from "../models/Employee";
import Organization from "../models/Organization";
import { emitScenarioScopedEvent } from "../sse/emit";

/**
 * Serialize an Employee document to a plain snapshot suitable for SSE payloads.
 * Mirrors `serializeEmployee` in employeeController.ts so SSE consumers see the
 * same shape regardless of which controller triggered the mutation.
 */
function serializeEmployee(emp: IEmployee): Record<string, unknown> {
  const obj = emp.toObject({ depopulate: true });
  delete obj.__v;
  return obj;
}

// ---------- Zod schemas ----------

const employeeDataSchema = z.object({
  name: z.string().trim().min(1),
  title: z.string().trim().min(1),
  department: z.string().trim().min(1),
  level: z.string().trim().min(1),
  location: z.string().trim().min(1),
  employmentType: z.enum(["FTE", "Contractor", "Intern"]),
  status: z.enum(["Active", "Planned", "Open Req", "Backfill"]).optional(),
  salary: z.number().min(0).optional(),
  equity: z.number().min(0).optional(),
  managerId: z.string().nullable().optional(),
  startDate: z.string().optional(),
  costCenter: z.string().optional(),
  hiringManager: z.string().optional(),
  recruiter: z.string().optional(),
  requisitionId: z.string().optional(),
  justification: z.string().optional(),
});

const submitSchema = z.object({
  requestType: z.enum(["new_hire", "comp_change"]).optional().default("new_hire"),
  employeeData: employeeDataSchema,
  targetEmployeeId: z.string().optional(),
  /** Optional chainId to force a specific chain (otherwise auto-selected). */
  chainId: z.string().optional(),
});

const actionSchema = z.object({
  comment: z.string().optional(),
});

const bulkActionSchema = z.object({
  requestIds: z.array(z.string()).min(1, "At least one request ID required"),
  comment: z.string().optional(),
});

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

// ---------- Chain selection ----------

/**
 * Role levels for "minLevel" comparisons. Higher index = higher seniority.
 * Chains with minLevel="Director" match any level >= Director in this list.
 */
const LEVEL_RANK: Record<string, number> = {
  IC1: 1,
  IC2: 2,
  IC3: 3,
  IC4: 4,
  IC5: 5,
  IC6: 6,
  M1: 4,
  M2: 5,
  M3: 6,
  Manager: 4,
  "Senior Manager": 5,
  Director: 7,
  "Senior Director": 8,
  VP: 9,
  "Vice President": 9,
  SVP: 10,
  EVP: 11,
  CHRO: 12,
  CTO: 12,
  CEO: 13,
};

function levelMeets(employeeLevel: string, minLevel?: string): boolean {
  if (!minLevel) return true;
  const empRank = LEVEL_RANK[employeeLevel] ?? 0;
  const minRank = LEVEL_RANK[minLevel] ?? 0;
  return empRank >= minRank;
}

/**
 * Select the approval chain for an incoming request. Algorithm:
 *   1. Evaluate each chain's conditions against the employee data.
 *   2. Among matching chains, pick the highest priority.
 *   3. Ties broken by the most specific (non-empty) conditions.
 *   4. Fall back to the default chain if one exists.
 */
async function selectChainForRequest(
  orgId: mongoose.Types.ObjectId | string,
  employeeData: IEmployeeRequestData,
): Promise<IApprovalChain | null> {
  const chains = await ApprovalChain.find({ orgId });
  if (chains.length === 0) return null;

  const cost = (employeeData.salary ?? 0) + (employeeData.equity ?? 0);

  const matching = chains.filter((chain) => {
    const c = chain.conditions ?? {};
    const hasLevel = typeof c.minLevel === "string" && c.minLevel.length > 0;
    const hasCost = typeof c.minCost === "number";
    if (!hasLevel && !hasCost) {
      // Default/catch-all chain; evaluate later.
      return false;
    }
    const levelOk = !hasLevel || levelMeets(employeeData.level, c.minLevel);
    const costOk = !hasCost || cost >= (c.minCost ?? 0);
    return levelOk && costOk;
  });

  if (matching.length > 0) {
    // Sort by priority desc, then by condition specificity
    matching.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const aSpec =
        (a.conditions?.minLevel ? 1 : 0) +
        (typeof a.conditions?.minCost === "number" ? 1 : 0);
      const bSpec =
        (b.conditions?.minLevel ? 1 : 0) +
        (typeof b.conditions?.minCost === "number" ? 1 : 0);
      return bSpec - aSpec;
    });
    return matching[0];
  }

  // Fall back to the default chain (or any chain with no conditions)
  const defaults = chains.filter(
    (c) =>
      c.isDefault ||
      (!c.conditions?.minLevel &&
        typeof c.conditions?.minCost !== "number"),
  );
  if (defaults.length === 0) return null;
  defaults.sort((a, b) => b.priority - a.priority);
  return defaults[0];
}

// ---------- Approver resolution ----------

function approverIdsForStep(chain: IApprovalChain, stepIndex: number): string[] {
  const step = chain.steps[stepIndex];
  if (!step) return [];
  return step.approverIds.map((id) => id.toString());
}

function isApproverForStep(
  chain: IApprovalChain,
  stepIndex: number,
  userId: string,
): boolean {
  return approverIdsForStep(chain, stepIndex).includes(userId);
}

// ---------- Submit ----------

/**
 * POST /api/scenarios/:id/headcount-requests
 * Submit a new headcount request. Conditional chain selection applies.
 */
export const submitHeadcountRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    if (!isValidObjectId(scenarioId)) {
      res.status(400).json({ error: "Invalid scenario ID" });
      return;
    }

    const scenario = await Scenario.findById(scenarioId);
    if (!scenario) {
      res.status(404).json({ error: "Scenario not found" });
      return;
    }

    const data = submitSchema.parse(req.body);

    let chain: IApprovalChain | null = null;

    if (data.chainId) {
      if (!isValidObjectId(data.chainId)) {
        res.status(400).json({ error: "Invalid chain ID" });
        return;
      }
      chain = await ApprovalChain.findById(data.chainId);
      if (!chain || chain.orgId.toString() !== scenario.orgId.toString()) {
        res.status(404).json({ error: "Approval chain not found" });
        return;
      }
    } else {
      chain = await selectChainForRequest(
        scenario.orgId,
        data.employeeData as IEmployeeRequestData,
      );
      if (!chain) {
        res.status(400).json({
          error:
            "No approval chain configured for this organization. Create one in Approval Settings.",
        });
        return;
      }
    }

    if (chain.steps.length === 0) {
      res.status(400).json({ error: "Approval chain has no steps" });
      return;
    }

    if (data.targetEmployeeId && !isValidObjectId(data.targetEmployeeId)) {
      res.status(400).json({ error: "Invalid target employee ID" });
      return;
    }

    const request = await HeadcountRequest.create({
      orgId: scenario.orgId,
      scenarioId,
      requestType: data.requestType,
      employeeData: data.employeeData,
      targetEmployeeId: data.targetEmployeeId ?? null,
      requestedBy: req.user!.userId,
      chainId: chain._id,
      currentStep: 0,
      status: "pending",
      audit: [
        {
          action: "submit",
          performedBy: new mongoose.Types.ObjectId(req.user!.userId),
          stepIndex: 0,
          stepRole: chain.steps[0].role,
          timestamp: new Date(),
        },
      ],
    });

    res.status(201).json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------- List / Get ----------

/**
 * GET /api/scenarios/:id/headcount-requests
 * List headcount requests for a scenario, with optional status filter.
 */
export const getScenarioRequests = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const scenarioId = req.params.id;
    if (!isValidObjectId(scenarioId)) {
      res.status(400).json({ error: "Invalid scenario ID" });
      return;
    }

    const statusFilter = req.query.status as string | undefined;
    const query: Record<string, unknown> = { scenarioId };
    if (statusFilter) query.status = statusFilter;

    const requests = await HeadcountRequest.find(query).sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/orgs/:orgId/headcount-requests
 * List all headcount requests for an org, with filters: status, scenarioId, requestedBy.
 */
export const getOrgRequests = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const orgId = req.params.orgId;
    if (!isValidObjectId(orgId)) {
      res.status(400).json({ error: "Invalid organization ID" });
      return;
    }

    const query: Record<string, unknown> = { orgId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.scenarioId) query.scenarioId = req.query.scenarioId;
    if (req.query.requestedBy) query.requestedBy = req.query.requestedBy;

    const requests = await HeadcountRequest.find(query).sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/orgs/:orgId/headcount-requests/pending
 * Return pending requests where the current user is the designated approver
 * for the current step.
 */
export const getPendingApprovalsForUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const orgId = req.params.orgId;
    if (!isValidObjectId(orgId)) {
      res.status(400).json({ error: "Invalid organization ID" });
      return;
    }

    const userId = req.user!.userId;

    const pending = await HeadcountRequest.find({
      orgId,
      status: "pending",
    });

    // Filter to requests where the user is an approver for the current step.
    // Pre-fetch chains in one query for efficiency.
    const chainIds = Array.from(
      new Set(pending.map((r) => r.chainId.toString())),
    );
    const chains = await ApprovalChain.find({ _id: { $in: chainIds } });
    const chainMap = new Map(chains.map((c) => [c._id.toString(), c]));

    const actionable = pending.filter((req) => {
      const chain = chainMap.get(req.chainId.toString());
      if (!chain) return false;
      if (req.requestedBy.toString() === userId) {
        // Self-approval is not allowed — hide from own pending queue.
        return false;
      }
      return isApproverForStep(chain, req.currentStep, userId);
    });

    res.json(actionable);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/headcount-requests/:id
 * Get a single request with full audit trail (authorization enforced via org).
 */
export const getHeadcountRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const reqId = req.params.id;
    if (!isValidObjectId(reqId)) {
      res.status(400).json({ error: "Invalid request ID" });
      return;
    }

    const request = await HeadcountRequest.findById(reqId);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    // Authorize via org membership
    const org = await Organization.findById(request.orgId);
    if (!org) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const userId = req.user!.userId;
    const isMember =
      org.memberIds.some((id) => id.toString() === userId) ||
      org.ownerId.toString() === userId;
    if (!isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(request);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------- Approve / Reject / Request Changes ----------

async function ensureActionable(
  reqId: string,
  userId: string,
): Promise<
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      request: IHeadcountRequest;
      chain: IApprovalChain;
    }
> {
  if (!isValidObjectId(reqId)) {
    return { ok: false, status: 400, error: "Invalid request ID" };
  }
  const request = await HeadcountRequest.findById(reqId);
  if (!request) {
    return { ok: false, status: 404, error: "Request not found" };
  }

  // Verify the acting user is a member (or owner) of the org that owns this
  // request. Even if they happen to be listed on an approval chain, they must
  // still belong to the org to act.
  const org = await Organization.findById(request.orgId);
  if (!org) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const isMember =
    org.memberIds.some((id) => id.toString() === userId) ||
    org.ownerId.toString() === userId;
  if (!isMember) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (request.status !== "pending") {
    return {
      ok: false,
      status: 400,
      error: `Request is not pending (status: ${request.status})`,
    };
  }

  if (request.requestedBy.toString() === userId) {
    return {
      ok: false,
      status: 403,
      error: "You cannot act on your own request",
    };
  }

  const chain = await ApprovalChain.findById(request.chainId);
  if (!chain) {
    return { ok: false, status: 500, error: "Approval chain missing" };
  }

  if (!isApproverForStep(chain, request.currentStep, userId)) {
    return {
      ok: false,
      status: 403,
      error: "You are not an approver for the current step",
    };
  }

  return { ok: true, request, chain };
}

/**
 * When a request is fully approved, create (or update) the employee record.
 * Returns the employee's id or null on failure.
 */
async function materializeEmployee(
  request: IHeadcountRequest,
): Promise<mongoose.Types.ObjectId | null> {
  try {
    const data = request.employeeData;
    const employeePayload: Record<string, unknown> = {
      name: data.name,
      title: data.title,
      department: data.department,
      level: data.level,
      location: data.location,
      employmentType: data.employmentType,
      status: data.status ?? "Planned",
      managerId:
        data.managerId && isValidObjectId(data.managerId)
          ? new mongoose.Types.ObjectId(data.managerId)
          : null,
      order: 0,
      scenarioId: request.scenarioId,
    };
    if (typeof data.salary === "number") employeePayload.salary = data.salary;
    if (typeof data.equity === "number") employeePayload.equity = data.equity;
    if (data.startDate) {
      const d = new Date(data.startDate);
      if (!Number.isNaN(d.getTime())) employeePayload.startDate = d;
    }
    if (data.costCenter) employeePayload.costCenter = data.costCenter;
    if (data.hiringManager) employeePayload.hiringManager = data.hiringManager;
    if (data.recruiter) employeePayload.recruiter = data.recruiter;
    if (data.requisitionId) employeePayload.requisitionId = data.requisitionId;

    if (request.requestType === "comp_change" && request.targetEmployeeId) {
      const existing = await Employee.findById(request.targetEmployeeId);
      if (existing) {
        const updatePayload: Record<string, unknown> = {};
        if (typeof data.salary === "number") updatePayload.salary = data.salary;
        if (typeof data.equity === "number") updatePayload.equity = data.equity;
        if (data.title) updatePayload.title = data.title;
        if (data.level) updatePayload.level = data.level;
        if (data.department) updatePayload.department = data.department;
        const updated = await Employee.findByIdAndUpdate(
          request.targetEmployeeId,
          updatePayload,
          { new: true },
        );

        // Fan out to SSE clients so realtime consumers see the comp change.
        if (updated) {
          await emitScenarioScopedEvent(
            updated.scenarioId,
            "employee.updated",
            { employee: serializeEmployee(updated) },
          );
        }

        return updated
          ? (updated._id as mongoose.Types.ObjectId)
          : (existing._id as mongoose.Types.ObjectId);
      }
    }

    const created = await Employee.create(employeePayload);

    // Fan out to SSE clients so realtime consumers see the newly created
    // employee, matching the behavior of the direct employee CRUD path.
    await emitScenarioScopedEvent(
      created.scenarioId,
      "employee.created",
      { employee: serializeEmployee(created) },
    );

    return created._id as mongoose.Types.ObjectId;
  } catch (err) {
    console.error("Failed to materialize employee from approved request:", err);
    return null;
  }
}

/**
 * POST /api/headcount-requests/:id/approve
 * Advance the request to the next step, or finalize it if this is the last step.
 */
export const approveHeadcountRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { comment } = actionSchema.parse(req.body ?? {});

    const check = await ensureActionable(req.params.id, userId);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const { request, chain } = check;

    const stepIndex = request.currentStep;
    const isLastStep = stepIndex >= chain.steps.length - 1;

    request.audit.push({
      action: "approve",
      performedBy: new mongoose.Types.ObjectId(userId),
      stepIndex,
      stepRole: chain.steps[stepIndex]?.role,
      comment,
      timestamp: new Date(),
    });

    if (isLastStep) {
      request.status = "approved";
      const employeeId = await materializeEmployee(request);
      if (employeeId) {
        request.approvedEmployeeId = employeeId;
      }
    } else {
      request.currentStep = stepIndex + 1;
    }

    await request.save();
    res.json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/headcount-requests/:id/reject
 * Terminate the chain. Status becomes "rejected".
 */
export const rejectHeadcountRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { comment } = actionSchema.parse(req.body ?? {});

    const check = await ensureActionable(req.params.id, userId);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const { request, chain } = check;

    request.status = "rejected";
    request.audit.push({
      action: "reject",
      performedBy: new mongoose.Types.ObjectId(userId),
      stepIndex: request.currentStep,
      stepRole: chain.steps[request.currentStep]?.role,
      comment,
      timestamp: new Date(),
    });

    await request.save();
    res.json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/headcount-requests/:id/request-changes
 * Send the request back to the submitter for edits.
 */
export const requestChangesOnHeadcountRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { comment } = actionSchema.parse(req.body ?? {});

    const check = await ensureActionable(req.params.id, userId);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const { request, chain } = check;

    request.status = "changes_requested";
    request.audit.push({
      action: "request_changes",
      performedBy: new mongoose.Types.ObjectId(userId),
      stepIndex: request.currentStep,
      stepRole: chain.steps[request.currentStep]?.role,
      comment,
      timestamp: new Date(),
    });

    await request.save();
    res.json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/headcount-requests/:id/resubmit
 * Submitter re-submits after requested changes. Restart from step 0.
 */
export const resubmitHeadcountRequest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const reqId = req.params.id;
    if (!isValidObjectId(reqId)) {
      res.status(400).json({ error: "Invalid request ID" });
      return;
    }

    const request = await HeadcountRequest.findById(reqId);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (request.requestedBy.toString() !== userId) {
      res.status(403).json({ error: "Only the submitter can resubmit" });
      return;
    }
    if (request.status !== "changes_requested") {
      res
        .status(400)
        .json({ error: "Only requests with status changes_requested can be resubmitted" });
      return;
    }

    // Allow editing employee data on resubmit — capture a field-level diff
    // so the audit trail preserves edit history (VAL-APPROVAL-012).
    const parsed = z
      .object({ employeeData: employeeDataSchema.optional() })
      .parse(req.body ?? {});

    const changes: { field: string; from: unknown; to: unknown }[] = [];

    if (parsed.employeeData) {
      // `request.employeeData` is a Mongoose subdocument; convert to a plain
      // object so we can safely enumerate fields without pulling in circular
      // parent references (which BSON.serialize rejects).
      const prevDoc = (
        request.employeeData as unknown as {
          toObject?: () => Record<string, unknown>;
        }
      ).toObject
        ? (request.employeeData as unknown as {
            toObject: () => Record<string, unknown>;
          }).toObject()
        : ({ ...(request.employeeData as unknown as Record<string, unknown>) });
      const previousData: Record<string, unknown> = prevDoc;
      const nextData = parsed.employeeData as unknown as Record<string, unknown>;
      const allKeys = new Set<string>([
        ...Object.keys(previousData),
        ...Object.keys(nextData),
      ]);
      for (const key of allKeys) {
        const prev = previousData[key];
        const next = nextData[key];
        const prevEmpty = prev === undefined || prev === null || prev === "";
        const nextEmpty = next === undefined || next === null || next === "";
        if (prevEmpty && nextEmpty) continue;
        // Normalize scalars to strings for comparison so 100 === "100"
        const equals = String(prev ?? "") === String(next ?? "");
        if (!equals) {
          changes.push({
            field: key,
            from: prev === undefined ? null : prev,
            to: next === undefined ? null : next,
          });
        }
      }
      request.employeeData = parsed.employeeData as IEmployeeRequestData;
    }

    const chain = await ApprovalChain.findById(request.chainId);
    request.status = "pending";
    request.currentStep = 0;
    request.audit.push({
      action: "resubmit",
      performedBy: new mongoose.Types.ObjectId(userId),
      stepIndex: 0,
      stepRole: chain?.steps[0]?.role,
      timestamp: new Date(),
      ...(changes.length > 0 ? { changes } : {}),
    });

    await request.save();
    res.json(request);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

// ---------- Bulk actions ----------

/**
 * POST /api/headcount-requests/bulk-approve
 * Approve multiple requests. Skips any the user cannot act on.
 */
export const bulkApprove = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { requestIds, comment } = bulkActionSchema.parse(req.body);

    const results: {
      id: string;
      status: "approved" | "advanced" | "skipped";
      reason?: string;
    }[] = [];

    for (const reqId of requestIds) {
      const check = await ensureActionable(reqId, userId);
      if (!check.ok) {
        results.push({ id: reqId, status: "skipped", reason: check.error });
        continue;
      }
      const { request, chain } = check;
      const stepIndex = request.currentStep;
      const isLastStep = stepIndex >= chain.steps.length - 1;

      request.audit.push({
        action: "approve",
        performedBy: new mongoose.Types.ObjectId(userId),
        stepIndex,
        stepRole: chain.steps[stepIndex]?.role,
        comment,
        timestamp: new Date(),
      });

      if (isLastStep) {
        request.status = "approved";
        const employeeId = await materializeEmployee(request);
        if (employeeId) request.approvedEmployeeId = employeeId;
        await request.save();
        results.push({ id: reqId, status: "approved" });
      } else {
        request.currentStep = stepIndex + 1;
        await request.save();
        results.push({ id: reqId, status: "advanced" });
      }
    }

    res.json({ results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/headcount-requests/bulk-reject
 * Reject multiple requests with an optional shared comment/reason.
 */
export const bulkReject = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { requestIds, comment } = bulkActionSchema.parse(req.body);

    const results: {
      id: string;
      status: "rejected" | "skipped";
      reason?: string;
    }[] = [];

    for (const reqId of requestIds) {
      const check = await ensureActionable(reqId, userId);
      if (!check.ok) {
        results.push({ id: reqId, status: "skipped", reason: check.error });
        continue;
      }
      const { request, chain } = check;

      request.status = "rejected";
      request.audit.push({
        action: "reject",
        performedBy: new mongoose.Types.ObjectId(userId),
        stepIndex: request.currentStep,
        stepRole: chain.steps[request.currentStep]?.role,
        comment,
        timestamp: new Date(),
      });

      await request.save();
      results.push({ id: reqId, status: "rejected" });
    }

    res.json({ results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};
