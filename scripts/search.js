#!/usr/bin/env node
// آزمایش بازیابی بدون صدا زدن مدل:  npm run search -- "میتونم هم کار کنم هم درس بخونم؟"
try { process.loadEnvFile(); } catch { /* .env اختیاری است */ }
const { retrieve, faqAnswer, keywordRank } = require('../lib/knowledge');

(async () => {
  const q = process.argv.slice(2).join(' ');
  if (!q) { console.error('سؤال را بدهید'); process.exit(1); }
  const faq = faqAnswer(q);
  if (faq) console.log(`FAQ مستقیم (شباهت ${faq.score.toFixed(2)}): ${faq.id}\n${faq.answer}\n`);
  const r = await retrieve(q, parseInt(process.env.ICP_KNOWLEDGE_CHARS || '1800', 10));
  console.log(`منبع: ${r.source} · topScore کلمه‌ای: ${r.topScore} · تکه‌ها: ${r.ids.join(', ')} · ${r.text.length} نویسه`);
  console.log('کلمه‌ای:', keywordRank(q).slice(0, 5).map(x => `${x.c.id}(${x.s})`).join(' '));
})();
