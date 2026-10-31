'use strict';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS + STATE
   ═══════════════════════════════════════════════════════════ */
const MAX_HISTORY=15, MAX_CTX=12, FETCH_TIMEOUT=65000, MAX_FILE_MB=10;
const DEFAULTS={lang:'fa',theme:'light',fontSize:15,sound:true,autoSendVoice:false};
const DIRS={fa:'rtl',ar:'rtl',en:'ltr'};
const LANG_CODES={fa:'fa-IR',ar:'ar-SA',en:'en-US'};
const LANG_DISPLAY={fa:'فارسی',ar:'العربية',en:'English'};

const I18N={
  fa:{
    'app.title':'سوپر همراه دانشجو','app.name':'سوپر همراه دانشجو',
    'sidebar.newChat':'مشاوره جدید','sidebar.search':'جستجو در مشاوره‌ها...',
    'sidebar.recent':'مشاوره‌های اخیر','sidebar.results':'نتایج جستجو',
    'sidebar.noChats':'هنوز مشاوره‌ای نیست','sidebar.noResults':'نتیجه‌ای یافت نشد',
    'sidebar.noArchived':'آرشیو خالی است','sidebar.guest':'کاربر مهمان',
    'sidebar.free':'مشاوره رایگان','sidebar.settings':'تنظیمات',
    'sidebar.support':'پشتیبانی','sidebar.about':'درباره ما',
    'sidebar.delete':'حذف','sidebar.archive':'آرشیو','sidebar.unarchive':'بازگردانی',
    'sidebar.tab.active':'مشاوره‌ها','sidebar.tab.archived':'آرشیو',
    'bottom.chats':'گفتگوها','bottom.archive':'آرشیو','bottom.settings':'تنظیمات','bottom.about':'درباره ما',
    'welcome.badge':'پاسخ فوری • ۲۴ ساعته • کاملاً رایگان','welcome.title':'سوپر همراه دانشجو',
    'welcome.desc':'سلام! من مشاور تحصیلی هوشمند شما هستم. در زمینه انتخاب رشته، برنامه‌ریزی درسی، انتخاب واحد و هر سوال تحصیلی دیگه‌ای کمکتون می‌کنم.',
    'welcome.hint':'یا فقط شروع کن به نوشتن...',
    'welcome.intent1':'انتخاب رشته','welcome.intent2':'برنامه‌ریزی درسی','welcome.intent3':'تغییر رشته',
    'welcome.q1.q':'درباره دانشگاه چه اطلاعاتی می‌تونید به من بدید؟',
    'welcome.q2.q':'برای انتخاب رشته دانشگاه چه نکاتی رو باید در نظر بگیرم؟',
    'welcome.q3.q':'شرایط و مراحل تغییر رشته در دانشگاه چیه؟',
    'input.placeholder':'سوال خود را بپرسید...','input.attach':'ارسال فایل','input.voice':'سوال صوتی',
    'typing.thinking':'دارم فکر می‌کنم...','typing.stage2':'یه لحظه صبر کن...','typing.stage3':'تقریباً تمومه...',
    'rec.recording':'در حال ضبط','rec.cancel':'لغو','rec.done':'پایان',
    'quick.short':'پاسخ سریع','quick.explain':'توضیح کامل','quick.examples':'با مثال','quick.steps':'مرحله‌به‌مرحله',
    'settings.title':'تنظیمات','settings.subtitle':'شخصی‌سازی تجربه',
    'settings.language':'زبان','settings.language.desc':'زبان رابط کاربری',
    'settings.theme':'حالت نمایش','settings.theme.desc':'تم رنگی برنامه',
    'settings.autoSend':'ارسال خودکار صوتی','settings.autoSend.desc':'پس از ضبط خودکار ارسال شود',
    'settings.font':'اندازه فونت','settings.font.desc':'اندازه متن برنامه',
    'settings.sound':'صدای اعلان','settings.sound.desc':'هنگام دریافت پاسخ',
    'settings.reset':'بازنشانی','settings.clearAll':'پاک‌کردن همهٔ گفتگوها','confirm.clearTitle':'پاک‌کردن همهٔ گفتگوها','confirm.clearMsg':'تمام گفتگوهای ذخیره‌شده روی این دستگاه برای همیشه حذف می‌شود.','confirm.clearOk':'بله، پاک کن','settings.close':'بستن','settings.save':'ذخیره و بستن',
    'font.xxs':'بسیار ریز','font.tiny':'ریز','font.small':'کوچک','font.medium':'متوسط',
    'font.large':'بزرگ','font.xlarge':'خیلی بزرگ','font.xxlarge':'بسیار بزرگ','font.huge':'عظیم',
    'confirm.cancel':'لغو','confirm.deleteTitle':'حذف مشاوره','confirm.deleteMsg':'آیا از حذف این گفتگو مطمئن هستید؟ این عمل قابل بازگشت نیست.','confirm.deleteOk':'بله، حذف کن',
    'confirm.archiveTitle':'انتقال به آرشیو','confirm.archiveMsg':'آیا از انتقال این مشاوره به آرشیو مطمئن هستید؟','confirm.archiveOk':'بله، آرشیو کن',
    'confirm.unarchiveTitle':'بازگردانی','confirm.unarchiveMsg':'آیا از بازگرداندن این مشاوره مطمئن هستید؟','confirm.unarchiveOk':'بله، بازگردان',
    'confirm.resetTitle':'بازگردانی به پیش‌فرض','confirm.resetMsg':'تمام تنظیمات به حالت اولیه برمی‌گردد. مشاوره‌ها حذف نمی‌شوند.','confirm.resetOk':'بله، بازنشانی کن',
    'file.title':'ارسال فایل','file.desc':'نوع فایل مورد نظر را انتخاب کنید','file.image':'تصویر','file.image.desc':'عکس، اسکرین‌شات، کارنامه','file.doc':'فایل و سند','file.doc.desc':'PDF، TXT، CSV','file.cancel':'انصراف',
    'msg.copy':'📋 کپی','msg.regen':'🔄 مجدد','msg.speak':'🔊 خوانش','msg.stopSpeak':'⏹ توقف','msg.share':'↗ اشتراک',
    'toast.copied':'متن کپی شد','toast.copyError':'خطا در کپی','toast.speakStop':'خوانش متوقف شد','toast.reading':'در حال خواندن...',
    'toast.thanks':'ممنون از بازخوردتون','toast.fileType':'فقط تصویر، PDF، TXT، MD و CSV پشتیبانی می‌شود','toast.feedback':'بازخورد ثبت شد','toast.newChat':'مشاوره جدید آغاز شد',
    'toast.chatDeleted':'مشاوره حذف شد','toast.chatArchived':'به آرشیو منتقل شد','toast.chatUnarchived':'از آرشیو بازگردانده شد',
    'toast.defaultsRestored':'تنظیمات بازنشانی شد','toast.historyTrimmed':'تاریخچه قدیمی حذف شد',
    'toast.fileReady':'فایل آماده ارسال است','toast.fileTooBig':'حجم نباید بیش از ۱۰ مگابایت باشد','toast.docTooBig':'حجم فایل متنی/PDF نباید بیش از ۲٫۵ مگابایت باشد','toast.fileReadError':'خطا در خواندن فایل',
    'toast.serverError':'خطا در ارتباط با سرور','toast.timeout':'زمان پاسخ به پایان رسید','toast.genStopped':'تولید پاسخ متوقف شد',
    'toast.recCancel':'ضبط لغو شد','toast.recTooShort':'صدا خیلی کوتاه بود','toast.recNothing':'چیزی تشخیص داده نشد',
    'toast.recAdded':'متن اضافه شد','toast.recError':'خطا در تبدیل صدا','toast.processingVoice':'پردازش صدا...',
    'toast.micDenied':'دسترسی به میکروفون رد شد','toast.httpsNeeded':'برای ضبط صدا HTTPS نیاز است',
    'toast.noSupport':'مرورگر ضبط صدا را پشتیبانی نمی‌کند','toast.noVoiceEngine':'امکان ضبط وجود ندارد',
    'toast.srFallback':'حالت سرور فعال شد','toast.srNoSpeech':'چیزی شنیده نشد','toast.srError':'خطا در تشخیص صدا',
    'toast.voiceNotInstalled':'صدای این زبان نصب نیست','toast.voiceFallbackArabic':'از صدای عربی استفاده می‌شود',
    'toast.ttsNotSupported':'خوانش متن پشتیبانی نمی‌شود','toast.transcribing':'تبدیل گفتار به متن...',
    'toast.shareCopied':'متن برای اشتراک کپی شد','toast.serverModeActive':'حالت سرور فعال شد',
    'toast.startRecFailed':'شروع ضبط ناموفق','toast.setupRecFailed':'راه‌اندازی ضبط ناموفق','toast.recNotSupported':'ضبط پشتیبانی نمی‌شود',
    'toast.storageFull':'حافظه پر شد','toast.leaveConfirm':'مطمئنید؟ پاسخ در حال تولید است',
    'error.serverGeneric':'مشکلی پیش آمد','error.tryAgain':'دوباره تلاش کنید.','error.timeout':'سرور پاسخ نداد.',
    'lead.cta':'📞 مشاور با من تماس بگیرد','lead.hint':'شماره‌تان را بگذارید تا همکاران مرکز هدایت تحصیلی با شما تماس بگیرند.',
    'lead.phone':'شماره موبایل (مثلاً ۰۹۱۲...)','lead.name':'نام (اختیاری)','lead.major':'رشتهٔ مورد علاقه (اختیاری)',
    'lead.consent':'موافقم مرکز هدایت تحصیلی با این شماره با من تماس بگیرد.','lead.send':'ثبت درخواست','lead.cancel':'انصراف',
    'lead.needConsent':'لطفاً گزینهٔ موافقت با تماس را تیک بزنید','lead.done':'درخواست شما ثبت شد؛ به‌زودی با شما تماس می‌گیریم.',
    'lang.title':'انتخاب زبان','lang.subtitle':'زبان مورد نظر',
    'support.title':'پشتیبانی','support.subtitle':'در خدمت شما','support.chat':'گفتگوی آنلاین','support.chat.desc':'پاسخ سریع در ساعات کاری','support.email':'ایمیل','support.phone':'تلفن',
    'about.title':'درباره ما','about.subtitle':'با ما آشنا شوید','about.version':'نسخه',
    'about.desc':'سوپر همراه دانشجو یک دستیار هوشمند تحصیلی است که با هدف کمک به دانشجویان در مسیر تحصیلی طراحی شده. از انتخاب رشته تا برنامه‌ریزی درسی، ما کنار شما هستیم.',
  },
  ar:{
    'app.title':'المستشار الخارق','app.name':'المستشار الخارق',
    'sidebar.newChat':'استشارة جديدة','sidebar.search':'البحث...','sidebar.recent':'الأخيرة','sidebar.results':'النتائج',
    'sidebar.noChats':'لا توجد استشارات','sidebar.noResults':'لا نتائج','sidebar.noArchived':'الأرشيف فارغ','sidebar.guest':'طالب زائر',
    'sidebar.free':'مجاني','sidebar.settings':'الإعدادات','sidebar.support':'الدعم','sidebar.about':'من نحن','sidebar.delete':'حذف','sidebar.archive':'أرشفة','sidebar.unarchive':'استعادة',
    'sidebar.tab.active':'الاستشارات','sidebar.tab.archived':'الأرشيف','bottom.chats':'الاستشارات','bottom.archive':'الأرشيف','bottom.settings':'الإعدادات','bottom.about':'من نحن',
    'welcome.badge':'رد فوري • 24/7 • مجاني','welcome.title':'المستشار الخارق',
    'welcome.desc':'مرحباً! أنا مستشارك الأكاديمي الذكي. يمكنني مساعدتك في اختيار التخصص، التخطيط الدراسي، وأي سؤال أكاديمي.',
    'welcome.hint':'أو ابدأ الكتابة فحسب...','welcome.intent1':'اختيار التخصص','welcome.intent2':'التخطيط الدراسي','welcome.intent3':'تغيير التخصص',
    'welcome.q1.q':'ما المعلومات عن الجامعة؟','welcome.q2.q':'ما النقاط عند اختيار التخصص؟','welcome.q3.q':'ما شروط تغيير التخصص؟',
    'input.placeholder':'اكتب سؤالك...','input.attach':'ملف','input.voice':'صوت','typing.thinking':'أفكر...','typing.stage2':'لحظة...','typing.stage3':'قريباً...',
    'rec.recording':'جارٍ التسجيل','rec.cancel':'إلغاء','rec.done':'إنهاء','quick.short':'رد سريع','quick.explain':'شرح كامل','quick.examples':'مع أمثلة','quick.steps':'خطوة بخطوة',
    'settings.title':'الإعدادات','settings.subtitle':'تخصيص التجربة','settings.language':'اللغة','settings.language.desc':'لغة الواجهة','settings.theme':'العرض','settings.theme.desc':'نمط الألوان',
    'settings.autoSend':'إرسال تلقائي','settings.autoSend.desc':'بعد التسجيل','settings.font':'حجم الخط','settings.font.desc':'حجم النص','settings.sound':'الصوت','settings.sound.desc':'عند الرد','settings.reset':'إعادة','settings.clearAll':'مسح كل المحادثات','confirm.clearTitle':'مسح كل المحادثات','confirm.clearMsg':'سيتم حذف جميع المحادثات المحفوظة على هذا الجهاز نهائياً.','confirm.clearOk':'نعم، امسح','settings.close':'إغلاق','settings.save':'حفظ',
    'font.xxs':'دقيق جداً','font.tiny':'دقيق','font.small':'صغير','font.medium':'متوسط','font.large':'كبير','font.xlarge':'كبير جداً','font.xxlarge':'ضخم','font.huge':'عظيم',
    'confirm.cancel':'إلغاء','confirm.deleteTitle':'حذف','confirm.deleteMsg':'حذف المحادثة؟','confirm.deleteOk':'نعم احذف',
    'confirm.archiveTitle':'أرشفة','confirm.archiveMsg':'نقل للأرشيف؟','confirm.archiveOk':'نعم','confirm.unarchiveTitle':'استعادة','confirm.unarchiveMsg':'استعادة؟','confirm.unarchiveOk':'نعم',
    'confirm.resetTitle':'استعادة الإعدادات','confirm.resetMsg':'إعادة كل الإعدادات؟','confirm.resetOk':'نعم',
    'file.title':'إرسال ملف','file.desc':'اختر النوع','file.image':'صورة','file.image.desc':'صورة، لقطة','file.doc':'مستند','file.doc.desc':'PDF، TXT، CSV','file.cancel':'إلغاء',
    'msg.copy':'📋 نسخ','msg.regen':'🔄 إعادة','msg.speak':'🔊 قراءة','msg.stopSpeak':'⏹ إيقاف','msg.share':'↗ مشاركة',
    'toast.copied':'تم النسخ','toast.copyError':'فشل','toast.speakStop':'توقف','toast.reading':'قراءة...','toast.thanks':'شكراً','toast.fileType':'الصور وPDF وTXT وMD وCSV فقط','toast.feedback':'تم',
    'toast.newChat':'بدأت','toast.chatDeleted':'تم الحذف','toast.chatArchived':'تم النقل','toast.chatUnarchived':'تمت الاستعادة',
    'toast.defaultsRestored':'تم','toast.historyTrimmed':'حُذف','toast.fileReady':'جاهز','toast.fileTooBig':'الحد 10م','toast.docTooBig':'الحد الأقصى للملف 2.5 م.ب','toast.fileReadError':'خطأ',
    'toast.serverError':'خطأ','toast.timeout':'انتهت المهلة','toast.genStopped':'توقف','toast.recCancel':'أُلغي','toast.recTooShort':'قصير','toast.recNothing':'لا شيء',
    'toast.recAdded':'تم','toast.recError':'خطأ','toast.processingVoice':'معالجة...','toast.micDenied':'مرفوض','toast.httpsNeeded':'HTTPS مطلوب',
    'toast.noSupport':'غير مدعوم','toast.noVoiceEngine':'لا محرك','toast.srFallback':'وضع خادم','toast.srNoSpeech':'لا صوت','toast.srError':'خطأ',
    'toast.voiceNotInstalled':'غير مثبت','toast.voiceFallbackArabic':'صوت عربي','toast.ttsNotSupported':'غير مدعوم','toast.transcribing':'تحويل...',
    'toast.shareCopied':'تم','toast.serverModeActive':'خادم','toast.startRecFailed':'فشل','toast.setupRecFailed':'فشل','toast.recNotSupported':'غير مدعوم',
    'toast.storageFull':'ممتلئ','toast.leaveConfirm':'مطمئن؟','error.serverGeneric':'خطأ','error.tryAgain':'حاول مجدداً','error.timeout':'لا استجابة',
    'lead.cta':'📞 اطلب اتصال مستشار','lead.hint':'اترك رقمك وسيتصل بك مركز الإرشاد الأكاديمي.','lead.phone':'رقم الهاتف','lead.name':'الاسم (اختياري)',
    'lead.major':'التخصص المطلوب (اختياري)','lead.consent':'أوافق على أن يتصل بي المركز على هذا الرقم.','lead.send':'إرسال','lead.cancel':'إلغاء',
    'lead.needConsent':'يرجى الموافقة على الاتصال','lead.done':'تم تسجيل طلبك وسنتصل بك قريباً.',
    'lang.title':'اللغة','lang.subtitle':'اختر','support.title':'الدعم','support.subtitle':'في خدمتك','support.chat':'محادثة','support.chat.desc':'رد سريع','support.email':'البريد','support.phone':'الهاتف',
    'about.title':'من نحن','about.subtitle':'تعرف','about.version':'الإصدار','about.desc':'المستشار الخارق مساعد أكاديمي ذكي.',
  },
  en:{
    'app.title':'Super Advisor','app.name':'Super Advisor',
    'sidebar.newChat':'New Consultation','sidebar.search':'Search...','sidebar.recent':'Recent','sidebar.results':'Results',
    'sidebar.noChats':'No consultations yet','sidebar.noResults':'No results','sidebar.noArchived':'Archive empty','sidebar.guest':'Guest Student',
    'sidebar.free':'Free consultation','sidebar.settings':'Settings','sidebar.support':'Support','sidebar.about':'About','sidebar.delete':'Delete','sidebar.archive':'Archive','sidebar.unarchive':'Restore',
    'sidebar.tab.active':'Consultations','sidebar.tab.archived':'Archive','bottom.chats':'Chats','bottom.archive':'Archive','bottom.settings':'Settings','bottom.about':'About',
    'welcome.badge':'Instant • 24/7 • Free','welcome.title':'Super Advisor',
    'welcome.desc':"Hi! I'm your smart academic advisor. I can help with choosing a major, study planning, course registration, and any other academic question.",
    'welcome.hint':'Or just start typing...','welcome.intent1':'Choose a major','welcome.intent2':'Study planning','welcome.intent3':'Change major',
    'welcome.q1.q':'What info about the university?','welcome.q2.q':'What to consider when choosing a major?','welcome.q3.q':'How to change my major?',
    'input.placeholder':'Ask your question...','input.attach':'Attach','input.voice':'Voice','typing.thinking':'Thinking...','typing.stage2':'Moment...','typing.stage3':'Almost done...',
    'rec.recording':'Recording','rec.cancel':'Cancel','rec.done':'Done','quick.short':'Quick','quick.explain':'Full','quick.examples':'Examples','quick.steps':'Step by step',
    'settings.title':'Settings','settings.subtitle':'Personalize','settings.language':'Language','settings.language.desc':'Interface language','settings.theme':'Display','settings.theme.desc':'Color theme',
    'settings.autoSend':'Auto-send voice','settings.autoSend.desc':'After recording','settings.font':'Font size','settings.font.desc':'Text size','settings.sound':'Sound','settings.sound.desc':'On reply','settings.reset':'Reset','settings.clearAll':'Clear all chats','confirm.clearTitle':'Clear all chats','confirm.clearMsg':'All chats saved on this device will be permanently deleted.','confirm.clearOk':'Yes, clear','settings.close':'Close','settings.save':'Save',
    'font.xxs':'Very Tiny','font.tiny':'Tiny','font.small':'Small','font.medium':'Medium','font.large':'Large','font.xlarge':'Very Large','font.xxlarge':'Extra Large','font.huge':'Huge',
    'confirm.cancel':'Cancel','confirm.deleteTitle':'Delete','confirm.deleteMsg':'Delete this conversation?','confirm.deleteOk':'Yes Delete',
    'confirm.archiveTitle':'Archive','confirm.archiveMsg':'Move to archive?','confirm.archiveOk':'Yes','confirm.unarchiveTitle':'Restore','confirm.unarchiveMsg':'Restore?','confirm.unarchiveOk':'Yes',
    'confirm.resetTitle':'Restore Defaults','confirm.resetMsg':'Reset all settings?','confirm.resetOk':'Yes',
    'file.title':'Send file','file.desc':'Choose type','file.image':'Image','file.image.desc':'Photo, screenshot','file.doc':'Document','file.doc.desc':'PDF, TXT, CSV','file.cancel':'Cancel',
    'msg.copy':'📋 Copy','msg.regen':'🔄 Retry','msg.speak':'🔊 Read','msg.stopSpeak':'⏹ Stop','msg.share':'↗ Share',
    'toast.copied':'Copied','toast.copyError':'Failed','toast.speakStop':'Stopped','toast.reading':'Reading...','toast.thanks':'Thanks','toast.fileType':'Only images, PDF, TXT, MD and CSV are supported','toast.feedback':'Recorded',
    'toast.newChat':'Started','toast.chatDeleted':'Deleted','toast.chatArchived':'Archived','toast.chatUnarchived':'Restored',
    'toast.defaultsRestored':'Done','toast.historyTrimmed':'Trimmed','toast.fileReady':'Ready','toast.fileTooBig':'Max 10MB','toast.docTooBig':'PDF/text files must be under 2.5MB','toast.fileReadError':'Error',
    'toast.serverError':'Server error','toast.timeout':'Timeout','toast.genStopped':'Stopped','toast.recCancel':'Cancelled','toast.recTooShort':'Too short','toast.recNothing':'Nothing',
    'toast.recAdded':'Added','toast.recError':'Error','toast.processingVoice':'Processing...','toast.micDenied':'Denied','toast.httpsNeeded':'HTTPS required',
    'toast.noSupport':'Unsupported','toast.noVoiceEngine':'No engine','toast.srFallback':'Server mode','toast.srNoSpeech':'No speech','toast.srError':'Error',
    'toast.voiceNotInstalled':'Not installed','toast.voiceFallbackArabic':'Arabic voice','toast.ttsNotSupported':'Unsupported','toast.transcribing':'Transcribing...',
    'toast.shareCopied':'Copied','toast.serverModeActive':'Server','toast.startRecFailed':'Failed','toast.setupRecFailed':'Failed','toast.recNotSupported':'Unsupported',
    'toast.storageFull':'Full','toast.leaveConfirm':'Are you sure?','error.serverGeneric':'Error','error.tryAgain':'Try again','error.timeout':'No response',
    'lead.cta':'📞 Have an advisor call me','lead.hint':'Leave your number and the academic guidance center will call you.','lead.phone':'Phone number','lead.name':'Name (optional)',
    'lead.major':'Field of interest (optional)','lead.consent':'I agree to be contacted at this number.','lead.send':'Submit','lead.cancel':'Cancel',
    'lead.needConsent':'Please tick the consent box','lead.done':'Request received — we will call you soon.',
    'lang.title':'Choose Language','lang.subtitle':'Select','support.title':'Support','support.subtitle':'We help','support.chat':'Live chat','support.chat.desc':'Quick reply','support.email':'Email','support.phone':'Phone',
    'about.title':'About Us','about.subtitle':'Get to know','about.version':'Version','about.desc':'Super Advisor is an intelligent academic assistant.',
  },
};

