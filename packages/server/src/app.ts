import express from "express";
import cors from "cors";
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

const app = express();

app.use(cors());
app.use(express.json());

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

export default app;
