(() => {
  const $ = (s) => document.querySelector(s);
  const state = { token: '', offset: 0, limit: 30, hasMore: false, loading: false };
  const status = (msg) => { $('#status').textContent = msg; };
  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || `خطای سرور (${response.status})`);
    return body;
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function recordHtml(r) {
    const safeId = esc(r.id);
    return `<article class="record" data-id="${safeId}">
      <div class="muted small">${safeId} · ${esc(r.category)} · ${esc(r.source_reference || r.source_file || 'منبع نامشخص')}</div>
      <h2>${esc(r.title)}</h2><div class="content">${esc(r.content)}</div>
      <div class="row" style="margin-top:12px">
        <label class="field">وضعیت منبع<select data-field="authority_status"><option value="unverified" selected>تأییدنشده</option><option value="verified">تأییدشده</option><option value="rejected">ردشده</option></select></label>
        <label class="field">اعتبار زمانی<select data-field="temporal_status"><option value="needs_review" selected>نیازمند بررسی</option><option value="valid">معتبر</option><option value="expired">منقضی</option><option value="not_applicable">بدون نیاز به تاریخ اعتبار</option></select></label>
        <label class="field">تاریخ انتشار (اختیاری)<input data-field="published_at" type="date"></label>
        <label class="field">اعتبار تا (اختیاری)<input data-field="valid_until" type="date"></label>
      </div>
      <label class="check"><input data-field="use_for_official_claims" type="checkbox"> اجازه استفاده برای ادعای رسمی</label>
      <label class="field" style="margin-top:10px">یادداشت بازبینی<textarea data-field="notes" rows="2" placeholder="منبع رسمی، لینک، دلیل تأیید یا رد..."></textarea></label>
      <div class="actions"><button class="primary" data-save>ذخیره بازبینی</button><button class="danger" data-reject>رد این رکورد</button></div>
    </article>`;
  }
  async function load(reset = true) {
    if (state.loading) return;
    state.loading = true;
    try {
      if (reset) { state.offset = 0; $('#records').innerHTML = ''; }
      state.token = $('#token').value.trim();
      if (!state.token) throw new Error('ابتدا توکن مدیریت را وارد کنید.');
      status('در حال بارگذاری...');
      const data = await request(`/api/admin?knowledge=review&limit=${state.limit}&offset=${state.offset}`);
      $('#records').insertAdjacentHTML('beforeend', (data.records || []).map(recordHtml).join(''));
      state.offset += (data.records || []).length;
      state.hasMore = !!data.hasMore;
      $('#more').classList.toggle('hidden', !state.hasMore);
      status(`${state.offset} رکورد بررسی‌نشده بارگذاری شد. برای دیدن رکوردهای بعدی از دکمه پایین استفاده کنید.`);
    } catch (e) { status(e.message); }
    finally { state.loading = false; }
  }
  async function save(card, reject = false) {
    const val = (name) => card.querySelector(`[data-field="${name}"]`);
    const authority = reject ? 'rejected' : val('authority_status').value;
    const temporal = val('temporal_status').value;
    const official = !reject && val('use_for_official_claims').checked;
    if (authority === 'verified' && !['valid','not_applicable'].includes(temporal)) {
      status('برای تأیید منبع، وضعیت زمانی را هم مشخص کنید: معتبر یا بدون نیاز به تاریخ اعتبار.'); return;
    }
    if (official && !(authority === 'verified' && ['valid','not_applicable'].includes(temporal))) {
      status('برای استفاده رسمی، منبع باید تأییدشده و از نظر زمانی معتبر باشد.'); return;
    }
    const review = {
      id: card.dataset.id,
      authority_status: authority,
      temporal_status: temporal,
      use_for_official_claims: official,
      published_at: val('published_at').value || null,
      valid_until: val('valid_until').value || null,
      notes: val('notes').value,
    };
    try {
      status(`در حال ذخیره ${review.id}...`);
      await request('/api/admin', { method: 'POST', body: JSON.stringify({ review }) });
      card.remove(); status(`بازبینی ${review.id} ذخیره شد.`);
    } catch (e) { status(e.message); }
  }
  $('#load').addEventListener('click', () => load(true));
  $('#more').addEventListener('click', () => load(false));
  $('#stats').addEventListener('click', async () => {
    try {
      state.token = $('#token').value.trim();
      if (!state.token) throw new Error('ابتدا توکن مدیریت را وارد کنید.');
      const data = await request('/api/admin');
      $('#statsOutput').textContent = JSON.stringify({ knowledge: data.knowledge, storage: data.storage, stats: data.stats, topUnanswered: data.topUnanswered }, null, 2);
      $('#statsOutput').classList.remove('hidden'); status('آمار دریافت شد.');
    } catch (e) { status(e.message); }
  });
  $('#records').addEventListener('click', (event) => {
    const card = event.target.closest('.record'); if (!card) return;
    if (event.target.closest('[data-save]')) save(card, false);
    if (event.target.closest('[data-reject]') && confirm('این رکورد رد شود؟')) save(card, true);
  });
})();