const S={
  lang:DEFAULTS.lang,platform:'desktop',theme:DEFAULTS.theme,
  generating:false,abort:null,attachment:null,typingAbort:false,lastAttachment:null,
  chats:[],chatId:null,messages:[],sound:DEFAULTS.sound,autoScroll:true,
  autoSendVoice:DEFAULTS.autoSendVoice,chatView:'active',
};

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const _EM={'&':'&amp;','<':'&lt;','>':'&gt;'};
const esc=s=>s==null?'':String(s).replace(/[&<>]/g,c=>_EM[c]);
const escAttr=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');
const fmtSize=b=>b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';
const uid=()=>'c_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const debounce=(fn,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isSecure=location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='';
const t=key=>(I18N[S.lang]&&I18N[S.lang][key])||I18N.fa[key]||key;
const getLangCode=()=>LANG_CODES[S.lang]||'fa-IR';
const haptic=(ms=8)=>{try{navigator.vibrate?.(ms);}catch{}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

const el={
  chat:$('#chat'),input:$('#input'),send:$('#send-btn'),form:$('#chat-form'),
  list:$('#chat-list'),typing:$('#typing'),scrollBtn:$('#scroll-btn'),
  attach:$('#attach'),attIcon:$('#att-icon'),attName:$('#att-name'),attSize:$('#att-size'),
  fontLabel:$('#font-label'),themeIcon:$('#theme-icon'),platformBadge:$('#platform-badge'),
  recPanel:$('#rec-panel'),recTimer:$('#rec-timer'),voiceBtn:$('#voice-btn'),
  typingText:$('#typing-text'),charCount:$('#char-count'),
  badgeActive:$('#badge-active'),badgeArchived:$('#badge-archived'),
  composer:document.querySelector('.composer'),
};

/* ═══════════════════════════════════════════════════════════
   MARKDOWN
   ═══════════════════════════════════════════════════════════ */
function md(text){
  if(!text)return'';
  const src=String(text);
  const blocks=[],inl=[];
  let out=src.replace(/```([\w+#.-]*)[ \t]*\n?([\s\S]*?)```/g,(_,lang,code)=>{
    blocks.push({lang:lang||'text',code:code.replace(/\n$/,'')});
    return `\u2063MB${blocks.length-1}\u2063`;
  });
  out=out.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  out=out.replace(/`([^`\n]+)`/g,(_,c)=>{inl.push(c);return `\u2063IC${inl.length-1}\u2063`;});
  out=out.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g,'<strong>$1</strong>');
  out=out.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g,'$1<em>$2</em>');
  out=out.replace(/(?:^|\n)((?:\|.+\|[ \t]*(?:\n|$)){2,})/g,(m,b)=>{
    const rows=b.trim().split('\n').map(r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
    if(rows.length<2||!rows[1].every(c=>/^:?-{2,}:?$/.test(c)))return m;
    const head='<tr>'+rows[0].map(c=>`<th>${c}</th>`).join('')+'</tr>';
    const body=rows.slice(2).map(r=>'<tr>'+r.map(c=>`<td>${c}</td>`).join('')+'</tr>').join('');
    return '\n<div class="tbl-wrap"><table>'+head+body+'</table></div>\n';
  });
  out=out.replace(/^(?:-{3,}|\*{3,})$/gm,'<hr>');
  out=out.replace(/(?:^|\n)((?:&gt; ?.*(?:\n|$))+)/g,(_,b)=>'\n<blockquote>'+b.trim().split('\n').map(l=>l.replace(/^&gt; ?/,'')).join('<br>')+'</blockquote>\n');
  out=out.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  out=out.replace(/^## (.+)$/gm,'<h2>$1</h2>');
  out=out.replace(/^# (.+)$/gm,'<h1>$1</h1>');
  out=out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)"']+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  out=out.replace(/(?:^|\n)((?:[-•*] .+(?:\n|$))+)/g,(_,b)=>{
    const items=b.trim().split('\n').map(l=>`<li>${l.replace(/^[-•*]\s+/,'')}</li>`).join('');
    return '\n<ul>'+items+'</ul>';
  });
  out=out.replace(/(?:^|\n)((?:[\d۰-۹]+[.)] .+(?:\n|$))+)/g,(_,b)=>{
    const items=b.trim().split('\n').map(l=>`<li>${l.replace(/^[\d۰-۹]+[.)]\s+/,'')}</li>`).join('');
    return '\n<ol>'+items+'</ol>';
  });
  out=out.replace(/\s*(<\/?(?:ul|ol|h[1-3]|blockquote|table|hr)>|<div class="tbl-wrap">|<\/div>(?=\s*(?:<br>|$|\n)))\s*/g,'$1').replace(/\s*(\u2063MB\d+\u2063)\s*/g,'$1');
  out=out.replace(/\n/g,'<br>').replace(/^(?:<br>)+|(?:<br>)+$/g,'');
  out=out.replace(/\u2063IC(\d+)\u2063/g,(_,i)=>`<code>${inl[+i]}</code>`);
  out=out.replace(/\u2063MB(\d+)\u2063/g,(_,i)=>{
    const {lang,code}=blocks[+i];
    const safe=code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const id='cb_'+Math.random().toString(36).slice(2,8);
    return `<div class="code-block" data-codeblock="${id}"><div class="code-block__head"><span class="code-block__lang">${esc(lang)}</span><button type="button" class="code-block__copy" data-copy-code="${id}">Copy</button></div><pre><code class="language-${esc(lang)}">${safe}</code></pre></div>`;
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════
   TOASTS
   ═══════════════════════════════════════════════════════════ */
const TOAST_ICONS={success:'✓',error:'✕',info:'ℹ',warning:'⚠'};
function toast(msg,type='info'){
  const node=document.createElement('div');
  node.className=`toast ${type}`;
  node.setAttribute('role','status');
  node.innerHTML=`<span class="toast__icon">${TOAST_ICONS[type]||TOAST_ICONS.info}</span><span style="flex:1;overflow-wrap:anywhere">${esc(msg)}</span>`;
  $('#toasts').appendChild(node);
  setTimeout(()=>{node.classList.add('out');setTimeout(()=>node.remove(),250);},3000);
}

/* ═══════════════════════════════════════════════════════════
   RIPPLE
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const btn=e.target.closest('button:not([data-no-ripple]):not([disabled]):not(.send-btn):not(.bottom-center):not(.tab)');
  if(!btn)return;
  if(btn.classList.contains('sidebar-tool'))return;
  try{
    const rect=btn.getBoundingClientRect();
    const size=Math.max(rect.width,rect.height)*1.2;
    const x=e.clientX-rect.left-size/2;
    const y=e.clientY-rect.top-size/2;
    const ripple=document.createElement('span');
    ripple.className='ripple';
    ripple.style.cssText=`width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    if(getComputedStyle(btn).position==='static')btn.style.position='relative';
    btn.style.overflow='hidden';
    btn.appendChild(ripple);
    setTimeout(()=>ripple.remove(),650);
  }catch{}
},{passive:true});

