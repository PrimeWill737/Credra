import "./env.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { healthRouter } from "./routes/health.js";
import { apiRouter } from "./routes/api.js";

const app = express();
const port = Number(process.env.PORT) || 4000;

const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins?.length ? corsOrigins : true,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use("/api/v1", apiRouter);

app.listen(port, () => {
  console.log(`CREDRA API listening on http://localhost:${port}`);
});
