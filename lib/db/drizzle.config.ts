import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile?.(path.resolve(process.cwd(), ".env")); } catch {}
  try { process.loadEnvFile?.(path.resolve(__dirname, "../../.env")); } catch {}
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // drizzle-kit's internal glob expects forward slashes; path.join gives
  // backslashes on Windows, which silently matches zero schema files.
  schema: path.join(__dirname, "./src/schema/index.ts").split(path.sep).join("/"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
