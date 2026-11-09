// صفحهٔ گزارش پرسش‌ها برای مدیر — داده از /api/admin?report=1 با ADMIN_TOKEN
(function () {
  const $ = id => document.getElementById(id);
  const COLORS = { faq: 'var(--kb)', knowledge: 'var(--kb)', vector: 'var(--vec)', memory: 'var(--mem)', general: 'var(--gen)',
                   no_info: 'var(--no)', off_topic: 'var(--off)', error: '#991b1b', smalltalk: '#94a3b8', web: '#0f766e' };
  const fa = n => Number(n || 0).toLocaleString('fa-IR');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let token = ''; try { token = sessionStorage.getItem('adm') || ''; } catch {}
  $('token').value = token;
  let rep = null;

  async function api(path, opt = {}) {
    token = $('token').value.trim();
    try { sessionStorage.setItem('adm', token); } catch {}
    const r = await fetch('/api/admin' + path, { ...opt, headers: { Authorization: 'Bearer ' + token, ...(opt.headers || {}) } });
    if (r.status === 401) throw new Error('توکن نادرست است.');
    if (r.status === 404) throw new Error('ADMIN_TOKEN روی سرور تنظیم نشده است.');
    if (!r.ok) throw new Error('خطا ' + r.status);
    return r;
  }
  const msg = (t, err) => { $('msg').textContent = t; $('msg').className = err ? 'err' : 'muted'; };

  function bar(sources, count) {
    return '<div class="bar">' + Object.entries(sources).map(([s, n]) =>
      `<i style="width:${(100 * n / count).toFixed(1)}%;background:${COLORS[s] || '#999'}" title="${esc(rep.labels[s] || s)}: ${n}"></i>`).join('') + '</div>';
  }
  const tag = s => `<span class="tag" style="background:${COLORS[s] || '#999'}">${esc(rep.labels[s] || s)}</span>`;

  function rowsFor(list) {
    return list.map(q => `<tr>
      <td>${esc(q.question)}${q.similarPhrasings > 1 ? `<details><summary>${fa(q.similarPhrasings)} عبارت مشابه</summary>${q.variants.map(v => `<div class="muted">${esc(v.q)} — ${fa(v.n)} بار</div>`).join('')}</details>` : ''}</td>
      <td><b>${fa(q.count)}</b></td>
      <td>${tag(q.mainSource)}<div style="margin-top:4px">${bar(q.sources, q.count)}</div>
          <div class="muted">${Object.entries(q.sources).map(([s, n]) => `${esc(rep.labels[s] || s)}: ${fa(n)}`).join('، ')}</div></td>
      <td>${fa(Math.round(q.fromKnowledgeRate * 100))}٪</td>
      <td class="muted">${q.knowledgeChunks.map(c => esc(c.id)).join('<br>') || '—'}</td>
      <td class="muted">${q.lastAskedAt ? new Date(q.lastAskedAt).toLocaleString('fa-IR') : ''}</td></tr>`).join('');
  }
  const HEAD = '<tr><th>پرسش</th><th>تعداد</th><th>منبع پاسخ</th><th>از پایگاه دانش</th><th>تکه‌های دانش</th><th>آخرین بار</th></tr>';

  function renderQuestions() {
    const f = $('filter').value.trim(), s = $('src').value;
    const list = rep.questions.filter(q => (!f || q.variants.some(v => v.q.includes(f)) || q.question.includes(f)) && (!s || q.sources[s]));
    $('qt').innerHTML = HEAD + (rowsFor(list) || '<tr><td colspan="6" class="muted">موردی نیست.</td></tr>');
  }

  function render() {
    const S = rep.summary, T = S.totals;
    const fromDb = (T.faq || 0) + (T.knowledge || 0) + (T.vector || 0) + (T.memory || 0);
    const asked = S.total - (T.smalltalk || 0);
    const tiles = [
      ['کل پیام‌ها', S.total], ['پرسش‌های متمایز', S.distinctQuestions],
      ['جواب از پایگاه دانش', fromDb, asked ? Math.round(100 * fromDb / asked) + '٪' : ''],
      ['از پایگاه دادهٔ وکتور', T.vector || 0], ['از دانش عمومی مدل', T.general || 0],
      ['بی‌پاسخ', T.no_info || 0], ['جست‌وجوی اینترنت', T.web || 0, S.webSearchEnabled ? '' : 'غیرفعال'],
      ['حاوی اطلاعات شخصی (متن ذخیره نشد)', S.privateQuestions],
    ];
    $('tiles').innerHTML = tiles.map(([l, n, x]) => `<div class="card tile"><b>${fa(n)}</b><span>${l}${x ? ' · ' + x : ''}</span></div>`).join('');
    $('legend').innerHTML = Object.keys(rep.labels).map(s => `<span><i style="background:${COLORS[s]}"></i>${esc(rep.labels[s])}</span>`).join('');
    $('src').innerHTML = '<option value="">همهٔ منبع‌ها</option>' + Object.keys(rep.labels).map(s => `<option value="${s}">${esc(rep.labels[s])}</option>`).join('');
    renderQuestions();
    $('ut').innerHTML = HEAD + (rowsFor(rep.unanswered) || '<tr><td colspan="6" class="muted">موردی نیست.</td></tr>');
    const cols = Object.keys(rep.labels);
    $('dt').innerHTML = '<tr><th>روز</th><th>کل</th>' + cols.map(s => `<th>${esc(rep.labels[s])}</th>`).join('') + '</tr>' +
      rep.byDay.map(d => `<tr><td>${new Date(d.date).toLocaleDateString('fa-IR')}</td><td><b>${fa(d.total)}</b></td>${cols.map(s => `<td>${fa(d[s])}</td>`).join('')}</tr>`).join('');
    $('out').hidden = false;
    msg(`به‌روز شده: ${new Date(rep.generatedAt).toLocaleString('fa-IR')}` + (rep.kvRemote ? '' : ' — هشدار: ذخیره‌ساز مشترک (Redis/MySQL) وصل نیست؛ آمار فقط مال همین سرور است و با ری‌استارت پاک می‌شود.'));
  }

  $('load').onclick = async () => {
    msg('در حال بارگذاری…');
    try { rep = await (await api('?report=1')).json(); if (rep.error) throw new Error('ذخیره‌ساز در دسترس نیست.'); render(); }
    catch (e) { msg(e.message, true); }
  };
  $('csv').onclick = async () => {
    try {
      const b = await (await api('?report=csv')).blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = 'questions-report-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { msg(e.message, true); }
  };
  $('reset').onclick = async () => {
    if (!confirm('همهٔ آمار گزارش پاک شود؟ این کار برگشت‌پذیر نیست.')) return;
    try { await api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetReport: true }) }); $('load').onclick(); }
    catch (e) { msg(e.message, true); }
  };
  $('filter').oninput = () => rep && renderQuestions();
  $('src').onchange = () => rep && renderQuestions();
  if (token) $('load').onclick();
})();
