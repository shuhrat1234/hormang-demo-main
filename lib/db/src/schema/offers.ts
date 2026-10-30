import { pgTable, text, timestamp, jsonb, boolean, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { requestsTable } from "./requests";

export const offerStatusEnum = pgEnum("offer_status", [
  "pending", "negotiating", "accepted", "rejected", "cancelled", "expired", "in_progress", "completed", "Yopilgan",
]);

export const offersTable = pgTable(
  "offers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    requestId: text("request_id").notNull().references(() => requestsTable.id, { onDelete: "cascade" }),
    masterId: text("master_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    masterName: text("master_name").notNull(),
    masterInitials: text("master_initials").notNull(),
    masterColor: text("master_color").notNull(),
    price: integer("price").notNull(),
    priceLabel: text("price_label"),
    message: text("message").notNull(),
    fileUrls: jsonb("file_urls").$type<string[]>(),
    avgResponseTime: integer("avg_response_time").notNull().default(0),
    status: offerStatusEnum("status").notNull().default("pending"),
    tangaSpent: integer("tanga_spent"),
    refunded: boolean("refunded").notNull().default(false),
    providerConfirmedCompleted: boolean("provider_confirmed_completed").notNull().default(false),
    customerConfirmedCompleted: boolean("customer_confirmed_completed").notNull().default(false),
    completionAfterPhotos: jsonb("completion_after_photos").$type<string[]>(),
    completionNotes: text("completion_notes"),
    completionDurationMinutes: integer("completion_duration_minutes"),
    completedAt: timestamp("completed_at"),
    portfolioTitle: text("portfolio_title"),
    portfolioDescription: text("portfolio_description"),
    portfolioCoverPhoto: text("portfolio_cover_photo"),
    portfolioAdditionalPhotos: jsonb("portfolio_additional_photos").$type<string[]>(),
    portfolioFeatured: boolean("portfolio_featured").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("offers_request_id_idx").on(table.requestId),
    index("offers_master_id_idx").on(table.masterId),
    index("offers_request_status_idx").on(table.requestId, table.status),
    index("offers_created_at_idx").on(table.createdAt),
  ],
);

export type OfferRow = typeof offersTable.$inferSelect;
