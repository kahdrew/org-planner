import { Router } from "express";
import { streamOrgEvents, pollOrgEvents } from "../controllers/sseController";

const router = Router();

/**
 * SSE routes intentionally do NOT use the global `auth` middleware so the
 * controllers can perform the same session check themselves without adding
 * another layer of wrapper types. Authentication relies on the session
 * cookie (`orgplanner.sid`) attached automatically by EventSource.
 */
// Polling fallback must be declared first so the more specific `/poll`
// path is not swallowed by the `/events` SSE handler if a user agent
// probes with a trailing slash.
router.get("/orgs/:orgId/events/poll", pollOrgEvents);
router.get("/orgs/:orgId/events", streamOrgEvents);

export default router;
