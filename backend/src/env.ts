/**
 * Load `.env` from the `backend/` directory regardless of process.cwd()
 * (fixes missing DATABASE_URL when `tsx` is started from another folder).
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
