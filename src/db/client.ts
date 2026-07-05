import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/bun-sqlite";

import { env } from "../env.ts";
import * as schema from "./schema.ts";

const dbPath = env.DATABASE_PATH;
mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode=WAL;");

export const db = drizzle(sqlite, { schema });
