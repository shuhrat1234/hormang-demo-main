import { pgTable, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["buyer", "provider"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  /** Source/channel through which the user learned about Hormang (survey on last registration step). */
  registrationSource: text("registration_source"),
  lastLoginAt: timestamp("last_login_at"),
  /** One-time 100%-profile-completion Tanga reward — set the first (and only) time it's granted. */
  profileBonusGrantedAt: timestamp("profile_bonus_granted_at"),
  /** True only once a user has gone through a flow that lets them set a real,
   *  known password (e.g. legacy email+password migration). Phone/OTP
   *  registration hashes a random, never-surfaced password, so password-gated
   *  sensitive actions must skip the password check unless this is true. */
  hasPassword: boolean("has_password").notNull().default(false),
  pendingEmail: text("pending_email"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorCodeHash: text("two_factor_code_hash"),
  twoFactorHint: text("two_factor_hint"),
  deleteRequestedAt: timestamp("delete_requested_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  passwordHash: true,
  lastLoginAt: true,
  hasPassword: true,
  pendingEmail: true,
  twoFactorEnabled: true,
  twoFactorCodeHash: true,
  twoFactorHint: true,
  deleteRequestedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().min(8),
  email: z.email().optional(),
  phone: z.string().min(9).optional(),
  registrationSource: z.string().optional(),
});

export const selectUserSchema = createSelectSchema(usersTable).omit({
  passwordHash: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type SafeUser = Omit<User, "passwordHash">;
