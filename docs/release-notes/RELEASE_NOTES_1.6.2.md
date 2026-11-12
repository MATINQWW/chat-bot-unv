# نسخه 1.6.1 — اصلاح سیاست پاسخ‌گویی تحصیلی

## مشکل اصلاح‌شده

در Prompt قبلی دو دستور با هم تعارض داشتند: یک دستور در نبود پاسخ در پایگاه دانش، ارجاع به مرکز و اعلام «اطلاعات ندارم» را الزام می‌کرد؛ دستور دیگری پاسخ‌گویی با دانش عمومی را مجاز می‌دانست. مدل گاهی دستور اول را برمی‌گزید و برای پرسش‌های عمومی رشته و مسیر شغلی پاسخ مفیدی نمی‌داد.

## تغییرات

- افزودن `lib/intent.js` برای تشخیص سه حالت `general`، `university` و `mixed`.
- بازنویسی قوانین Prompt با تفکیک روشن دانش عمومی از واقعیت رسمی دانشگاه.
- پاسخ‌گویی عمومی درباره رشته، مهارت، علاقه، تناسب تحصیلی و مسیر شغلی حتی در نبود داده در Knowledge Base.
- جلوگیری از حدس درباره شهریه، ظرفیت، تاریخ، مدارک، قوانین و سایر اطلاعات اختصاصی دانشگاه.
- در پرسش ترکیبی، پاسخ عمومی و اطلاعات اختصاصی دانشگاه از هم جدا می‌شوند.
- جلوگیری از خواندن/ذخیره پاسخ‌های عمومی در حافظه یادگیری تا پاسخ مدل به‌عنوان پاسخ رسمی یا FAQ بازپخش نشود.
- جلوگیری از نمایش CTA تماس برای پرسش‌های صرفاً عمومی.
- ثبت منبع `general` در گزارش مدیر بدون نیاز به افزودن ستاره به متن قابل مشاهده کاربر.
- افزودن تست‌های سیاست پاسخ‌گویی به Smoke Test.

## سازگاری

- هیچ تغییری در `index.html`، `style.css`، `script.js`، `report.html`، `report.js`، `owl.png` یا پوشه `assets/` اعمال نشده است.
- قرارداد API، قالب JSON و SSE و مسیرهای فعلی حفظ شده‌اند.
- متغیر محیطی جدیدی لازم نیست.

## آزمون‌ها

- `npm run test:all` موفق.
- Smoke Test، تست سرور، تست امنیت و ارزیابی بازیابی 43/43 موفق.
- آزمون کیفیت پاسخ واقعی با Provider زنده در این محیط اجرا نشده؛ پس از Deploy باید پرسش‌های نمونه با مدل واقعی دوباره آزمایش شوند.

## 1.6.2 — Resilient handling of upstream HTTP 413
- Added a fourth minimal-context retry using a compact system prompt, no prior conversation history, no retrieved knowledge, and a 128-token output budget.
- Progressive truncation for text attachments across retries.
- More precise user-facing error messages when the provider still rejects oversized image/text attachments or context.
- Frontend files remain unchanged.
