import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const cookieConsentsTable = pgTable("cookie_consents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  consentStatus: text("consent_status").notNull(), // 'accepted' | 'essential_only' | 'rejected'
  analytics: boolean("analytics").notNull().default(true),
  marketing: boolean("marketing").notNull().default(true),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CookieConsentRow = typeof cookieConsentsTable.$inferSelect;
export type InsertCookieConsent = typeof cookieConsentsTable.$inferInsert;
