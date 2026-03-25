import { Router } from "express";
import { monoRouter } from "./mono.js";
import { scoreRouter } from "./score.js";
import { adminRouter } from "./admin.js";
import { clientRouter } from "./client.js";

export const apiRouter = Router();

apiRouter.use("/integrations", monoRouter);
apiRouter.use(scoreRouter);
apiRouter.use("/client", clientRouter);
apiRouter.use("/admin", adminRouter);
