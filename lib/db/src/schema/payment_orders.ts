import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { pricingTiersTable } from "./pricing_tiers";

export const paymentProviderEnum = pgEnum("payment_provider", ["payme", "click", "free"]);
export const paymentOrderStatusEnum = pgEnum("payment_order_status", [
  "pending",
  "paid",
  "cancelled",
  "failed",
]);

export const paymentOrdersTable = pgTable("payment_orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tierId: text("tier_id").notNull().references(() => pricingTiersTable.id),
  provider: paymentProviderEnum("provider").notNull(),
  amountSom: integer("amount_som").notNull(),
  status: paymentOrderStatusEnum("status").notNull().default("pending"),
  providerTransactionId: text("provider_transaction_id").unique(),
  performedAt: timestamp("performed_at"),
  cancelledAt: timestamp("cancelled_at"),
  /** Payme's CancelTransaction reason code, echoed back verbatim by CheckTransaction/GetStatement. */
  cancelReason: integer("cancel_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PaymentOrder = typeof paymentOrdersTable.$inferSelect;
export type InsertPaymentOrder = typeof paymentOrdersTable.$inferInsert;
