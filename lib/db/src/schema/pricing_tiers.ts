import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const pricingTiersTable = pgTable("pricing_tiers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  nameUz: text("name_uz").notNull(),
  nameRu: text("name_ru").notNull(),
  nameEn: text("name_en"),
  descUz: text("desc_uz"),
  descRu: text("desc_ru"),
  descEn: text("desc_en"),
  credits: integer("credits").notNull(),
  bonusTokens: integer("bonus_tokens").notNull().default(0),
  priceSom: integer("price_som").notNull(),
  /** Promotional sale price (so'm) — when set and active, overrides priceSom until validUntil/saleLimit is hit. */
  salePrice: integer("sale_price"),
  saleLimit: integer("sale_limit"),
  salePurchaseCount: integer("sale_purchase_count").notNull().default(0),
  /** Max times a single user may buy this tier; null = unlimited. */
  perUserLimit: integer("per_user_limit"),
  startsAt: timestamp("starts_at"),
  validUntil: timestamp("valid_until"),
  status: text("status").notNull().default("active"),
  visibilityTarget: text("visibility_target"),
  featured: boolean("featured").notNull().default(false),
  hotOffer: boolean("hot_offer").notNull().default(false),
  bonusPlan: boolean("bonus_plan").notNull().default(false),
  badgeUz: text("badge_uz"),
  badgeRu: text("badge_ru"),
  badgeEn: text("badge_en"),
  color: text("color"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPricingTierSchema = createInsertSchema(pricingTiersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectPricingTierSchema = createSelectSchema(pricingTiersTable);

export type InsertPricingTier = typeof pricingTiersTable.$inferInsert;
export type PricingTier = typeof pricingTiersTable.$inferSelect;
