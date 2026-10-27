import { and, eq, sql } from "drizzle-orm";
import { db, usersTable, walletsTable, tangaTransactionsTable, referralsTable } from "@workspace/db";

export const REFERRAL_REWARD = 3;
export const MAX_REFERRALS = 5;

export type ReferralRewardResult =
  | { granted: true; balance: number }
  | { granted: false; alreadyGranted: true }
  | { granted: false; capped: true }
  | { error: string };

export async function grantReferralReward(referrerCode: string, inviteeId: string): Promise<ReferralRewardResult> {
  if (!referrerCode || typeof referrerCode !== "string") {
    return { error: "referrerCode talab qilinadi" };
  }

  const prefix = referrerCode.trim().toUpperCase().replace(/^HORMANG-/, "").toLowerCase();
  if (prefix.length < 4) {
    return { error: "Noto'g'ri referral kod" };
  }

  // Use CAST to text and ILIKE so it works across UUID and string columns reliably
  const candidates = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`CAST(${usersTable.id} AS text) ILIKE ${prefix + "%"}`)
    .limit(2);

  if (candidates.length !== 1) {
    return { error: "Taklif qiluvchi topilmadi" };
  }
  const referrerId = candidates[0].id;

  if (referrerId === inviteeId) {
    return { error: "O'zingizni taklif qila olmaysiz" };
  }

  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(referralsTable)
      .values({ referrerId, inviteeId })
      .onConflictDoNothing({ target: referralsTable.inviteeId })
      .returning({ id: referralsTable.id });

    if (inserted.length === 0) {
      return { granted: false as const, alreadyGranted: true as const };
    }

    const rewardedSoFar = await tx
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.rewarded, true)));

    if (rewardedSoFar.length >= MAX_REFERRALS) {
      return { granted: false as const, capped: true as const };
    }

    const [existingWallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, referrerId))
      .limit(1);

    const nextBalance = (existingWallet?.balance ?? 0) + REFERRAL_REWARD;
    if (existingWallet) {
      await tx
        .update(walletsTable)
        .set({ balance: nextBalance, updatedAt: new Date() })
        .where(eq(walletsTable.userId, referrerId));
    } else {
      await tx
        .insert(walletsTable)
        .values({ userId: referrerId, balance: nextBalance });
    }

    await tx.insert(tangaTransactionsTable).values({
      userId: referrerId,
      type: "referral",
      direction: "in",
      amount: REFERRAL_REWARD,
      description: "Do'stni taklif qilish mukofoti",
    });

    await tx
      .update(referralsTable)
      .set({ rewarded: true })
      .where(eq(referralsTable.inviteeId, inviteeId));

    return { granted: true as const, balance: nextBalance };
  });
}
