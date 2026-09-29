/**
 * Translates chat system messages dynamically according to the viewer's active interface language.
 */
export function translateSystemMessage(
  text: string,
  sysMsgs: Record<string, string> | any
): string {
  if (!text || !sysMsgs) return text ?? "";
  const t = text.trim();

  // 1. Exact match map
  const directMap: Record<string, string> = {
    "Taklif qabul qilindi": sysMsgs.systemMsgOfferAccepted,
    "Taklif qabul qilindi — Suhbat davom etmoqda": sysMsgs.systemMsgOfferAccepted,
    "Предложение принято": sysMsgs.systemMsgOfferAccepted,
    "Предложение принято — чат продолжается": sysMsgs.systemMsgOfferAccepted,
    "Offer accepted": sysMsgs.systemMsgOfferAccepted,
    "Offer accepted — chat continues": sysMsgs.systemMsgOfferAccepted,

    "Taklif rad etildi. Suhbat yopildi.": sysMsgs.systemMsgOfferRejected,
    "Taklif rad etildi": sysMsgs.systemMsgOfferRejected,
    "Предложение отклонено. Чат закрыт.": sysMsgs.systemMsgOfferRejected,
    "Предложение отклонено": sysMsgs.systemMsgOfferRejected,
    "Offer rejected. Chat closed.": sysMsgs.systemMsgOfferRejected,

    "Mijoz boshqa ijrochini tanladi": sysMsgs.systemMsgOfferSiblingClosed,
    "Mijoz boshqa ijrochi taklifini qabul qildi": sysMsgs.systemMsgOfferSiblingClosed,
    "Клиент принял предложение другого исполнителя": sysMsgs.systemMsgOfferSiblingClosed,
    "Клиент выбрал другого исполнителя": sysMsgs.systemMsgOfferSiblingClosed,
    "Customer accepted another provider's offer": sysMsgs.systemMsgOfferSiblingClosed,

    "Ijrochi xizmat yakunlanganligini tasdiqladi. Mijoz tasdig'i kutilmoqda.": sysMsgs.systemMsgProviderConfirmed,
    "⏳ Ijrochi xizmat yakunlanganligini tasdiqladi. Mijoz tasdig'i kutilmoqda.": sysMsgs.systemMsgProviderConfirmed,
    "Исполнитель подтвердил завершение. Ожидается подтверждение клиента.": sysMsgs.systemMsgProviderConfirmed,
    "⏳ Исполнитель подтвердил завершение. Ожидается подтверждение клиента.": sysMsgs.systemMsgProviderConfirmed,
    "Provider confirmed completion. Awaiting customer confirmation.": sysMsgs.systemMsgProviderConfirmed,
    "⏳ Provider confirmed completion. Awaiting customer confirmation.": sysMsgs.systemMsgProviderConfirmed,

    "Mijoz xizmat yakunlanganligini tasdiqladi. Ijrochi tasdig'i kutilmoqda.": sysMsgs.systemMsgCustomerConfirmed,
    "⏳ Mijoz xizmat yakunlanganligini tasdiqladi. Ijrochi tasdig'i kutilmoqda.": sysMsgs.systemMsgCustomerConfirmed,
    "Клиент подтвердил завершение. Ожидается подтверждение исполнителя.": sysMsgs.systemMsgCustomerConfirmed,
    "⏳ Клиент подтвердил завершение. Ожидается подтверждение исполнителя.": sysMsgs.systemMsgCustomerConfirmed,
    "Customer confirmed completion. Awaiting provider confirmation.": sysMsgs.systemMsgCustomerConfirmed,
    "⏳ Customer confirmed completion. Awaiting provider confirmation.": sysMsgs.systemMsgCustomerConfirmed,

    "Xizmat yakunlandi": sysMsgs.systemMsgCompleted,
    "✅ Xizmat yakunlandi! Hamkorlik uchun rahmat.": sysMsgs.systemMsgCompleted,
    "Услуга завершена": sysMsgs.systemMsgCompleted,
    "✅ Услуга завершена! Спасибо за сотрудничество.": sysMsgs.systemMsgCompleted,
    "Service completed": sysMsgs.systemMsgCompleted,
    "✅ Service completed! Thank you for your cooperation.": sysMsgs.systemMsgCompleted,

    "Admin tomonidan yakunlandi": sysMsgs.systemMsgAdminCompleted ?? sysMsgs.systemMsgCompleted,
    "Завершено администратором": sysMsgs.systemMsgAdminCompleted ?? sysMsgs.systemMsgCompleted,
    "Completed by administrator": sysMsgs.systemMsgAdminCompleted ?? sysMsgs.systemMsgCompleted,
  };

  if (directMap[t]) {
    return directMap[t];
  }

  // 2. Fuzzy substring matching for any slight differences/punctuation
  const lower = t.toLowerCase();
  if (lower.includes("qabul qilindi") || lower.includes("принято") || lower.includes("offer accepted")) {
    return sysMsgs.systemMsgOfferAccepted ?? t;
  }
  if (lower.includes("rad etildi") || lower.includes("отклонено") || lower.includes("offer rejected")) {
    return sysMsgs.systemMsgOfferRejected ?? t;
  }
  if (lower.includes("boshqa ijrochi") || lower.includes("другого исполнителя") || lower.includes("another provider")) {
    return sysMsgs.systemMsgOfferSiblingClosed ?? t;
  }
  if (lower.includes("ijrochi xizmat yakunlanganligini") || lower.includes("исполнитель подтвердил") || lower.includes("provider confirmed")) {
    return sysMsgs.systemMsgProviderConfirmed ?? t;
  }
  if (lower.includes("mijoz xizmat yakunlanganligini") || lower.includes("клиент подтвердил") || lower.includes("customer confirmed")) {
    return sysMsgs.systemMsgCustomerConfirmed ?? t;
  }
  if (lower.includes("admin tomonidan") || lower.includes("администратором") || lower.includes("administrator")) {
    return sysMsgs.systemMsgAdminCompleted ?? sysMsgs.systemMsgCompleted ?? t;
  }
  if (lower.includes("xizmat yakunlandi") || lower.includes("услуга завершена") || lower.includes("service completed")) {
    return sysMsgs.systemMsgCompleted ?? t;
  }

  return t;
}