/* ═══════════════════════════════════════════════════════════
   TTS
   ═══════════════════════════════════════════════════════════ */
const TTS={
  voices:[],currentVoice:null,ready:false,warned:false,_tok:0,_group:null,
  _ui(group){
    if(this._group&&this._group!==group)this._group.classList.remove('speaking');
    this._group=group||null;
    if(group)group.classList.add('speaking');
  },
  _clearUI(){if(this._group){this._group.classList.remove('speaking');this._group=null;}},
  init(){
    if(!('speechSynthesis' in window))return;
    const load=()=>{this.voices=speechSynthesis.getVoices()||[];this.currentVoice=this.pickBest(this.voices);this.ready=this.voices.length>0;};
    load();
    if(speechSynthesis.onvoiceschanged!==undefined)speechSynthesis.addEventListener('voiceschanged',load);
    window.addEventListener('pointerdown',()=>{if(!this.currentVoice)load();},{once:true});
  },
  pickBest(list){
    if(!list?.length)return null;
    const want=getLangCode();const base=want.split('-')[0];
    const exact=list.find(v=>v.lang===want);if(exact)return exact;
    const same=list.find(v=>new RegExp('^'+base+'([-_]|$)','i').test(v.lang));if(same)return same;
    if(base==='fa'){const ar=list.find(v=>/^ar([-_]|$)/i.test(v.lang));if(ar)return ar;}
    return null;
  },
  refresh(){this.warned=false;this.currentVoice=this.pickBest(this.voices);},
  splitSentences(text){
    const parts=text.split(/([.!?؟\n]+)\s+/);
    const out=[];
    for(let i=0;i<parts.length;i+=2)out.push(parts[i]+(parts[i+1]||''));
    return out.filter(s=>s.trim().length);
  },
  chunk(text,max=220){
    if(!text)return[];
    if(text.length<=max)return[text];
    const parts=[];let cur='';
    const sentences=this.splitSentences(text);
    for(const s of sentences){
      if((cur+' '+s).trim().length>max){
        if(cur)parts.push(cur.trim());
        if(s.length>max){for(let i=0;i<s.length;i+=max)parts.push(s.slice(i,i+max));cur='';}else cur=s;
      }else cur+=(cur?' ':'')+s;
    }
    if(cur.trim())parts.push(cur.trim());
    return parts;
  },
  speak(text,group){
    if(!('speechSynthesis' in window)){toast(t('toast.ttsNotSupported'),'warning');return false;}
    if(!this.ready){this.voices=speechSynthesis.getVoices()||[];this.currentVoice=this.pickBest(this.voices);this.ready=this.voices.length>0;}
    if(!this.currentVoice)toast(t('toast.voiceNotInstalled'),'warning');
    else if(!this.warned&&getLangCode().startsWith('fa')&&/^ar/i.test(this.currentVoice.lang)){this.warned=true;toast(t('toast.voiceFallbackArabic'),'warning');}
    try{speechSynthesis.cancel();}catch{}
    const parts=this.chunk(text);if(!parts.length){this._clearUI();return false;}
    const useVoice=this.currentVoice;
    const tok=++this._tok;
    this._ui(group);
    parts.forEach((part,i)=>{
      const u=new SpeechSynthesisUtterance(part);
      if(useVoice){u.voice=useVoice;u.lang=useVoice.lang;}else u.lang=getLangCode();
      u.rate=0.95;u.pitch=1;u.volume=1;
      // فقط آخرین تکه (و فقط برای همین نوبت) دکمهٔ توقف را برمی‌گرداند
      if(i===parts.length-1){const done=()=>{if(tok===this._tok)this._clearUI();};u.onend=done;u.onerror=done;}
      speechSynthesis.speak(u);
    });
    if(isIOS)setTimeout(()=>{try{speechSynthesis.resume();}catch{}},100);
    return true;
  },
  stop(){this._tok++;try{speechSynthesis.cancel();}catch{}this._clearUI();},
};
TTS.init();

/* ═══════════════════════════════════════════════════════════
   MODAL SYSTEM
   ═══════════════════════════════════════════════════════════ */
function openModal(id){
  const m=document.getElementById(id);if(!m)return;
  if(!m.classList.contains('show'))_lastFocus.push(document.activeElement);
  m.classList.add('show');
  requestAnimationFrame(()=>{m.querySelector('[data-modal-panel]')?.focus({preventScroll:true});});
  trapFocus(m);
}
const _lastFocus=[];
function closeModal(id){
  const m=document.getElementById(id);if(!m)return;
  const was=m.classList.contains('show');
  m.classList.remove('show');
  releaseFocus();
  const open=$$('.modal-backdrop.show').pop();if(open)trapFocus(open);
  if(was){const f=_lastFocus.pop();try{f&&f.isConnected&&f.focus({preventScroll:true});}catch{}}
}
function closeAllModals(){$$('.modal-backdrop.show').forEach(m=>m.classList.remove('show'));releaseFocus();_lastFocus.length=0;}

let _focusTrap=null;
function trapFocus(modal){
  releaseFocus();
  const focusable=modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  const handler=e=>{
    if(e.key!=='Tab')return;
    if(e.shiftKey){if(document.activeElement===first){e.preventDefault();last.focus();}}
    else{if(document.activeElement===last){e.preventDefault();first.focus();}}
  };
  modal.addEventListener('keydown',handler);
  _focusTrap={modal,handler};
}
function releaseFocus(){
  if(_focusTrap){_focusTrap.modal.removeEventListener('keydown',_focusTrap.handler);_focusTrap=null;}
}

document.addEventListener('click',e=>{
  const openBtn=e.target.closest('[data-open]');if(openBtn){openModal(openBtn.dataset.open);return;}
  const closeBtn=e.target.closest('[data-close]');if(closeBtn){closeModal(closeBtn.dataset.close);return;}
  const modal=e.target.closest('.modal-backdrop');if(modal&&e.target===modal&&_downOnBackdrop)closeModal(modal.id);
});
let _downOnBackdrop=false;
document.addEventListener('pointerdown',e=>{_downOnBackdrop=e.target.classList?.contains('modal-backdrop');},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const top=$$('.modal-backdrop.show').pop();if(top)closeModal(top.id);}});

let confirmCb=null;
function confirmDialog({title,msg,okText,variant='danger',onConfirm}){
  $('#cf-title').textContent=title;
  $('#cf-msg').textContent=msg;
  const okBtn=$('#cf-ok');
  const icon=$('#cf-icon');
  if(variant==='archive'){
    okBtn.className='btn-primary';okBtn.style.background='linear-gradient(135deg,#F59E0B,#D97706)';
    icon.style.background='rgba(245,158,11,.1)';icon.textContent='📦';
  }else if(variant==='unarchive'){
    okBtn.className='btn-primary';okBtn.style.background='linear-gradient(135deg,#10B981,#059669)';
    icon.style.background='rgba(16,185,129,.1)';icon.textContent='📤';
  }else{
    okBtn.className='btn-danger';okBtn.style.background='';
    icon.style.background='rgba(244,63,94,.1)';icon.textContent='⚠️';
  }
  okBtn.textContent=okText||t('confirm.deleteOk');
  confirmCb=onConfirm;openModal('m-confirm');
}
$('#cf-ok').addEventListener('click',()=>{const cb=confirmCb;confirmCb=null;closeModal('m-confirm');cb?.();});

