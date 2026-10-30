import { pgTable, text, timestamp, jsonb, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const requestStatusEnum = pgEnum("request_status", [
  "open", "accepted", "matched", "completed", "cancelled", "inactive",
]);

export const requestsTable = pgTable(
  "requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    customerId: text("customer_id").references(() => usersTable.id, { onDelete: "cascade" }),
    customerName: text("customer_name"),
    categoryId: text("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    emoji: text("emoji").notNull(),
    answers: jsonb("answers").notNull().$type<Record<string, unknown>>(),
    requestPhotos: jsonb("request_photos").$type<string[]>(),
    status: requestStatusEnum("status").notNull().default("open"),
    region: text("region"),
    district: text("district"),
    acceptedOfferId: text("accepted_offer_id"),
    closedForOffers: boolean("closed_for_offers").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("requests_status_category_idx").on(table.status, table.categoryId),
    index("requests_customer_created_idx").on(table.customerId, table.createdAt),
    index("requests_created_at_idx").on(table.createdAt),
    index("requests_district_idx").on(table.district),
  ],
);

export type RequestRow = typeof requestsTable.$inferSelect;
