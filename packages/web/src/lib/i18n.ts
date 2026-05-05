// ─── i18n — FR / EN / AR ───

export type Lang = 'en' | 'fr' | 'ar';

export const LANGUAGES: { code: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Francais', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

const translations: Record<string, Record<Lang, string>> = {
  // Sidebar nav
  'nav.dashboard': { en: 'Dashboard', fr: 'Tableau de bord', ar: 'لوحة التحكم' },
  'nav.pipeline': { en: 'Pipeline', fr: 'Pipeline', ar: 'خط الأنابيب' },
  'nav.leads': { en: 'Leads', fr: 'Prospects', ar: 'العملاء المحتملين' },
  'nav.tasks': { en: 'Tasks', fr: 'Taches', ar: 'المهام' },
  'nav.retention': { en: 'Retention Desk', fr: 'Bureau Retention', ar: 'مكتب الاحتفاظ' },
  'nav.emails': { en: 'Emails', fr: 'Emails', ar: 'البريد الإلكتروني' },
  'nav.affiliates': { en: 'Affiliates', fr: 'Affilies', ar: 'الشركاء' },
  'nav.reports': { en: 'Reports', fr: 'Rapports', ar: 'التقارير' },

  // Sidebar footer
  'sidebar.lightMode': { en: 'Light Mode', fr: 'Mode clair', ar: 'الوضع الفاتح' },
  'sidebar.darkMode': { en: 'Dark Mode', fr: 'Mode sombre', ar: 'الوضع الداكن' },
  'sidebar.signOut': { en: 'Sign Out', fr: 'Deconnexion', ar: 'تسجيل الخروج' },
  'sidebar.department': { en: 'Department', fr: 'Departement', ar: 'القسم' },
  'sidebar.all': { en: 'All', fr: 'Tous', ar: 'الكل' },
  'sidebar.seller': { en: 'Seller', fr: 'Vendeur', ar: 'البائع' },
  'sidebar.retention': { en: 'Retention', fr: 'Retention', ar: 'الاحتفاظ' },
  'sidebar.language': { en: 'Language', fr: 'Langue', ar: 'اللغة' },

  // Buttons
  'btn.newLead': { en: 'New Lead', fr: 'Nouveau prospect', ar: 'عميل جديد' },
  'btn.exportCsv': { en: 'Export CSV', fr: 'Exporter CSV', ar: 'تصدير CSV' },
  'btn.importCsv': { en: 'Import CSV', fr: 'Importer CSV', ar: 'استيراد CSV' },
  'btn.call': { en: 'Call', fr: 'Appeler', ar: 'اتصال' },
  'btn.sendEmail': { en: 'Send Email', fr: 'Envoyer email', ar: 'إرسال بريد' },
  'btn.save': { en: 'Save', fr: 'Enregistrer', ar: 'حفظ' },
  'btn.cancel': { en: 'Cancel', fr: 'Annuler', ar: 'إلغاء' },
  'btn.add': { en: 'Add', fr: 'Ajouter', ar: 'إضافة' },
  'btn.search': { en: 'Search leads...', fr: 'Rechercher prospects...', ar: 'بحث العملاء...' },
  'btn.allStatuses': { en: 'All Statuses', fr: 'Tous les statuts', ar: 'جميع الحالات' },
  'btn.refreshReports': { en: 'Refresh Reports', fr: 'Actualiser rapports', ar: 'تحديث التقارير' },
  'btn.newAffiliate': { en: 'New Affiliate', fr: 'Nouvel affilie', ar: 'شريك جديد' },
  'btn.newTemplate': { en: 'New Template', fr: 'Nouveau modele', ar: 'قالب جديد' },
  'btn.loadDefaults': { en: 'Load Defaults', fr: 'Charger defauts', ar: 'تحميل الافتراضي' },

  // Headers
  'header.leads': { en: 'leads', fr: 'prospects', ar: 'عملاء' },
  'header.totalLeads': { en: 'Total Leads', fr: 'Total prospects', ar: 'إجمالي العملاء' },
  'header.myLeads': { en: 'My Leads', fr: 'Mes prospects', ar: 'عملائي' },
  'header.ftdVolume': { en: 'FTD Volume', fr: 'Volume FTD', ar: 'حجم FTD' },
  'header.todayCalls': { en: 'Today Calls', fr: 'Appels du jour', ar: 'مكالمات اليوم' },
  'header.todayTasks': { en: 'Today Tasks', fr: 'Taches du jour', ar: 'مهام اليوم' },
  'header.overdue': { en: 'Overdue', fr: 'En retard', ar: 'متأخر' },
  'header.notifications': { en: 'Notifications', fr: 'Notifications', ar: 'الإشعارات' },
  'header.markAllRead': { en: 'Mark all read', fr: 'Tout marquer lu', ar: 'تحديد الكل كمقروء' },
  'header.conversionPipeline': { en: 'Conversion Pipeline', fr: 'Pipeline conversion', ar: 'خط التحويل' },
  'header.agentLeaderboard': { en: 'Agent Leaderboard', fr: 'Classement agents', ar: 'ترتيب الوكلاء' },

  // Reports
  'reports.volumeToday': { en: 'Volume Today', fr: 'Volume du jour', ar: 'حجم اليوم' },
  'reports.pnlToday': { en: 'P&L Today', fr: 'P&L du jour', ar: 'الربح/الخسارة اليوم' },
  'reports.depositsToday': { en: 'Deposits Today', fr: 'Depots du jour', ar: 'الإيداعات اليوم' },
  'reports.withdrawalsToday': { en: 'Withdrawals Today', fr: 'Retraits du jour', ar: 'السحوبات اليوم' },
  'reports.topInstruments': { en: 'Top Instruments', fr: 'Top instruments', ar: 'أفضل الأدوات' },
  'reports.dailyVolume': { en: 'Daily Volume (30 days)', fr: 'Volume quotidien (30j)', ar: 'الحجم اليومي (30 يوم)' },
  'reports.dailyPnl': { en: 'Daily P&L (30 days)', fr: 'P&L quotidien (30j)', ar: 'الربح/الخسارة اليومي (30 يوم)' },

  // Lead detail
  'lead.activity': { en: 'Activity', fr: 'Activite', ar: 'النشاط' },
  'lead.notes': { en: 'Notes', fr: 'Notes', ar: 'ملاحظات' },
  'lead.calls': { en: 'Calls', fr: 'Appels', ar: 'المكالمات' },
  'lead.tasks': { en: 'Tasks', fr: 'Taches', ar: 'المهام' },
  'lead.kyc': { en: 'KYC', fr: 'KYC', ar: 'KYC' },
  'lead.trades': { en: 'Trades', fr: 'Trades', ar: 'الصفقات' },
  'lead.source': { en: 'Source', fr: 'Source', ar: 'المصدر' },
  'lead.created': { en: 'Created', fr: 'Cree', ar: 'تاريخ الإنشاء' },
  'lead.lastContact': { en: 'Last Contact', fr: 'Dernier contact', ar: 'آخر اتصال' },
  'lead.status': { en: 'Status', fr: 'Statut', ar: 'الحالة' },
  'lead.assignedTo': { en: 'Assigned To', fr: 'Assigne a', ar: 'مسؤول' },
  'lead.priority': { en: 'Priority', fr: 'Priorite', ar: 'الأولوية' },

  // Login
  'login.welcome': { en: 'Welcome back', fr: 'Bienvenue', ar: 'مرحبا بعودتك' },
  'login.subtitle': { en: 'Sign in to your CRM dashboard', fr: 'Connectez-vous a votre CRM', ar: 'سجل الدخول إلى لوحة CRM' },
  'login.signIn': { en: 'Sign In to CRM', fr: 'Se connecter au CRM', ar: 'تسجيل الدخول' },
  'login.signingIn': { en: 'Signing in...', fr: 'Connexion...', ar: 'جاري التسجيل...' },

  // Table headers
  'table.lead': { en: 'Lead', fr: 'Prospect', ar: 'العميل' },
  'table.contact': { en: 'Contact', fr: 'Contact', ar: 'الاتصال' },
  'table.kyc': { en: 'KYC', fr: 'KYC', ar: 'KYC' },
  'table.agent': { en: 'Agent', fr: 'Agent', ar: 'الوكيل' },
};

export function t(key: string, lang: Lang): string {
  return translations[key]?.[lang] || translations[key]?.en || key;
}

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('crm_lang');
  if (saved && ['en', 'fr', 'ar'].includes(saved)) return saved as Lang;
  return 'en';
}

export function setLang(lang: Lang) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('crm_lang', lang);
  // Set RTL
  const dir = LANGUAGES.find(l => l.code === lang)?.dir || 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}