/* ═══════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════ */
function applyTheme(theme){
  S.theme=theme;
  document.documentElement.classList.toggle('dark',theme==='dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#050A14':'#0EA5E9');
  try{localStorage.setItem('n_theme',theme);}catch{}
  $$('.theme-btn').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));
}
function setThemeWithTransition(newTheme,e){
  if(newTheme===S.theme)return;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!document.startViewTransition||reduce){applyTheme(newTheme);return;}
  let x=window.innerWidth/2,y=window.innerHeight/2;
  if(e&&(e.clientX||e.clientY)){x=e.clientX;y=e.clientY;}
  else{const btn=$('#theme-toggle');if(btn){const r=btn.getBoundingClientRect();x=r.left+r.width/2;y=r.top+r.height/2;}}
  const endRadius=Math.hypot(Math.max(x,window.innerWidth-x),Math.max(y,window.innerHeight-y));
  try{
    const transition=document.startViewTransition(()=>applyTheme(newTheme));
    transition.ready.then(()=>{
      document.documentElement.animate(
        {clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${endRadius}px at ${x}px ${y}px)`]},
        {duration:600,easing:'cubic-bezier(.4,0,.2,1)',pseudoElement:'::view-transition-new(root)'}
      );
    }).catch(()=>{});
  }catch{applyTheme(newTheme);}
}
$('#theme-toggle').addEventListener('click',e=>{setThemeWithTransition(S.theme==='light'?'dark':'light',e);});
$$('.theme-btn').forEach(b=>b.addEventListener('click',e=>setThemeWithTransition(b.dataset.theme,e)));

/* ═══════════════════════════════════════════════════════════
   FONT SIZE
   ═══════════════════════════════════════════════════════════ */
function fontLabelKey(v){
  if(v<=12)return'font.xxs';if(v<=13)return'font.tiny';if(v<=14)return'font.small';if(v<=16)return'font.medium';
  if(v<=18)return'font.large';if(v<=20)return'font.xlarge';if(v<=21)return'font.xxlarge';return'font.huge';
}
function setFontSize(v){
  v=Math.min(22,Math.max(12,parseInt(v,10)||DEFAULTS.fontSize));
  document.documentElement.style.fontSize=v+'px';
  const sl=$('#font-size');if(sl)sl.style.setProperty('--p',((v-12)/10*100)+'%');
  if(el.fontLabel)el.fontLabel.textContent=t(fontLabelKey(v));
  try{localStorage.setItem('n_fontsize',v);}catch{}
}
$('#font-size').addEventListener('input',e=>setFontSize(e.target.value));

/* ═══════════════════════════════════════════════════════════
   PLATFORM
   ═══════════════════════════════════════════════════════════ */
function setPlatform(){
  const ua=navigator.userAgent||'';
  let p='desktop';
  if(/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))p='ios';
  else if(/android/i.test(ua))p='android';
  S.platform=p;
  if(el.platformBadge)el.platformBadge.textContent={ios:'iOS',android:'Android',desktop:'Desktop'}[p]||'';
}

/* ═══════════════════════════════════════════════════════════
   I18N
   ═══════════════════════════════════════════════════════════ */
function applyI18n(){
  document.documentElement.lang=S.lang;
  document.documentElement.dir=DIRS[S.lang]||'rtl';
  document.title=t('app.title');
  $$('[data-i18n]').forEach(n=>{const k=n.dataset.i18n;if(k)n.textContent=t(k);});
  $$('[data-i18n-placeholder]').forEach(n=>n.placeholder=t(n.dataset.i18nPlaceholder));
  $$('[data-i18n-title]').forEach(n=>n.title=t(n.dataset.i18nTitle));
  if(el.fontLabel)el.fontLabel.textContent=t(fontLabelKey(parseInt($('#font-size').value,10)||DEFAULTS.fontSize));
  const disp=$('#current-lang-display');if(disp)disp.textContent=LANG_DISPLAY[S.lang]||'فارسی';
  $$('#lang-options [data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===S.lang));
}
function setLang(lang){
  S.lang=['fa','ar','en'].includes(lang)?lang:'fa';
  try{localStorage.setItem('n_lang',S.lang);}catch{}
  applyI18n();TTS.refresh();
  if(S.messages.length)renderMessages(S.messages);else showWelcome();
  renderChatList($('#search-chats').value);
}

let _langToken=0;
async function pickLanguage(lang){
  if(lang===S.lang){closeModal('m-lang');return;}
  closeModal('m-lang');
  const my=++_langToken;
  const ld=$('#loader');if(!ld){setLang(lang);return;}
  ld.classList.remove('hide');
  await wait(400);
  if(my!==_langToken)return;
  setLang(lang);
  await wait(500);
  if(my!==_langToken)return;
  ld.classList.add('hide');
}
$$('#lang-options [data-lang-pick]').forEach(btn=>btn.addEventListener('click',()=>pickLanguage(btn.dataset.langPick)));

/* ═══════════════════════════════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════════════════════════════ */
function toggleSidebar(force){
  if(force===false&&typeof setBottomActive==='function')setBottomActive(null);
  const sb=$('#sidebar'),ov=$('#sb-overlay');
  const next=force!==undefined?force:!sb.classList.contains('open');
  sb.classList.toggle('open',next);
  document.body.classList.toggle('sb-open',next&&window.innerWidth<768);
  $('#sb-toggle')?.setAttribute('aria-expanded',String(next));
  if(next&&window.innerWidth<768)ov.classList.add('show');
  else ov.classList.remove('show');
}
$('#sb-toggle').addEventListener('click',()=>toggleSidebar());
$('#sb-close').addEventListener('click',()=>toggleSidebar(false));
$('#sb-overlay').addEventListener('click',()=>toggleSidebar(false));
window.addEventListener('resize',debounce(()=>{
  if(window.innerWidth>=768){
    $('#sidebar').classList.remove('open');
    $('#sb-overlay').classList.remove('show');
    document.body.classList.remove('sb-open');
  }
},150));

/* ═══════════════════════════════════════════════════════════
   CHATS
   ═══════════════════════════════════════════════════════════ */
function trimChats(){
  // حداکثر MAX_HISTORY گفتگو (فعال + آرشیو) نگه داشته می‌شود؛ قدیمی‌ترها حذف می‌شوند
  S.chats=S.chats.slice().sort((a,b)=>(b.date||0)-(a.date||0)).slice(0,MAX_HISTORY);
}
function loadChats(){
  try{S.chats=JSON.parse(localStorage.getItem('n_chats')||'[]');}catch{S.chats=[];}
  if(!Array.isArray(S.chats))S.chats=[];
  S.chats=S.chats.filter(c=>c&&c.id);
  trimChats();
}
function saveChats(){
  trimChats();
  try{localStorage.setItem('n_chats',JSON.stringify(S.chats));}
  catch{
    while(S.chats.length>1){
      S.chats.pop();
      try{localStorage.setItem('n_chats',JSON.stringify(S.chats));return;}catch{}
    }
    try{localStorage.removeItem('n_chats');}catch{}
    toast(t('toast.storageFull'),'warning');
  }
}
function persistCurrentChat(){
  if(!S.messages.length||!S.chatId)return;
  const firstUser=S.messages.find(m=>m.role==='user');
  const title=(firstUser?.content||t('sidebar.newChat')).slice(0,60).replace(/\n.*/s,'');
  const existing=S.chats.find(c=>c.id===S.chatId);
  const unchanged=!!existing&&Array.isArray(existing.messages)&&existing.messages.length===S.messages.length;
  const data={id:S.chatId,title,messages:S.messages.slice(),date:unchanged?(existing.date||Date.now()):Date.now(),archived:existing?.archived||false};
  const idx=S.chats.findIndex(c=>c.id===S.chatId);if(idx>=0)S.chats.splice(idx,1);
  S.chats.unshift(data);
  const before=S.chats.length;trimChats();
  if(before>S.chats.length)toast(t('toast.historyTrimmed'),'info');
  saveChats();renderChatList();
}

/* ═══════════════════════════════════════════════════════════
   WELCOME
   ═══════════════════════════════════════════════════════════ */
function showWelcome(){
  el.chat.innerHTML=`
    <div class="welcome">
      <div class="welcome-mascot">
        <div class="welcome-mascot__glow"></div>
        <svg class="welcome-mascot__img" viewBox="0 0 120 120" aria-hidden="true"><use href="#s-mascot"/></svg>
      </div>
      <div class="badge-live"><span class="pulse-dot"></span><span>${esc(t('welcome.badge'))}</span></div>
      <h2 class="welcome-title">${esc(t('welcome.title'))}</h2>
      <p class="welcome-desc">${esc(t('welcome.desc'))}</p>
      <div class="intent-chips">
        <button class="intent-chip" data-prompt="${escAttr(t('welcome.q2.q'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg><span>${esc(t('welcome.intent1'))}</span></button>
        <button class="intent-chip" data-prompt="${escAttr(t('welcome.q1.q'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg><span>${esc(t('welcome.intent2'))}</span></button>
        <button class="intent-chip" data-prompt="${escAttr(t('welcome.q3.q'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"/></svg><span>${esc(t('welcome.intent3'))}</span></button>
      </div>
      <p class="welcome-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>${esc(t('welcome.hint'))}</span></p>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   BUBBLES
   ═══════════════════════════════════════════════════════════ */
function userBubbleHTML(text){
  return `
    <div class="msg-group mine">
      <div class="msg-body mine">
        <div data-role="user" class="bubble-user">${esc(text)}</div>
        <div class="msg-actions" style="justify-content:flex-end">
          <button class="msg-action" data-action="copy">${esc(t('msg.copy'))}</button>
        </div>
      </div>
      <div class="msg-avatar msg-avatar--user"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
    </div>`;
}
function aiBubbleHTML(text,cid,mid,vote){
  const fbOn=!!mid;
  const fbCls=v=>'msg-action '+v+(vote===v?' voted':'');
  const fbDis=vote?' disabled aria-disabled="true"':'';
  return `
    <div class="msg-group" data-cid="${escAttr(cid||'')}" data-mid="${escAttr(mid||'')}"${vote?` data-voted="${escAttr(vote)}"`:''}>
      <svg class="msg-avatar msg-avatar--ai" viewBox="0 0 40 40" aria-hidden="true"><use href="#s-ai"/></svg>
      <div class="msg-body">
        <div data-role="ai" class="bubble-ai">${md(text)}</div>
        <div class="msg-actions">
          <button class="msg-action" data-action="copy">${esc(t('msg.copy'))}</button>
          <button class="msg-action" data-action="regen">${esc(t('msg.regen'))}</button>
          <button class="msg-action" data-action="speak">${esc(t('msg.speak'))}</button>
          <button class="msg-action stop" data-action="stop-speak">${esc(t('msg.stopSpeak'))}</button>
          ${fbOn?`<button class="${fbCls('like')}" data-action="like" aria-pressed="${vote==='like'}"${fbDis}>👍</button>
          <button class="${fbCls('dislike')}" data-action="dislike" aria-pressed="${vote==='dislike'}"${fbDis}>👎</button>`:''}
          <button class="msg-action" data-action="share">${esc(t('msg.share'))}</button>
        </div>
      </div>
    </div>`;
}
function appendUser(txt){el.chat.insertAdjacentHTML('beforeend',userBubbleHTML(txt));scrollToBottom(true);}

/* ═══════════════════════════════════════════════════════════
   TYPING
   ═══════════════════════════════════════════════════════════ */
let _typingTimer=null;
const TYPING_KEYS=['typing.thinking','typing.stage2','typing.stage3'];
function setTypingStage(idx){
  const key=TYPING_KEYS[idx]||TYPING_KEYS[TYPING_KEYS.length-1];
  if(!el.typingText)return;
  el.typingText.dataset.i18n=key;
  el.typingText.textContent=t(key);
}
function startTypingStages(){
  stopTypingStages();
  let stage=0;setTypingStage(stage);
  _typingTimer=setInterval(()=>{
    if(stage<TYPING_KEYS.length-1){stage++;setTypingStage(stage);}
  },4000);
}
function stopTypingStages(){
  if(_typingTimer){clearInterval(_typingTimer);_typingTimer=null;}
  setTypingStage(0);
}

/* ═══════════════════════════════════════════════════════════
   TYPEWRITER (parse-once + clip reveal)
   ═══════════════════════════════════════════════════════════ */
const TYPE_CPS=55, TYPE_MAX_MS=14000;
function appendAITyped(fullText,cid,mid){
  el.chat.insertAdjacentHTML('beforeend',aiBubbleHTML('',cid,mid));
  const groups=el.chat.querySelectorAll('.msg-group');
  const group=groups[groups.length-1];
  const bubble=group.querySelector('[data-role="ai"]');
  const actions=group.querySelector('.msg-actions');
  if(actions)actions.style.opacity='0';
  const cursor=document.createElement('span');
  cursor.className='typewriter-cursor';
  const total=fullText.length;
  const cps=Math.max(TYPE_CPS,total/(TYPE_MAX_MS/1000));
  // close an unfinished ``` fence so partial code renders as a code block
  const partial=n=>{
    let t=fullText.slice(0,n);
    if((t.match(/```/g)||[]).length%2)t+='\n```';
    return t;
  };
  const finish=()=>{
    bubble.innerHTML=md(fullText);
    if(actions)actions.style.opacity='';
    if(S.autoScroll)el.chat.scrollTop=el.chat.scrollHeight;
  };
  return new Promise(resolve=>{
    const start=performance.now();
    let shown=-1,lastRender=0;
    S.typingAbort=false;
    const tick=now=>{
      if(S.typingAbort){finish();resolve();return;}
      let n=Math.min(total,Math.floor((now-start)/1000*cps));
      if(n<total){ // snap to word boundary so words appear whole
        const sp=fullText.slice(n,n+12).search(/[\s\n]/);
        n=sp>=0?n+sp:n;
      }
      if(n!==shown&&(now-lastRender>45||n>=total)){
        shown=n;lastRender=now;
        bubble.innerHTML=md(partial(n));
        if(n<total)bubble.appendChild(cursor);
        if(S.autoScroll)el.chat.scrollTop=el.chat.scrollHeight;
      }
      if(n<total)requestAnimationFrame(tick);
      else{finish();resolve();}
    };
    requestAnimationFrame(tick);
  });
}

/* ═══════════════════════════════════════════════════════════
   SCROLL
   ═══════════════════════════════════════════════════════════ */
let _progScroll=false,_progT=null;
function scrollToBottom(force,instant=false){
  if(!force&&!S.autoScroll)return;
  requestAnimationFrame(()=>{
    _progScroll=true;clearTimeout(_progT);
    _progT=setTimeout(()=>{_progScroll=false;onChatScroll();},instant?80:600);
    el.chat.scrollTo({top:el.chat.scrollHeight,behavior:instant?'instant':'smooth'});
  });
}
function onChatScroll(){
  const c=el.chat;
  const near=c.scrollHeight-c.scrollTop-c.clientHeight<120;
  S.autoScroll=near;
  el.scrollBtn.classList.toggle('show',!near);
}
el.chat.addEventListener('scroll',()=>{if(!_progScroll)onChatScroll();},{passive:true});
['wheel','touchstart'].forEach(ev=>el.chat.addEventListener(ev,()=>{_progScroll=false;},{passive:true}));
el.scrollBtn.addEventListener('click',()=>scrollToBottom(true));

/* ═══════════════════════════════════════════════════════════
   ACTIONS
   ═══════════════════════════════════════════════════════════ */
el.chat.addEventListener('click',async e=>{
  const qp=e.target.closest('[data-prompt]');if(qp){sendQuickPrompt(qp.dataset.prompt);return;}
  const copyCodeBtn=e.target.closest('[data-copy-code]');
  if(copyCodeBtn){
    const id=copyCodeBtn.dataset.copyCode;
    const block=document.querySelector(`[data-codeblock="${id}"] pre code`);
    if(block){
      const orig=copyCodeBtn.textContent;
      await copyText(block.textContent);
      copyCodeBtn.textContent='✓';
      copyCodeBtn.classList.add('copied');
      setTimeout(()=>{copyCodeBtn.textContent=orig;copyCodeBtn.classList.remove('copied');},1400);
    }
    return;
  }
  const btn=e.target.closest('[data-action]');if(!btn)return;
  const group=btn.closest('.msg-group');
  const bubble=group?.querySelector('[data-role]');if(!bubble)return;
  const text=bubbleText(bubble,btn.dataset.action==='speak');
  switch(btn.dataset.action){
    case'copy':await copyText(text);break;
    case'speak':{const ok=TTS.speak(text,group);if(ok)toast(t('toast.reading'),'info');break;}
    case'stop-speak':TTS.stop();toast(t('toast.speakStop'),'info');break;
    case'share':await shareText(text);break;
    case'regen':regenerate();break;
    case'like':case'dislike':submitVote(group,btn.dataset.action);break;
    case'lead':openLeadForm(group);break;
    case'lead-cancel':group.querySelector('.lead-form')?.remove();break;
    case'lead-send':sendLead(group);break;
  }
});
/* ─── درخواست تماس با مشاور ─── */
function addLeadButton(group){
  if(!group||group.querySelector('[data-action="lead"]'))return;
  const actions=group.querySelector('.msg-actions');if(!actions)return;
  actions.insertAdjacentHTML('afterbegin',`<button class="msg-action lead-cta" data-action="lead">${esc(t('lead.cta'))}</button>`);
}
function openLeadForm(group){
  if(group.querySelector('.lead-form'))return;
  const body=group.querySelector('.msg-body');
  body.insertAdjacentHTML('beforeend',`
    <div class="lead-form" role="form" aria-label="${escAttr(t('lead.cta'))}">
      <p class="lead-form__hint">${esc(t('lead.hint'))}</p>
      <input class="lead-form__in" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="${escAttr(t('lead.phone'))}" maxlength="20" dir="ltr">
      <input class="lead-form__in" name="name" type="text" autocomplete="name" placeholder="${escAttr(t('lead.name'))}" maxlength="60">
      <input class="lead-form__in" name="major" type="text" placeholder="${escAttr(t('lead.major'))}" maxlength="80">
      <label class="lead-form__consent"><input type="checkbox" name="consent"> ${esc(t('lead.consent'))}</label>
      <div class="lead-form__row">
        <button class="msg-action lead-cta" data-action="lead-send">${esc(t('lead.send'))}</button>
        <button class="msg-action" data-action="lead-cancel">${esc(t('lead.cancel'))}</button>
      </div>
    </div>`);
  const lf=body.querySelector('.lead-form');lf.scrollIntoView({block:'nearest',behavior:'smooth'});
  lf.querySelector('[name="phone"]').focus({preventScroll:true});
}
async function sendLead(group){
  const f=group.querySelector('.lead-form');if(!f||f.dataset.busy)return;
  const v=n=>f.querySelector(`[name="${n}"]`);
  if(!v('consent').checked){toast(t('lead.needConsent'),'error');return;}
  // آخرین سؤال کاربر پیش از این پاسخ
  const mid=group.dataset.mid,i=S.messages.findIndex(m=>m.mid===mid);
  const q=(S.messages.slice(0,i<0?S.messages.length:i).reverse().find(m=>m.role==='user')||{}).content||'';
  f.dataset.busy='1';
  try{
    const res=await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({phone:v('phone').value,name:v('name').value,major:v('major').value,question:q.slice(0,300),consent:true,lang:S.lang})});
    const d=await res.json().catch(()=>({}));
    if(!res.ok){toast(d.message||t('toast.serverError'),'error');return;}
    f.outerHTML=`<p class="lead-form__done">✅ ${esc(t('lead.done'))}</p>`;
    group.querySelector('[data-action="lead"]')?.remove();
  }catch{toast(t('toast.serverError'),'error');}
  finally{delete f.dataset.busy;}
}
// هر پیام فقط یک‌بار بازخورد می‌گیرد؛ وضعیت در خود پیام ذخیره می‌شود و بعد از رفرش هم می‌ماند
function submitVote(group,vote){
  if(!group||group.dataset.voted)return;
  const cid=group.dataset.cid,mid=group.dataset.mid;
  const msg=S.messages.find(m=>m.role==='assistant'&&((mid&&m.mid===mid)||(!mid&&cid&&m.cid===cid)));
  if(msg&&msg.vote)return;
  group.dataset.voted=vote;
  group.querySelectorAll('[data-action="like"],[data-action="dislike"]').forEach(b=>{
    b.disabled=true;b.setAttribute('aria-disabled','true');
    const on=b.dataset.action===vote;
    b.classList.toggle('voted',on);b.setAttribute('aria-pressed',String(on));
  });
  if(msg){msg.vote=vote;persistCurrentChat();}
  sendFeedback(group,vote==='like'?'up':'down');
  toast(vote==='like'?t('toast.thanks'):t('toast.feedback'),vote==='like'?'success':'info');
}
function sendFeedback(group,vote){
  const cid=group&&group.dataset?group.dataset.cid:'';
  if(!cid)return;
  fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cid,vote})}).catch(()=>{});
}
function bubbleText(b,skipCode){
  const c=b.cloneNode(true);
  c.querySelectorAll('.code-block__head,.typewriter-cursor').forEach(n=>n.remove());
  if(skipCode)c.querySelectorAll('.code-block').forEach(n=>n.remove());
  c.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));
  c.querySelectorAll('li').forEach(n=>n.prepend('• '));
  c.querySelectorAll('li,h1,h2,h3,pre,ul,ol').forEach(n=>n.append('\n'));
  return c.textContent.replace(/\n{3,}/g,'\n\n').trim();
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast(t('toast.copied'),'success');}
  catch{
    try{
      const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');
      ta.style.cssText='position:fixed;top:0;left:0;opacity:0;font-size:16px;';
      document.body.appendChild(ta);ta.focus({preventScroll:true});ta.select();ta.setSelectionRange(0,ta.value.length);
      const ok=document.execCommand('copy');ta.remove();
      if(!ok)throw new Error('copy failed');
      toast(t('toast.copied'),'success');
    }catch{toast(t('toast.copyError'),'error');}
  }
}
async function shareText(text){
  if(navigator.share){try{await navigator.share({title:t('app.name'),text});}catch{}}
  else{await copyText(text);toast(t('toast.shareCopied'),'success');}
}

