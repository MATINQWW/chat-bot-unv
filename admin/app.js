(function () {
  'use strict';

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };

  var PAGE_SIZE = 25;
  var I18N = {
    fa: {
      dir: 'rtl', locale: 'fa-IR',
      ribbon: 'پنل مدیریت نوکا · داده‌های عملیاتی',
      brand: 'نوکا', brandSub: 'مرکز مدیریت', workspace: 'دانشگاه خوراسگان', workspaceSub: 'فضای مدیریتی',
      navMain: 'مدیریت', navSec: 'مدیریت دسترسی', live: 'زنده', logout: 'خروج',
      footerMid: 'رابط مدیریت نوکا', footerEnd: 'نمایش داده‌های ثبت‌شده',
      loginTitle: 'ورود به پنل مدیریت', loginSub: 'برای ادامه، با حساب مدیریتی خود وارد شوید.',
      loginEmail: 'ایمیل یا نام کاربری', loginPass: 'رمز عبور', loginPassPh: 'رمز عبور خود را وارد کنید',
      loginSubmit: 'ورود به پنل', loginChecking: 'در حال بررسی اطلاعات…',
      authInfoTitle: 'ورود امن و نقش‌محور', authInfoBody: 'نوع دسترسی شما پس از تأیید سرور مشخص می‌شود. Super Admin به همه بخش‌های مدیریتی دسترسی دارد؛ دسترسی Admin محدود به مجوزهای تخصیص‌یافته است.',
      loginDisc: 'اطلاعات ورود در سرور بررسی می‌شود و نشست با کوکی امن و سمت سرور نگهداری می‌شود.',
      views: { dashboard: 'داشبورد', requests: 'درخواست‌ها و گفتگوها', tokens: 'مصرف توکن', knowledge: 'مدیریت دانش', admins: 'ادمین‌ها و دسترسی‌ها', audit: 'گزارش فعالیت‌ها', settings: 'تنظیمات' },
      cats: { all: 'همه', general: 'اطلاعات عمومی', faculty: 'دانشکده‌ها', major: 'رشته‌های تحصیلی', list: 'فهرست‌ها', faq: 'سؤالات متداول (FAQ)' },
      roles: { admin: 'ادمین عمومی', knowledge_editor: 'ویرایشگر دانش', counselor: 'مشاور (لیدها و تیکت)', read_only: 'فقط‌خواندنی' },
      sources: { faq: 'پاسخ آماده (FAQ)', knowledge: 'پایگاه دانش', vector: 'جست‌وجوی معنایی (وکتور)', memory: 'حافظه یادگیری (کش)', general: 'دانش عمومی مدل', no_info: 'بدون اطلاعات', off_topic: 'خارج از حوزه', error: 'خطا / شلوغی', smalltalk: 'احوال‌پرسی', web: 'وب' },
      dashTitle: 'سلام، مدیر نوکا', dashSub: 'نمای کلی بر اساس داده‌های واقعی ثبت‌شده', refresh: 'به‌روزرسانی',
      totalReq: 'کل درخواست‌های ثبت‌شده', uniqQ: 'پرسش‌های یکتا', leadsLbl: 'درخواست‌های تماس',
      tokIn: 'توکن ورودی', tokOut: 'توکن خروجی', tokCache: 'توکن کش‌شده / ذخیره‌شده', tokTotal: 'مجموع مصرف توکن',
      reqTrend: 'روند درخواست‌های واقعی', tokTrend: 'روند مصرف توکن (ورودی / خروجی / کش)', srcBreakdown: 'منبع واقعی پاسخ‌ها',
      topQ: 'پرسش‌های پرتکرار', viewAll: 'مشاهده کامل', empty: 'داده‌ای برای نمایش وجود ندارد.',
      tabQuestions: 'پرسش‌های پرتکرار', tabLeads: 'درخواست‌های تماس', exportCsv: 'خروجی CSV',
      searchQ: 'جست‌وجو در متن پرسش...', filterAll: 'همه منابع', filterOk: 'پاسخ از دانش/حافظه', filterErr: 'دارای خطا', filterNoInfo: 'بدون اطلاعات',
      sortFreqDesc: 'مرتب‌سازی: پرتکرارترین', sortFreqAsc: 'مرتب‌سازی: کم‌تکرارترین', sortNew: 'مرتب‌سازی: جدیدترین', sortOld: 'مرتب‌سازی: قدیمی‌ترین', sortSource: 'مرتب‌سازی: منبع پاسخ',
      colQuestion: 'پرسش ثبت‌شده', colCount: 'تعداد', colSource: 'منبع اصلی', colLast: 'آخرین ثبت',
      colName: 'نام', colPhone: 'شماره تماس', colTopic: 'موضوع', colTime: 'زمان ثبت',
      tokTitle: 'مصرف توکن', tokSub: 'تفکیک واقعی توکن ورودی، خروجی و کش‌شده به تفکیک روز و مدل',
      colProv: 'سرویس‌دهنده', colModel: 'مدل', colCalls: 'تعداد فراخوانی', colLatency: 'میانگین تأخیر',
      knowTitle: 'مدیریت پایگاه دانش', knowSubDb: 'مدیریت مستقیم در دیتابیس MySQL با همگام‌سازی خودکار Upstash Vector', knowSubRo: 'نمایش محتوای فایل دانش (برای ویرایش، NOOKA_DB_URL را تنظیم کنید)',
      addKnow: '＋ افزودن دانش جدید', searchKnow: 'جست‌وجوی عنوان، شناسه یا متن...',
      colId: 'شناسه', colTitle: 'عنوان', colCat: 'دسته‌بندی', colKeywords: 'کلیدواژه‌ها', colActions: 'عملیات',
      btnFull: 'متن کامل', btnEdit: 'ویرایش', btnDelete: 'حذف', btnClose: 'بستن', btnCancel: 'انصراف', btnSave: 'ذخیره',
      adminsTitle: 'ادمین‌ها و دسترسی‌ها', adminsSub: 'مدیریت حساب‌های ادمین در دیتابیس؛ کاربر جدید بلافاصله می‌تواند وارد شود.', addAdmin: '＋ افزودن ادمین',
      colEmail: 'ایمیل', colRole: 'نقش', colStatus: 'وضعیت', colPerms: 'دسترسی‌ها', active: 'فعال', inactive: 'غیرفعال', protected: 'محافظت‌شده',
      auditTitle: 'گزارش فعالیت‌ها', auditSub: 'تفکیک‌شده به بخش ورود/خروج و بخش تغییرات دانش/فایل‌ها',
      auditTabAuth: 'ورود، خروج و تلاش‌های ناموفق', auditTabFiles: 'تغییرات دانش و فایل‌ها',
      colActor: 'نام ادمین', colAction: 'رویداد', colOutcome: 'نتیجه', colTarget: 'فایل / شناسه', colIp: 'هش IP',
      settingsTitle: 'تنظیمات و سلامت دیتابیس', settingsSub: 'بررسی زنده اتصال دیتابیس MySQL، Redis و Vector',
      changePw: 'تغییر رمز عبور من', connected: 'متصل', notConfigured: 'پیکربندی نشده', configuredUnchecked: 'تنظیم شده', connError: 'خطای اتصال',
      prev: 'قبلی', next: 'بعدی', pageOf: 'صفحه', of: 'از', items: 'مورد', groups: 'گروه',
    },
    en: {
      dir: 'ltr', locale: 'en-US',
      ribbon: 'Nooka Admin Panel · Live Operational Data',
      brand: 'Nooka', brandSub: 'Admin Center', workspace: 'Khorasgan University', workspaceSub: 'Management Workspace',
      navMain: 'Management', navSec: 'Access & Security', live: 'Live', logout: 'Logout',
      footerMid: 'Nooka Admin Interface', footerEnd: 'Real Recorded Data Only',
      loginTitle: 'Admin Sign In', loginSub: 'Sign in with your administrator account to continue.',
      loginEmail: 'Email or Username', loginPass: 'Password', loginPassPh: 'Enter your password',
      loginSubmit: 'Sign In', loginChecking: 'Verifying credentials…',
      authInfoTitle: 'Role-Based Secure Login', authInfoBody: 'Your permissions are verified server-side. Super Admins have full access; Admins only see assigned sections.',
      loginDisc: 'Credentials are verified on the server with HttpOnly secure session cookies.',
      views: { dashboard: 'Dashboard', requests: 'Requests & Chats', tokens: 'Token Usage', knowledge: 'Knowledge Base', admins: 'Admins & Roles', audit: 'Audit Logs', settings: 'Settings' },
      cats: { all: 'All', general: 'General Info', faculty: 'Faculties', major: 'Academic Majors', list: 'Lists', faq: 'FAQ' },
      roles: { admin: 'General Admin', knowledge_editor: 'Knowledge Editor', counselor: 'Counselor (Leads)', read_only: 'Read Only' },
      sources: { faq: 'FAQ (Prepared)', knowledge: 'Knowledge Base', vector: 'Vector Search', memory: 'Learned Cache', general: 'Model General', no_info: 'No Info', off_topic: 'Off Topic', error: 'Error / Busy', smalltalk: 'Small Talk', web: 'Web' },
      dashTitle: 'Welcome, Admin', dashSub: 'Overview based strictly on real recorded data', refresh: 'Refresh',
      totalReq: 'Total Requests', uniqQ: 'Unique Questions', leadsLbl: 'Contact Leads',
      tokIn: 'Input Tokens', tokOut: 'Output Tokens', tokCache: 'Cached / Saved Tokens', tokTotal: 'Total Token Usage',
      reqTrend: 'Real Requests Trend', tokTrend: 'Token Usage Trend (Input / Output / Cached)', srcBreakdown: 'Answer Sources',
      topQ: 'Top Questions', viewAll: 'View All', empty: 'No data to display.',
      tabQuestions: 'Top Questions', tabLeads: 'Contact Leads', exportCsv: 'Export CSV',
      searchQ: 'Search questions...', filterAll: 'All Sources', filterOk: 'Knowledge / Memory', filterErr: 'With Errors', filterNoInfo: 'No Info',
      sortFreqDesc: 'Order: Most Frequent', sortFreqAsc: 'Order: Least Frequent', sortNew: 'Order: Newest', sortOld: 'Order: Oldest', sortSource: 'Order: By Source',
      colQuestion: 'Question', colCount: 'Count', colSource: 'Main Source', colLast: 'Last Asked',
      colName: 'Name', colPhone: 'Phone', colTopic: 'Topic', colTime: 'Created At',
      tokTitle: 'Token Usage', tokSub: 'Real breakdown of input, output, and cached tokens by day and model',
      colProv: 'Provider', colModel: 'Model', colCalls: 'Calls', colLatency: 'Avg Latency',
      knowTitle: 'Knowledge Base', knowSubDb: 'Direct MySQL storage with automatic Upstash Vector sync', knowSubRo: 'Read-only view (set NOOKA_DB_URL to enable editing)',
      addKnow: '+ Add Knowledge', searchKnow: 'Search title, ID, or content...',
      colId: 'ID', colTitle: 'Title', colCat: 'Category', colKeywords: 'Keywords', colActions: 'Actions',
      btnFull: 'Full Text', btnEdit: 'Edit', btnDelete: 'Delete', btnClose: 'Close', btnCancel: 'Cancel', btnSave: 'Save',
      adminsTitle: 'Admins & Permissions', adminsSub: 'Manage database admin accounts; new accounts can log in immediately.', addAdmin: '+ Add Admin',
      colEmail: 'Email', colRole: 'Role', colStatus: 'Status', colPerms: 'Access', active: 'Active', inactive: 'Disabled', protected: 'Protected',
      auditTitle: 'Audit Logs', auditSub: 'Separated into Auth Events and Knowledge/File Changes',
      auditTabAuth: 'Logins, Logouts & Failed Attempts', auditTabFiles: 'Knowledge & File Changes',
      colActor: 'Admin Name', colAction: 'Event', colOutcome: 'Outcome', colTarget: 'Target / ID', colIp: 'IP Hash',
      settingsTitle: 'Settings & Database Health', settingsSub: 'Live status of MySQL, Redis, and Vector connections',
      changePw: 'Change My Password', connected: 'Connected', notConfigured: 'Not Configured', configuredUnchecked: 'Configured', connError: 'Connection Error',
      prev: 'Prev', next: 'Next', pageOf: 'Page', of: 'of', items: 'items', groups: 'groups',
    },
    ar: {
      dir: 'rtl', locale: 'ar-EG',
      ribbon: 'لوحة إدارة نوكا · البيانات التشغيلية الحقيقية',
      brand: 'نوكا', brandSub: 'مركز الإدارة', workspace: 'جامعة خوراسكان', workspaceSub: 'مساحة الإدارة',
      navMain: 'الإدارة', navSec: 'الصلاحيات والأمان', live: 'مباشر', logout: 'خروج',
      footerMid: 'واجهة إدارة نوكا', footerEnd: 'عرض البيانات المسجلة فقط',
      loginTitle: 'تسجيل الدخول للوحة الإدارة', loginSub: 'سجّل الدخول بحساب المدير للمتابعة.',
      loginEmail: 'البريد الإلكتروني أو اسم المستخدم', loginPass: 'كلمة المرور', loginPassPh: 'أدخل كلمة المرور',
      loginSubmit: 'دخول', loginChecking: 'جاري التحقق…',
      authInfoTitle: 'دخول آمن حسب الصلاحيات', authInfoBody: 'يتم التحقق من صلاحياتك على الخادم. للمدير العام صلاحية كاملة وللمشرفين صلاحيات محددة.',
      loginDisc: 'يتم التحقق من البيانات على الخادم وتُحفظ الجلسة بكوكيز آمنة.',
      views: { dashboard: 'لوحة التحكم', requests: 'الطلبات والمحادثات', tokens: 'استهلاك التوكن', knowledge: 'إدارة المعرفة', admins: 'المديرون والصلاحيات', audit: 'سجل النشاطات', settings: 'الإعدادات' },
      cats: { all: 'الكل', general: 'معلومات عامة', faculty: 'الكليات', major: 'التخصصات', list: 'القوائم', faq: 'الأسئلة الشائعة' },
      roles: { admin: 'مدير عام', knowledge_editor: 'محرر المعرفة', counselor: 'مستشار', read_only: 'قراءة فقط' },
      sources: { faq: 'إجابة جاهزة (FAQ)', knowledge: 'قاعدة المعرفة', vector: 'البحث الدلالي', memory: 'ذاكرة الكاش', general: 'معرفة النموذج', no_info: 'لا توجد معلومات', off_topic: 'خارج النطاق', error: 'خطأ', smalltalk: 'تحية', web: 'ويب' },
      dashTitle: 'مرحباً بك في لوحة نوكا', dashSub: 'ملخص مبني على البيانات الحقيقية المسجلة فقط', refresh: 'تحديث',
      totalReq: 'إجمالي الطلبات', uniqQ: 'الأسئلة الفريدة', leadsLbl: 'طلبات الاتصال',
      tokIn: 'توكن الإدخال', tokOut: 'توكن الإخراج', tokCache: 'توكن مخزّن مؤقتاً', tokTotal: 'إجمالي التوكن',
      reqTrend: 'مسار الطلبات الحقيقية', tokTrend: 'مسار استهلاك التوكن (إدخال / إخراج / كاش)', srcBreakdown: 'مصادر الإجابات',
      topQ: 'أكثر الأسئلة تكراراً', viewAll: 'عرض الكل', empty: 'لا توجد بيانات للعرض.',
      tabQuestions: 'الأسئلة المتكررة', tabLeads: 'طلبات الاتصال', exportCsv: 'تصدير CSV',
      searchQ: 'ابحث في الأسئلة...', filterAll: 'كل المصادر', filterOk: 'من المعرفة/الذاكرة', filterErr: 'تحتوي أخطاء', filterNoInfo: 'بدون معلومات',
      sortFreqDesc: 'الترتيب: الأكثر تكراراً', sortFreqAsc: 'الترتيب: الأقل تكراراً', sortNew: 'الترتيب: الأحدث', sortOld: 'الترتيب: الأقدم', sortSource: 'الترتيب: حسب المصدر',
      colQuestion: 'السؤال', colCount: 'العدد', colSource: 'المصدر الرئيسي', colLast: 'آخر تسجيل',
      colName: 'الاسم', colPhone: 'رقم الهاتف', colTopic: 'الموضوع', colTime: 'الوقت',
      tokTitle: 'استهلاك التوكن', tokSub: 'تفصيل حقيقي لتوكن الإدخال والإخراج والكاش حسب اليوم والنموذج',
      colProv: 'المزوّد', colModel: 'النموذج', colCalls: 'عدد الطلبات', colLatency: 'متوسط التأخير',
      knowTitle: 'إدارة قاعدة المعرفة', knowSubDb: 'تخزين مباشر في MySQL مع مزامنة تلقائية مع Upstash Vector', knowSubRo: 'عرض للقراءة فقط',
      addKnow: '＋ إضافة معرفة جديدة', searchKnow: 'ابحث بالعنوان أو المعرف أو النص...',
      colId: 'المعرف', colTitle: 'العنوان', colCat: 'الفئة', colKeywords: 'الكلمات المفتاحية', colActions: 'إجراءات',
      btnFull: 'النص الكامل', btnEdit: 'تعديل', btnDelete: 'حذف', btnClose: 'إغلاق', btnCancel: 'إلغاء', btnSave: 'حفظ',
      adminsTitle: 'المديرون والصلاحيات', adminsSub: 'إدارة حسابات المديرين في قاعدة البيانات.', addAdmin: '＋ إضافة مدير',
      colEmail: 'البريد الإلكتروني', colRole: 'الدور', colStatus: 'الحالة', colPerms: 'الصلاحيات', active: 'نشط', inactive: 'معطّل', protected: 'محمي',
      auditTitle: 'سجل النشاطات', auditSub: 'مقسّم إلى قسم الدخول/الخروج وقسم تعديلات المعرفة والملفات',
      auditTabAuth: 'الدخول والخروج والمحاولات الفاشلة', auditTabFiles: 'تعديلات المعرفة والملفات',
      colActor: 'اسم المدير', colAction: 'الحدث', colOutcome: 'النتيجة', colTarget: 'الهدف / المعرف', colIp: 'بصمة IP',
      settingsTitle: 'الإعدادات وحالة قاعدة البيانات', settingsSub: 'فحص مباشر لاتصال MySQL و Redis و Vector',
      changePw: 'تغيير كلمة المرور', connected: 'متصل', notConfigured: 'غير مُعدّ', configuredUnchecked: 'مُعدّ', connError: 'خطأ اتصال',
      prev: 'السابق', next: 'التالي', pageOf: 'صفحة', of: 'من', items: 'عنصر', groups: 'مجموعة',
    },
  };

  var savedLang = 'fa';
  try { var sl = localStorage.getItem('nooka_admin_lang'); if (I18N[sl]) savedLang = sl; } catch (_) {}

  var state = {
    lang: savedLang,
    view: 'dashboard',
    requestTab: 'questions',
    requestFilter: 'all',
    requestSort: 'count_desc',
    leadsSort: 'date_desc',
    requestSearch: '',
    requestPage: 1,
    leadsPage: 1,
    knowledgeType: 'all',
    knowledgeSearch: '',
    knowledgePage: 1,
    auditTab: 'auth',
    auditPage: 1,
    currentAdmin: null,
    data: null,
    loading: false,
    lastFocus: null,
  };

  var L = function () { return I18N[state.lang] || I18N.fa; };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  var fmt = function (n) { return Number(n || 0).toLocaleString(L().locale); };

  // تاریخ شمسی واقعی برای فارسی (بدون تقویم قمری!) و میلادی برای انگلیسی/عربی
  function fmtDate(val, withTime) {
    if (!val) return '—';
    var d = typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)
      ? new Date(val + 'T12:00:00Z')
      : new Date(val);
    if (isNaN(d.getTime())) return String(val);
    try {
      var locale = state.lang === 'fa' ? 'fa-IR-u-ca-persian' : (state.lang === 'ar' ? 'ar-EG-u-ca-gregory' : 'en-GB');
      var opts = withTime
        ? { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
        : { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' };
      return new Intl.DateTimeFormat(locale, opts).format(d);
    } catch (_) {
      return String(val);
    }
  }

  function fmtShortDay(ymd) {
    if (!ymd) return '';
    var d = new Date(ymd + 'T12:00:00Z');
    if (isNaN(d.getTime())) return String(ymd).slice(5);
    try {
      var locale = state.lang === 'fa' ? 'fa-IR-u-ca-persian' : (state.lang === 'ar' ? 'ar-EG-u-ca-gregory' : 'en-US');
      return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Tehran', month: '2-digit', day: '2-digit' }).format(d);
    } catch (_) { return String(ymd).slice(5); }
  }

  var EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function pwWrap(id, extraAttrs) {
    return '<div class="pw-wrap"><input class="input-control" id="' + id + '" type="password" ' + (extraAttrs || '') + '>' +
      '<button class="pw-eye" type="button" data-toggle-pw="' + id + '" aria-label="Toggle password">' + EYE_OPEN + '</button></div>';
  }

  function applyLangStatic() {
    var t = L();
    document.documentElement.lang = state.lang;
    document.documentElement.dir = t.dir;
    $('#loginLangSelect').value = state.lang;
    $('#topLangSelect').value = state.lang;
    $('#ribbonText').textContent = t.ribbon;
    $('#loginBrandTitle').textContent = t.brand;
    $('#loginBrandSub').textContent = t.brandSub;
    $('#loginTitle').textContent = t.loginTitle;
    $('#loginSubtitle').textContent = t.loginSub;
    $('#loginEmailLabel').textContent = t.loginEmail;
    $('#loginPasswordLabel').textContent = t.loginPass;
    $('#loginPassword').placeholder = t.loginPassPh;
    $('#loginSubmitBtn').innerHTML = esc(t.loginSubmit) + ' <span>' + (t.dir === 'rtl' ? '←' : '→') + '</span>';
    $('#loginAuthInfoTitle').textContent = t.authInfoTitle;
    $('#loginAuthInfoBody').textContent = t.authInfoBody;
    $('#loginDisclaimer').textContent = t.loginDisc;
    $('#brandTitle').textContent = t.brand;
    $('#brandSub').textContent = t.brandSub;
    $('#workspaceTitle').textContent = t.workspace;
    $('#workspaceSub').textContent = t.workspaceSub;
    $('#navGroupMain').textContent = t.navMain;
    $('#navGroupSec').textContent = t.navSec;
    $('#crumbBrand').textContent = t.brand;
    $('#liveLabel').textContent = t.live;
    $('#logoutButton').textContent = t.logout;
    $('#footerMid').textContent = t.footerMid;
    $('#footerEnd').textContent = t.footerEnd;
    $$('[data-nav-label]').forEach(function (el) {
      var k = el.getAttribute('data-nav-label');
      if (t.views[k]) el.textContent = t.views[k];
    });
  }

  function setLang(lang) {
    if (!I18N[lang]) return;
    state.lang = lang;
    try { localStorage.setItem('nooka_admin_lang', lang); } catch (_) {}
    applyLangStatic();
    if (state.currentAdmin && state.data) render();
  }

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
      invalid_credentials: state.lang === 'en' ? 'Invalid username/email or password.' : (state.lang === 'ar' ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : 'ایمیل/نام کاربری یا رمز عبور صحیح نیست.'),
      admin_auth_not_configured: 'حساب مدیر اصلی در تنظیمات امن سرور تعریف نشده است.',
      session_store_unavailable: 'ذخیره‌سازی امن نشست در دسترس نیست. اتصال ذخیره‌ساز را بررسی کنید.',
      db_unavailable: 'اتصال دیتابیس مدیریت برقرار نیست.',
      rate_limited: state.lang === 'en' ? 'Too many login attempts. Try again later.' : 'تعداد تلاش‌های ورود زیاد بوده است. کمی بعد دوباره تلاش کنید.',
      origin_not_allowed: 'مبدأ درخواست تأیید نشد.',
    })[code] || (state.lang === 'en' ? 'Login failed. Check server connection.' : 'ورود انجام نشد. اتصال و تنظیمات سرور را بررسی کنید.');
  }

  function canView(view) { return !!state.currentAdmin && Array.isArray(state.currentAdmin.views) && state.currentAdmin.views.indexOf(view) >= 0; }
  function isSuperAdmin() { return !!state.currentAdmin && state.currentAdmin.key === 'super'; }
  function caps() { return (state.data && state.data.capabilities) || {}; }

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
    var closeBtn = opts.locked ? '' : '<button class="icon-button" type="button" data-close-modal aria-label="Close">×</button>';
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
    var t = L();
    var body =
      (forced ? '<div class="callout"><div>ⓘ</div><div><strong>تغییر رمز عبور الزامی است</strong><span>پیش از استفاده از پنل باید رمز اولیه خود را تغییر دهید (حداقل ۱۲ نویسه).</span></div></div>' : '') +
      '<div class="form-grid">' +
        '<div class="form-field full"><label for="pwCurrent">' + (state.lang === 'en' ? 'Current Password' : 'رمز عبور فعلی') + '</label>' + pwWrap('pwCurrent', 'autocomplete="current-password" required') + '</div>' +
        '<div class="form-field full"><label for="pwNext">' + (state.lang === 'en' ? 'New Password (min 12 chars)' : 'رمز عبور جدید (حداقل ۱۲ نویسه)') + '</label>' + pwWrap('pwNext', 'minlength="12" autocomplete="new-password" required') + '</div>' +
        '<div class="form-field full"><label for="pwConfirm">' + (state.lang === 'en' ? 'Confirm New Password' : 'تکرار رمز عبور جدید') + '</label>' + pwWrap('pwConfirm', 'minlength="12" autocomplete="new-password" required') + '</div>' +
      '</div>';
    var footer = (forced ? '' : '<button class="btn" type="button" data-close-modal>' + esc(t.btnCancel) + '</button>') +
      '<button class="btn btn-primary" type="button" id="pwChangeSave">' + esc(t.btnSave) + '</button>';
    openModal(t.changePw, body, footer, { locked: !!forced });
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
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
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
    } catch (_) { toast('ارتباط با سرور برقرار نشد.'); }
    finally { b.disabled = false; }
  }

  async function loginWithServer(email, password) {
    var b = $('#loginSubmitBtn');
    b.disabled = true;
    b.textContent = L().loginChecking;
    $('#loginError').hidden = true;
    try {
      var r = await fetch('/api/admin-auth', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
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
      applyLangStatic();
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
        }
      }
      applyAdmin();
      render();
    } catch (_) {
      $('#pageContent').innerHTML =
        '<div class="callout"><div>ⓘ</div><div><strong>داده‌ها بارگذاری نشدند</strong>' +
        '<span>اتصال دیتابیس و API مدیریتی را بررسی کنید.</span></div></div>';
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
  }

  async function logout() {
    var b = $('#logoutButton');
    b.disabled = true;
    try {
      var r = await fetch('/api/admin-auth', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      if (r.status === 401 || r.ok) { showLogin(); $('#loginPassword').value = ''; return; }
      toast('خروج از سرور تأیید نشد.');
    } catch (_) { toast('ارتباط با سرور برای خروج برقرار نشد.'); }
    finally { b.disabled = false; }
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
  function head(t, d, action) { return '<div class="page-heading"><div><h1>' + t + '</h1><p>' + d + '</p></div><div class="heading-actions">' + (action || '') + '</div></div>'; }
  function stat(label, value, note, sym, tone) {
    return '<article class="stat-card"><div class="stat-top"><span class="stat-label">' + label + '</span><span class="stat-icon ' + (tone || '') + '">' + sym + '</span></div><div class="stat-value">' + value + '</div><div class="stat-foot"><span>' + note + '</span></div></article>';
  }
  function empty(msg) { return '<div class="empty-state">' + esc(msg || L().empty) + '</div>'; }
  function report() { return (state.data && state.data.report) || null; }
  function questions() { var r = report(); return r && Array.isArray(r.questions) ? r.questions : []; }
  function leads() { return (state.data && Array.isArray(state.data.leads)) ? state.data.leads : []; }
  function srcLabel(code) { return (L().sources && L().sources[code]) || ((report() && report().labels) || {})[code] || code || '—'; }
  function catLabel(code) { return (L().cats && L().cats[code]) || code || '—'; }

  function paginate(list, page, kind) {
    var t = L();
    var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    var p = Math.min(Math.max(1, page), totalPages);
    var slice = list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    var pager = totalPages > 1
      ? '<div class="pager"><span>' + t.pageOf + ' ' + fmt(p) + ' ' + t.of + ' ' + fmt(totalPages) + ' (' + fmt(list.length) + ' ' + t.items + ')</span>' +
        '<div class="pager-actions">' +
          '<button class="btn btn-sm" type="button" data-page-kind="' + kind + '" data-page="' + (p - 1) + '" ' + (p <= 1 ? 'disabled' : '') + '>' + t.prev + '</button>' +
          '<button class="btn btn-sm" type="button" data-page-kind="' + kind + '" data-page="' + (p + 1) + '" ' + (p >= totalPages ? 'disabled' : '') + '>' + t.next + '</button>' +
        '</div></div>'
      : '';
    return { items: slice, pager: pager, page: p };
  }

  function tokenTrendHTML(days) {
    var t = L();
    var chart = (days || []).filter(function (x) { return x && x.total > 0; }).slice(0, 14).reverse();
    if (!chart.length) return empty();
    var max = Math.max.apply(null, chart.map(function (x) { return Math.max(x.input || 0, x.output || 0, x.cached || 0); }).concat([1]));
    var cols = chart.map(function (x) {
      var hIn = x.input ? Math.max(4, x.input / max * 100) : 0;
      var hOut = x.output ? Math.max(4, x.output / max * 100) : 0;
      var hCa = x.cached ? Math.max(4, x.cached / max * 100) : 0;
      var tip = fmtDate(x.date, false) + ' | ' + t.tokIn + ': ' + fmt(x.input) + ' | ' + t.tokOut + ': ' + fmt(x.output) + ' | ' + t.tokCache + ': ' + fmt(x.cached);
      return '<div class="chart-col" title="' + esc(tip) + '"><div class="bar-group">' +
        (hIn ? '<span class="bar in" style="height:' + hIn + '%"></span>' : '') +
        (hOut ? '<span class="bar out" style="height:' + hOut + '%"></span>' : '') +
        (hCa ? '<span class="bar cache" style="height:' + hCa + '%"></span>' : '') +
        '</div></div>';
    }).join('');
    var labels = chart.map(function (x) { return '<span>' + esc(fmtShortDay(x.date)) + '</span>'; }).join('');
    return '<div class="chart-legend">' +
        '<span><i style="background:var(--primary)"></i>' + t.tokIn + '</span>' +
        '<span><i style="background:var(--success)"></i>' + t.tokOut + '</span>' +
        '<span><i style="background:var(--warning)"></i>' + t.tokCache + '</span>' +
      '</div>' +
      '<div class="chart-area">' + cols + '</div>' +
      '<div class="chart-days">' + labels + '</div>';
  }

  function dashboard() {
    var t = L();
    var r = report();
    var s = (r && r.summary) || {};
    var tok = state.data.tokens || { input: 0, output: 0, cached: 0, used: 0, byDay: [] };
    var q = questions();
    var reqDays = ((r && r.byDay) || []).filter(function (x) { return x && Number(x.total) > 0; }).slice(0, 14).reverse();
    var maxReq = Math.max.apply(null, reqDays.map(function (x) { return Number(x.total) || 0; }).concat([1]));
    var reqBars = reqDays.map(function (x) {
      return '<div class="chart-col"><span class="bar" title="' + esc(fmtDate(x.date, false) + ': ' + fmt(x.total)) + '" style="height:' + Math.max(4, x.total / maxReq * 100) + '%"></span></div>';
    }).join('');
    var reqLabels = reqDays.map(function (x) { return '<span>' + esc(fmtShortDay(x.date)) + '</span>'; }).join('');

    var realSources = Object.keys(s.totals || {}).filter(function (k) { return Number(s.totals[k]) > 0; });

    return head(t.dashTitle, t.dashSub, '<button class="btn" type="button" data-action="refresh">' + icon('chart') + ' ' + t.refresh + '</button>') +
      '<div class="stats-grid">' +
        stat(t.totalReq, fmt(s.total), t.uniqQ + ': ' + fmt(s.distinctQuestions), icon('chart')) +
        stat(t.tokIn, fmt(tok.input), t.tokTotal + ': ' + fmt(tok.used), '↑') +
        stat(t.tokOut, fmt(tok.output), t.leadsLbl + ': ' + fmt(leads().length), '↓', 'green') +
        stat(t.tokCache, fmt(tok.cached), tok.source === 'mysql' ? 'MySQL' : 'KV', '⚡', 'orange') +
      '</div>' +
      '<div class="dashboard-grid">' +
        '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">' + t.reqTrend + '</h2></div></div>' +
          (reqBars ? '<div class="chart-area">' + reqBars + '</div><div class="chart-days">' + reqLabels + '</div>' : empty()) +
        '</section>' +
        '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">' + t.srcBreakdown + '</h2></div></div>' +
          (realSources.length
            ? realSources.map(function (k) { return '<div class="legend-row"><span>' + esc(srcLabel(k)) + '</span><b>' + fmt(s.totals[k]) + '</b></div>'; }).join('')
            : empty()) +
        '</section>' +
      '</div>' +
      '<section class="panel" style="margin-bottom:16px"><div class="panel-head"><div><h2 class="panel-title">' + t.tokTrend + '</h2></div><button class="btn btn-sm" type="button" data-view="tokens">' + t.viewAll + '</button></div>' +
        tokenTrendHTML(tok.byDay) +
      '</section>' +
      '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + t.topQ + '</h2><button class="btn btn-sm" type="button" data-view="requests">' + t.viewAll + '</button></div>' +
        questionTable(q.slice(0, 5)) +
      '</section>';
  }

  function questionTable(list) {
    var t = L();
    if (!list.length) return empty();
    return '<div class="table-wrap"><table><thead><tr><th>' + t.colQuestion + '</th><th>' + t.colCount + '</th><th>' + t.colSource + '</th><th>' + t.colLast + '</th></tr></thead><tbody>' +
      list.map(function (q) {
        return '<tr><td class="primary-cell">' + esc(q.question || '—') + '</td>' +
          '<td class="ltr">' + fmt(q.count) + '</td>' +
          '<td><span class="source-tag">' + esc(srcLabel(q.mainSource)) + '</span></td>' +
          '<td class="ltr">' + esc(fmtDate(q.lastAskedAt, true)) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function filteredQuestions() {
    var term = state.requestSearch.toLowerCase();
    var arr = questions().filter(function (q) {
      var src = q.sources || {};
      var matchFilter = state.requestFilter === 'all' ||
        (state.requestFilter === 'noinfo' ? (src.no_info || 0) > 0 :
          state.requestFilter === 'error' ? (src.error || 0) > 0 :
            ((src.faq || 0) + (src.memory || 0) + (src.knowledge || 0) + (src.vector || 0)) > 0);
      var matchSearch = !term || (q.question || '').toLowerCase().indexOf(term) >= 0;
      return matchFilter && matchSearch;
    }).slice();
    var srt = state.requestSort;
    arr.sort(function (a, b) {
      if (srt === 'count_asc') return (a.count || 0) - (b.count || 0);
      if (srt === 'date_desc') return new Date(b.lastAskedAt || 0) - new Date(a.lastAskedAt || 0);
      if (srt === 'date_asc') return new Date(a.lastAskedAt || 0) - new Date(b.lastAskedAt || 0);
      if (srt === 'source') return String(a.mainSource || '').localeCompare(String(b.mainSource || ''));
      return (b.count || 0) - (a.count || 0);
    });
    return arr;
  }

  function renderRequestsTablePart() {
    var list = filteredQuestions();
    var pg = paginate(list, state.requestPage, 'requests');
    state.requestPage = pg.page;
    var wrap = $('#requestsTableWrap');
    var cnt = $('#requestsCount');
    if (cnt) cnt.textContent = fmt(list.length) + ' ' + L().groups;
    if (wrap) wrap.innerHTML = questionTable(pg.items) + pg.pager;
  }

  function leadsTable(list) {
    var t = L();
    if (!list.length) return empty();
    var sorted = list.slice().sort(function (a, b) {
      var da = new Date(a.at || 0).getTime(), db = new Date(b.at || 0).getTime();
      return state.leadsSort === 'date_asc' ? da - db : db - da;
    });
    var pg = paginate(sorted, state.leadsPage, 'leads');
    state.leadsPage = pg.page;
    return '<div class="table-wrap"><table><thead><tr><th>' + t.colName + '</th><th>' + t.colPhone + '</th><th>' + t.colTopic + '</th><th>' + t.colTime + '</th></tr></thead><tbody>' +
      pg.items.map(function (l) {
        return '<tr><td class="primary-cell">' + esc(l.name || '—') + '</td>' +
          '<td class="ltr">' + esc(l.phone || '—') + '</td>' +
          '<td>' + esc(l.question || '—') + '</td>' +
          '<td class="ltr">' + esc(fmtDate(l.at, true)) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' + pg.pager;
  }

  function requestsView() {
    var t = L();
    var tabs = '<div class="sub-tabs">' +
      '<button class="sub-tab ' + (state.requestTab === 'questions' ? 'active' : '') + '" type="button" data-req-tab="questions">' + t.tabQuestions + ' (' + fmt(questions().length) + ')</button>' +
      '<button class="sub-tab ' + (state.requestTab === 'leads' ? 'active' : '') + '" type="button" data-req-tab="leads">' + t.tabLeads + ' (' + fmt(leads().length) + ')</button>' +
      '</div>';

    if (state.requestTab === 'leads') {
      return head(t.tabLeads, t.views.requests, '<button class="btn" type="button" data-action="export-leads">' + icon('download') + ' ' + t.exportCsv + '</button>') +
        tabs +
        '<div class="filters"><select class="select-control" id="leadsSort">' +
          '<option value="date_desc" ' + (state.leadsSort === 'date_desc' ? 'selected' : '') + '>' + t.sortNew + '</option>' +
          '<option value="date_asc" ' + (state.leadsSort === 'date_asc' ? 'selected' : '') + '>' + t.sortOld + '</option>' +
        '</select></div>' +
        '<section class="panel table-panel">' + leadsTable(leads()) + '</section>';
    }

    var list = filteredQuestions();
    var pg = paginate(list, state.requestPage, 'requests');
    state.requestPage = pg.page;
    return head(t.views.requests, t.tabQuestions, '<button class="btn" type="button" data-action="export-requests">' + icon('download') + ' ' + t.exportCsv + '</button>') +
      tabs +
      '<div class="filters">' +
        '<input class="search-control" id="requestSearch" placeholder="' + esc(t.searchQ) + '" value="' + esc(state.requestSearch) + '">' +
        '<select class="select-control" id="requestFilter">' +
          '<option value="all" ' + (state.requestFilter === 'all' ? 'selected' : '') + '>' + t.filterAll + '</option>' +
          '<option value="success" ' + (state.requestFilter === 'success' ? 'selected' : '') + '>' + t.filterOk + '</option>' +
          '<option value="error" ' + (state.requestFilter === 'error' ? 'selected' : '') + '>' + t.filterErr + '</option>' +
          '<option value="noinfo" ' + (state.requestFilter === 'noinfo' ? 'selected' : '') + '>' + t.filterNoInfo + '</option>' +
        '</select>' +
        '<select class="select-control" id="requestSort">' +
          '<option value="count_desc" ' + (state.requestSort === 'count_desc' ? 'selected' : '') + '>' + t.sortFreqDesc + '</option>' +
          '<option value="count_asc" ' + (state.requestSort === 'count_asc' ? 'selected' : '') + '>' + t.sortFreqAsc + '</option>' +
          '<option value="date_desc" ' + (state.requestSort === 'date_desc' ? 'selected' : '') + '>' + t.sortNew + '</option>' +
          '<option value="date_asc" ' + (state.requestSort === 'date_asc' ? 'selected' : '') + '>' + t.sortOld + '</option>' +
          '<option value="source" ' + (state.requestSort === 'source' ? 'selected' : '') + '>' + t.sortSource + '</option>' +
        '</select>' +
        '<span class="toolbar-note" id="requestsCount">' + fmt(list.length) + ' ' + t.groups + '</span>' +
      '</div>' +
      '<section class="panel table-panel" id="requestsTableWrap">' + questionTable(pg.items) + pg.pager + '</section>';
  }

  function tokensView() {
    var t = L();
    var tok = state.data.tokens || { input: 0, output: 0, cached: 0, used: 0, byDay: [], byProvider: [] };
    var provRows = tok.byProvider || [];
    return head(t.tokTitle, t.tokSub, '<button class="btn" type="button" data-action="refresh">' + icon('chart') + ' ' + t.refresh + '</button>') +
      '<div class="stats-grid">' +
        stat(t.tokIn, fmt(tok.input), 'Prompt Tokens', '↑') +
        stat(t.tokOut, fmt(tok.output), 'Completion Tokens', '↓', 'green') +
        stat(t.tokCache, fmt(tok.cached), 'FAQ / Memory / Cache', '⚡', 'orange') +
        stat(t.tokTotal, fmt(tok.used), tok.source === 'mysql' ? 'MySQL Telemetry' : 'KV Stats', '◉') +
      '</div>' +
      '<section class="panel" style="margin-bottom:16px"><div class="panel-head"><h2 class="panel-title">' + t.tokTrend + '</h2></div>' +
        tokenTrendHTML(tok.byDay) +
      '</section>' +
      '<section class="panel table-panel"><div class="panel-head"><h2 class="panel-title">' + t.colProv + ' / ' + t.colModel + '</h2></div>' +
        (provRows.length
          ? '<div class="table-wrap"><table><thead><tr><th>' + t.colProv + '</th><th>' + t.colModel + '</th><th>' + t.colCalls + '</th><th>' + t.tokIn + '</th><th>' + t.tokOut + '</th><th>' + t.tokCache + '</th><th>' + t.colLatency + '</th></tr></thead><tbody>' +
            provRows.map(function (p) {
              return '<tr><td><b>' + esc(p.provider) + '</b></td><td class="ltr">' + esc(p.model) + '</td><td class="ltr">' + fmt(p.calls) + '</td>' +
                '<td class="ltr">' + fmt(p.input) + '</td><td class="ltr">' + fmt(p.output) + '</td><td class="ltr">' + fmt(p.cached) + '</td>' +
                '<td class="ltr">' + fmt(p.avgLatencyMs) + ' ms</td></tr>';
            }).join('') + '</tbody></table></div>'
          : empty()) +
      '</section>';
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
    var t = L();
    if (!list.length) return empty();
    var pg = paginate(list, state.knowledgePage, 'knowledge');
    state.knowledgePage = pg.page;
    var editable = !!caps().knowledgeEdit;
    return '<div class="table-wrap"><table><thead><tr><th>' + t.colId + '</th><th>' + t.colTitle + '</th><th>' + t.colCat + '</th><th>' + t.colKeywords + '</th><th>' + t.colActions + '</th></tr></thead><tbody>' +
      pg.items.map(function (x) {
        return '<tr><td class="ltr muted">' + esc(x.id) + '</td>' +
          '<td class="primary-cell">' + esc(x.title) + '</td>' +
          '<td><span class="source-tag">' + esc(catLabel(x.type)) + '</span></td>' +
          '<td>' + esc((x.keywords || []).join('، ')) + '</td>' +
          '<td class="nowrap"><button class="btn btn-sm" type="button" data-knowledge-preview="' + esc(x.id) + '">' + t.btnFull + '</button>' +
            (editable ? ' <button class="btn btn-sm btn-soft" type="button" data-knowledge-edit="' + esc(x.id) + '">' + t.btnEdit + '</button>' : '') +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>' + pg.pager;
  }

  function renderKnowledgeTablePart() {
    var list = filteredKnowledge();
    var wrap = $('#knowledgeTableWrap');
    var cnt = $('#knowledgeCount');
    if (cnt) cnt.textContent = fmt(list.length) + ' ' + L().items;
    if (wrap) wrap.innerHTML = knowledgeTableHTML(list);
  }

  function knowledgeView() {
    var t = L();
    var k = (state.data.knowledge && state.data.knowledge.chunks) || [];
    var list = filteredKnowledge();
    var orderedTypes = ['general', 'faculty', 'major', 'list', 'faq'];
    var presentTypes = orderedTypes.filter(function (tp) { return k.some(function (x) { return x.type === tp; }); });
    var editable = !!caps().knowledgeEdit;
    return head(
      t.knowTitle,
      editable ? t.knowSubDb : t.knowSubRo,
      editable ? '<button class="btn btn-primary" type="button" data-action="add-knowledge">' + t.addKnow + '</button>' : ''
    ) +
      '<div class="stats-grid">' +
        stat(t.knowTitle, fmt(k.length), t.items, icon('book')) +
        stat(t.colCat, fmt(presentTypes.length), orderedTypes.map(catLabel).slice(0, 3).join(' · '), '▤', 'green') +
      '</div>' +
      '<div class="filters">' +
        '<input class="search-control" id="knowledgeSearch" placeholder="' + esc(t.searchKnow) + '" value="' + esc(state.knowledgeSearch) + '">' +
        '<span class="toolbar-note" id="knowledgeCount">' + fmt(list.length) + ' ' + t.items + '</span>' +
      '</div>' +
      '<div class="category-pills">' +
        '<button class="category-pill ' + (state.knowledgeType === 'all' ? 'active' : '') + '" type="button" data-knowledge-type="all">' + t.cats.all + ' (' + fmt(k.length) + ')</button>' +
        orderedTypes.map(function (tp) {
          var c = k.filter(function (x) { return x.type === tp; }).length;
          return '<button class="category-pill ' + (state.knowledgeType === tp ? 'active' : '') + '" type="button" data-knowledge-type="' + tp + '">' + esc(catLabel(tp)) + ' (' + fmt(c) + ')</button>';
        }).join('') +
      '</div>' +
      '<section class="panel table-panel" id="knowledgeTableWrap">' + knowledgeTableHTML(list) + '</section>';
  }

  async function openKnowledgeEditor(id) {
    var t = L();
    try {
      var ch = { id: '', type: 'general', title: '', text: '', keywords: [], answer: '' };
      if (id) {
        var r = await fetch('/api/admin-knowledge?id=' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' });
        if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) {
          var local = ((state.data.knowledge && state.data.knowledge.chunks) || []).find(function (x) { return x.id === id; });
          if (local) ch = local; else return toast('بارگذاری اطلاعات دانش انجام نشد.');
        } else {
          ch = j.chunk || ch;
        }
      }
      var isEdit = !!id;
      var body = '<div class="form-grid">' +
        '<div class="form-field"><label for="kTitle">' + t.colTitle + '</label><input class="input-control" id="kTitle" value="' + esc(ch.title || '') + '" required></div>' +
        '<div class="form-field"><label for="kType">' + t.colCat + '</label><select class="select-control" id="kType">' +
          ['general', 'faculty', 'major', 'list', 'faq'].map(function (tp) {
            return '<option value="' + tp + '" ' + (ch.type === tp ? 'selected' : '') + '>' + esc(catLabel(tp)) + '</option>';
          }).join('') +
        '</select></div>' +
        '<div class="form-field full"><label for="kKeywords">' + t.colKeywords + '</label><input class="input-control" id="kKeywords" value="' + esc((ch.keywords || []).join('، ')) + '"></div>' +
        '<div class="form-field full"><label for="kText">' + (ch.type === 'faq' ? 'پاسخ FAQ' : t.btnFull) + '</label><textarea class="textarea-control" id="kText">' + esc(ch.type === 'faq' ? (ch.answer || ch.text || '') : (ch.text || '')) + '</textarea></div>' +
      '</div>';
      openModal(
        isEdit ? (t.btnEdit + ': ' + ch.title) : t.addKnow,
        body,
        '<button class="btn" type="button" data-close-modal>' + t.btnCancel + '</button>' +
        '<button class="btn btn-primary" type="button" id="knowledgeSave" data-id="' + esc(id || '') + '">' + t.btnSave + '</button>'
      );
    } catch (_) { toast('ارتباط با سرور برقرار نشد.'); }
  }

  async function saveKnowledge() {
    var b = $('#knowledgeSave');
    var id = b.getAttribute('data-id');
    var type = $('#kType').value;
    var title = $('#kTitle').value.trim();
    var keywords = $('#kKeywords').value.trim();
    var bodyText = $('#kText').value.trim();
    if (!title || !bodyText) return toast('عنوان و متن دانش الزامی است.');
    var chunk = type === 'faq'
      ? { type: type, title: title, keywords: keywords, answer: bodyText }
      : { type: type, title: title, keywords: keywords, text: bodyText };
    b.disabled = true;
    try {
      var r = await fetch('/api/admin-knowledge', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { action: 'update', id: id, chunk: chunk } : { action: 'create', chunk: chunk }),
      });
      if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) return toast(j.error === 'duplicate_id' ? 'این شناسه تکراری است.' : 'ذخیره دانش در دیتابیس انجام نشد.');
      closeModal();
      toast('پایگاه دانش در دیتابیس ذخیره شد.');
      await loadData();
    } catch (_) { toast('ارتباط با سرور برقرار نشد.'); }
    finally { b.disabled = false; }
  }

  async function deleteKnowledge(id) {
    if (!window.confirm('این تکه دانش حذف (آرشیو) شود؟')) return;
    try {
      var r = await fetch('/api/admin-knowledge', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: id }),
      });
      if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
      if (!r.ok) return toast('حذف دانش انجام نشد.');
      closeModal();
      toast('تکه دانش حذف شد.');
      await loadData();
    } catch (_) { toast('ارتباط با سرور برقرار نشد.'); }
  }

  function adminsView() {
    var t = L();
    var a = state.data.admins || [];
    return head(t.adminsTitle, t.adminsSub, '<button class="btn btn-primary" type="button" data-action="add-admin">' + t.addAdmin + '</button>') +
      '<section class="panel table-panel">' +
        (a.length
          ? '<div class="table-wrap"><table><thead><tr><th>' + t.colName + '</th><th>' + t.colEmail + '</th><th>' + t.colRole + '</th><th>' + t.colStatus + '</th><th>' + t.colPerms + '</th><th>' + t.colActions + '</th></tr></thead><tbody>' +
            a.map(function (x) {
              return '<tr><td><b>' + esc(x.name) + '</b>' + (x.username ? '<div class="muted ltr" style="font-size:11px">@' + esc(x.username) + '</div>' : '') + '</td>' +
                '<td class="ltr">' + esc(x.email) + '</td>' +
                '<td>' + esc(x.role) + '</td>' +
                '<td>' + badge(x.active ? 'success' : 'warning', x.active ? t.active : t.inactive) + '</td>' +
                '<td>' + esc((x.views || []).map(function (v) { return t.views[v] || v; }).join('، ')) + '</td>' +
                '<td class="nowrap">' + (x.protected
                  ? '<span class="muted">' + t.protected + '</span>'
                  : '<button class="btn btn-sm" type="button" data-admin-edit="' + esc(x.email) + '">' + t.btnEdit + '</button> <button class="btn btn-sm btn-danger" type="button" data-admin-delete="' + esc(x.email) + '">' + t.btnDelete + '</button>') +
                '</td></tr>';
            }).join('') +
            '</tbody></table></div>'
          : empty()) +
      '</section>';
  }

  function adminForm(item) {
    var t = L();
    var edit = !!item;
    var dbMode = !!caps().dbMode;
    var views = ['dashboard', 'requests', 'tokens', 'knowledge', 'audit', 'settings'];
    var roleField = dbMode
      ? '<div class="form-field full"><label for="adminRole">' + t.colRole + '</label><select class="select-control" id="adminRole">' +
          ['admin', 'knowledge_editor', 'counselor', 'read_only'].map(function (rc) {
            return '<option value="' + rc + '" ' + ((item && item.roleCode || 'admin') === rc ? 'selected' : '') + '>' + esc(t.roles[rc]) + '</option>';
          }).join('') + '</select></div>'
      : '<div class="form-field full"><label>' + t.colPerms + '</label>' + views.map(function (v) {
          return '<label class="check-row"><input type="checkbox" name="adminView" value="' + v + '" ' + ((item && item.views || ['dashboard']).indexOf(v) >= 0 ? 'checked' : '') + '> ' + esc(t.views[v]) + '</label>';
        }).join('') + '</div>';

    var body = '<div class="form-grid">' +
      '<div class="form-field"><label for="adminName">' + t.colName + '</label><input class="input-control" id="adminName" value="' + esc(item && item.name || '') + '" required></div>' +
      '<div class="form-field"><label for="adminEmail">' + t.colEmail + '</label><input class="input-control" id="adminEmail" type="email" value="' + esc(item && item.email || '') + '" ' + (edit ? 'disabled' : '') + ' required></div>' +
      '<div class="form-field full"><label for="adminPassword">' + (edit ? 'رمز جدید (اختیاری)' : t.loginPass) + ' · حداقل ۱۲ نویسه</label>' + pwWrap('adminPassword', 'minlength="12" autocomplete="new-password" ' + (edit ? '' : 'required')) + '</div>' +
      roleField +
      (edit ? '<div class="form-field full"><label class="check-row"><input type="checkbox" id="adminActive" ' + (item.active ? 'checked' : '') + '> ' + t.active + '</label></div>' : '') +
      '</div>';

    openModal(
      edit ? t.btnEdit : t.addAdmin,
      body,
      '<button class="btn" type="button" data-close-modal>' + t.btnCancel + '</button>' +
      '<button class="btn btn-primary" type="button" id="adminSave" data-email="' + esc(item && item.email || '') + '" data-mode="' + (edit ? 'edit' : 'create') + '">' + t.btnSave + '</button>'
    );
  }

  async function saveAdmin() {
    var b = $('#adminSave');
    var mode = b.getAttribute('data-mode');
    var dbMode = !!caps().dbMode;
    var views = dbMode ? ['dashboard', 'requests', 'tokens', 'knowledge'] : $$('input[name="adminView"]:checked').map(function (x) { return x.value; });
    var payload = { name: $('#adminName').value.trim(), views: views };
    if (dbMode && $('#adminRole')) payload.roleCode = $('#adminRole').value;
    if (mode === 'create') {
      payload.email = $('#adminEmail').value.trim().toLowerCase();
      payload.password = $('#adminPassword').value;
    } else {
      payload.email = b.getAttribute('data-email');
      payload.password = $('#adminPassword').value;
      payload.active = $('#adminActive').checked;
    }
    if (!payload.name || (!dbMode && !views.length) || (mode === 'create' && (!payload.email || payload.password.length < 12)) || (payload.password && payload.password.length < 12)) {
      return toast('اطلاعات معتبر (و رمز حداقل ۱۲ نویسه) وارد کنید.');
    }
    b.disabled = true;
    try {
      var r = await fetch('/api/admin-users', {
        method: mode === 'create' ? 'POST' : 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        return toast(({
          email_exists: 'این ایمیل قبلاً ثبت شده است.',
          invalid_admin_data: 'اطلاعات ادمین معتبر نیست.',
          invalid_password: j.reason === 'contains_identity' ? 'رمز نباید شامل ایمیل یا نام کاربری باشد.' : 'رمز عبور معتبر نیست (حداقل ۱۲ نویسه).',
          invalid_email: 'ایمیل معتبر نیست.',
          admin_not_found: 'ادمین پیدا نشد.',
          store_unavailable: 'ذخیره‌ساز در دسترس نیست.',
        })[j.error] || 'ذخیره ادمین انجام نشد.');
      }
      closeModal();
      toast('ادمین با موفقیت در دیتابیس ذخیره شد.');
      await loadData();
    } catch (_) { toast('ارتباط با سرور برقرار نشد.'); }
    finally { b.disabled = false; }
  }

  function auditView() {
    var t = L();
    var authList = state.data.auditAuth || state.data.audit || [];
    var fileList = state.data.auditFiles || [];
    var activeList = state.auditTab === 'files' ? fileList : authList;
    var pg = paginate(activeList, state.auditPage, 'audit');
    state.auditPage = pg.page;

    var tabs = '<div class="sub-tabs">' +
      '<button class="sub-tab ' + (state.auditTab === 'auth' ? 'active' : '') + '" type="button" data-audit-tab="auth">' + t.auditTabAuth + ' (' + fmt(authList.length) + ')</button>' +
      '<button class="sub-tab ' + (state.auditTab === 'files' ? 'active' : '') + '" type="button" data-audit-tab="files">' + t.auditTabFiles + ' (' + fmt(fileList.length) + ')</button>' +
      '</div>';

    var table = activeList.length
      ? '<section class="panel table-panel"><div class="table-wrap"><table><thead><tr>' +
          '<th>' + t.colTime + '</th><th>' + t.colActor + '</th><th>' + t.colAction + '</th>' +
          (state.auditTab === 'files' ? '<th>' + t.colTarget + '</th>' : '<th>' + t.colOutcome + '</th>') +
          '<th>' + t.colIp + '</th></tr></thead><tbody>' +
          pg.items.map(function (x) {
            var actor = x.actorName || x.emailHash || '—';
            var subUser = x.actorUsername && x.actorUsername !== actor ? ' (' + x.actorUsername + ')' : '';
            var outBadge = x.outcome === 'failure' || x.outcome === 'denied'
              ? badge('danger', x.outcome)
              : badge('success', x.outcome || 'success');
            return '<tr>' +
              '<td class="ltr">' + esc(fmtDate(x.at, true)) + '</td>' +
              '<td><b>' + esc(actor) + '</b><span class="muted">' + esc(subUser) + '</span></td>' +
              '<td>' + esc(x.description || x.action) + ' <span class="muted ltr" style="font-size:11px">(' + esc(x.action) + ')</span></td>' +
              (state.auditTab === 'files'
                ? '<td class="ltr">' + esc(x.targetId || x.target || '—') + '</td>'
                : '<td>' + outBadge + '</td>') +
              '<td class="ltr muted">' + esc(x.ipHash || '—') + '</td></tr>';
          }).join('') +
        '</tbody></table></div>' + pg.pager + '</section>'
      : empty();

    return head(t.auditTitle, t.auditSub, '<button class="btn" type="button" data-action="export-audit">' + icon('download') + ' ' + t.exportCsv + '</button>') + tabs + table;
  }

  function settingsView() {
    var t = L();
    var h = state.data.health || {};
    function row(n, x) {
      var cls = 'warning', label = t.notConfigured;
      if (x && x.status === 'connected') {
        cls = 'success';
        label = t.connected + (x.latencyMs != null ? ' · ' + x.latencyMs + 'ms' : '') + (x.database ? ' (' + x.database + ')' : '');
      } else if (x && x.status === 'error') {
        cls = 'danger';
        label = t.connError + (x.error ? ': ' + x.error : '');
      } else if (x && x.configured) {
        cls = 'warning';
        label = t.configuredUnchecked;
      }
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)"><div style="flex:1"><b>' + n + '</b>' + (x && x.version ? '<div class="muted ltr" style="font-size:11px">MySQL ' + esc(x.version) + '</div>' : '') + '</div>' + badge(cls, label) + '</div>';
    }
    var pwBtn = caps().dbMode ? '<button class="btn btn-primary" type="button" data-action="change-password">' + t.changePw + '</button>' : '';
    return head(t.settingsTitle, t.settingsSub, pwBtn + ' <button class="btn" type="button" data-action="refresh">' + icon('chart') + ' ' + t.refresh + '</button>') +
      '<section class="panel">' + row('MySQL (Aiven / Main DB)', h.mysql) + row('Redis / Upstash', h.redis) + row('Upstash Vector', h.vector) + '</section>';
  }

  function render() {
    if (!state.currentAdmin) return showLogin();
    var t = L();
    if (!canView(state.view)) state.view = (state.currentAdmin.views && state.currentAdmin.views[0]) || 'dashboard';
    $('#breadcrumbTitle').textContent = t.views[state.view] || t.views.dashboard;
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
    var views = { dashboard: dashboard, requests: requestsView, tokens: tokensView, knowledge: knowledgeView, admins: adminsView, audit: auditView, settings: settingsView };
    $('#pageContent').innerHTML = (views[state.view] || dashboard)();
    $('#sidebar').classList.remove('open');
    $('#sidebarScrim').classList.remove('show');
  }

  function downloadCSV(type) {
    var rows = [];
    if (type === 'audit') {
      var list = state.auditTab === 'files' ? (state.data.auditFiles || []) : (state.data.auditAuth || state.data.audit || []);
      rows = [['زمان', 'نام ادمین', 'عملیات', 'نتیجه', 'هدف', 'IP']].concat(list.map(function (x) { return [fmtDate(x.at, true), x.actorName || x.emailHash, x.action, x.outcome, x.targetId || '', x.ipHash]; }));
    } else if (type === 'leads') {
      rows = [['نام', 'شماره تماس', 'موضوع', 'زمان']].concat(leads().map(function (x) { return [x.name, x.phone, x.question, fmtDate(x.at, true)]; }));
    } else {
      rows = [['پرسش', 'تعداد', 'منبع اصلی', 'آخرین ثبت']].concat(filteredQuestions().map(function (x) { return [x.question, x.count, srcLabel(x.mainSource), fmtDate(x.lastAskedAt, true)]; }));
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
    var pwBtn = e.target.closest('[data-toggle-pw]');
    if (pwBtn) {
      var inp = document.getElementById(pwBtn.getAttribute('data-toggle-pw'));
      if (inp) {
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        pwBtn.innerHTML = show ? EYE_OFF : EYE_OPEN;
      }
      return;
    }
    var v = e.target.closest('[data-view]');
    if (v) {
      var target = v.getAttribute('data-view');
      if (!canView(target)) return toast('مجوز مشاهده این بخش را ندارید.');
      state.view = target;
      render();
      return;
    }
    var reqTab = e.target.closest('[data-req-tab]');
    if (reqTab) { state.requestTab = reqTab.getAttribute('data-req-tab'); render(); return; }
    var audTab = e.target.closest('[data-audit-tab]');
    if (audTab) { state.auditTab = audTab.getAttribute('data-audit-tab'); state.auditPage = 1; render(); return; }

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
      if (!window.confirm('این حساب ادمین غیرفعال/حذف شود؟')) return;
      delAdmin.disabled = true;
      fetch('/api/admin-users', {
        method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      }).then(async function (r) {
        if (r.status === 401) return showLogin('نشست شما منقضی شده است؛ دوباره وارد شوید.');
        if (!r.ok) return toast('حذف ادمین انجام نشد.');
        toast('ادمین حذف/غیرفعال شد.');
        loadData();
      }).catch(function () { toast('ارتباط با سرور برقرار نشد.'); }).finally(function () { delAdmin.disabled = false; });
      return;
    }
    if (e.target.id === 'adminSave') { saveAdmin(); return; }
    if (e.target.id === 'knowledgeSave') { saveKnowledge(); return; }
    if (e.target.id === 'pwChangeSave') { submitPasswordChange(); return; }

    var kt = e.target.closest('[data-knowledge-type]');
    if (kt) { state.knowledgeType = kt.getAttribute('data-knowledge-type'); state.knowledgePage = 1; render(); return; }
    var ke = e.target.closest('[data-knowledge-edit]');
    if (ke) { openKnowledgeEditor(ke.getAttribute('data-knowledge-edit')); return; }
    var kd = e.target.closest('[data-knowledge-delete]');
    if (kd) { deleteKnowledge(kd.getAttribute('data-knowledge-delete')); return; }
    var kp = e.target.closest('[data-knowledge-preview]');
    if (kp) {
      var item = ((state.data.knowledge && state.data.knowledge.chunks) || []).find(function (x) { return x.id === kp.getAttribute('data-knowledge-preview'); });
      if (item) {
        var t = L();
        var editable = !!caps().knowledgeEdit;
        openModal(
          item.title,
          '<div class="detail-box"><span>' + t.colId + ' · ' + esc(catLabel(item.type)) + '</span><strong class="ltr">' + esc(item.id) + '</strong></div><div class="detail-text">' + esc(item.text) + '</div>',
          (editable ? '<button class="btn btn-danger" type="button" data-knowledge-delete="' + esc(item.id) + '">' + t.btnDelete + '</button><button class="btn btn-primary" type="button" data-knowledge-edit="' + esc(item.id) + '">' + t.btnEdit + '</button>' : '') +
          '<button class="btn" type="button" data-close-modal>' + t.btnClose + '</button>'
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
    if (e.target.id === 'requestSearch') { state.requestSearch = e.target.value; state.requestPage = 1; renderRequestsTablePart(); }
    if (e.target.id === 'knowledgeSearch') { state.knowledgeSearch = e.target.value; state.knowledgePage = 1; renderKnowledgeTablePart(); }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'requestFilter') { state.requestFilter = e.target.value; state.requestPage = 1; renderRequestsTablePart(); }
    if (e.target.id === 'requestSort') { state.requestSort = e.target.value; state.requestPage = 1; renderRequestsTablePart(); }
    if (e.target.id === 'leadsSort') { state.leadsSort = e.target.value; state.leadsPage = 1; render(); }
    if (e.target.id === 'loginLangSelect' || e.target.id === 'topLangSelect') { setLang(e.target.value); }
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

  applyLangStatic();
  restoreSession();
}());
