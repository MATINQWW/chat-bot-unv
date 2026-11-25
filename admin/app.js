(function () {
  'use strict';

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };

  var PAGE_SIZE = 25;
  var state = {
    view: 'dashboard',
    requestTab: 'questions',
    requestFilter: 'all',
    requestSearch: '',
    requestPage: 1,
    leadsPage: 1,
    knowledgeType: 'all',
    knowledgeSearch: '',
    knowledgePage: 1,
    auditPage: 1,
    currentAdmin: null,
    data: null,
    loading: false,
    lastFocus: null,
  };

  var viewNames = {
    dashboard: 'داشبورد',
    requests: 'درخواست‌ها و گفتگوها',
    tokens: 'مصرف توکن',
    knowledge: 'مدیریت دانش',
    admins: 'ادمین‌ها و دسترسی‌ها',
    audit: 'گزارش فعالیت‌ها',
    settings: 'تنظیمات',
  };

  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  var fmt = function (n) { return Number(n || 0).toLocaleString('fa-IR'); };

  function showLogin(message) {
    state.currentAdmin = null;
    state.data = null;
    $('#appShell').hidden = true;
    $('#loginScreen').hidden = false;
    closeModal();
    if (message) {
      $('#loginError').textContent = message;
      $('#loginError').hidden = false;
    } else {
      $('#loginError').hidden = true;
    }
  }

  function authErrorMessage(code) {
    return ({
      invalid_credentials: 'ایمیل/نام کاربری یا رمز عبور صحیح نیست.',
      admin_auth_not_configured: 'حساب مدیر اصلی در تنظیمات امن سرور تعریف نشده است.',
      session_store_unavailable: 'ذخیره‌سازی امن نشست در دسترس نیست. اتصال ذخیره‌ساز را بررسی کنید.',
      db_unavailable: 'اتصال دیتابیس مدیریت برقرار نیست.',
      rate_limit_unavailable: 'محدودسازی تلاش ورود در دسترس نیست.',
      audit_store_unavailable: 'ثبت رویداد امنیتی انجام نشد؛ ورود متوقف شد.',
      rate_limited: 'تعداد تلاش‌های ورود زیاد بوده است. کمی بعد دوباره تلاش کنید.',
      origin_not_allowed: 'مبدأ درخواست تأیید نشد.',
    })[code] || 'ورود انجام نشد. اتصال و تنظیمات سرور را بررسی کنید.';
  }

  function canView(view) {
    return !!state.currentAdmin && Array.isArray(state.currentAdmin.views) && state.currentAdmin.views.indexOf(view) >= 0;
  }
  function isSuperAdmin() {
    return !!state.currentAdmin && state.currentAdmin.key === 'super';
  }
  function caps() {
    return (state.data && state.data.capabilities) || {};
  }

  function toast(m) {
    var e = document.createElement('div');
    e.className = 'toast';
    e.textContent = m;
    $('#toastRoot').appendChild(e);
    setTimeout(function () { e.remove(); }, 3000);
  }

  function openModal(title, body, footer, opts) {
    opts = opts || {};
    state.lastFocus = document.activeElement;
    var closeAttr = opts.locked ? '' : ' data-close-modal';
    var closeBtn = opts.locked ? '' : '<button class="icon-button" type="button" data-close-modal aria-label="بستن">×</button>';
    $('#modalRoot').innerHTML =
      '<div class="modal-backdrop"' + closeAttr + '>' +
        '<section class="modal-card" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
          '<div class="modal-head"><strong>' + esc(title) + '</strong>' + closeBtn + '</div>' +
          '<div class="modal-body">' + body + '</div>' +
          '<div class="modal-foot">' + footer + '</div>' +
        '</section>' +
      '</div>';
    var first = $('#modalRoot input:not([disabled]), #modalRoot textarea, #modalRoot select, #modalRoot button');
    if (first) first.focus();
  }

  function closeModal() {
    if (!$('#modalRoot').innerHTML) return;
    $('#modalRoot').innerHTML = '';
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
      try { state.lastFocus.focus(); } catch (_) {}
    }
    state.lastFocus = null;
  }

  function showPasswordChangeModal(forced) {
    var body =
      (forced ? '<div class="callout"><div>ⓘ</div><div><strong>تغییر رمز عبور الزامی است</strong><span>پیش از استفاده از پنل باید رمز اولیه خود را تغییر دهید (حداقل ۱۲ نویسه).</span></div></div>' : '') +
      '<div class="form-grid">' +
        '<div class="form-field full"><label for="pwCurrent">رمز عبور فعلی</label><input class="input-control" id="pwCurrent" type="password" autocomplete="current-password" required></div>' +
        '<div class="form-field full"><label for="pwNext">رمز عبور جدید (حداقل ۱۲ نویسه)</label><input class="input-control" id="pwNext" type="password" minlength="12" autocomplete="new-password" required></div>' +
        '<div class="form-field full"><label for="pwConfirm">تکرار رمز عبور جدید</label><input class="input-control" id="pwConfirm" type="password" minlength="12" autocomplete="new-password" required></div>' +
      '</div>';
    var footer = (forced ? '' : '<button class="btn" type="button" data-close-modal>انصراف</button>') +
      '<button class="btn btn-primary" type="button" id="pwChangeSave">ثبت رمز جدید</button>';
    openModal('تغییر رمز عبور', body, footer, { locked: !!forced });
  }

  async function submitPasswordChange() {
    var cur = $('#pwCurrent').value;
    var next = $('#pwNext').value;
    var conf = $('#pwConfirm').value;
    if (!cur || next.length < 12) return toast('رمز عبور جدید باید حداقل ۱۲ نویسه باشد.');
    if (next !== conf) return toast('تکرار رمز عبور جدید مطابقت ندارد.');
    var b = $('#pwChangeSave');
    b.disabled = true;
    try {
      var r = await fetch('/api/admin-auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', currentPassword: cur, newPassword: next }),
      });
      if (r.status === 401) return toast('رمز عبور فعلی صحیح نیست.');
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) return toast(j.reason === 'same_as_current' ? 'رمز جدید نباید با رمز فعلی یکسان باشد.' : 'تغییر رمز انجام نشد.');
      state.currentAdmin = j.admin || state.currentAdmin;
      if (state.currentAdmin) state.currentAdmin.mustChangePassword = false;
      closeModal();
      toast('رمز عبور با موفقیت تغییر کرد.');
      await loadData();
    } catch (_) {
      toast('ارتباط با سرور برقرار نشد.');
    } finally {
      b.disabled = false;
    }
  }

  async function loginWithServer(email, password) {
    var b = $('#loginForm button[type="submit"]');
    b.disabled = true;
    b.textContent = 'در حال بررسی اطلاعات…';
    $('#loginError').hidden = true;
    try {
      var r = await fetch('/api/admin-auth', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: email, password: password }),
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) { showLogin(authErrorMessage(j.error)); return; }
      state.currentAdmin = j.admin;
      $('#loginPassword').value = '';
      $('#loginScreen').hidden = true;
      $('#appShell').hidden = false;
      applyAdmin();
      if (state.currentAdmin && state.currentAdmin.mustChangePassword) {
        showPasswordChangeModal(true);
        return;
      }
      await loadData();
    } catch (_) {
      showLogin('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.');
    } finally {
      b.disabled = false;
      b.innerHTML = 'ورود به پنل <span>←</span>';
    }
  }

  async function restoreSession() {
    showLogin();
    try {
      var r = await fetch('/api/admin-auth', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 503) return showLogin('ذخیره‌سازی امن نشست در دسترس نیست؛ اتصال سرور را بررسی کنید.');
      if (!r.ok) return;
      var j = await r.json();
      if (j.authenticated) {
        state.currentAdmin = j.admin;
        $('#loginScreen').hidden = true;
        $('#appShell').hidden = false;
        applyAdmin();
        if (state.currentAdmin && state.currentAdmin.mustChangePassword) {
          showPasswordChangeModal(true);
          return;
        }
        await loadData();
      }
    } catch (_) {
      showLogin('برای ورود، اتصال به سرور باید برقرار باشد.');
    }
  }

  async function loadData() {
    state.loading = true;
    try {
      var r = await fetch('/api/admin-data', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) return showLogin('نشست شما معتبر نیست؛ دوباره وارد شوید.');
      if (r.status === 403) {
        var fj = await r.json().catch(function () { return {}; });
        if (fj.error === 'password_change_required') { showPasswordChangeModal(true); return; }
      }
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || 'data_unavailable');
      state.data = j;
      if (state.currentAdmin && state.currentAdmin.key === 'super') {
        var ar = await fetch('/api/admin-users', { credentials: 'same-origin', cache: 'no-store' });
        if (ar.status === 401) return showLogin('نشست شما معتبر نیست؛ دوباره وارد شوید.');
        if (ar.ok) {
          var aj = await ar.json();
          state.data.admins = aj.admins || [];
        } else {
          state.data.admins = [];
          toast('بارگذاری فهرست ادمین‌ها انجام نشد.');
        }
      }
      applyAdmin();
      render();
    } catch (_) {
      $('#pageContent').innerHTML =
        '<div class="callout"><div>ⓘ</div><div><strong>داده‌ها بارگذاری نشدند</strong>' +
        '<span>اتصال ذخیره‌ساز و API مدیریتی را بررسی کنید. هیچ دادهٔ نمونه‌ای جایگزین اطلاعات واقعی نمی‌شود.</span></div></div>';
    } finally {
      state.loading = false;
    }
  }

  function applyAdmin() {
    var a = state.currentAdmin || {};
    var n = a.name || a.email || 'مدیر';
    $('#profileName').textContent = n;
    $('#profileRole').textContent = a.role || '';
    $('#profileInitial').textContent = n.charAt(0);
    $('#topAvatar').textContent = n.charAt(0);
    $('#currentRoleBadge').textContent = a.role || '';
    $('#currentRoleBadge').classList.toggle('super', a.key === 'super');
    var st = $('.security-note strong');
    var sm = $('.security-note small');
    if (st) st.textContent = 'احراز هویت سمت سرور';
    if (sm) sm.textContent = 'نشست امن و نقش تأییدشده';
  }

  async function logout() {
    var b = $('#logoutButton');
    b.disabled = true;
    try {
      var r = await fetch('/api/admin-auth', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      if (r.status === 401) { showLogin(); $('#loginPassword').value = ''; return; }
      if (!r.ok) return toast('خروج از سرور تأیید نشد.');
      showLogin();
      $('#loginPassword').value = '';
    } catch (_) {
      toast('ارتباط با سرور برای خروج برقرار نشد.');
    } finally {
      b.disabled = false;
    }
  }

  function icon(name) {
    var p = {
      chart: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
      book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21zM4 5v16M8 7h8"/>',
      alert: '<path d="M12 3 2 20h20L12 3zm0 6v5m0 3h.01"/>',
    };
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (p[name] || p.chart) + '</svg>';
  }
  function badge(cls, text) { return '<span class="status ' + cls + '">' + esc(text) + '</span>'; }
  function head(t, d, action) {
    return '<div class="page-heading"><div><h1>' + t + '</h1><p>' + d + '</p></div><div class="heading-actions">' + (action || '') + '</div></div>';
  }
  function stat(label, value, note, sym, tone) {
    return '<article class="stat-card"><div class="stat-top"><span class="stat-label">' + label + '</span><span class="stat-icon ' + (tone || '') + '">' + sym + '</span></div><div class="stat-value">' + value + '</div><div class="stat-foot"><span>' + note + '</span></div></article>';
  }
  function empty(msg) { return '<div class="empty-state">' + esc(msg || 'داده‌ای برای نمایش وجود ندارد.') + '</div>'; }
  function report() { return (state.data && state.data.report) || null; }
  function questions() { var r = report(); return r && Array.isArray(r.questions) ? r.questions : []; }
  function leads() { return (state.data && Array.isArray(state.data.leads)) ? state.data.leads : []; }

  function paginate(list, page, kind) {
    var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    var p = Math.min(Math.max(1, page), totalPages);
    var slice = list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    var pager = totalPages > 1
      ? '<div class="pager"><span>صفحه ' + fmt(p) + ' از ' + fmt(totalPages) + ' (' + fmt(list.length) + ' مورد)</span>' +
        '<div class="pager-actions">' +
          '<button class="btn btn-sm" type="button" data-page-kind="' + kind + '" data-page="' + (p - 1) + '" ' + (p <= 1 ? 'disabled' : '') + '>قبلی</button>' +
          '<button class="btn btn-sm" type="button" data-page-kind="' + kind + '" data-page="' + (p + 1) + '" ' + (p >= totalPages ? 'disabled' : '') + '>بعدی</button>' +
        '</div></div>'
      : '';
    return { items: slice, pager: pager, page: p };
  }

  function dashboard() {
    var r = report();
    var s = (r && r.summary) || {};
    var q = questions();
    var days = (r && r.byDay) || [];
    var chart = days.slice(0, 14).reverse();
    var max = Math.max.apply(null, chart.map(function (x) { return x.total; }).concat([1]));
    var bars = chart.map(function (x) {
      return '<div class="chart-col"><span class="bar" title="' + esc(x.date) + ': ' + fmt(x.total) + '" style="height:' + Math.max(3, x.total / max * 100) + '%"></span></div>';
    }).join('');
    var dayLabels = chart.map(function (x) {
      return '<span>' + esc(String(x.date || '').slice(5)) + '</span>';
    }).join('');
    return head('سلام، مدیر نوکا', 'نمای کلی بر اساس آمار واقعی ثبت‌شده', '<button class="btn" type="button" data-action="refresh">' + icon('chart') + ' به‌روزرسانی</button>') +
      '<div class="stats-grid">' +
        stat('کل درخواست‌های ثبت‌شده', fmt(s.total), 'از زمان شروع ثبت گزارش', icon('chart')) +
        stat('پرسش‌های یکتا', fmt(s.distinctQuestions), 'گروه‌های پرسش قابل شناسایی', icon('book'), 'green') +
        stat('درخواست‌های تماس', fmt(leads().length), 'ثبت‌شده توسط کاربران', icon('alert'), 'orange') +
        stat('توکن مصرف‌شده', state.data.tokens ? fmt(state.data.tokens.used) : '—', 'مقدار ثبت‌شده در آمار یادگیری', '◉') +
      '</div>' +
      '<div class="dashboard-grid">' +
        '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">روند درخواست‌ها</h2><div class="panel-subtitle">۱۴ روز اخیر دارای داده</div></div></div>' +
          (bars ? '<div class="chart-area">' + bars + '</div><div class="chart-days">' + dayLabels + '</div>' : empty()) +
        '</section>' +
        '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">منبع پاسخ‌ها</h2><div class="panel-subtitle">بر اساس گزارش ثبت‌شده</div></div></div>' +
          (s.totals && Object.keys(s.totals).length
            ? Object.keys(s.totals).map(function (k) { return '<div class="legend-row"><span>' + esc((r.labels || {})[k] || k) + '</span><b>' + fmt(s.totals[k]) + '</b></div>'; }).join('')
            : empty()) +
        '</section>' +
      '</div>' +
      '<section class="panel"><div class="panel-head"><h2 class="panel-title">پرسش‌های پرتکرار</h2><button class="btn btn-sm" type="button" data-view="requests">مشاهده گزارش</button></div>' +
        questionTable(q.slice(0, 5)) +
      '</section>';
  }

  function questionTable(list) {
    if (!list.length) return empty();
    var labels = (report() && report().labels) || {};
    return '<div class="table-wrap"><table><thead><tr><th>پرسش ثبت‌شده</th><th>تعداد</th><th>منبع اصلی</th><th>آخرین ثبت</th></tr></thead><tbody>' +
      list.map(function (q) {
        return '<tr><td class="primary-cell">' + esc(q.question || 'متن پرسش به‌دلیل حریم خصوصی ذخیره نشده') + '</td>' +
          '<td class="ltr">' + fmt(q.count) + '</td>' +
          '<td>' + esc(labels[q.mainSource] || q.mainSource || '—') + '</td>' +
          '<td class="ltr">' + esc(q.lastAskedAt || '—') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function filteredQuestions() {
    var term = state.requestSearch.toLowerCase();
    return questions().filter(function (q) {
      var src = q.sources || {};
      var matchFilter = state.requestFilter === 'all' ||
        (state.requestFilter === 'noinfo' ? (src.no_info || 0) > 0 :
          state.requestFilter === 'error' ? (src.error || 0) > 0 :
            ((src.faq || 0) + (src.memory || 0) + (src.knowledge || 0) + (src.vector || 0)) > 0);
      var matchSearch = !term || (q.question || '').toLowerCase().indexOf(term) >= 0;
      return matchFilter && matchSearch;
    });
  }

  function renderRequestsTablePart() {
    var list = filteredQuestions();
    var pg = paginate(list, state.requestPage, 'requests');
    state.requestPage = pg.page;
    var wrap = $('#requestsTableWrap');
    var cnt = $('#requestsCount');
    if (cnt) cnt.textContent = fmt(list.length) + ' گروه';
    if (wrap) wrap.innerHTML = questionTable(pg.items) + pg.pager;
  }

  function leadsTable(list) {
    if (!list.length) return empty('هنوز درخواست تماسی ثبت نشده است.');
    var pg = paginate(list, state.leadsPage, 'leads');
    state.leadsPage = pg.page;
    return '<div class="table-wrap"><table><thead><tr><th>نام</th><th>شماره تماس</th><th>پرسش / موضوع</th><th>زمان ثبت</th></tr></thead><tbody>' +
      pg.items.map(function (l) {
        return '<tr><td class="primary-cell">' + esc(l.name || '—') + '</td>' +
          '<td class="ltr">' + esc(l.phone || '—') + '</td>' +
          '<td>' + esc(l.question || '—') + '</td>' +
          '<td class="ltr">' + esc(l.at || '—') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' + pg.pager;
  }

  function requestsView() {
    var tabs = '<div class="sub-tabs">' +
      '<button class="sub-tab ' + (state.requestTab === 'questions' ? 'active' : '') + '" type="button" data-req-tab="questions">پرسش‌های پرتکرار (' + fmt(questions().length) + ')</button>' +
      '<button class="sub-tab ' + (state.requestTab === 'leads' ? 'active' : '') + '" type="button" data-req-tab="leads">درخواست‌های تماس (' + fmt(leads().length) + ')</button>' +
      '</div>';

    if (state.requestTab === 'leads') {
      return head('درخواست‌های تماس (لیدها)', 'شماره‌ها و پیام‌های ثبت‌شده توسط کاربران برای تماس مشاور', '<button class="btn" type="button" data-action="export-leads">' + icon('download') + ' خروجی CSV</button>') +
        tabs +
        '<section class="panel table-panel">' + leadsTable(leads()) + '</section>';
    }

    var list = filteredQuestions();
    var pg = paginate(list, state.requestPage, 'requests');
    state.requestPage = pg.page;
    return head('گزارش پرسش‌ها', 'داده‌ها به‌صورت تجمیعی ذخیره می‌شوند؛ پرسش‌های دارای اطلاعات حساس متنشان ذخیره نمی‌شود.', '<button class="btn" type="button" data-action="export-requests">' + icon('download') + ' خروجی CSV</button>') +
      tabs +
      '<div class="filters">' +
        '<input class="search-control" id="requestSearch" placeholder="جست‌وجو در متن پرسش..." value="' + esc(state.requestSearch) + '">' +
        '<select class="select-control" id="requestFilter">' +
          '<option value="all" ' + (state.requestFilter === 'all' ? 'selected' : '') + '>همه</option>' +
          '<option value="success" ' + (state.requestFilter === 'success' ? 'selected' : '') + '>پاسخ از دانش/حافظه</option>' +
          '<option value="error" ' + (state.requestFilter === 'error' ? 'selected' : '') + '>دارای خطا</option>' +
          '<option value="noinfo" ' + (state.requestFilter === 'noinfo' ? 'selected' : '') + '>بدون اطلاعات</option>' +
        '</select>' +
        '<span class="toolbar-note" id="requestsCount">' + fmt(list.length) + ' گروه</span>' +
      '</div>' +
      '<section class="panel table-panel" id="requestsTableWrap">' + questionTable(pg.items) + pg.pager + '</section>';
  }

  function tokensView() {
    var t = state.data.tokens;
    if (!t) return head('مصرف توکن', 'آمار مصرف ثبت‌شده در ذخیره‌ساز', '') + empty();
    return head('مصرف توکن', 'فقط مقادیری نمایش داده می‌شوند که برنامه واقعاً ثبت کرده است.', '') +
      '<div class="stats-grid">' +
        stat('توکن مصرف‌شده', fmt(t.used), 'مجموع ثبت‌شده؛ ورودی/خروجی تفکیک نشده', '◉') +
        stat('توکن ذخیره‌شده', fmt(t.saved), 'صرفه‌جویی ثبت‌شده توسط حافظه یادگیری', icon('book'), 'green') +
      '</div>' +
      '<div class="callout"><div>ⓘ</div><div><strong>اطلاعات تفکیک‌شده موجود نیست</strong><span>نسخه فعلی توکن ورودی، خروجی، Provider و هزینه هر درخواست را جداگانه ذخیره نمی‌کند.</span></div></div>';
  }

  function filteredKnowledge() {
    var k = (state.data.knowledge && state.data.knowledge.chunks) || [];
    var term = state.knowledgeSearch.toLowerCase();
    return k.filter(function (x) {
      return (state.knowledgeType === 'all' || x.type === state.knowledgeType) &&
        (!term || (x.title + ' ' + x.id + ' ' + x.type + ' ' + (x.text || '')).toLowerCase().indexOf(term) >= 0);
    });
  }

  function knowledgeTableHTML(list) {
    if (!list.length) return empty();
    var pg = paginate(list, state.knowledgePage, 'knowledge');
    state.knowledgePage = pg.page;
    var editable = !!caps().knowledgeEdit;
    return '<div class="table-wrap"><table><thead><tr><th>شناسه</th><th>عنوان</th><th>نوع</th><th>کلمات کلیدی</th><th>عملیات</th></tr></thead><tbody>' +
      pg.items.map(function (x) {
        return '<tr><td class="ltr muted">' + esc(x.id) + '</td>' +
          '<td class="primary-cell">' + esc(x.title) + '</td>' +
          '<td><span class="source-tag">' + esc(x.type) + '</span></td>' +
          '<td>' + esc((x.keywords || []).join('، ')) + '</td>' +
          '<td class="nowrap"><button class="btn btn-sm" type="button" data-knowledge-preview="' + esc(x.id) + '">متن کامل</button>' +
            (editable ? ' <button class="btn btn-sm btn-soft" type="button" data-knowledge-edit="' + esc(x.id) + '">ویرایش</button>' : '') +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>' + pg.pager;
  }

  function renderKnowledgeTablePart() {
    var list = filteredKnowledge();
    var wrap = $('#knowledgeTableWrap');
    var cnt = $('#knowledgeCount');
    if (cnt) cnt.textContent = fmt(list.length) + ' مورد';
    if (wrap) wrap.innerHTML = knowledgeTableHTML(list);
  }

  function knowledgeView() {
    var k = (state.data.knowledge && state.data.knowledge.chunks) || [];
    var list = filteredKnowledge();
    var types = Array.from(new Set(k.map(function (x) { return x.type; }).filter(Boolean)));
    var editable = !!caps().knowledgeEdit;
    return head(
      'مدیریت پایگاه دانش',
      editable ? 'ویرایش مستقیم knowledge/chunks.json با پشتیبان‌گیری خودکار و همگام‌سازی وکتور' : 'نمایش محتوای فایل knowledge/chunks.json (برای فعال‌سازی ویرایش، NOOKA_DB_URL را روی VPS تنظیم کنید)',
      editable ? '<button class="btn btn-primary" type="button" data-action="add-knowledge">＋ افزودن تکه دانش</button>' : ''
    ) +
      '<div class="stats-grid">' +
        stat('کل تکه‌های دانش', fmt(k.length), 'تعداد واقعی فایل دانش', icon('book')) +
        stat('دسته‌ها', fmt(types.length), 'انواع موجود در فایل', '▤') +
      '</div>' +
      '<div class="filters">' +
        '<input class="search-control" id="knowledgeSearch" placeholder="جست‌وجوی عنوان، شناسه یا متن..." value="' + esc(state.knowledgeSearch) + '">' +
        '<span class="toolbar-note" id="knowledgeCount">' + fmt(list.length) + ' مورد</span>' +
      '</div>' +
      '<div class="category-pills">' +
        '<button class="category-pill ' + (state.knowledgeType === 'all' ? 'active' : '') + '" type="button" data-knowledge-type="all">همه</button>' +
        types.map(function (t) {
          return '<button class="category-pill ' + (state.knowledgeType === t ? 'active' : '') + '" type="button" data-knowledge-type="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('') +
      '</div>' +
      '<section class="panel table-panel" id="knowledgeTableWrap">' + knowledgeTableHTML(list) + '</section>';
  }

  async function openKnowledgeEditor(id) {
    try {
      var url = id ? '/api/admin-knowledge?id=' + encodeURIComponent(id) : '/api/admin-knowledge';
      var r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) return toast('بارگذاری اطلاعات دانش انجام نشد.');
      var ch = j.chunk || { id: '', type: 'general', title: '', text: '', keywords: [] };
      var isEdit = !!id;
      var body = '<div class="form-grid">' +
        '<div class="form-field"><label for="kTitle">عنوان</label><input class="input-control" id="kTitle" value="' + esc(ch.title || '') + '" required></div>' +
        '<div class="form-field"><label for="kType">نوع</label><select class="select-control" id="kType" ' + (isEdit ? 'disabled' : '') + '>' +
          ['general', 'major', 'faculty', 'faq', 'list'].map(function (tp) {
            return '<option value="' + tp + '" ' + (ch.type === tp ? 'selected' : '') + '>' + tp + '</option>';
          }).join('') +
        '</select></div>' +
        '<div class="form-field full"><label for="kKeywords">کلیدواژه‌ها (جداشده با ویرگول)</label><input class="input-control" id="kKeywords" value="' + esc((ch.keywords || []).join('، ')) + '"></div>' +
        '<div class="form-field full"><label for="kText">' + (ch.type === 'faq' ? 'پاسخ FAQ' : 'متن دانش') + '</label><textarea class="textarea-control" id="kText">' + esc(ch.type === 'faq' ? (ch.answer || '') : (ch.text || '')) + '</textarea></div>' +
      '</div>';
      openModal(
        isEdit ? 'ویرایش تکه دانش' : 'افزودن تکه دانش جدید',
        body,
        '<button class="btn" type="button" data-close-modal>انصراف</button>' +
        '<button class="btn btn-primary" type="button" id="knowledgeSave" data-id="' + esc(id || '') + '" data-sha="' + esc(j.sha || '') + '">ذخیره</button>'
      );
    } catch (_) {
      toast('ارتباط با سرور برقرار نشد.');
    }
  }

  async function saveKnowledge() {
    var b = $('#knowledgeSave');
    var id = b.getAttribute('data-id');
    var baseSha = b.getAttribute('data-sha');
    var type = $('#kType').value;
    var title = $('#kTitle').value.trim();
    var keywords = $('#kKeywords').value.trim();
    var bodyText = $('#kText').value.trim();
    var chunk = type === 'faq' ? { type: type, title: title, keywords: keywords, answer: bodyText } : { type: type, title: title, keywords: keywords, text: bodyText };
    b.disabled = true;
    try {
      var r = await fetch('/api/admin-knowledge', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { action: 'update', id: id, chunk: chunk, baseSha: baseSha } : { action: 'create', chunk: chunk, baseSha: baseSha }),
      });
      if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) return toast(j.error === 'conflict' ? 'تداخل ویرایش: نسخه فایل تغییر کرده است. صفحه را تازه کنید.' : 'ذخیره تکه دانش انجام نشد.');
      closeModal();
      toast('پایگاه دانش با موفقیت به‌روزرسانی شد.');
      await loadData();
    } catch (_) {
      toast('ارتباط با سرور برقرار نشد.');
    } finally {
      b.disabled = false;
    }
  }

  function adminsView() {
    var a = state.data.admins || [];
    var labels = { dashboard: 'داشبورد', requests: 'گزارش پرسش‌ها', tokens: 'مصرف توکن', knowledge: 'پایگاه دانش', admins: 'مدیریت ادمین‌ها', audit: 'گزارش فعالیت‌ها', settings: 'تنظیمات' };
    return head('ادمین‌ها و دسترسی‌ها', 'مدیریت حساب‌های ذخیره‌شده در سرور؛ حساب مدیر اصلی محافظت‌شده است.', '<button class="btn btn-primary" type="button" data-action="add-admin">＋ افزودن ادمین</button>') +
      '<section class="panel table-panel">' +
        (a.length
          ? '<div class="table-wrap"><table><thead><tr><th>نام</th><th>ایمیل</th><th>نقش</th><th>وضعیت</th><th>بخش‌های مجاز</th><th>عملیات</th></tr></thead><tbody>' +
            a.map(function (x) {
              return '<tr><td><b>' + esc(x.name) + '</b></td><td class="ltr">' + esc(x.email) + '</td><td>' + esc(x.role) + '</td>' +
                '<td>' + badge(x.active ? 'success' : 'warning', x.active ? 'فعال' : 'غیرفعال') + '</td>' +
                '<td>' + esc((x.views || []).map(function (v) { return labels[v] || v; }).join('، ')) + '</td>' +
                '<td class="nowrap">' + (x.protected
                  ? '<span class="muted">محافظت‌شده</span>'
                  : '<button class="btn btn-sm" type="button" data-admin-edit="' + esc(x.email) + '">ویرایش</button> <button class="btn btn-sm btn-danger" type="button" data-admin-delete="' + esc(x.email) + '">حذف</button>') +
                '</td></tr>';
            }).join('') +
            '</tbody></table></div>'
          : empty()) +
      '</section>' +
      '<div class="callout section-spacer"><div>ⓘ</div><div><strong>کنترل دسترسی</strong><span>مجوزها در سمت سرور بررسی می‌شوند. مدیر اصلی از این فهرست قابل حذف یا تنزل نیست.</span></div></div>';
  }

  function adminForm(item) {
    var edit = !!item;
    var views = ['dashboard', 'requests', 'tokens', 'knowledge', 'audit', 'settings'];
    var labels = { dashboard: 'داشبورد', requests: 'گزارش پرسش‌ها', tokens: 'مصرف توکن', knowledge: 'پایگاه دانش', audit: 'گزارش فعالیت‌ها', settings: 'تنظیمات' };
    var checks = views.map(function (v) {
      return '<label class="check-row"><input type="checkbox" name="adminView" value="' + v + '" ' + ((item && item.views || []).indexOf(v) >= 0 ? 'checked' : '') + '> ' + labels[v] + '</label>';
    }).join('');
    var body = '<div class="form-grid">' +
      '<div class="form-field"><label for="adminName">نام</label><input class="input-control" id="adminName" value="' + esc(item && item.name || '') + '" required></div>' +
      '<div class="form-field"><label for="adminEmail">ایمیل</label><input class="input-control" id="adminEmail" type="email" value="' + esc(item && item.email || '') + '" ' + (edit ? 'disabled' : '') + ' required></div>' +
      '<div class="form-field full"><label for="adminPassword">' + (edit ? 'رمز جدید (اختیاری)' : 'رمز اولیه') + ' · حداقل ۱۲ نویسه</label><input class="input-control" id="adminPassword" type="password" minlength="12" autocomplete="new-password" ' + (edit ? '' : 'required') + '></div>' +
      '<div class="form-field full"><label>مجوزهای دسترسی</label>' + checks + '</div>' +
      (edit ? '<div class="form-field full"><label class="check-row"><input type="checkbox" id="adminActive" ' + (item.active ? 'checked' : '') + '> حساب فعال باشد</label></div>' : '') +
      '</div>';
    openModal(
      edit ? 'ویرایش ادمین' : 'افزودن ادمین',
      body,
      '<button class="btn" type="button" data-close-modal>انصراف</button>' +
      '<button class="btn btn-primary" type="button" id="adminSave" data-email="' + esc(item && item.email || '') + '" data-mode="' + (edit ? 'edit' : 'create') + '">ذخیره</button>'
    );
  }

  async function saveAdmin() {
    var b = $('#adminSave');
    var mode = b.getAttribute('data-mode');
    var views = $$('input[name="adminView"]:checked').map(function (x) { return x.value; });
    var payload = { name: $('#adminName').value.trim(), views: views };
    if (mode === 'create') {
      payload.email = $('#adminEmail').value.trim().toLowerCase();
      payload.password = $('#adminPassword').value;
    } else {
      payload.email = b.getAttribute('data-email');
      payload.password = $('#adminPassword').value;
      payload.active = $('#adminActive').checked;
    }
    if (!payload.name || !views.length || (mode === 'create' && (!payload.email || payload.password.length < 12)) || (payload.password && payload.password.length < 12)) {
      return toast('اطلاعات و حداقل یک مجوز معتبر وارد کنید.');
    }
    b.disabled = true;
    try {
      var r = await fetch('/api/admin-users', {
        method: mode === 'create' ? 'POST' : 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        return toast(({
          email_exists: 'این ایمیل قبلاً ثبت شده است.',
          invalid_admin_data: 'اطلاعات ادمین معتبر نیست.',
          invalid_password: 'رمز عبور معتبر نیست (حداقل ۱۲ نویسه).',
          invalid_email: 'ایمیل معتبر نیست.',
          admin_not_found: 'ادمین پیدا نشد.',
          store_unavailable: 'ذخیره‌ساز در دسترس نیست.',
          audit_store_unavailable: 'ثبت گزارش ممیزی انجام نشد.',
        })[j.error] || 'ذخیره ادمین انجام نشد.');
      }
      closeModal();
      toast('تغییرات ذخیره شد.');
      await loadData();
    } catch (_) {
      toast('ارتباط با سرور برقرار نشد.');
    } finally {
      b.disabled = false;
    }
  }

  function auditView() {
    var a = state.data.audit || [];
    var pg = paginate(a, state.auditPage, 'audit');
    state.auditPage = pg.page;
    return head('گزارش فعالیت‌ها', 'رویدادهای واقعی احراز هویت؛ شامل هش ایمیل و IP برای حفظ حریم خصوصی.', '<button class="btn" type="button" data-action="export-audit">' + icon('download') + ' خروجی CSV</button>') +
      (a.length
        ? '<section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>زمان</th><th>عملیات</th><th>هش ایمیل</th><th>نقش</th><th>هش IP</th></tr></thead><tbody>' +
          pg.items.map(function (x) {
            return '<tr><td class="ltr">' + esc(x.at) + '</td><td class="ltr">' + esc(x.action) + '</td><td class="ltr muted">' + esc(x.emailHash || '—') + '</td><td>' + esc(x.role || '—') + '</td><td class="ltr muted">' + esc(x.ipHash || '—') + '</td></tr>';
          }).join('') +
          '</tbody></table></div>' + pg.pager + '</section>'
        : empty('هنوز رویداد احراز هویت ثبت نشده است.'));
  }

  function settingsView() {
    var h = state.data.health || {};
    function row(n, x) {
      var label = !x || !x.configured ? 'پیکربندی نشده' : x.status === 'connected' ? 'متصل' : 'تنظیم شده؛ سلامت بررسی نشده';
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)"><div style="flex:1"><b>' + n + '</b></div><span class="source-tag">' + label + '</span></div>';
    }
    var pwBtn = caps().dbMode ? '<button class="btn" type="button" data-action="change-password">تغییر رمز عبور من</button>' : '';
    return head('تنظیمات پنل', 'وضعیت پیکربندی زیرساخت و امنیت حساب شما', pwBtn) +
      '<section class="panel">' + row('Redis / Upstash', h.redis) + row('MySQL', h.mysql) + row('Upstash Vector', h.vector) + '</section>';
  }

  function render() {
    if (!state.currentAdmin) return showLogin();
    if (!canView(state.view)) state.view = (state.currentAdmin.views && state.currentAdmin.views[0]) || 'dashboard';
    $('#breadcrumbTitle').textContent = viewNames[state.view] || 'داشبورد';
    $$('.nav-item').forEach(function (b) {
      var v = b.getAttribute('data-view');
      b.hidden = !canView(v);
      b.classList.toggle('active', v === state.view);
    });
    var pn = $('nav[aria-label="دسترسی و امنیت"]');
    var pl = $('.nav-label-spaced');
    var showSec = isSuperAdmin() || canView('audit') || canView('settings');
    if (pn) pn.hidden = !showSec;
    if (pl) pl.hidden = !showSec;
    var views = {
      dashboard: dashboard,
      requests: requestsView,
      tokens: tokensView,
      knowledge: knowledgeView,
      admins: adminsView,
      audit: auditView,
      settings: settingsView,
    };
    $('#pageContent').innerHTML = (views[state.view] || dashboard)();
    $('#sidebar').classList.remove('open');
    $('#sidebarScrim').classList.remove('show');
  }

  function downloadCSV(type) {
    var rows = [];
    if (type === 'audit') {
      rows = [['زمان', 'عملیات', 'هش ایمیل', 'نقش', 'هش IP']].concat((state.data.audit || []).map(function (x) { return [x.at, x.action, x.emailHash, x.role, x.ipHash]; }));
    } else if (type === 'leads') {
      rows = [['نام', 'شماره تماس', 'موضوع', 'زمان']].concat(leads().map(function (x) { return [x.name, x.phone, x.question, x.at]; }));
    } else {
      rows = [['پرسش', 'تعداد', 'منبع اصلی', 'آخرین ثبت']].concat(questions().map(function (x) { return [x.question, x.count, x.mainSource, x.lastAskedAt]; }));
    }
    var csv = '\ufeff' + rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u;
    a.download = 'nooka-' + type + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  }

  document.addEventListener('click', function (e) {
    var v = e.target.closest('[data-view]');
    if (v) {
      var target = v.getAttribute('data-view');
      if (!canView(target)) return toast('مجوز مشاهده این بخش را ندارید.');
      state.view = target;
      render();
      return;
    }
    var reqTab = e.target.closest('[data-req-tab]');
    if (reqTab) {
      state.requestTab = reqTab.getAttribute('data-req-tab');
      render();
      return;
    }
    var pgBtn = e.target.closest('[data-page-kind]');
    if (pgBtn && !pgBtn.disabled) {
      var kind = pgBtn.getAttribute('data-page-kind');
      var pg = parseInt(pgBtn.getAttribute('data-page'), 10) || 1;
      if (kind === 'requests') { state.requestPage = pg; renderRequestsTablePart(); return; }
      if (kind === 'knowledge') { state.knowledgePage = pg; renderKnowledgeTablePart(); return; }
      if (kind === 'leads') { state.leadsPage = pg; render(); return; }
      if (kind === 'audit') { state.auditPage = pg; render(); return; }
    }
    var act = e.target.closest('[data-action]');
    if (act) {
      var a = act.getAttribute('data-action');
      if (a === 'refresh') loadData();
      if (a === 'export-requests') downloadCSV('requests');
      if (a === 'export-leads') downloadCSV('leads');
      if (a === 'export-audit') downloadCSV('audit');
      if (a === 'add-admin' && isSuperAdmin()) adminForm(null);
      if (a === 'add-knowledge' && caps().knowledgeEdit) openKnowledgeEditor('');
      if (a === 'change-password') showPasswordChangeModal(false);
      return;
    }
    var editAdmin = e.target.closest('[data-admin-edit]');
    if (editAdmin) {
      var targetAdmin = (state.data.admins || []).find(function (x) { return x.email === editAdmin.getAttribute('data-admin-edit'); });
      if (targetAdmin && !targetAdmin.protected) adminForm(targetAdmin);
      return;
    }
    var delAdmin = e.target.closest('[data-admin-delete]');
    if (delAdmin) {
      if (delAdmin.disabled) return;
      var targetEmail = delAdmin.getAttribute('data-admin-delete');
      if (!window.confirm('این حساب ادمین حذف شود؟')) return;
      delAdmin.disabled = true;
      fetch('/api/admin-users', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      }).then(async function (r) {
        if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
        if (!r.ok) return toast('حذف ادمین انجام نشد.');
        toast('ادمین حذف شد.');
        loadData();
      }).catch(function () { toast('ارتباط با سرور برقرار نشد.'); }).finally(function () { delAdmin.disabled = false; });
      return;
    }
    if (e.target.id === 'adminSave') { saveAdmin(); return; }
    if (e.target.id === 'knowledgeSave') { saveKnowledge(); return; }
    if (e.target.id === 'pwChangeSave') { submitPasswordChange(); return; }

    var kt = e.target.closest('[data-knowledge-type]');
    if (kt) {
      state.knowledgeType = kt.getAttribute('data-knowledge-type');
      state.knowledgePage = 1;
      render();
      return;
    }
    var ke = e.target.closest('[data-knowledge-edit]');
    if (ke) {
      openKnowledgeEditor(ke.getAttribute('data-knowledge-edit'));
      return;
    }
    var kp = e.target.closest('[data-knowledge-preview]');
    if (kp) {
      var item = ((state.data.knowledge && state.data.knowledge.chunks) || []).find(function (x) { return x.id === kp.getAttribute('data-knowledge-preview'); });
      if (item) {
        openModal(
          item.title,
          '<div class="detail-box"><span>شناسه</span><strong class="ltr">' + esc(item.id) + '</strong></div><div class="detail-text">' + esc(item.text) + '</div>',
          '<button class="btn" type="button" data-close-modal>بستن</button>'
        );
      }
      return;
    }
    var closeBtn = e.target.closest('button[data-close-modal]');
    if (closeBtn || e.target.matches('.modal-backdrop[data-close-modal]')) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('.modal-backdrop[data-close-modal]')) closeModal();
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'requestSearch') {
      state.requestSearch = e.target.value;
      state.requestPage = 1;
      renderRequestsTablePart();
    }
    if (e.target.id === 'knowledgeSearch') {
      state.knowledgeSearch = e.target.value;
      state.knowledgePage = 1;
      renderKnowledgeTablePart();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'requestFilter') {
      state.requestFilter = e.target.value;
      state.requestPage = 1;
      renderRequestsTablePart();
    }
  });

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    loginWithServer($('#loginEmail').value.trim().toLowerCase(), $('#loginPassword').value);
  });
  $('#logoutButton').addEventListener('click', logout);
  try { if (localStorage.getItem('nooka_admin_theme') === 'dark') document.documentElement.classList.add('dark'); } catch (_) {}
  $('#themeToggle').addEventListener('click', function () {
    var isDark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('nooka_admin_theme', isDark ? 'dark' : 'light'); } catch (_) {}
  });
  $('#mobileMenu').addEventListener('click', function () { $('#sidebar').classList.add('open'); $('#sidebarScrim').classList.add('show'); });
  $('#sidebarClose').addEventListener('click', function () { $('#sidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('show'); });
  $('#sidebarScrim').addEventListener('click', function () { $('#sidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('show'); });

  restoreSession();
}());