/* ═══════════════════════════════════════════════════════════
   SWIPE
   ═══════════════════════════════════════════════════════════ */
let _openSwipeItem=null;
function attachSwipeHandlers(item){
  const inner=item.querySelector('.chat-item-inner');
  if(!inner)return;
  const chatId=item.dataset.chatId;
  const chat=S.chats.find(c=>c.id===chatId);
  if(!chat)return;
  const MAX=92,THRESH=56;
  let pointerId=null,startX=0,startY=0,currentX=0,dragging=false,axis=null,suppressClick=false;
  const setX=(x,animate)=>{
    const c=Math.max(-MAX,Math.min(MAX,x));
    inner.style.transition=animate?'':'none';
    inner.style.transform=`translateX(${c}px)`;
    currentX=c;
    if(c>2){item.classList.add('swipe-left');item.classList.remove('swipe-right');}
    else if(c<-2){item.classList.add('swipe-right');item.classList.remove('swipe-left');}
    else item.classList.remove('swipe-left','swipe-right');
  };
  const onDown=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(pointerId!==null)return;
    if(_openSwipeItem&&_openSwipeItem!==item){try{_openSwipeItem._closeSwipe?.();}catch{}}
    pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;
    currentX=0;dragging=false;axis=null;
  };
  const onMove=e=>{
    if(e.pointerId!==pointerId)return;
    const rx=e.clientX-startX,ry=e.clientY-startY;
    if(axis===null){
      if(Math.abs(rx)>8||Math.abs(ry)>8){
        axis=Math.abs(rx)>Math.abs(ry)?'x':'y';
        if(axis==='x'){
          dragging=true;item.classList.add('swiping');
          inner.style.transition='none';
          _openSwipeItem=item;
          try{inner.setPointerCapture(e.pointerId);}catch{}
        }else{pointerId=null;try{inner.releasePointerCapture(e.pointerId);}catch{}return;}
      }else return;
    }
    if(axis!=='x')return;
    setX(rx,false);
    if(e.cancelable)e.preventDefault();
  };
  const onUp=e=>{
    if(e.pointerId!==pointerId)return;
    try{inner.releasePointerCapture(e.pointerId);}catch{}
    const wasDragging=dragging;
    const fx=currentX;
    pointerId=null;dragging=false;
    item.classList.remove('swiping','swipe-left','swipe-right');
    if(!wasDragging){_openSwipeItem=null;return;}
    suppressClick=true;setTimeout(()=>{suppressClick=false;},180);
    inner.style.transition='';inner.style.transform='';
    currentX=0;_openSwipeItem=null;
    if(fx>=THRESH){haptic(15);setTimeout(()=>triggerSwipeAction(chatId,'delete'),60);}
    else if(fx<=-THRESH){haptic(15);setTimeout(()=>triggerSwipeAction(chatId,chat.archived?'unarchive':'archive'),60);}
  };
  inner.addEventListener('pointerdown',onDown,{passive:true});
  inner.addEventListener('pointermove',onMove,{passive:false});
  inner.addEventListener('pointerup',onUp);
  inner.addEventListener('pointercancel',onUp);
  inner.addEventListener('dragstart',e=>e.preventDefault());
  inner.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();return;}},true);
  item._closeSwipe=()=>{
    inner.style.transition='';inner.style.transform='';
    item.classList.remove('swiping','swipe-left','swipe-right');
    currentX=0;if(_openSwipeItem===item)_openSwipeItem=null;
  };
}
function triggerSwipeAction(id,action){
  if(_openSwipeItem){try{_openSwipeItem._closeSwipe?.();}catch{}_openSwipeItem=null;}
  const chat=S.chats.find(c=>c.id===id);if(!chat)return;
  if(action==='delete'){
    confirmDialog({
      title:t('confirm.deleteTitle'),msg:t('confirm.deleteMsg'),okText:t('confirm.deleteOk'),variant:'danger',
      onConfirm:()=>{
        S.chats=S.chats.filter(c=>c.id!==id);saveChats();
        if(S.chatId===id){cancelGeneration();S.messages=[];S.chatId=null;newChat(true);}
        else renderChatList($('#search-chats').value);
        toast(t('toast.chatDeleted'),'success');haptic(20);
      }
    });
  }else if(action==='archive'){
    confirmDialog({
      title:t('confirm.archiveTitle'),msg:t('confirm.archiveMsg'),okText:t('confirm.archiveOk'),variant:'archive',
      onConfirm:()=>{
        chat.archived=true;chat.date=chat.date||Date.now();saveChats();
        if(S.chatId===id){cancelGeneration();S.messages=[];S.chatId=uid();showWelcome();}
        renderChatList($('#search-chats').value);
        toast(t('toast.chatArchived'),'success');haptic(15);
      }
    });
  }else if(action==='unarchive'){
    confirmDialog({
      title:t('confirm.unarchiveTitle'),msg:t('confirm.unarchiveMsg'),okText:t('confirm.unarchiveOk'),variant:'unarchive',
      onConfirm:()=>{
        chat.archived=false;chat.date=Date.now();saveChats();
        renderChatList($('#search-chats').value);
        toast(t('toast.chatUnarchived'),'success');haptic(15);
      }
    });
  }
}
document.addEventListener('pointerdown',e=>{
  if(_openSwipeItem&&!_openSwipeItem.contains(e.target)){
    try{_openSwipeItem._closeSwipe?.();}catch{}
    _openSwipeItem=null;
  }
},{passive:true,capture:true});

