// ═══════════════════════════════════════════════════════════
// تنظیمات پروژه — همهٔ تنظیمات اینجاست. در Vercel (Environment Variables) فقط کلیدها و رمزها:
//   کلید مدل (اسمش در llm.providers.*.key) · CHAT_SIGNING_SECRET · ADMIN_TOKEN (اختیاری)
//   و اگر استفاده می‌کنید: KV_REST_API_URL/TOKEN · UPSTASH_VECTOR_REST_URL/TOKEN · LEAD_WEBHOOK_URL · TRANSCRIBE_API_KEY
// این فایل در گیت‌هاب دیده می‌شود؛ هیچ کلیدی اینجا ننویسید.
// ═══════════════════════════════════════════════════════════
module.exports = {

  // ─── مدل زبانی ───
  llm: {
    use: 'irancopilot',           // سرویس فعال (یکی از providers)
    fallback: [],            // اختیاری: اگر فعال خطا داد یا پر بود، به ترتیب این‌ها؛ مثلاً ['irancopilot']

    providers: {
      // url: آدرس API سازگار با OpenAI · model: اسم مدل · key: «اسم» متغیر کلید در Vercel
      // vision: مدل تصویر می‌فهمد؟ · اختیاری: visionModel · maxConcurrent · stream: false · extra: {...}
      ollama: {
        url: 'https://ollama.com/v1',
        model: 'gemma4:31b',
        key: 'OLLAMA_API_KEY',
        vision: true,
      },
      irancopilot: {
        url: 'https://irancopilot.com/studio/pro/v1/chat/completions',
        model: 'icp-chat',
        key: 'ICP_API_KEY',
      },
    },

    maxTokens: 800,          // سقف طول پاسخ
    knowledgeChars: 1800,    // سقف متن دانش در هر درخواست
    temperature: 0.2,
    stream: true,            // پاسخ جریانی (کلمه‌به‌کلمه)؛ false اگر سرویس پشتیبانی نمی‌کند
    timeoutMs: 40000,        // کمتر از maxDuration تابع Vercel (۶۰ ثانیه)
    maxConcurrent: 50,       // سقف درخواست هم‌زمان به هر سرویس (در هر instance)
    breakMs: 60000,          // مدت کنار گذاشتن سرویسی که پشت سر هم خطا داده
  },

  // ─── جست‌وجوی دانش ───
  search: {
    faqSim: 0.6,             // حداقل شباهت برای پاسخ مستقیم سؤال‌های آماده (۰ تا ۱)
    // فقط اگر Upstash Vector وصل باشد:
    vectorTopK: 5,
    vectorKeep: 3,           // چند نتیجهٔ برتر معنایی وارد پرامپت شوند
    vectorTimeoutMs: 2500,
    vectorNamespace: '',
    semanticCache: true,
    semanticCacheSim: 0.92,
  },

  // ─── حافظهٔ یادگیری (پرسش‌های تکراری بدون مدل) ───
  learn: {
    minAskers: 2,            // چند کاربر مستقل یک سؤال را بپرسند تا پاسخ ذخیره شود
    maxEntries: 300,
    sim: 0.75,
  },

  // ─── دیگر ───
  allowedOrigins: [],        // دامنه‌های دیگری که اجازهٔ صدا زدن API را دارند، مثلاً ['https://example.com']
  leadAllowMemory: false,    // فقط برای توسعه: درخواست تماس در حافظه (با ری‌استارت پاک می‌شود)
  transcribe: {              // گفتار به متن (اختیاری؛ کلید در TRANSCRIBE_API_KEY)
    url: '',                 // مثلاً https://api.groq.com/openai/v1/audio/transcriptions
    model: 'whisper-large-v3',
  },
};
