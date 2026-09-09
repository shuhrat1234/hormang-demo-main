import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const announcementsTable = pgTable("announcements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  titleUz: text("title_uz").notNull(),
  titleRu: text("title_ru"),
  titleEn: text("title_en"),
  contentUz: text("content_uz").notNull(),
  contentRu: text("content_ru"),
  contentEn: text("content_en"),
  image: text("image"),
  ctaTextUz: text("cta_text_uz"),
  ctaTextRu: text("cta_text_ru"),
  ctaTextEn: text("cta_text_en"),
  ctaLink: text("cta_link"),
  target: text("target").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  status: text("status").notNull().default("draft"),
  publishAt: timestamp("publish_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AnnouncementRow = typeof announcementsTable.$inferSelect;
