import express from "express";
import cors from "cors";
import { buildSessionMiddleware } from "./middleware/session";
import authRoutes from "./routes/authRoutes";
import orgRoutes from "./routes/orgRoutes";
import scenarioRoutes from "./routes/scenarioRoutes";
import employeeRoutes from "./routes/employeeRoutes";
import invitationRoutes from "./routes/invitationRoutes";
import scheduledChangeRoutes from "./routes/scheduledChangeRoutes";
import timelineRoutes from "./routes/timelineRoutes";
import budgetRoutes from "./routes/budgetRoutes";
import approvalRoutes from "./routes/approvalRoutes";
import sseRoutes from "./routes/sseRoutes";
import aiRoutes from "./routes/aiRoutes";

const app = express();

// Vercel (and any other reverse proxy) terminates TLS before Express. Trust the
// first proxy so `secure` cookies are emitted when `req.secure` reflects the
// forwarded protocol.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());

// Session middleware MUST come before any route that reads req.session.
app.use(buildSessionMiddleware());

app.use("/api/auth", authRoutes);
// SSE must be mounted before the default orgRoutes so the event-stream
// handler isn't shadowed by the authenticated CRUD router.
app.use("/api", sseRoutes);
app.use("/api/orgs", orgRoutes);
app.use("/api", scenarioRoutes);
app.use("/api", employeeRoutes);
app.use("/api", invitationRoutes);
app.use("/api", scheduledChangeRoutes);
app.use("/api", timelineRoutes);
app.use("/api", budgetRoutes);
app.use("/api", approvalRoutes);
app.use("/api", aiRoutes);

export default app;
