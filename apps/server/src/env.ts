import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
];

const envPath = candidates.find((candidate) => existsSync(candidate));
config(envPath ? { path: envPath } : undefined);
