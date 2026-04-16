import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import orgRoutes from "./routes/orgRoutes";
import scenarioRoutes from "./routes/scenarioRoutes";
import employeeRoutes from "./routes/employeeRoutes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/orgs", orgRoutes);
app.use("/api", scenarioRoutes);
app.use("/api", employeeRoutes);

export default app;