/* ═══════════════════════════════════════════════════════════
   CHAT LIST
   ═══════════════════════════════════════════════════════════ */
function renderChatList(filter=''){
  const q=(filter||'').trim();
  const view=S.chatView||'active';
  let items=S.chats.filter(c=>(!!c.archived)===(view==='archived'));
  if(q)items=items.filter(c=>(c.title||'').toLowerCase().includes(q.toLowerCase()));
  items.sort((a,b)=>(b.date||0)-(a.date||0));

  const activeCount=S.chats.filter(c=>!c.archived).length;
  const archivedCount=S.chats.filter(c=>c.archived).length;
  if(el.badgeActive)el.badgeActive.textContent=activeCount;
  if(el.badgeArchived)el.badgeArchived.textContent=archivedCount;

  if(!items.length){
    const msg=q?t('sidebar.noResults'):(view==='archived'?t('sidebar.noArchived'):t('sidebar.noChats'));
    el.list.innerHTML=`<div class="list-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>${esc(msg)}</p>
    </div>`;
    _openSwipeItem=null;
    return;
  }

  const frag=document.createDocumentFragment();
  const header=document.createElement('div');
  header.className='list-header';
  header.textContent=q?t('sidebar.results'):(view==='archived'?t('sidebar.tab.archived'):t('sidebar.recent'));
  frag.appendChild(header);

  const locale=S.lang==='fa'?'fa-IR':S.lang==='ar'?'ar-SA':'en-US';

  items.forEach(chat=>{
    const active=S.chatId===chat.id;
    const wrapper=document.createElement('div');
    wrapper.className=`chat-item ${active?'chat-item-active':''}`;
    wrapper.dataset.chatId=chat.id;

    const bgLeft=document.createElement('div');
    bgLeft.className='chat-action-bg left';
    bgLeft.setAttribute('aria-hidden','true');
    bgLeft.innerHTML=`<span class="icon-badge">🗑️</span><span class="action-text">${esc(t('sidebar.delete'))}</span>`;

    const bgRight=document.createElement('div');
    bgRight.className='chat-action-bg right'+(chat.archived?' is-restore':'');
    bgRight.setAttribute('aria-hidden','true');
    bgRight.innerHTML=chat.archived
      ?`<span class="icon-badge">📤</span><span class="action-text">${esc(t('sidebar.unarchive'))}</span>`
      :`<span class="icon-badge">📦</span><span class="action-text">${esc(t('sidebar.archive'))}</span>`;

    const inner=document.createElement('div');
    inner.className='chat-item-inner';
    inner.setAttribute('draggable','false');

    const body=document.createElement('div');
    body.style.cssText='flex:1;min-width:0;display:flex;align-items:center;gap:10px;cursor:pointer';
    body.dataset.load=chat.id;
    body.innerHTML=`
      <div class="chat-avatar"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#s-logo"/></svg></div>
      <div style="min-width:0;flex:1"><span class="chat-title">${esc(chat.title)}</span><span class="chat-meta">${new Date(chat.date||Date.now()).toLocaleDateString(locale,{month:'short',day:'numeric'})}</span></div>`;

    inner.appendChild(body);
    wrapper.append(bgLeft,bgRight,inner);
    frag.appendChild(wrapper);
    attachSwipeHandlers(wrapper);
  });

  el.list.replaceChildren(frag);
  _openSwipeItem=null;
}
el.list.addEventListener('click',e=>{
  const load=e.target.closest('[data-load]')||e.target.querySelector?.('[data-load]');
  if(load)loadChat(load.dataset.load);
});
$('#search-chats').addEventListener('input',debounce(e=>renderChatList(e.target.value),150));

$$('[data-chat-view]').forEach(tab=>{
  tab.addEventListener('click',()=>{
    const view=tab.dataset.chatView;
    if(S.chatView===view)return;
    S.chatView=view;
    $$('[data-chat-view]').forEach(t=>t.classList.toggle('active',t.dataset.chatView===view));
    if(_openSwipeItem){try{_openSwipeItem._closeSwipe?.();}catch{}_openSwipeItem=null;}
    renderChatList($('#search-chats').value);
  });
});

/* ═══════════════════════════════════════════════════════════
   DAY DIVIDERS
   ═══════════════════════════════════════════════════════════ */
function dayLabel(date){
  const now=new Date();
  const d=new Date(date);
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const that=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const diff=Math.round((today-that)/86400000);
  if(diff===0)return S.lang==='fa'?'امروز':S.lang==='ar'?'اليوم':'Today';
  if(diff===1)return S.lang==='fa'?'دیروز':S.lang==='ar'?'أمس':'Yesterday';
  const loc=S.lang==='fa'?'fa-IR':S.lang==='ar'?'ar-SA':'en-US';
  return d.toLocaleDateString(loc,{year:'numeric',month:'long',day:'numeric'});
}
function renderMessages(msgs){
  el.chat.innerHTML='';
  const frag=document.createDocumentFragment();
  let lastDay=null;
  msgs.forEach(m=>{
    const key=m.date?new Date(m.date).toDateString():null;
    if(key&&key!==lastDay){
      lastDay=key;
      const div=document.createElement('div');
      div.className='day-divider';
      div.innerHTML=`<span>${esc(dayLabel(m.date))}</span>`;
      frag.appendChild(div);
    }
    const tmp=document.createElement('div');
    tmp.innerHTML=m.role==='user'?userBubbleHTML(m.content):aiBubbleHTML(m.content,m.cid,(m.mid||(m.mid=uid())),m.vote);
    if(m.role!=='user'&&m.lead)addLeadButton(tmp.querySelector('.msg-group'));
    while(tmp.firstChild)frag.appendChild(tmp.firstChild);
  });
  el.chat.appendChild(frag);
}

/* ═══════════════════════════════════════════════════════════
   CHAT LIFECYCLE
   ═══════════════════════════════════════════════════════════ */
function newChat(silent){
  TTS.stop();
  cancelGeneration();
  persistCurrentChat();
  S.messages=[];S.chatId=uid();
  if(S.chatView!=='active'){
    S.chatView='active';
    $$('[data-chat-view]').forEach(t=>t.classList.toggle('active',t.dataset.chatView==='active'));
  }
  showWelcome();renderChatList();
  if(!silent){
    if(window.innerWidth<768)toggleSidebar(false);
    toast(t('toast.newChat'),'success');
  }
}
function cancelGeneration(){
  if(!S.generating)return;
  try{S.abort?.abort();}catch{}
  S.typingAbort=true;S.generating=false;
  stopTypingStages();el.typing.hidden=true;updateSend();
  toast(t('toast.genStopped'),'warning');
}
function loadChat(id){
  if(id===S.chatId&&S.messages.length){if(window.innerWidth<768)toggleSidebar(false);return;}
  TTS.stop();
  cancelGeneration();
  persistCurrentChat();
  const chat=S.chats.find(c=>c.id===id);if(!chat)return;
  S.chatId=id;S.messages=chat.messages.slice();
  renderMessages(S.messages);renderChatList();scrollToBottom(true);
  if(window.innerWidth<768)toggleSidebar(false);
}
$('#new-chat').addEventListener('click',()=>newChat());

/* ═══════════════════════════════════════════════════════════
   INPUT
   ═══════════════════════════════════════════════════════════ */
function autoResize(){const x=el.input;x.style.height='auto';x.style.height=Math.min(x.scrollHeight,150)+'px';}
function updateSend(){
  const hasContent=el.input.value.trim().length>0||S.attachment;
  const canSend=hasContent||S.generating;
  el.send.disabled=!canSend;
  el.send.classList.toggle('is-stop',S.generating);
  el.send.setAttribute('aria-label',S.generating?'stop':'send');
  const len=el.input.value.length;
  if(len>3500){el.charCount.classList.add('show');el.charCount.textContent=`${len}/4000`;}
  else el.charCount.classList.remove('show');
  const empty=!el.input.value.trim()&&!S.attachment;
  el.composer?.classList.toggle('show-quick',empty&&!S.generating&&document.activeElement===el.input);
}
el.input.addEventListener('input',()=>{autoResize();updateSend();});
el.input.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&window.innerWidth>=768){e.preventDefault();el.form.requestSubmit();}
});
el.input.addEventListener('focus',updateSend);
el.input.addEventListener('blur',()=>{setTimeout(()=>{if(!el.input.value.trim()&&!S.attachment)el.composer?.classList.remove('show-quick');},200);});
function sendQuickPrompt(text){el.input.value=text;autoResize();updateSend();el.form.requestSubmit();}

$$('#quick-row [data-quick]').forEach(chip=>{
  chip.addEventListener('click',()=>{
    const map={
      short:S.lang==='fa'?'خیلی خلاصه و کوتاه جواب بده.':S.lang==='ar'?'أجب بإيجاز.':'Answer briefly.',
      explain:S.lang==='fa'?'کامل و مفصل توضیح بده.':S.lang==='ar'?'اشرح بالتفصيل.':'Explain in detail.',
      examples:S.lang==='fa'?'با مثال توضیح بده.':S.lang==='ar'?'اشرح مع أمثلة.':'Explain with examples.',
      steps:S.lang==='fa'?'مرحله‌به‌مرحله توضیح بده.':S.lang==='ar'?'اشرح خطوة بخطوة.':'Explain step by step.',
    };
    const prefix=map[chip.dataset.quick]||'';
    el.input.value=(prefix+' '+el.input.value).trim();
    autoResize();updateSend();el.input.focus();
  });
});

/* ═══════════════════════════════════════════════════════════
   ATTACH
   ═══════════════════════════════════════════════════════════ */
