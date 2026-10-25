import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/contexts/i18n-context";

export type LegalDocType = "terms" | "privacy" | "safety" | null;

interface LegalModalProps {
  type: LegalDocType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LegalModal({ type, open, onOpenChange }: LegalModalProps) {
  const { locale } = useI18n();

  if (!type) return null;

  const content = {
    terms: {
      title: {
        ru: "Условия использования (Публичная оферта)",
        uz: "Foydalanish shartlari (Ommaviy oferta)",
        en: "Terms of Service (Public Offer)",
      },
      updated: {
        ru: "Редакция от 10 февраля 2026 г.",
        uz: "Tahrir: 2026-yil 10-fevral",
        en: "Last updated: February 10, 2026",
      },
      sections: [
        {
          heading: {
            ru: "1. Общие положения",
            uz: "1. Umumiy qoidalar",
            en: "1. General Provisions",
          },
          body: {
            ru: "Платформа Hormang (далее — «Платформа») предоставляет информационно-посреднические услуги, объединяющие Заказчиков и Исполнителей в Республике Узбекистан. Hormang не является стороной сделки между Заказчиком и Исполнителем и не несет ответственности за качество фактически выполненных работ.",
            uz: "Hormang platformasi (keyingi o'rinlarda «Platforma») O'zbekiston Respublikasida Buyurtmachilar va Ijrochilarni birlashtiruvchi axborot-vositachilik xizmatlarini taqdim etadi. Hormang tomonlar o'rtasidagi bitim ishtirokchisi hisoblanmaydi va bajarilgan ishlar sifati uchun javobgar emas.",
            en: "The Hormang platform provides information matching services connecting Customers and Service Providers in the Republic of Uzbekistan. Hormang is not a party to the contract between the Customer and the Provider and is not liable for work quality.",
          },
        },
        {
          heading: {
            ru: "2. Регистрация и внутренняя валюта Tanga",
            uz: "2. Ro'yxatdan o'tish va Tanga ichki valyutasi",
            en: "2. Registration and Tanga Tokens",
          },
          body: {
            ru: "Исполнители приобретают виртуальные единицы (Tanga) для отправки откликов на клиентские заявки. Списание Tanga происходит в момент отправки предложения. В случае отмены заявки или несостоявшегося контакта возврат Tanga регулируется правилами модерации платформы.",
            uz: "Ijrochilar mijozlar so'rovlariga taklif yuborish uchun Tanga xarid qiladilar. Tanga taklif yuborilgan paytda yechiladi. So'rov bekor qilingan taqdirda Tanga qaytarilishi moderatorlar tomonidan ko'rib chiqiladi.",
            en: "Providers purchase virtual Tanga units to send quotes to customer requests. Tanga is deducted upon offer submission. Refunds for cancelled requests are governed by platform moderation rules.",
          },
        },
        {
          heading: {
            ru: "3. Обязательства сторон и расчеты",
            uz: "3. Tomonlarning majburiyatlari va hisob-kitoblar",
            en: "3. Obligations and Payments",
          },
          body: {
            ru: "Расчеты за оказанные услуги производятся между Заказчиком и Исполнителем напрямую (наличными или банковским переводом) после завершения работ и проверки качества. Предоплата без надлежащих гарантий не рекомендуется.",
            uz: "Xizmatlar uchun to'lov Buyurtmachi va Ijrochi o'rtasida ish yakunlangach va sifat tekshirilgach to'g'ridan-to'g'ri amalga oshiriladi (naqd yoki karta orqali).",
            en: "Payments for rendered services are made directly between Customer and Provider after work completion and inspection. Direct prepayments are discouraged without appropriate guarantees.",
          },
        },
      ],
    },
    privacy: {
      title: {
        ru: "Политика конфиденциальности",
        uz: "Maxfiylik siyosati",
        en: "Privacy Policy",
      },
      updated: {
        ru: "Действует с 1 января 2026 г.",
        uz: "Amal qilish muddati: 2026-yil 1-yanvardan",
        en: "Effective Date: January 1, 2026",
      },
      sections: [
        {
          heading: {
            ru: "1. Сбор и обработка персональных данных",
            uz: "1. Shaxsiy ma'lumotlarni yig'ish va qayta ishlash",
            en: "1. Data Collection and Processing",
          },
          body: {
            ru: "Мы собираем номер телефона, имя, геолокацию (город/район) и историю заявок/откликов исключительно для обеспечения корректной работы сервиса и связи между заказчиками и исполнителями.",
            uz: "Biz faqat xizmatning to'g'ri ishlashi va mijoz bilan ijrochi o'rtasida aloqa o'rnatish uchun telefon raqami, ism, joylashuv va buyurtmalar tarixini yig'amiz.",
            en: "We collect phone numbers, names, approximate locations (city/district), and order history solely to facilitate platform connections between customers and verified providers.",
          },
        },
        {
          heading: {
            ru: "2. Защита информации",
            uz: "2. Ma'lumotlar xavfsizligi",
            en: "2. Information Security",
          },
          body: {
            ru: "Персональные данные хранятся на защищенных серверах в соответствии с Законом Республики Узбекистан «О персональных данных» № ЗРУ-547. Мы не передаем контакты третьим лицам без вашего согласия.",
            uz: "Shaxsiy ma'lumotlar O'zbekiston Respublikasining «Shaxsga doir ma'lumotlar to'g'risida»gi Qonuniga muvofiq himoyalangan serverlarda saqlanadi. Ma'lumotlar uchinchi shaxslarga berilmaydi.",
            en: "Personal data is securely stored in compliance with the Law of the Republic of Uzbekistan 'On Personal Data' No. ZRU-547. We do not sell or disclose your data to third parties.",
          },
        },
        {
          heading: {
            ru: "3. Файлы Cookie",
            uz: "3. Cookie fayllari",
            en: "3. Cookies",
          },
          body: {
            ru: "Платформа использует необходимые файлы cookie для сохранения авторизации, выбранного языка и аналитики посещаемости.",
            uz: "Platforma tizimga kirish, tanlangan til va umumiy tahlillar uchun zaruriy cookie fayllaridan foydalanadi.",
            en: "The platform uses essential cookies to persist user sessions, language preferences, and aggregate analytics.",
          },
        },
      ],
    },
    safety: {
      title: {
        ru: "Безопасность и правила сервиса",
        uz: "Xavfsizlik va servis qoidalari",
        en: "Safety and Platform Guidelines",
      },
      updated: {
        ru: "Стандарты надежности Hormang",
        uz: "Hormang ishonchlilik standartlari",
        en: "Hormang Reliability Standards",
      },
      sections: [
        {
          heading: {
            ru: "1. Проверка исполнителей",
            uz: "1. Ijrochilarni tekshirish",
            en: "1. Provider Verification",
          },
          body: {
            ru: "Мы проводим проверку номеров телефонов, верификацию документов и мониторинг отзывов. Исполнители с подтвержденными профилями получают отличительный бейдж доверия.",
            uz: "Biz telefon raqamlarini, hujjatlarni va mijozlar sharhlarini doimiy ravishda tekshirib boramiz. Tasdiqlangan ijrochilar maxsus ishonch belgisiga ega bo'ladilar.",
            en: "We perform phone verification, identity checks, and review monitoring. Verified specialists display trusted identification badges.",
          },
        },
        {
          heading: {
            ru: "2. Оплата только после выполнения",
            uz: "2. To'lov faqat ish bajarilgandan so'ng",
            en: "2. Pay Only After Completion",
          },
          body: {
            ru: "Главное правило безопасности для заказчиков: никогда не переводите предоплату незнакомым исполнителям до фактического осмотра объекта или начала работ.",
            uz: "Xavfsizlikning oltin qoidasi: hech qachon ish bajarilmasdan yoki shaxsan uchrashmasdan oldindan pul o'tkazmang.",
            en: "Golden safety rule for customers: never wire prepayment before meeting the specialist in person or inspecting the finished work.",
          },
        },
        {
          heading: {
            ru: "3. Жалобы и модерация",
            uz: "3. Shikoyat va moderatsiya",
            en: "3. Dispute Moderation",
          },
          body: {
            ru: "При возникновении разногласий, оскорблений или подозрений в мошенничестве вы можете пожаловаться на профиль через чат или написать в службу поддержки support@hormang.uz.",
            uz: "Kelishmovchilik, noo'rin xatti-harakatlar yoki firibgarlik shubhasi tug'ilsa, chat orqali shikoyat yuborishingiz yoki support@hormang.uz manziliga murojaat qilishingiz mumkin.",
            en: "In case of disputes, misconduct, or fraud suspicions, file a complaint directly in chat or contact support@hormang.uz immediately.",
          },
        },
      ],
    },
  }[type];

  const loc = locale === "uz" || locale === "ru" || locale === "en" ? locale : "uz";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden rounded-2xl sm:rounded-3xl">
        <DialogHeader className="p-6 pb-4 border-b border-gray-100 bg-gray-50/50">
          <DialogTitle className="text-xl font-extrabold text-gray-900 tracking-tight">
            {content.title[loc]}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500 font-medium">
            {content.updated[loc]}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="p-6 max-h-[60vh] space-y-6">
          <div className="space-y-6 text-sm leading-relaxed text-gray-700">
            {content.sections.map((sec, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="font-bold text-gray-900 text-base">
                  {sec.heading[loc]}
                </h4>
                <p className="text-gray-600 leading-relaxed">
                  {sec.body[loc]}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
