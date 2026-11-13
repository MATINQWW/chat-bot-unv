#!/usr/bin/env node
// سنجش بازیابی و مسیریابی روی eval/questions.json (بدون صدا زدن مدل)
//   npm run eval            → با Vector اگر env تنظیم باشد، وگرنه فقط کلمه‌ای
//   npm run eval -- -v      → جزئیات هر سؤال
try { process.loadEnvFile(); } catch { /* .env اختیاری است */ }
const path = require('path');
const { retrieve, faqAnswer, smallTalk } = require('../lib/knowledge');
const { cases } = require(path.join(__dirname, '..', 'eval', 'questions.json'));
const V = process.argv.includes('-v');
const mi = process.argv.indexOf('--min'); const MIN = mi > 0 ? parseFloat(process.argv[mi + 1]) : 0; // CI: زیر این درصد → خطا
const LIMIT = require('../config').llm.knowledgeChars || 1800;

(async () => {
  let pass = 0, chars = 0, modelCalls = 0, source = 'keyword';
  const fails = [];
  for (const c of cases) {
    const route = smallTalk(c.q) ? 'smalltalk' : faqAnswer(c.q) ? 'faq' : 'model';
    let ok = route === c.route, ids = [];
    if (route === 'model') {
      const r = await retrieve(c.q, LIMIT);
      ids = r.ids; source = r.source === 'none' ? source : r.source; chars += r.text.length; modelCalls++;
      if (c.expect) ok = ok && c.expect.some(id => ids.includes(id));
    }
    if (ok) pass++; else fails.push({ ...c, got: route, ids });
    if (V) console.log(`${ok ? '✓' : '✗'} [${route}] ${c.q}${ids.length ? '  → ' + ids.join(', ') : ''}`);
  }
  console.log(`\nمنبع بازیابی: ${source}`);
  console.log(`درست: ${pass}/${cases.length} (${Math.round(100 * pass / cases.length)}%)`);
  console.log(`بدون مدل: ${cases.length - modelCalls}/${cases.length} · میانگین نویسهٔ دانش برای هر فراخوانی مدل: ${Math.round(chars / Math.max(1, modelCalls))}`);
  for (const f of fails) console.log(`  ✗ ${f.q}  (انتظار: ${f.route}${f.expect ? ' ' + f.expect.join('|') : ''} · دریافت: ${f.got} ${f.ids.join(', ')})${f.note ? '  — ' + f.note : ''}`);
  const pct = 100 * pass / cases.length;
  if (pct < MIN) { console.error(`✗ درصد درستی ${pct.toFixed(0)}٪ کمتر از حداقل ${MIN}٪`); process.exitCode = 1; }
})();