$$('[data-pick]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const type=btn.dataset.pick;closeModal('m-file');
    setTimeout(()=>(type==='image'?$('#fi-image'):$('#fi-doc')).click(),180);
  });
});
function readFileBase64(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>{const res=String(r.result||'');const c=res.indexOf(',');resolve(c>=0?res.slice(c+1):'');};
    r.onerror=reject;r.readAsDataURL(file);
  });
}
const DOC_EXT=['pdf','txt','md','csv'], MAX_DOC_BYTES=2500000, MAX_IMG_B64=1200000;
function loadImage(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im);};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('img'));};im.src=u;});}
// تصویر قبل از ارسال کوچک می‌شود (کاهش حجم و توکن): حداکثر ۱۰۲۴ پیکسل، JPEG
async function shrinkImage(file){
  const im=await loadImage(file);let max=1024,q=.82;
  for(let i=0;i<5;i++){
    const sc=Math.min(1,max/Math.max(im.width,im.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*sc));c.height=Math.max(1,Math.round(im.height*sc));
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
    const b64=c.toDataURL('image/jpeg',q).split(',')[1]||'';
    if(b64&&b64.length<=MAX_IMG_B64)return b64;
    max=Math.round(max*.75);q=Math.max(.6,q-.06);
  }
  throw new Error('too big');
}
async function handleFile(file,type){
  if(!file)return;
  if(file.size>MAX_FILE_MB*1024*1024)return toast(t('toast.fileTooBig'),'error');
  try{
    let data,mime,size=file.size;
    if(type==='image'){
      if(!/^image\//.test(file.type))return toast(t('toast.fileType'),'error');
      data=await shrinkImage(file);mime='image/jpeg';size=Math.round(data.length*0.75);
    }else{
      const ext=(file.name.split('.').pop()||'').toLowerCase();
      if(!DOC_EXT.includes(ext))return toast(t('toast.fileType'),'error');
      if(file.size>MAX_DOC_BYTES)return toast(t('toast.docTooBig'),'error');
      data=await readFileBase64(file);mime=file.type||'application/octet-stream';
    }
    S.attachment={name:file.name,type,size,mime,data};
    el.attIcon.textContent=type==='image'?'🖼️':'📄';
    el.attName.textContent=file.name;
    el.attSize.textContent=fmtSize(size);
    el.attach.classList.add('show');
    updateSend();
    toast(`${t('toast.fileReady')} — "${file.name}"`,'success');
  }catch{toast(t('toast.fileReadError'),'error');}
}
$('#fi-image').addEventListener('change',e=>{handleFile(e.target.files[0],'image');e.target.value='';});
$('#fi-doc').addEventListener('change',e=>{handleFile(e.target.files[0],'document');e.target.value='';});
function removeAttachment(){S.attachment=null;el.attach.classList.remove('show');updateSend();}
$('#att-remove').addEventListener('click',removeAttachment);

/* ═══════════════════════════════════════════════════════════
   SUBMIT
   ═══════════════════════════════════════════════════════════ */
el.form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(S.generating){cancelGeneration();return;}
  const text=el.input.value.trim();
  if(!text&&!S.attachment)return;
  if(el.chat.querySelector('[data-prompt]'))el.chat.innerHTML='';
  let content=text;
  if(S.attachment)content+=(text?'\n':'')+`📎 ${S.attachment.name}`;
  const att=S.attachment;
  S.messages.push({role:'user',content,date:Date.now()});
  maybeInsertDayDivider();
  appendUser(content);
  S.lastAttachment=att?{att,idx:S.messages.length-1,chatId:S.chatId}:null;
  el.input.value='';el.input.style.height='auto';
  removeAttachment();
  await runCompletion(att);
});
function maybeInsertDayDivider(){
  const todayKey=new Date().toDateString();
  const prev=S.messages[S.messages.length-2];
  if(prev&&prev.date&&new Date(prev.date).toDateString()===todayKey)return;
  const div=document.createElement('div');
  div.className='day-divider';
  div.dataset.day=todayKey;
  div.innerHTML=`<span>${esc(dayLabel(Date.now()))}</span>`;
  el.chat.appendChild(div);
}
async function callAPI(att){
  S.abort=new AbortController();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;try{S.abort.abort();}catch{}},FETCH_TIMEOUT);
  const trimmed=S.messages.slice(-MAX_CTX);
  const messages=[];
  for(const m of trimmed){
    const role=m.role==='assistant'?'assistant':'user';
    const prev=messages[messages.length-1];
    if(prev&&prev.role===role){prev.content+='\n\n'+m.content;delete prev.sig;}
    else messages.push({role,content:m.content,sig:role==='assistant'?m.sig:undefined});
  }
  while(messages.length&&messages[0].role!=='user')messages.shift();
  const payload={messages,lang:S.lang,stream:STREAM_OK};
  if(att)payload.attachment={name:att.name,mime:att.mime,data:att.data,type:att.type};
  try{
    const res=await fetch('/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept-Language':S.lang},
      body:JSON.stringify(payload),
      signal:S.abort.signal
    });
    if(!res.ok){const d=await res.text().catch(()=>'');console.error('API Error:',res.status);let sm='',j={};try{j=JSON.parse(d);sm=(j.message||'').slice(0,300);}catch{}
      const e=new Error(sm||`Server error (${res.status})`);if(j.error==='busy'){e.name='BusyError';e.lead=!!j.lead;}throw e;}
    // پاسخ جریانی (SSE) فقط وقتی مدل صدا زده شده؛ کش/FAQ همان JSON است
    if((res.headers.get('content-type')||'').includes('text/event-stream')&&res.body){
      return {stream:res.body,clear:()=>clearTimeout(timer)};
    }
    const data=await res.json();
    if(!data.reply)throw new Error('Empty reply');
    return {reply:data.reply,sig:data.sig||'',cid:data.cid||'',lead:!!data.lead};
  }catch(err){
    if(timedOut){const e=new Error('timeout');e.name='TimeoutError';throw e;}
    throw err;
  }finally{clearTimeout(timer);}
}
const STREAM_OK=typeof ReadableStream!=='undefined'&&typeof TextDecoder!=='undefined';
// خواندن SSE و نمایش تدریجی در یک حباب تازه؛ خروجی: {reply,sig,cid,lead}
async function consumeStream(body,mid,stale){
  el.chat.insertAdjacentHTML('beforeend',aiBubbleHTML('','',mid));
  const groups=el.chat.querySelectorAll('.msg-group');
  const group=groups[groups.length-1];
  const bubble=group.querySelector('[data-role="ai"]');
  const actions=group.querySelector('.msg-actions');
  if(actions)actions.style.opacity='0';
  const cursor=document.createElement('span');cursor.className='typewriter-cursor';
  const reader=body.getReader(),dec=new TextDecoder();
  let buf='',text='',final=null,lastRender=0,pending=false;
  const render=(force)=>{
    const now=performance.now();
    if(!force&&now-lastRender<60){if(!pending){pending=true;setTimeout(()=>{pending=false;render(true);},60);}return;}
    lastRender=now;
    let t=text;if((t.match(/```/g)||[]).length%2)t+='\n```';
    bubble.innerHTML=md(t);bubble.appendChild(cursor);
    if(S.autoScroll)el.chat.scrollTop=el.chat.scrollHeight;
  };
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      if(stale()){try{reader.cancel();}catch{}return null;}
      buf+=dec.decode(value,{stream:true});
      let i;
      while((i=buf.indexOf('\n\n'))>=0){
        const line=buf.slice(0,i).trim();buf=buf.slice(i+2);
        if(!line.startsWith('data:'))continue;
        let ev;try{ev=JSON.parse(line.slice(5));}catch{continue;}
        if(ev.d){text+=ev.d;render(false);}
        else if(ev.done)final=ev;
        else if(ev.error){group.remove();throw new Error(ev.message||ev.error);}
      }
    }
  }catch(e){if(e.name==='AbortError'&&text){final={reply:text,sig:'',cid:''};}else{group.remove();throw e;}}
  if(!final){if(!text){group.remove();throw new Error('Empty reply');}final={reply:text,sig:'',cid:''};}
  bubble.innerHTML=md(final.reply);
  group.dataset.cid=final.cid||'';
  if(actions)actions.style.opacity='';
  if(S.autoScroll)el.chat.scrollTop=el.chat.scrollHeight;
  return {reply:final.reply,sig:final.sig||'',cid:final.cid||'',lead:!!final.lead,group};
}
let _runId=0;
async function runCompletion(att){
  const run=++_runId,cid=S.chatId;
  const stale=()=>run!==_runId||cid!==S.chatId;
  S.generating=true;
  el.typing.hidden=false;
  startTypingStages();updateSend();scrollToBottom(true);
  try{
    let _r=await callAPI(att);
    if(stale())return;
    stopTypingStages();el.typing.hidden=true;
    const mid=uid();
    if(_r.stream){
      const cl=_r.clear;
      try{_r=await consumeStream(_r.stream,mid,stale);}finally{cl&&cl();}
      if(!_r||stale())return;
    }else{
      await appendAITyped(_r.reply,_r.cid,mid);
      if(stale())return;
    }
    const reply=_r.reply;
    if(_r.lead)addLeadButton(el.chat.querySelector(`.msg-group[data-mid="${CSS.escape(mid)}"]`));
    S.messages.push({role:'assistant',content:reply,sig:_r.sig,cid:_r.cid||'',mid,vote:'',date:Date.now(),lead:!!_r.lead});
    persistCurrentChat();
    if(S.sound)playSound();
  }catch(err){
    if(stale())return;
    stopTypingStages();el.typing.hidden=true;
    if(err.name!=='AbortError'){
      if(err.name==='BusyError'){ // همهٔ سرویس‌های مدل پر: پیام دوستانه + دکمهٔ تماس (بدون «خطا»)
        el.chat.insertAdjacentHTML('beforeend',aiBubbleHTML(`⏳ ${err.message}`));
        if(err.lead)addLeadButton(el.chat.querySelector('.msg-group:last-child'));
        scrollToBottom(true);return;
      }
      const isTimeout=err.name==='TimeoutError'||String(err.message||'').toLowerCase().includes('timeout');
      const msg=isTimeout?t('error.timeout'):`${t('error.serverGeneric')}: ${err.message}`;
      el.chat.insertAdjacentHTML('beforeend',aiBubbleHTML(`⚠️ ${msg}\n${t('error.tryAgain')}`));
      toast(isTimeout?t('toast.timeout'):t('toast.serverError'),'error');
      scrollToBottom(true);
    }
  }finally{
    if(run===_runId){S.generating=false;updateSend();}
  }
}
async function regenerate(){
  if(S.generating)return;
  const lastUserIdx=S.messages.map(m=>m.role).lastIndexOf('user');
  if(lastUserIdx<0)return;
  S.messages=S.messages.slice(0,lastUserIdx+1);
  const groups=[...el.chat.querySelectorAll('.msg-group')];
  for(let i=groups.length-1;i>=0;i--){
    if(groups[i].querySelector('[data-role="ai"]')){groups[i].remove();break;}
  }
  const la=S.lastAttachment;
  const att=la&&la.chatId===S.chatId&&la.idx===lastUserIdx?la.att:null;
  await runCompletion(att);
}
el.send.addEventListener('click',e=>{if(S.generating){e.preventDefault();cancelGeneration();}});

/* ═══════════════════════════════════════════════════════════
   SOUND
   ═══════════════════════════════════════════════════════════ */
let _audioCtx=null;
function playSound(){
  try{
    if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(_audioCtx.state==='suspended')_audioCtx.resume();
    const o=_audioCtx.createOscillator(),g=_audioCtx.createGain();
    o.connect(g);g.connect(_audioCtx.destination);
    const now=_audioCtx.currentTime;
    o.type='sine';o.frequency.setValueAtTime(880,now);
    o.frequency.exponentialRampToValueAtTime(1320,now+0.1);
    g.gain.setValueAtTime(0.08,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.25);
    o.start(now);o.stop(now+0.25);
  }catch{}
}
['pointerdown','keydown','touchend'].forEach(ev=>document.addEventListener(ev,()=>{
  try{
    if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(_audioCtx.state==='suspended')_audioCtx.resume();
  }catch{}
},{once:true,passive:true}));
$('#sound-toggle').addEventListener('change',e=>{S.sound=e.target.checked;try{localStorage.setItem('n_sound',S.sound?'1':'0');}catch{}});

/* ═══════════════════════════════════════════════════════════
   RESET
   ═══════════════════════════════════════════════════════════ */
function resetToDefaults(){
  setLang(DEFAULTS.lang);
  applyTheme(DEFAULTS.theme);
  S.autoSendVoice=DEFAULTS.autoSendVoice;
  $('#font-size').value=DEFAULTS.fontSize;
  setFontSize(DEFAULTS.fontSize);
  S.sound=DEFAULTS.sound;
  $('#sound-toggle').checked=DEFAULTS.sound;
  try{localStorage.setItem('n_sound',DEFAULTS.sound?'1':'0');}catch{}
  toast(t('toast.defaultsRestored'),'success');
}
$('#reset-defaults').addEventListener('click',()=>{
  confirmDialog({title:t('confirm.resetTitle'),msg:t('confirm.resetMsg'),okText:t('confirm.resetOk'),variant:'danger',onConfirm:resetToDefaults});
});

/* ═══════════════════════════════════════════════════════════
   VOICE
   ═══════════════════════════════════════════════════════════ */
const Voice={
  mode:null,sr:null,mr:null,stream:null,chunks:[],
  active:false,starting:false,cancelled:false,
  startedAt:0,timerInt:null,MAX_SEC:60,
  audioCtx:null,analyser:null,sourceNode:null,rafId:null,

  setUI(active){
    this.active=active;
    el.voiceBtn.classList.toggle('recording',active);
    el.recPanel.classList.toggle('show',active);
    if(active){
      this.startedAt=Date.now();el.recTimer.textContent='00:00';
      clearInterval(this.timerInt);
      this.timerInt=setInterval(()=>{
        const s=Math.floor((Date.now()-this.startedAt)/1000);
        el.recTimer.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        if(s>=this.MAX_SEC)this.stop();
      },250);
    }else{clearInterval(this.timerInt);this.timerInt=null;}
  },
  startViz(stream){
    try{
      if(!this.audioCtx)this.audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      if(this.audioCtx.state==='suspended')this.audioCtx.resume();
      this.sourceNode=this.audioCtx.createMediaStreamSource(stream);
      const an=this.audioCtx.createAnalyser();
      an.fftSize=64;an.smoothingTimeConstant=0.7;
      this.sourceNode.connect(an);this.analyser=an;
      const data=new Uint8Array(an.frequencyBinCount);
      const bars=el.recPanel.querySelectorAll('.wave span');
      const wave=el.recPanel.querySelector('.wave');
      if(wave)wave.classList.add('live');
      const draw=()=>{
        if(!this.analyser)return;
        this.analyser.getByteFrequencyData(data);
        const n=bars.length;
        const step=Math.floor(data.length/(n+1))||1;
        bars.forEach((b,i)=>{
          const v=data[i*step+Math.floor(step/2)]||0;
          b.style.setProperty('--h',(5+(v/255)*19).toFixed(1)+'px');
        });
        this.rafId=requestAnimationFrame(draw);
      };
      draw();
    }catch(e){console.warn('viz failed',e);}
  },
  stopViz(){
    if(this.rafId)cancelAnimationFrame(this.rafId);
    this.rafId=null;
    try{this.sourceNode?.disconnect();}catch{}
    this.analyser=null;this.sourceNode=null;
    const wave=el.recPanel.querySelector('.wave');
    if(wave)wave.classList.remove('live');
    el.recPanel.querySelectorAll('.wave span').forEach(b=>b.style.removeProperty('--h'));
  },
  async prime(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(x=>x.stop());return true;}catch{return false;}},
  pickMime(){
    if(!window.MediaRecorder)return null;
    const c=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
    return c.find(x=>MediaRecorder.isTypeSupported(x))||'';
  },
  chooseEngine(){
    const hasSR=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
    const hasMR=!!navigator.mediaDevices?.getUserMedia&&!!window.MediaRecorder;
    if(isIOS)return hasMR?'mr':(hasSR?'sr':null);
    return hasSR?'sr':(hasMR?'mr':null);
  },
  async start(){
    if(this.starting)return;
    if(this.active){this.stop();return;}
    if(!isSecure)return toast(t('toast.httpsNeeded'),'error');
    if(!navigator.mediaDevices?.getUserMedia&&!window.SpeechRecognition&&!window.webkitSpeechRecognition)return toast(t('toast.noSupport'),'warning');
    const engine=this.chooseEngine();if(!engine)return toast(t('toast.noVoiceEngine'),'warning');
    this.starting=true;
    try{
      if(isIOS){const ok=await this.prime();if(!ok){toast(t('toast.micDenied'),'error');return;}}
      this.mode=engine;this.cancelled=false;
      if(engine==='sr')await this.startSR();else await this.startMR();
    }finally{this.starting=false;}
  },
  async startSR(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const rec=new SR();
    rec.lang=getLangCode();rec.continuous=false;rec.interimResults=true;rec.maxAlternatives=1;
    let gotResult=false;let silentTimer=null;
    rec.onstart=()=>this.setUI(true);
    rec.onresult=e=>{gotResult=true;const tr=Array.from(e.results).map(r=>r[0].transcript).join('');el.input.value=tr;autoResize();updateSend();};
    rec.onerror=e=>{
      if(!gotResult&&e.error!=='aborted'&&e.error!=='no-speech'){
        this.stopSR();this.setUI(false);
        if(navigator.mediaDevices?.getUserMedia&&!this.starting){
          this.starting=true;toast(t('toast.srFallback'),'info');this.mode='mr';
          setTimeout(async()=>{try{await this.startMR();}finally{this.starting=false;}},400);
          return;
        }
      }
      if(e.error==='not-allowed')toast(t('toast.micDenied'),'error');
      else if(e.error==='no-speech')toast(t('toast.srNoSpeech'),'warning');
      else toast(t('toast.srError'),'error');
      this.setUI(false);
    };
    rec.onend=()=>{
      this.setUI(false);if(this.sr===rec)this.sr=null;
      if(this.cancelled){
        this.cancelled=false;
        if(gotResult){el.input.value='';autoResize();updateSend();}
        return;
      }
      if(gotResult&&S.autoSendVoice){
        setTimeout(()=>{if(!S.generating&&(el.input.value.trim()||S.attachment))el.form.requestSubmit();},300);
      }
    };
    if(isIOS){
      silentTimer=setTimeout(()=>{
        if(!gotResult&&this.active){
          try{rec.abort();}catch{}
          this.sr=null;this.setUI(false);
          if(navigator.mediaDevices?.getUserMedia&&!this.starting){
            this.starting=true;toast(t('toast.serverModeActive'),'info');this.mode='mr';
            setTimeout(async()=>{try{await this.startMR();}finally{this.starting=false;}},300);
          }
        }
      },8000);
    }
    rec.addEventListener('end',()=>clearTimeout(silentTimer),{once:true});
    this.sr=rec;
    try{rec.start();}catch(e){toast(t('toast.startRecFailed'),'error');this.setUI(false);}
  },
  stopSR(){if(this.sr){try{this.sr.stop();}catch{}this.sr=null;}},
  async startMR(){
    try{this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});}
    catch{return toast(t('toast.micDenied'),'error');}
    const mime=this.pickMime();
    if(mime===null){this.cleanupMR();return toast(t('toast.recNotSupported'),'warning');}
    this.chunks=[];
    try{this.mr=mime?new MediaRecorder(this.stream,{mimeType:mime}):new MediaRecorder(this.stream);}
    catch(e){this.cleanupMR();return toast(t('toast.setupRecFailed'),'error');}
    this.mr.ondataavailable=e=>{if(e.data&&e.data.size)this.chunks.push(e.data);};
    this.mr.onstop=async()=>{
      const blob=new Blob(this.chunks,{type:this.mr?.mimeType||mime||'audio/webm'});
      this.cleanupMR();
      if(this.cancelled){this.cancelled=false;return;}
      if(blob.size<1200){toast(t('toast.recTooShort'),'warning');return;}
      await this.transcribe(blob);
    };
    this.mr.start(250);
    this.setUI(true);
    this.startViz(this.stream);
  },
  cleanupMR(){
    try{this.stopViz();}catch{}
    try{this.stream?.getTracks().forEach(x=>x.stop());}catch{}
    this.stream=null;this.mr=null;this.chunks=[];
  },
  async transcribe(blob){
    const btn=el.voiceBtn;
    const oldHTML=btn.innerHTML;
    const inputEl=el.input;
    btn.disabled=true;
    btn.innerHTML=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-9-9"/></svg>`;
    inputEl.dataset.prevPHKey='input.placeholder';
    inputEl.placeholder=t('toast.processingVoice');
    inputEl.value='';inputEl.disabled=true;
    el.composer?.classList.add('voice-processing');
    toast(t('toast.transcribing'),'info');
    try{
      const res=await fetch('/api/transcribe?lang='+encodeURIComponent(S.lang),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob});
      if(!res.ok)throw new Error(`Server error (${res.status})`);
      const data=await res.json();
      const text=(data.text||'').trim();
      if(!text){toast(t('toast.recNothing'),'warning');return;}
      inputEl.value=text;
      autoResize();updateSend();
      toast(t('toast.recAdded'),'success');
      if(S.autoSendVoice){
        setTimeout(()=>{if(!S.generating&&(el.input.value.trim()||S.attachment))el.form.requestSubmit();},500);
      }else inputEl.focus();
    }catch(e){console.error(e);toast(t('toast.recError'),'error');}
    finally{
      btn.disabled=false;
      btn.innerHTML=oldHTML;
      inputEl.disabled=false;
      el.composer?.classList.remove('voice-processing');
      inputEl.placeholder=t('input.placeholder');
    }
  },
  stop(){
    if(!this.active)return;
    if(this.mode==='sr')this.stopSR();
    else if(this.mr&&this.mr.state!=='inactive')this.mr.stop();
    this.stopViz();this.setUI(false);
  },
  cancel(){
    this.cancelled=true;
    if(this.mode==='sr')this.stopSR();
    else if(this.mr&&this.mr.state!=='inactive')this.mr.stop();
    this.stopViz();this.setUI(false);
    toast(t('toast.recCancel'),'info');
  },
};
el.voiceBtn.addEventListener('click',()=>Voice.start());
$('#rec-done').addEventListener('click',()=>Voice.stop());
$('#rec-cancel').addEventListener('click',()=>Voice.cancel());

