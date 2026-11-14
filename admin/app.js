(function () {
  'use strict';
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var state = { view: 'dashboard', requestFilter: 'all', requestSearch: '', knowledgeType: 'all', knowledgeSearch: '', knowledgeSha: null, knowledgeList: null, currentAdmin: null };
  var viewNames = { dashboard: 'داشبورد', requests: 'درخواست‌ها و گفتگوها', tokens: 'مصرف توکن', knowledge: 'مدیریت دانش', admins: 'ادمین‌ها و دسترسی‌ها', audit: 'گزارش فعالیت‌ها', settings: 'تنظیمات' };
  // Identity and role arrive only from the server after credentials/session validation.
  function showLogin(message) {
    state.currentAdmin = null;
    $('#appShell').hidden = true;
    $('#loginScreen').hidden = false;
    $('#modalRoot').innerHTML = '';
    if (message) {
      $('#loginError').textContent = message;
      $('#loginError').hidden = false;
    } else {
      $('#loginError').hidden = true;
    }
  }
  function applyAuthenticatedAdmin(account) {
    if (!account || !Array.isArray(account.views) || !account.email || !account.role) {
      showLogin('پاسخ احراز هویت معتبر نیست. دوباره وارد شوید.');
      return false;
    }
    state.currentAdmin = account;
    state.view = 'dashboard';
    $('#loginError').hidden = true;
    $('#loginScreen').hidden = true;
    $('#appShell').hidden = false;
    $('#profileName').textContent = account.name || account.email;
    $('#profileRole').textContent = account.role;
    $('#profileInitial').textContent = (account.name || account.email).charAt(0);
    $('#topAvatar').textContent = (account.name || account.email).charAt(0);
    $('#currentRoleBadge').textContent = account.role;
    $('#currentRoleBadge').classList.toggle('super', account.key === 'super');
    var securityTitle = document.querySelector('.security-note strong');
    var securityText = document.querySelector('.security-note small');
    if (securityTitle) securityTitle.textContent = 'احراز هویت سمت سرور';
    if (securityText) securityText.textContent = 'نشست امن و نقش تأییدشده';
    render();
    return true;
  }
  function authErrorMessage(code) {
    if (code === 'invalid_credentials') return 'ایمیل یا رمز عبور صحیح نیست.';
    if (code === 'admin_auth_not_configured') return 'حساب مدیر اصلی در تنظیمات امن سرور تعریف نشده است.';
    if (code === 'session_store_unavailable') return 'ذخیره‌سازی امن نشست در دسترس نیست. اتصال Redis را بررسی کنید.';
    if (code === 'rate_limit_unavailable') return 'سرویس محدودسازی تلاش ورود در دسترس نیست؛ ورود برای امنیت متوقف شد.';
    if (code === 'audit_store_unavailable') return 'ثبت رویداد امنیتی انجام نشد؛ ورود برای امنیت متوقف شد.';
    if (code === 'rate_limited') return 'تعداد تلاش‌های ورود زیاد بوده است. کمی بعد دوباره تلاش کنید.';
    if (code === 'origin_not_allowed') return 'درخواست از مبدأ تأییدنشده ارسال شده است.';
    return 'ورود انجام نشد. اتصال و تنظیمات سرور را بررسی کنید.';
  }
  async function loginWithServer(email, password) {
    var button = $('#loginForm button[type="submit"]');
    button.disabled = true;
    button.textContent = 'در حال بررسی اطلاعات…';
    $('#loginError').hidden = true;
    try {
      var response = await fetch('/api/admin-auth', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: email, password: password })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        showLogin(authErrorMessage(data.error));
        return;
      }
      applyAuthenticatedAdmin(data.admin);
      $('#loginPassword').value = '';
    } catch (_) {
      showLogin('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.');
    } finally {
      button.disabled = false;
      button.innerHTML = 'ورود به پنل <span>←</span>';
    }
  }
  async function restoreServerSession() {
    showLogin();
    try {
      var response = await fetch('/api/admin-auth', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 503) showLogin('ذخیره‌سازی امن نشست در دسترس نیست؛ اتصال Redis را بررسی کنید.');
        return;
      }
      var data = await response.json();
      if (data.authenticated) applyAuthenticatedAdmin(data.admin);
    } catch (_) {
      showLogin('برای ورود، اتصال به سرور باید برقرار باشد.');
    }
  }
  async function logoutFromServer() {
    var button = $('#logoutButton');
    button.disabled = true;
    try {
      var response = await fetch('/api/admin-auth', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
      });
      if (!response.ok) { toast('خروج از سرور تأیید نشد. دوباره تلاش کنید.'); return; }
      showLogin();
      $('#loginPassword').value = '';
      $('#loginEmail').focus();
    } catch (_) {
      toast('ارتباط با سرور برای خروج برقرار نشد.');
    } finally {
      button.disabled = false;
    }
  }
  function canView(view) {
    return !!state.currentAdmin && state.currentAdmin.views.indexOf(view) >= 0;
  }
  function isSuperAdmin() {
    return !!state.currentAdmin && state.currentAdmin.key === 'super';
  }
  var requests = [
    { id: 'NK-8F21A', time: '۱۴۰۵/۰۸/۲۱ · ۱۲:۴۸', question: 'برای انتخاب رشته مهندسی کامپیوتر چه درس‌هایی مهم‌تر هستند؟', answer: 'برای مهندسی کامپیوتر، علاقه به ریاضی، حل مسئله و مبانی فناوری اهمیت دارد. در دبیرستان توجه به ریاضی و فیزیک می‌تواند پایه خوبی ایجاد کند.', source: 'vector', status: 'success', statusText: 'موفق', duration: '۱٫۲ ثانیه', provider: 'IranCopilot', model: 'icp-chat', input: 842, output: 186, total: 1028 },
    { id: 'NK-8F219', time: '۱۴۰۵/۰۸/۲۱ · ۱۲:۴۲', question: 'شهریه رشته حسابداری چقدر است؟', answer: 'اطلاعات رسمی و به‌روز شهریه در پایگاه دانش موجود نیست. برای اعلام مبلغ دقیق باید آخرین اطلاعیه مالی دانشگاه بررسی شود.', source: 'no_info', status: 'warning', statusText: 'بدون اطلاعات', duration: '۰٫۸ ثانیه', provider: '—', model: '—', input: 0, output: 0, total: 0 },
    { id: 'NK-8F214', time: '۱۴۰۵/۰۸/۲۱ · ۱۲:۳۵', question: 'آدرس دانشکده علوم انسانی کجاست؟', answer: 'دانشکده علوم انسانی در پردیس دانشگاه آزاد اسلامی واحد اصفهان (خوراسگان) قرار دارد. برای مسیر دقیق می‌توانید از نقشه دانشگاه استفاده کنید.', source: 'knowledge', status: 'success', statusText: 'موفق', duration: '۱٫۵ ثانیه', provider: 'IranCopilot', model: 'icp-chat', input: 690, output: 142, total: 832 },
    { id: 'NK-8F20D', time: '۱۴۰۵/۰۸/۲۱ · ۱۲:۲۷', question: 'سلام نوکا، خوبی؟', answer: 'سلام! من نوکا هستم 👋 ممنون، آماده‌ام کمکت کنم.', source: 'smalltalk', status: 'success', statusText: 'موفق', duration: '۰٫۰۲ ثانیه', provider: '—', model: '—', input: 0, output: 0, total: 0 },
    { id: 'NK-8F208', time: '۱۴۰۵/۰۸/۲۱ · ۱۲:۱۹', question: 'بازار کار رشته روانشناسی چطوره؟', answer: 'درخواست به سرویس مدل ارسال شد اما سرویس در مهلت مقرر پاسخ نداد. لطفاً دوباره تلاش کنید.', source: 'error', status: 'danger', statusText: 'خطا', duration: '۴۰ ثانیه', provider: 'IranCopilot', model: 'icp-chat', input: 0, output: 0, total: 0 },
    { id: 'NK-8F1FE', time: '۱۴۰۵/۰۸/۲۱ · ۱۲:۰۵', question: 'رشته‌های دانشکده فنی و مهندسی رو معرفی کن.', answer: 'فهرست رشته‌های مرتبط در پایگاه دانش پیدا شد و پاسخ با استفاده از اطلاعات مرجع تولید شد.', source: 'faq', status: 'success', statusText: 'موفق', duration: '۰٫۰۳ ثانیه', provider: '—', model: '—', input: 0, output: 0, total: 0 }
  ];
  var knowledge = [
    { id: 'uni-identity', type: 'general', title: 'هویت دانشگاه و مشخصات', category: 'اطلاعات عمومی', updated: '۱۴۰۵/۰۸/۱۸', status: 'published' },
    { id: 'major-computer', type: 'major', title: 'مهندسی کامپیوتر', category: 'فنی و مهندسی', updated: '۱۴۰۵/۰۸/۱۶', status: 'published' },
    { id: 'faculty-humanities', type: 'faculty', title: 'دانشکده علوم انسانی', category: 'دانشکده‌ها', updated: '۱۴۰۵/۰۸/۱۵', status: 'published' },
    { id: 'faq-tuition', type: 'faq', title: 'پرسش‌های مربوط به شهریه', category: 'پرسش‌های متداول', updated: '۱۴۰۵/۰۸/۱۴', status: 'published' },
    { id: 'major-psychology', type: 'major', title: 'روانشناسی', category: 'علوم انسانی', updated: '۱۴۰۵/۰۸/۱۲', status: 'published' },
    { id: 'list-majors', type: 'list', title: 'فهرست رشته‌های دانشگاه', category: 'فهرست‌ها', updated: '۱۴۰۵/۰۸/۱۰', status: 'published' }
  ];
  var admins = [
    { name: 'مدیر اصلی', email: 'owner@example.invalid', role: 'Super Admin', state: 'فعال', initials: 'م', tone: '' },
    { name: 'سارا محمدی', email: 's.mohammadi@example.invalid', role: 'Knowledge Manager', state: 'فعال', initials: 'س', tone: 'green' },
    { name: 'علی رضایی', email: 'a.rezaei@example.invalid', role: 'Support', state: 'فعال', initials: 'ع', tone: 'purple' },
    { name: 'نگار احمدی', email: 'n.ahmadi@example.invalid', role: 'Analyst', state: 'محدود', initials: 'ن', tone: '' }
  ];
  var audit = [
    ['۱۴۰۵/۰۸/۲۱ · ۱۲:۴۰', 'سارا محمدی', 'knowledge.update', 'ویرایش اطلاعات رشته مهندسی کامپیوتر', 'موفق'],
    ['۱۴۰۵/۰۸/۲۱ · ۱۱:۵۸', 'مدیر اصلی', 'admin.permission.update', 'تغییر مجوز مشاهده درخواست‌ها', 'موفق'],
    ['۱۴۰۵/۰۸/۲۱ · ۱۱:۲۲', 'علی رضایی', 'request.view_sensitive', 'مشاهده جزئیات یک درخواست', 'موفق'],
    ['۱۴۰۵/۰۸/۲۰ · ۱۶:۰۵', 'سارا محمدی', 'knowledge.create', 'افزودن پیش‌نویس اطلاعات جدید', 'موفق'],
    ['۱۴۰۵/۰۸/۲۰ · ۱۴:۳۱', 'نگار احمدی', 'admin.login.failed', 'تلاش ناموفق برای ورود', 'ناموفق']
  ];
  var icon = function (name) {
    var p = { chart: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>', search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>', plus: '<path d="M12 5v14M5 12h14"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .8-3 2s1.1 2 3 2 3 1 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5M12 5v14"/>', book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5v16M8 7h8M8 11h7"/>', shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', alert: '<path d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13a2 2 0 0 0-3.4 0z"/><path d="M12 9v4m0 4h.01"/>', users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6m3-3h-6"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2z"/>' };
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (p[name] || p.chart) + '</svg>';
  };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var badge = function (status, text) { return '<span class="status ' + status + '">' + esc(text) + '</span>'; };
  var pageHead = function (title, desc, action) { return '<div class="page-heading"><div><h1>' + title + '</h1><p>' + desc + '</p></div><div class="heading-actions">' + (action || '') + '</div></div>'; };
  var stat = function (label, value, note, symbol, tone, trend) { return '<article class="stat-card"><div class="stat-top"><span class="stat-label">' + label + '</span><span class="stat-icon ' + (tone || '') + '">' + symbol + '</span></div><div class="stat-value">' + value + '</div><div class="stat-foot"><span class="trend ' + (trend === 'down' ? 'down' : '') + '">' + (trend === 'down' ? '↓' : '↑') + ' ' + (trend === 'down' ? '۲٫۱٪' : '۱۲٫۸٪') + '</span><span>' + note + '</span></div></article>'; };
  function dashboard() {
    var bars = [38, 54, 43, 67, 52, 76, 61, 82, 65, 91, 72, 100, 74, 88];
    var chart = bars.map(function (h, i) { return '<div class="chart-col"><span class="bar ' + (i > 9 ? 'alt' : '') + '" style="height:' + h + '%"></span></div>'; }).join('');
    return pageHead('سلام، مدیر نوکا 👋', 'نمای کلی رابط مدیریت؛ اعداد و رکوردها فعلاً نمونه هستند', '<button class="btn" data-action="export-requests">' + icon('download') + ' خروجی نمونه</button>') +
      '<div class="stats-grid">' + stat('کل درخواست‌ها', '۱۲,۸۴۶', 'نسبت به هفته قبل', icon('chart'), '', 'up') + stat('درخواست موفق', '۱۲,۳۹۲', '۹۶٫۴٪ از کل درخواست‌ها', '✓', 'green', 'up') + stat('خطاهای ثبت‌شده', '۲۸', 'نیازمند بررسی', icon('alert'), 'red', 'down') + stat('مصرف توکن', '۲٫۴۸M', 'توکن ورودی و خروجی', icon('coin'), 'orange', 'up') + '</div>' +
      '<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">روند درخواست‌ها</h2><div class="panel-subtitle">تعداد درخواست‌ها در ۱۴ روز گذشته</div></div><select class="select-control" id="chartPeriod"><option>۱۴ روز اخیر</option><option>۷ روز اخیر</option><option>۳۰ روز اخیر</option></select></div><div class="chart-area">' + chart + '</div><div class="chart-days"><span>۰۸ آبان</span><span>۱۲ آبان</span><span>۱۶ آبان</span><span>۲۱ آبان</span></div></section>' +
      '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">منبع پاسخ‌ها</h2><div class="panel-subtitle">تفکیک مسیر پاسخ‌گویی</div></div><span class="source-tag">نمونه</span></div><div class="source-layout"><div class="donut"><div class="donut-center"><strong>۱۲٫۸K</strong><span>درخواست</span></div></div><div class="legend"><div class="legend-row"><i class="legend-dot" style="background:var(--primary)"></i><span>مدل + Vector</span><b>۴۲٪</b></div><div class="legend-row"><i class="legend-dot" style="background:var(--success)"></i><span>دانش کلمه‌ای</span><b>۲۷٪</b></div><div class="legend-row"><i class="legend-dot" style="background:var(--warning)"></i><span>FAQ و حافظه</span><b>۱۵٪</b></div><div class="legend-row"><i class="legend-dot" style="background:#A99BCB"></i><span>عمومی و بی‌پاسخ</span><b>۱۰٪</b></div><div class="legend-row"><i class="legend-dot" style="background:var(--surface2)"></i><span>خطا</span><b>۶٪</b></div></div></div></section></div>' +
      '<div class="dashboard-grid"><section class="panel table-panel"><div class="panel-head"><div><h2 class="panel-title">آخرین درخواست‌ها</h2><div class="panel-subtitle">نمونه‌ای از رویدادهای اخیر</div></div><button class="btn btn-sm btn-soft" data-view="requests">مشاهده همه ' + icon('arrow') + '</button></div>' + requestTable(requests.slice(0, 4), true) + '</section>' +
      '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">وضعیت سرویس‌ها</h2><div class="panel-subtitle">وضعیت نمونه اجزای زیرساخت</div></div><span class="status success">همه پایدار</span></div>' +
      systemStatus('موتور چت', 'API پاسخ‌گویی', 'عملیاتی') + systemStatus('پایگاه دانش', '۷۵ تکه اطلاعات نمونه', 'عملیاتی') + systemStatus('Upstash Vector', 'جست‌وجوی معنایی', 'عملیاتی') + systemStatus('MySQL', 'در انتظار اتصال VPS', 'متصل نیست', true) + systemStatus('Redis', 'Rate Limit مشترک', 'متصل نیست', true) + '</section></div>';
  }
  function systemStatus(name, desc, label, pending) { return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><span class="legend-dot" style="background:' + (pending ? 'var(--warning)' : 'var(--success)') + '"></span><div style="flex:1"><div style="font-size:10px;font-weight:800">' + name + '</div><div class="secondary-cell">' + desc + '</div></div><span class="' + (pending ? 'muted' : 'status success') + '" style="font-size:9px">' + label + '</span></div>'; }
  function requestTable(list, compact) {
    if (!list.length) return '<div class="empty-state">درخواستی با این مشخصات پیدا نشد.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>شناسه / زمان</th><th>سؤال کاربر</th><th>منبع پاسخ</th><th>وضعیت</th><th>زمان پاسخ</th>' + (compact ? '' : '<th>توکن</th>') + '<th></th></tr></thead><tbody>' + list.map(function (r) { return '<tr data-request="' + esc(r.id) + '"><td><div class="primary-cell ltr">' + esc(r.id) + '</div><div class="secondary-cell">' + esc(r.time) + '</div></td><td><div class="primary-cell" style="max-width:340px;overflow:hidden;text-overflow:ellipsis">' + esc(r.question) + '</div></td><td><span class="source-tag">' + esc(sourceName(r.source)) + '</span></td><td>' + badge(r.status, r.statusText) + '</td><td class="ltr">' + esc(r.duration) + '</td>' + (compact ? '' : '<td class="ltr">' + r.total.toLocaleString('en-US') + '</td>') + '<td><button class="icon-button" style="width:29px;height:29px" data-open-request="' + esc(r.id) + '" title="جزئیات">' + icon('eye') + '</button></td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function sourceName(s) { return ({ vector: 'مدل + Vector', knowledge: 'دانش کلمه‌ای', faq: 'FAQ', smalltalk: 'احوالپرسی', no_info: 'بدون اطلاعات', error: 'خطا' })[s] || s; }
  function requestsView() {
    var list = requests.filter(function (r) { var ok = state.requestFilter === 'all' || (state.requestFilter === 'error' ? r.status === 'danger' : state.requestFilter === 'success' ? r.status === 'success' : r.source === 'no_info'); return ok && (!state.requestSearch || (r.question + r.id).toLowerCase().indexOf(state.requestSearch.toLowerCase()) >= 0); });
    return pageHead('درخواست‌ها و گفتگوها', 'مشاهده مسیر پاسخ‌گویی، وضعیت و جزئیات هر درخواست', '<button class="btn" data-action="export-requests">' + icon('download') + ' خروجی CSV</button>') +
      '<div class="callout"><div>ⓘ</div><div><strong>داده‌های نمایشی</strong><span>این درخواست‌ها نمونه ساختگی هستند. در نسخه عملیاتی، متن سؤال و پاسخ فقط برای ادمین دارای مجوز مشاهده اطلاعات حساس نمایش داده می‌شود.</span></div></div>' +
      '<div class="filters"><input class="search-control" id="requestSearch" placeholder="جست‌وجو در شناسه یا متن سؤال..." value="' + esc(state.requestSearch) + '"><select class="select-control" id="requestFilter"><option value="all">همه درخواست‌ها</option><option value="success" ' + (state.requestFilter === 'success' ? 'selected' : '') + '>موفق</option><option value="error" ' + (state.requestFilter === 'error' ? 'selected' : '') + '>خطاها</option><option value="noinfo" ' + (state.requestFilter === 'noinfo' ? 'selected' : '') + '>بدون اطلاعات</option></select><span class="toolbar-note">' + list.length + ' رکورد نمایشی</span></div>' +
      '<section class="panel table-panel">' + requestTable(list, false) + '</section>';
  }
  function tokensView() {
    return pageHead('مصرف توکن', 'مصرف ورودی و خروجی مدل‌ها به تفکیک درخواست و Provider', '<button class="btn" data-action="export-tokens">' + icon('download') + ' خروجی CSV</button>') +
      '<div class="stats-grid">' + stat('توکن ورودی', '۱٫۷۲M', '۶۹٪ از مصرف کل', '↙', '', 'up') + stat('توکن خروجی', '۷۶۰K', '۳۱٪ از مصرف کل', '↗', 'green', 'up') + stat('میانگین هر درخواست', '۱۹۳', 'توکن در هر درخواست مدل', icon('coin'), 'orange', 'down') + stat('فراخوانی مدل', '۸,۲۱۴', 'شامل تلاش‌های مجدد', icon('chart'), '', 'up') + '</div>' +
      '<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">تفکیک توکن‌ها</h2><div class="panel-subtitle">مقایسه مصرف ورودی و خروجی</div></div><span class="source-tag">۱۴ روز اخیر</span></div><div class="token-bars"><div class="token-bar-row"><span>ورودی</span><div class="token-track"><div class="token-fill" style="width:69%"></div></div><b class="ltr">1,720,000</b></div><div class="token-bar-row"><span>خروجی</span><div class="token-track"><div class="token-fill out" style="width:31%"></div></div><b class="ltr">760,000</b></div></div><div class="content-grid section-spacer"><div class="mini-metric"><span>هزینه تخمینی نمونه</span><strong>$4.82</strong></div><div class="mini-metric"><span>میانگین زمان مدل</span><strong>1.8s</strong></div></div></section>' +
      '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">مصرف به تفکیک Provider</h2><div class="panel-subtitle">مقادیر ساختگی برای نمایش رابط</div></div></div>' + systemStatus('IranCopilot', 'icp-chat', '۷۲٪') + systemStatus('OpenRouter', 'مدل جایگزین', '۲۱٪') + systemStatus('سایر', 'سرویس‌های آزمایشی', '۷٪') + '<p class="modal-hint">پس از اتصال داده‌های عملیاتی، هزینه از جدول تعرفه مدل و Usage واقعی محاسبه می‌شود.</p></section></div>' +
      '<section class="panel table-panel"><div class="panel-head"><div><h2 class="panel-title">جزئیات مصرف هر درخواست</h2><div class="panel-subtitle">توکن ورودی، خروجی، هش و مدل</div></div></div><div class="table-wrap"><table><thead><tr><th>شناسه درخواست</th><th>مدل</th><th>ورودی</th><th>خروجی</th><th>مجموع</th><th>هش پرسش</th></tr></thead><tbody>' + requests.map(function (r) { return '<tr><td class="ltr">' + r.id + '</td><td>' + r.model + '</td><td class="ltr">' + r.input.toLocaleString('en-US') + '</td><td class="ltr">' + r.output.toLocaleString('en-US') + '</td><td class="ltr"><b>' + r.total.toLocaleString('en-US') + '</b></td><td class="ltr muted">a81f…' + r.id.slice(-4) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
  }
  var kState = { loading: false, error: null };
  function loadKnowledge(force) {
    if (!force && state.knowledgeList !== null) { render(); return; }
    kState.loading = true; kState.error = null;
    fetch('/api/admin-knowledge', { credentials: 'same-origin', cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.error) { kState.error = d.error; kState.loading = false; render(); return; }
        state.knowledgeList = d.chunks || []; state.knowledgeSha = d.sha || null;
        kState.loading = false; render();
      }).catch(function(){ kState.error = 'network'; kState.loading = false; render(); });
  }
  function typeFa(t){ return {general:'عمومی',major:'رشته',faculty:'دانشکده',faq:'FAQ',list:'فهرست'}[t]||t; }
  function knowledgeView() {
    if (!state.knowledgeList && !kState.loading && !kState.error) { loadKnowledge(true); return '<div class="loading-state">در حال بارگذاری پایگاه دانش…</div>'; }
    if (kState.loading) return '<div class="loading-state">در حال بارگذاری…</div>';
    if (kState.error) return pageHead('مدیریت پایگاه دانش','','') + '<div class="callout"><div>⚠️</div><div><strong>خطا</strong><span>'+esc(kState.error)+'</span></div></div>';
    var all = state.knowledgeList || [];
    var list = all.filter(function(k){ return (state.knowledgeType === 'all' || k.type === state.knowledgeType) && (!state.knowledgeSearch || (k.title+k.id).toLowerCase().indexOf(state.knowledgeSearch.toLowerCase()) >= 0); });
    var tc = {}; all.forEach(function(k){ tc[k.type]=(tc[k.type]||0)+1; });
    var pills = [['all','همه · '+all.length],['major','رشته‌ها · '+(tc.major||0)],['general','عمومی · '+(tc.general||0)],['faculty','دانشکده · '+(tc.faculty||0)],['faq','FAQ · '+(tc.faq||0)],['list','فهرست · '+(tc.list||0)]];
    var canCreate = state.currentAdmin && (state.currentAdmin.permissions||[]).indexOf('knowledge.create') >= 0;
    var canEdit   = state.currentAdmin && (state.currentAdmin.permissions||[]).indexOf('knowledge.edit') >= 0;
    return pageHead('مدیریت پایگاه دانش','ویرایش مستقیم فایل دانش روی VPS',canCreate?'<button class="btn btn-primary" data-action="add-knowledge">'+icon('plus')+' افزودن</button>':'')+
      (state.knowledgeSha?'<div class="callout"><div>✔</div><div><strong>اتصال برقرار</strong><span>'+all.length+' تکه · SHA: '+esc(state.knowledgeSha.slice(0,16))+'…</span></div><button class="btn btn-sm" data-action="reload-knowledge" style="margin-right:auto">↻ بارگذاری مجدد</button></div>':'')+
      '<div class="filters"><input class="search-control" id="knowledgeSearch" placeholder="جست‌وجو…" value="'+esc(state.knowledgeSearch)+'"><span class="toolbar-note">'+list.length+' مورد</span></div>'+
      '<div class="category-pills">'+pills.map(function(p){ return '<button class="category-pill '+(state.knowledgeType===p[0]?'active':'')+'" data-knowledge-type="'+p[0]+'">'+p[1]+'</button>'; }).join('')+'</div>'+
      '<section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>شناسه</th><th>عنوان</th><th>نوع</th><th>نویسه</th><th></th></tr></thead><tbody>'+
      (list.length?list.map(function(k){ return '<tr><td class="ltr muted">'+esc(k.id)+'</td><td class="primary-cell">'+esc(k.title)+'</td><td><span class="source-tag">'+typeFa(k.type)+'</span></td><td class="ltr">'+esc(String(k.chars||''))+'</td><td><button class="btn btn-sm" data-knowledge-preview="'+esc(k.id)+'">مشاهده</button>'+(canEdit?' <button class="btn btn-sm" data-knowledge-edit="'+esc(k.id)+'">ویرایش</button>':'')+' </td></tr>'; }).join(''):'<tr><td colspan="5"><div class="empty-state">موردی پیدا نشد.</div></td></tr>')+
      '</tbody></table></div></section>';
  }
  function kFormBody(c, isFaq) {
    var v = c||{};
    return '<div class="form-grid">'+
      '<div class="form-field full"><label>عنوان'+(isFaq?' / سؤال اصلی':'')+'</label><input class="input-control" id="kTitle" value="'+esc(v.title||'')+'" placeholder="عنوان"></div>'+
      (!c?'<div class="form-field"><label>نوع</label><select class="input-control" id="kType"><option value="general">عمومی</option><option value="major">رشته</option><option value="faculty">دانشکده</option><option value="faq">FAQ</option><option value="list">فهرست</option></select></div>':
           '<div class="form-field"><label>نوع</label><input class="input-control" value="'+typeFa(v.type||'')+'" disabled></div>')+
      '<div class="form-field full"><label>کلیدواژه‌ها (با ویرگول)</label><input class="input-control" id="kKeywords" value="'+esc((v.keywords||[]).join('، '))+'" placeholder="کلیدواژه، کلیدواژه"></div>'+
      (isFaq?
        '<div class="form-field full"><label>پاسخ</label><textarea class="textarea-control" id="kAnswer" rows="4">'+esc(v.answer||'')+'</textarea></div>'+
        '<div class="form-field full"><label>سؤال‌های مشابه (هر خط)</label><textarea class="textarea-control" id="kQuestions" rows="3">'+esc((v.questions||[]).slice(1).join('
'))+'</textarea></div>':
        '<div class="form-field full"><label>متن دانش</label><textarea class="textarea-control" id="kText" rows="8">'+esc(v.text||'')+'</textarea></div>')+
      '</div><p class="modal-hint">SHA: '+esc(state.knowledgeSha?state.knowledgeSha.slice(0,16)+'…':'نامشخص')+'</p>';
  }
  function collectKForm(fixedType) {
    var type = fixedType||($('#kType')&&$('#kType').value)||'general';
    var kw = ($('#kKeywords')||{value:''}).value.split(/[,،؛;\n]+/).map(function(x){return x.trim();}).filter(Boolean);
    if (type==='faq') return { type:type, title:($('#kTitle')||{value:''}).value.trim(), keywords:kw, answer:($('#kAnswer')||{value:''}).value.trim(), questions:($('#kQuestions')||{value:''}).value.trim().split('\n').map(function(x){return x.trim();}).filter(Boolean) };
    return { type:type, title:($('#kTitle')||{value:''}).value.trim(), keywords:kw, text:($('#kText')||{value:''}).value };
  }
  function saveKnowledgeApi(action, id, chunk, btn) {
    if (!state.knowledgeSha) { toast('SHA نامشخص است؛ صفحه را مجدداً بارگذاری کنید.'); return; }
    btn.disabled=true; btn.textContent='در حال ذخیره…';
    var body = { action:action, baseSha:state.knowledgeSha, chunk:chunk };
    if (id) body.id = id;
    fetch('/api/admin-knowledge',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){ return r.json().then(function(d){return{ok:r.ok,d:d};}); })
      .then(function(res){
        if (!res.ok) {
          var msg=(res.d&&res.d.error)||'خطا';
          if (res.d&&res.d.fields) msg+=': '+Object.entries(res.d.fields).map(function(e){return e[0]+' — '+e[1];}).join(' | ');
          if (res.d&&res.d.currentSha){state.knowledgeSha=res.d.currentSha;msg+=' (تعارض نسخه؛ دوباره تلاش کنید)';}
          toast(msg); btn.disabled=false; btn.textContent='ذخیره'; return;
        }
        if (res.d.sha) state.knowledgeSha=res.d.sha;
        state.knowledgeList=null; closeModal(); loadKnowledge(true);
        toast(action==='create'?'تکه دانش افزوده شد.':'تکه دانش به‌روز شد.');
      }).catch(function(){toast('خطای شبکه');btn.disabled=false;btn.textContent='ذخیره';});
  }
  function addKnowledgeModal() {
    openModal('افزودن اطلاعات', kFormBody(null,false),
      '<button class="btn" data-close-modal>انصراف</button><button class="btn btn-primary" id="saveKnowledge">ذخیره</button>');
    var typeEl=document.getElementById('kType');
    if (typeEl) typeEl.addEventListener('change',function(){
      var t=typeEl.value; var bEl=document.querySelector('.modal-body');
      if (bEl){bEl.innerHTML=kFormBody(null,t==='faq'); var ne=document.getElementById('kType'); if(ne){ne.value=t; ne.addEventListener('change',arguments.callee);}}
    });
  }
  function editKnowledgeModal(id) {
    fetch('/api/admin-knowledge?id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d.error){toast('خطا: '+d.error);return;}
        var c=d.chunk; if(d.sha) state.knowledgeSha=d.sha;
        openModal('ویرایش: '+esc(c.title), kFormBody(c,c.type==='faq'),
          '<button class="btn" data-close-modal>انصراف</button><button class="btn btn-primary" id="saveEditKnowledge">ذخیره</button>');
        document.getElementById('saveEditKnowledge').addEventListener('click',function(){
          saveKnowledgeApi('update',id,collectKForm(c.type),this);
        });
      }).catch(function(){toast('خطای شبکه');});
  }
  function viewKnowledgeModal(id) {
    var item=(state.knowledgeList||[]).find(function(k){return k.id===id;});
    var canEdit=state.currentAdmin&&(state.currentAdmin.permissions||[]).indexOf('knowledge.edit')>=0;
    var body='<p class="modal-hint">برای دیدن متن کامل، دکمه ویرایش را بزنید.</p>';
    if (item) body='<div class="detail-grid"><div class="detail-box"><span>شناسه</span><strong class="ltr">'+esc(item.id)+'</strong></div><div class="detail-box"><span>نوع</span><strong>'+typeFa(item.type)+'</strong></div><div class="detail-box"><span>نویسه</span><strong class="ltr">'+esc(String(item.chars||''))+'</strong></div></div>'+body;
    openModal('مشاهده دانش', body,
      '<button class="btn" data-close-modal>بستن</button>'+(canEdit&&item?'<button class="btn btn-primary" data-knowledge-edit-modal="'+esc(id)+'">ویرایش</button>':''));
  }

    function adminsView() {
    var list = admins.concat(state.temporaryAdmins);
    return pageHead('ادمین‌ها و دسترسی‌ها', 'مدیریت اعضای پنل، نقش‌ها و مجوزهای عملیاتی', '<button class="btn btn-primary" data-action="add-admin">' + icon('plus') + ' افزودن ادمین</button>') +
      '<div class="callout"><div>' + icon('shield') + '</div><div><strong>اصل دسترسی حداقلی</strong><span>هر ادمین فقط باید به بخش‌های لازم دسترسی داشته باشد. نقش Super Admin در نسخه عملیاتی قابل واگذاری یا تغییر توسط ادمین عادی نیست.</span></div></div>' +
      '<div class="stats-grid">' + stat('کل ادمین‌ها', String(list.length).padStart(2,'0'), 'حساب‌های نمونه', icon('users'), '', 'up') + stat('فعال', '۰۳', 'حساب فعال نمونه', '✓', 'green', 'up') + stat('محدودشده', '۰۱', 'نیازمند بررسی', icon('shield'), 'orange', 'down') + stat('نقش‌ها', '۰۵', 'سطوح دسترسی طراحی‌شده', '♙', '', 'up') + '</div>' +
      '<section class="panel table-panel"><div class="panel-head"><div><h2 class="panel-title">اعضای پنل</h2><div class="panel-subtitle">فهرست نمونه ادمین‌ها</div></div><span class="source-tag">RBAC</span></div><div class="table-wrap"><table><thead><tr><th>نام ادمین</th><th>ایمیل</th><th>نقش</th><th>وضعیت</th><th>دسترسی‌های کلیدی</th><th>عملیات</th></tr></thead><tbody>' + list.map(function (a, i) { return '<tr><td><span class="avatar-small ' + a.tone + '">' + esc(a.initials) + '</span><b>' + esc(a.name) + '</b></td><td class="ltr muted">' + esc(a.email) + '</td><td><span class="source-tag">' + esc(a.role) + '</span></td><td>' + badge(a.state === 'فعال' ? 'success' : 'warning',a.state) + '</td><td><span class="permission-chip">مشاهده</span><span class="permission-chip">' + (i === 0 ? 'همه مجوزها' : i === 1 ? 'مدیریت دانش' : i === 2 ? 'پشتیبانی' : 'گزارش‌ها') + '</span></td><td><button class="btn btn-sm" data-admin-edit="' + i + '">دسترسی‌ها</button></td></tr>'; }).join('') + '</tbody></table></div></section>' +
      '<section class="panel section-spacer"><div class="panel-head"><div><h2 class="panel-title">مجوزهای اصلی</h2><div class="panel-subtitle">نمونه ماتریس مجوزها؛ تغییرها در این نسخه ذخیره نمی‌شوند</div></div></div><div class="content-grid"><div><b>پایگاه دانش</b><p><span class="permission-chip">knowledge.view</span><span class="permission-chip">knowledge.create</span><span class="permission-chip">knowledge.edit</span><span class="permission-chip">knowledge.publish</span></p></div><div><b>درخواست‌ها</b><p><span class="permission-chip">requests.view</span><span class="permission-chip">requests.view_sensitive</span><span class="permission-chip">requests.export</span></p></div><div><b>مدیریت ادمین</b><p><span class="permission-chip">admins.create</span><span class="permission-chip">admins.manage_roles</span></p></div><div><b>گزارش‌ها و تنظیمات</b><p><span class="permission-chip">audit.view</span><span class="permission-chip">settings.manage</span></p></div></div></section>';
  }
  function auditView() {
    return pageHead('گزارش فعالیت‌ها', 'تاریخچه اقدامات ادمین‌ها و تغییرات پنل', '<button class="btn" data-action="export-audit">' + icon('download') + ' خروجی CSV</button>') +
      '<div class="stats-grid">' + stat('رویدادهای امروز', '۱۸۴', 'تمام عملیات مدیریتی', icon('chart'), '', 'up') + stat('ورود موفق', '۲۱', 'نشست‌های ثبت‌شده', '✓', 'green', 'up') + stat('تلاش ناموفق', '۰۳', 'ورود یا عملیات ردشده', icon('alert'), 'orange', 'down') + stat('تغییرات دانش', '۱۲', 'افزودن و ویرایش', icon('book'), '', 'up') + '</div>' +
      '<div class="filters"><input class="search-control" id="auditSearch" placeholder="جست‌وجو در نام ادمین، عملیات یا شرح..."><select class="select-control"><option>همه عملیات</option><option>ورود و خروج</option><option>تغییر دانش</option><option>تغییر دسترسی</option></select><span class="toolbar-note">نگهداری تاریخچه مدیریتی: بلندمدت</span></div>' +
      '<section class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>زمان</th><th>ادمین</th><th>کد عملیات</th><th>شرح فعالیت</th><th>نتیجه</th><th>هش رویداد</th></tr></thead><tbody>' + audit.map(function (a, i) { return '<tr><td class="nowrap">' + a[0] + '</td><td><b>' + a[1] + '</b></td><td class="ltr muted">' + a[2] + '</td><td>' + a[3] + '</td><td>' + badge(a[4] === 'موفق' ? 'success' : 'danger',a[4]) + '</td><td class="ltr muted">9fa' + i + '…b82d</td></tr>'; }).join('') + '</tbody></table></div></section>' +
      '<div class="callout section-spacer"><div>◇</div><div><strong>ثبت غیرقابل‌ویرایش در نسخه عملیاتی</strong><span>Audit Log به‌صورت append-only ذخیره می‌شود؛ هش زنجیره‌ای و نسخه پشتیبان مستقل نیز در پیاده‌سازی نهایی اضافه خواهد شد.</span></div></div>';
  }
  function settingsView() {
    return pageHead('تنظیمات پنل', 'وضعیت محیط، سیاست نگهداری و زیرساخت مورد انتظار', '') +
      '<div class="callout"><div>ⓘ</div><div><strong>این صفحه فقط نمایشی است</strong><span>هیچ تنظیمی از این بخش به محیط Vercel یا سرویس‌های واقعی اعمال نمی‌شود.</span></div></div>' +
      '<div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2 class="panel-title">محیط اجرا</h2><span class="preview-pill">Preview</span></div>' + systemStatus('Frontend', 'پنل مدیریت در مسیر /admin', 'فعال') + systemStatus('Sample Data', 'اطلاعات نمونه؛ هنوز به دیتابیس عملیاتی متصل نیست', 'فعال') + systemStatus('MySQL VPS', 'اتصال پس از تحویل VPS', 'در انتظار', true) + systemStatus('Redis', 'Rate Limit و Cache مشترک', 'در انتظار', true) + systemStatus('Vector', 'Upstash Vector فعلی', 'متصل در نسخه فعلی') + '</section>' +
      '<section class="panel"><div class="panel-head"><h2 class="panel-title">سیاست‌های داده</h2></div><div class="mini-metric"><span>نگهداری جزئیات درخواست</span><strong>نامحدود</strong></div><div class="mini-metric section-spacer"><span>نگهداری Audit Log</span><strong>بلندمدت</strong></div><div class="mini-metric section-spacer"><span>انتشار دانش</span><strong style="font-size:14px">ادمین مجاز</strong></div><div class="mini-metric section-spacer"><span>دیتابیس مرجع</span><strong style="font-size:14px">MySQL روی VPS</strong></div></section></div>' +
      '<section class="panel section-spacer"><h2 class="panel-title">یادداشت مهاجرت</h2><p class="muted" style="font-size:10px;line-height:2">در فاز فعلی رابط کاربری و گردش کار نمایشی ساخته شده است. در فاز بعد، APIهای واقعی، احراز هویت چندادمینی، MySQL، ثبت رویدادها، Token Usage و Outbox برای همگام‌سازی Vector به این رابط متصل می‌شوند.</p></section>';
  }
  function render() {
    if (!state.currentAdmin) { showLogin(); return; }
    if (!canView(state.view)) state.view = 'dashboard';
    $('#breadcrumbTitle').textContent = viewNames[state.view];
    $$('.nav-item').forEach(function (b) {
      var view = b.getAttribute('data-view');
      b.hidden = !canView(view);
      b.classList.toggle('active', view === state.view);
    });
    var privilegedNav = $('nav[aria-label="دسترسی و امنیت"]');
    var privilegedLabel = $('.nav-label-spaced');
    if (privilegedNav) privilegedNav.hidden = !isSuperAdmin();
    if (privilegedLabel) privilegedLabel.hidden = !isSuperAdmin();
    var page = state.view === 'dashboard' ? dashboard() : state.view === 'requests' ? requestsView() : state.view === 'tokens' ? tokensView() : state.view === 'knowledge' ? knowledgeView() : state.view === 'admins' ? adminsView() : state.view === 'audit' ? auditView() : settingsView();
    $('#pageContent').innerHTML = page;
    $('#sidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('show');
  }
  function toast(message) { var el = document.createElement('div'); el.className = 'toast'; el.textContent = message; $('#toastRoot').appendChild(el); setTimeout(function () { el.remove(); }, 2800); }
  function openModal(title, body, foot) { $('#modalRoot').innerHTML = '<div class="modal-backdrop" data-close-modal><section class="modal-card" role="dialog" aria-modal="true"><div class="modal-head"><strong>' + title + '</strong><button class="icon-button" data-close-modal aria-label="بستن">×</button></div><div class="modal-body">' + body + '</div><div class="modal-foot">' + foot + '</div></section></div>'; }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  function openRequest(id) {
    var r = requests.find(function (x) { return x.id === id; }); if (!r) return;
    var body = '<div class="detail-grid"><div class="detail-box"><span>شناسه درخواست</span><strong class="ltr">' + esc(r.id) + '</strong></div><div class="detail-box"><span>زمان ثبت</span><strong>' + esc(r.time) + '</strong></div><div class="detail-box"><span>منبع پاسخ</span><strong>' + esc(sourceName(r.source)) + '</strong></div><div class="detail-box"><span>وضعیت</span><strong>' + esc(r.statusText) + '</strong></div><div class="detail-box"><span>زمان پردازش</span><strong>' + esc(r.duration) + '</strong></div><div class="detail-box"><span>توکن کل</span><strong class="ltr">' + r.total + '</strong></div></div><div class="detail-text"><b>سؤال کاربر</b><br>' + esc(r.question) + '<br><br><b>پاسخ نوکا</b><br>' + esc(r.answer) + '</div><div class="detail-grid section-spacer"><div class="detail-box"><span>Provider</span><strong>' + esc(r.provider) + '</strong></div><div class="detail-box"><span>مدل</span><strong>' + esc(r.model) + '</strong></div><div class="detail-box"><span>توکن ورودی</span><strong class="ltr">' + r.input + '</strong></div><div class="detail-box"><span>توکن خروجی</span><strong class="ltr">' + r.output + '</strong></div></div><p class="modal-hint">نمونه ساختگی؛ پس از اتصال داده‌های عملیاتی جزئیات با مجوز requests.view_sensitive قابل مشاهده خواهد بود.</p>';
    openModal('جزئیات درخواست', body, '<button class="btn" data-close-modal>بستن</button>');
  }


  function exportCSV(type) {
    var rows = type === 'audit' ? [['زمان','ادمین','عملیات','شرح','نتیجه']].concat(audit) : [['شناسه','سؤال','منبع','وضعیت','توکن ورودی','توکن خروجی']].concat(requests.map(function (r) { return [r.id,r.question,sourceName(r.source),r.statusText,r.input,r.output]; }));
    var csv = '\ufeff' + rows.map(function (r) { return r.map(function (x) { var s = String(x == null ? '' : x).replace(/"/g,'""'); return '"' + s + '"'; }).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'nooka-demo-' + type + '.csv'; a.click(); URL.revokeObjectURL(url); toast('فایل نمونه ساخته شد.');
  }
  document.addEventListener('click', function (e) {
    var view = e.target.closest('[data-view]'); if (view) { var targetView = view.getAttribute('data-view'); if (!canView(targetView)) { toast('این بخش فقط برای Super Admin یا ادمین دارای مجوز قابل مشاهده است.'); return; } state.view = targetView; render(); return; }
    var action = e.target.closest('[data-action]'); if (action) { var act = action.getAttribute('data-action'); if (act === 'add-knowledge' && canView('knowledge')) addKnowledgeModal(); if (act === 'reload-knowledge') { state.knowledgeList=null; loadKnowledge(true); } if (act === 'add-admin' && isSuperAdmin()) addAdminModal(); if ((act === 'export-requests' || act === 'export-tokens') && (canView('requests') || canView('tokens'))) exportCSV('requests'); if (act === 'export-audit' && isSuperAdmin()) exportCSV('audit'); return; }
    var req = e.target.closest('[data-open-request]'); if (req) { openRequest(req.getAttribute('data-open-request')); return; }
    var row = e.target.closest('tr[data-request]'); if (row) { openRequest(row.getAttribute('data-request')); return; }
    var type = e.target.closest('[data-knowledge-type]'); if (type) { state.knowledgeType = type.getAttribute('data-knowledge-type'); render(); return; }
    var krow = e.target.closest('[data-knowledge-preview]'); if (krow) { viewKnowledgeModal(krow.getAttribute('data-knowledge-preview')); return; } var kedit = e.target.closest('[data-knowledge-edit]'); if (kedit) { editKnowledgeModal(kedit.getAttribute('data-knowledge-edit')); return; } var keditM = e.target.closest('[data-knowledge-edit-modal]'); if (keditM) { closeModal(); editKnowledgeModal(keditM.getAttribute('data-knowledge-edit-modal')); return; }
    var edit = e.target.closest('[data-admin-edit]'); if (edit) { if (!isSuperAdmin()) { toast('مدیریت ادمین‌ها فقط در دسترس Super Admin است.'); return; } var i = Number(edit.getAttribute('data-admin-edit')); var a = admins.concat(state.temporaryAdmins)[i]; if (a) openModal('سطح دسترسی ادمین', '<div class="detail-box"><span>ادمین</span><strong>' + esc(a.name) + ' · ' + esc(a.role) + '</strong></div><div class="section-spacer"><label style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">مشاهده درخواست‌ها <span class="toggle on"></span></label><label style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">مشاهده اطلاعات حساس <span class="toggle ' + (i < 2 ? 'on' : '') + '"></span></label><label style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">مدیریت پایگاه دانش <span class="toggle ' + (i === 1 ? 'on' : '') + '"></span></label><label style="display:flex;justify-content:space-between;padding:9px 0">مشاهده Audit Log <span class="toggle ' + (i === 0 || i === 3 ? 'on' : '') + '"></span></label></div><p class="modal-hint">تغییر مجوزها صرفاً نمایشی است. پس از اتصال داده‌های عملیاتی فقط Super Admin می‌تواند نقش و مجوزها را تغییر دهد.</p>', '<button class="btn" data-close-modal>بستن</button><button class="btn btn-primary" id="permissionDemo">نمایش تغییر</button>'); return; }
    if (e.target.closest('[data-close-modal]')) { closeModal(); return; }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'requestSearch') { state.requestSearch = e.target.value; var pos = e.target.selectionStart; render(); var n = $('#requestSearch'); n.focus(); n.setSelectionRange(pos,pos); }
    if (e.target.id === 'knowledgeSearch') { state.knowledgeSearch = e.target.value; var p = e.target.selectionStart; render(); var k = $('#knowledgeSearch'); k.focus(); k.setSelectionRange(p,p); }
    if (e.target.id === 'auditSearch') { var q = e.target.value.toLowerCase(); $$('.table-wrap tbody tr').forEach(function (tr) { tr.style.display = tr.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; }); }
  });
  document.addEventListener('change', function (e) { if (e.target.id === 'requestFilter') { state.requestFilter = e.target.value; render(); } });
  document.addEventListener('click', function (e) {
    if (e.target.id === 'saveKnowledge') { var btn=e.target; var type=($('#kType')||{value:'general'}).value; var chunk=collectKForm(null); if (!chunk.title){toast('عنوان الزامی است.');return;} if (type==='faq'&&!chunk.answer){toast('پاسخ FAQ الزامی است.');return;} if (type!=='faq'&&!chunk.text){toast('متن دانش الزامی است.');return;} saveKnowledgeApi('create',null,chunk,btn); }
    if (e.target.id === 'saveAdmin') { toast('مدیریت ادمین‌ها در این نسخه از طریق اسکریپت create-admin.js روی VPS انجام می‌شود.'); }
    if (e.target.id === 'permissionDemo') toast('تغییر دسترسی در حالت Preview ذخیره نمی‌شود.');
  });
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    loginWithServer($('#loginEmail').value.trim().toLowerCase(), $('#loginPassword').value);
  });
  $('#logoutButton').addEventListener('click', logoutFromServer);
  $('#themeToggle').addEventListener('click', function () { document.documentElement.classList.toggle('dark'); });
  $('#notifications').addEventListener('click', function () { toast('اعلان جدیدی در محیط نمایشی وجود ندارد.'); });
  $('#mobileMenu').addEventListener('click', function () { $('#sidebar').classList.add('open'); $('#sidebarScrim').classList.add('show'); });
  $('#sidebarClose').addEventListener('click', function () { $('#sidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('show'); });
  $('#sidebarScrim').addEventListener('click', function () { $('#sidebar').classList.remove('open'); $('#sidebarScrim').classList.remove('show'); });
  restoreServerSession();
}());
