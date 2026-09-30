import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, "../.env") });
process.env.NODE_ENV = "test";
