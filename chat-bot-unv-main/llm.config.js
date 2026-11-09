// ═══════════════════════════════════════════════════════════
// تنظیمات مدل زبانی — برای عوض کردن سرویس، آدرس یا مدل فقط همین فایل را ویرایش کنید.
//
//   use:       سرویس فعال (یکی از اسم‌های داخل providers)
//   fallback:  اختیاری — اگر سرویس فعال خطا داد یا پر بود، به ترتیب سراغ این‌ها می‌رود
//
// هر سرویس:
//   url:    آدرس API سازگار با OpenAI (تا قبل از /chat/completions)
//   model:  اسم مدل
//   key:    «اسم» متغیری که کلید در Vercel (Settings → Environment Variables) با آن ذخیره شده.
//           خود کلید را هرگز اینجا ننویسید؛ این فایل در گیت‌هاب عمومی دیده می‌شود.
//   vision: آیا مدل تصویر می‌فهمد (پیش‌فرض false)
// اختیاری: visionModel · maxConcurrent (پیش‌فرض ۵۰) · stream: false · extra: { پارامترهای اضافهٔ بدنه }
//
// بدون ویرایش فایل هم می‌شود سرویس فعال را عوض کرد: متغیر LLM_USE را در Vercel بگذارید (مثلاً irancopilot).
// ═══════════════════════════════════════════════════════════
module.exports = {
  use: 'ollama',
  fallback: [],

  providers: {
    ollama: {
      url: 'https://ollama.com/v1',
      model: 'gemma4:31b',
      key: 'OLLAMA_API_KEY',
      vision: true,
    },
    irancopilot: {
      url: 'https://irancopilot.com/studio/pro/v1',
      model: 'icp-chat',
      key: 'ICP_API_KEY',
    },
  },
};
