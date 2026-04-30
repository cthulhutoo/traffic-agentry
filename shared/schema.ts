// Schema not used — this dashboard reads from access logs / a sample feed via /api/metrics.
// File kept as a stub so the template's drizzle.config.ts and Vite alias remain valid.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const _placeholder = sqliteTable("_placeholder", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  note: text("note").notNull(),
});
