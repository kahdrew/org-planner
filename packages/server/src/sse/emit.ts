/**
 * Helpers that translate controller-level mutations into SSE events.
 *
 * Controllers know the `scenarioId` that was mutated; the event bus is
 * keyed by `orgId` (so events are isolated per-org). These helpers do
 * the scenario→org lookup and call `eventBus.emit`.
 *
 * Emission failures are swallowed — a broken SSE fanout must never
 * cause the underlying REST mutation to fail.
 */

import mongoose from "mongoose";
import Scenario from "../models/Scenario";
import { eventBus, SseEventType } from "./eventBus";

/** Resolve the orgId for a given scenarioId, or `null` if not found. */
async function resolveOrgId(scenarioId: mongoose.Types.ObjectId | string): Promise<string | null> {
  try {
    const id = scenarioId.toString();
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const scenario = await Scenario.findById(id).select("orgId").lean();
    return scenario ? scenario.orgId.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Emit an event whose origin is a scenario. Looks up the owning org
 * and fans out to SSE clients connected to it.
 */
export async function emitScenarioScopedEvent(
  scenarioId: mongoose.Types.ObjectId | string,
  type: SseEventType,
  payload: unknown,
): Promise<void> {
  try {
    const orgId = await resolveOrgId(scenarioId);
    if (!orgId) return;
    eventBus.emit(orgId, {
      type,
      scenarioId: scenarioId.toString(),
      payload,
    });
  } catch {
    /* never let SSE break the caller */
  }
}

/**
 * Emit an org-level event (e.g., org metadata changes). Direct orgId form.
 */
export function emitOrgScopedEvent(
  orgId: string,
  type: SseEventType,
  payload: unknown,
): void {
  try {
    eventBus.emit(orgId, { type, payload });
  } catch {
    /* never let SSE break the caller */
  }
}