/* ═══════════════════════════════════════════════════════════
   SHORTCUTS
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.code==='KeyK'){e.preventDefault();newChat();}
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.code==='Slash'){e.preventDefault();el.input.focus();}
  if(e.altKey&&e.shiftKey&&e.code==='KeyV'){e.preventDefault();Voice.start();}
  if(e.key==='Escape'&&window.innerWidth<768&&$('#sidebar').classList.contains('open')&&!$('.modal-backdrop.show'))toggleSidebar(false);
});
window.addEventListener('beforeunload',e=>{
  if(Voice.active||S.generating){e.preventDefault();e.returnValue=t('toast.leaveConfirm');return t('toast.leaveConfirm');}
});

/* ═══════════════════════════════════════════════════════════
   BOTTOM NAV
   ═══════════════════════════════════════════════════════════ */
function setBottomActive(k){$$('.bottom-item').forEach(b=>b.classList.toggle('active',b.dataset.bottom===k));}
$$('[data-bottom]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const what=btn.dataset.bottom;
    if(what==='new'){newChat();return;}
    if(what==='chats'){
      S.chatView='active';
      $$('[data-chat-view]').forEach(t=>t.classList.toggle('active',t.dataset.chatView==='active'));
      renderChatList();toggleSidebar(true);setBottomActive('chats');return;
    }
    if(what==='archive'){
      S.chatView='archived';
      $$('[data-chat-view]').forEach(t=>t.classList.toggle('active',t.dataset.chatView==='archived'));
      renderChatList();toggleSidebar(true);setBottomActive('archive');return;
    }
    if(what==='settings'){openModal('m-settings');return;}
    if(what==='about'){openModal('m-about');return;}
  });
});

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
(function init(){
  let savedLang=null;try{savedLang=localStorage.getItem('n_lang');}catch{}
  S.lang=['fa','ar','en'].includes(savedLang)?savedLang:DEFAULTS.lang;
  TTS.refresh();

  let savedTheme=null;try{savedTheme=localStorage.getItem('n_theme');}catch{}
  applyTheme((savedTheme==='dark'||savedTheme==='light')?savedTheme:(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':DEFAULTS.theme));

  applyI18n();setPlatform();


  let savedFontSize=null;try{savedFontSize=localStorage.getItem('n_fontsize');}catch{}
  const initFontSize=savedFontSize||DEFAULTS.fontSize;
  $('#font-size').value=initFontSize;
  setFontSize(initFontSize);

  let savedSound=null;try{savedSound=localStorage.getItem('n_sound');}catch{}
  S.sound=savedSound===null?DEFAULTS.sound:savedSound==='1';
  $('#sound-toggle').checked=S.sound;

  loadChats();
  S.chatId=uid();
  renderChatList();showWelcome();updateSend();

  if(!isSecure)setTimeout(()=>toast(t('toast.httpsNeeded'),'warning'),1500);
  window.addEventListener('pagehide',()=>{try{persistCurrentChat();}catch{}});
  const hideLoader=()=>{const l=$('#loader');l.classList.add('hide');setTimeout(()=>l.remove(),700);};
  Promise.race([document.fonts?.ready||Promise.resolve(),wait(1200)]).then(()=>wait(500)).then(hideLoader);
})();

/* ═══════════════════════════════════════════════════════════
   RUNTIME FIXES
   ═══════════════════════════════════════════════════════════ */
(function runtimeFixes(){
  if(typeof HTMLFormElement!=='undefined'&&!HTMLFormElement.prototype.requestSubmit){
    HTMLFormElement.prototype.requestSubmit=function(){
      const ev=new Event('submit',{bubbles:true,cancelable:true});
      if(this.dispatchEvent(ev)&&typeof this.submit==='function')this.submit();
    };
  }
  const root=document.documentElement,vv=window.visualViewport;
  if(vv){
    const apply=()=>{
      if(vv.scale>1.01){root.classList.remove('vv','kb-open');return;}
      const kb=window.innerHeight-vv.height>140;
      root.style.setProperty('--app-h',vv.height+'px');
      root.classList.toggle('vv',kb);
      root.classList.toggle('kb-open',kb);
      if(kb){window.scrollTo(0,0);if(S.autoScroll)scrollToBottom(true,true);}
    };
    vv.addEventListener('resize',apply);
    vv.addEventListener('scroll',()=>{if(root.classList.contains('kb-open'))window.scrollTo(0,0);});
  }
  const main=document.querySelector('main'),footer=document.querySelector('footer.composer-footer');
  if(main&&footer&&window.ResizeObserver){
    new ResizeObserver(()=>main.style.setProperty('--footer-h',footer.offsetHeight+'px')).observe(footer);
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){try{persistCurrentChat();}catch{}}
  });
  $$('[data-open]').forEach(n=>{
    if(n.tagName==='BUTTON')return;
    n.setAttribute('role','button');n.tabIndex=0;
    n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openModal(n.dataset.open);}});
  });
})();
