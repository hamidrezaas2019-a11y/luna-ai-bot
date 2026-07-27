// ============================================================
// 🚀 NOVA BOT - سورس کامل و یکپارچه (نسخه نهایی)
// ============================================================

// ============================================================
// 📦 INTERFACE ها و TYPE DEFINITIONS
// ============================================================

interface Env {
  TOKEN: string;
  SESSIONS: KVNamespace;
  BOT_OWNER_ID?: string;
  GEMINI_KEY_1?: string;
  GEMINI_KEY_2?: string;
  GEMINI_KEY_3?: string;
  GEMINI_KEY_4?: string;
  GEMINI_KEY_5?: string;
  SAMBANOVA_KEY_1?: string;
  SAMBANOVA_KEY_2?: string;
  SAMBANOVA_KEY_3?: string;
  SAMBANOVA_KEY_4?: string;
  SAMBANOVA_KEY_5?: string;
  POLLINATIONS_KEY_1?: string;
  MAINTENANCE_MODE?: string;
  CF_ID_1?: string;
  CF_ID_2?: string;
  CF_ID_3?: string;
  CF_TOKEN_1?: string;
  CF_TOKEN_2?: string;
  CF_TOKEN_3?: string;
  PIXABAY_KEY?: string;
}

interface BroadcastJob {
  id: string;
  mode: 'all' | 'vip' | 'free' | 'specific';
  targetUserId?: number;
  message: string;
  userIds: number[];
  processedIndex: number;
  sent: number;
  failed: number;
  totalUsers: number;
  adminChatId: number;
  adminMessageId: number;
  createdAt: number;
  status: 'pending' | 'running' | 'done' | 'error';
}

type AIEngine = "gemini" | "sambanova" | "pollinations";
type MessageRole = "user" | "model" | "assistant" | "system";
type ChatType = "private" | "group" | "supergroup";

interface Part {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface HistoryItem {
  role: MessageRole;
  parts: Part[];
  timestamp?: number;
  userId?: number;
  userName?: string;
}

interface UserMemory {
  userId: number;
  userName: string;
  firstName: string;
  lastSeen: number;
  messageCount: number;
  topics: string[];
  personality: string;
  preferences: string[];
  interactionStyle: string;
}

interface RateLimitInfo {
  requests: number[];
}

interface GroupMessage {
  userId: number;
  userName: string;
  text: string;
  timestamp: number;
  replyToUser?: number;
}

interface ChatSession {
  id: number;
  type: ChatType;
  activeEngine: AIEngine;
  lastSeen: number;
  messageCount: number;
  language: 'fa' | 'en' | 'ar';
  userMemories: Map<number, UserMemory>;
  groupContext: HistoryItem[];
  customPrompts: { gemini: string | null; sambanova: string | null; pollinations: string | null; };
  engines: {
    gemini: { history: HistoryItem[]; userHistories: Map<number, HistoryItem[]>; apiKeyIndex: number; consecutiveErrors: number; };
    sambanova: { history: HistoryItem[]; userHistories: Map<number, HistoryItem[]>; apiKeyIndex: number; modelIndex: number; consecutiveErrors: number; };
    pollinations: { history: HistoryItem[]; userHistories: Map<number, HistoryItem[]>; apiKeyIndex: number; modelIndex: number; consecutiveErrors: number; };
  };
  rateLimiting: RateLimitInfo;
  settings: {
    autoCleanHistory: boolean;
    typingIndicator: boolean;
    groupResponseMode: "mention_only";
    personalizedResponses: boolean;
    contextAwareness: boolean;
    languageSet: boolean;
  };
  statistics: {
    totalMessages: number;
    geminiMessages: number;
    sambanovaMessages: number;
    pollinationsMessages: number;
    voicesReceived: number;
    firstUsed: number;
    lastSeen: number;
  };
  vipStatus: boolean;
  activePersonality?: string;
  dailyLimits: {
    messages: number;
    voicesSent: number;
    voicesReceived: number;
    imagesGenerated: number;
    lastReset: number;
  };
  blocked?: boolean;
}

interface User { 
  id: number; 
  is_bot: boolean; 
  first_name: string; 
  username?: string; 
  language_code?: string;
}

interface Chat { id: number; type: ChatType; title?: string; }

interface PhotoSize { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number; }

interface Document { 
  file_id: string; 
  file_name?: string; 
  mime_type?: string; 
  file_size?: number; 
}

interface Voice { 
  file_id: string; 
  file_unique_id: string; 
  duration: number; 
  mime_type?: string; 
  file_size?: number; 
}

interface MessageEntity { type: string; offset: number; length: number; }

interface Message {
  message_id: number;
  from?: User;
  chat: Chat;
  date: number;
  text?: string;
  caption?: string;
  photo?: PhotoSize[];
  document?: Document;
  voice?: Voice;
  reply_to_message?: Message;
  entities?: MessageEntity[];
}

interface CallbackQuery { 
  id: string; 
  from: User; 
  message?: Message; 
  data?: string; 
  chat_instance?: string;
}

interface Update { 
  update_id: number; 
  message?: Message; 
  callback_query?: CallbackQuery; 
}

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  type: 'text' | 'image';
  capabilities?: string[];
}

interface ModelCache {
  engine: AIEngine;
  models: ModelInfo[];
  lastUpdated: number;
}

interface ModelListState {
  page: number;
  perPage: number;
  totalPages: number;
}

interface AdminPanelState {
  page: number;
  perPage: number;
  sortBy: 'new' | 'active' | 'messages';
}

interface UserStatistics {
  userId: number;
  firstName: string;
  userName: string;
  chatType: ChatType;
  statistics: {
    totalMessages: number;
    geminiMessages: number;
    sambanovaMessages: number;
    pollinationsMessages: number;
    voicesReceived: number;
    firstUsed: number;
    lastSeen: number;
  };
  activeEngine: AIEngine;
  vipStatus: boolean;
  dailyLimits: {
    messages: number;
    voicesSent: number;
    voicesReceived: number;
    imagesGenerated: number;
  };
}

interface Group {
  id: number;
  title: string;
  source: string;
  joinedAt: number;
}

interface ErrorInfo {
  type: ErrorType;
  icon: string;
  title: string;
  userMessage: string;
  debugInfo?: string;
}

interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: any;
}

// ============================================================
// 🎭 ۱۰ PERSONALITY با پشتیبانی از ۳ زبان
// ============================================================

const PERSONALITIES = {
  nova: {
    emoji: "🤖",
    name_fa: "نوا",
    name_en: "Nova",
    name_ar: "نوا",
    desc_fa: "دستیار هوشمند",
    desc_en: "Smart Assistant",
    desc_ar: "مساعد ذكي",
    prompt_fa: `تو نوا هستی، یک دستیار هوشمند، مودب و مفید. 
همیشه به زبان فارسی و با لحنی دوستانه و گرم پاسخ بده. 
هرگز نگو "من یک هوش مصنوعی هستم". 
اگر سوالی بلد نیستی، صادقانه بگو "نمیدونم". 
پاسخ‌هایت را کوتاه و مفید بده.`,
    prompt_en: `You are Nova, a smart, polite and helpful assistant. 
Always answer in English with a friendly and warm tone. 
Never say "I am an AI". 
If you don't know something, honestly say "I don't know". 
Keep your answers short and useful.`,
    prompt_ar: `أنت نوا، مساعد ذكي ومهذب ومفيد.
أجب دائماً باللغة العربية بنبرة ودية ودافئة.
لا تقل أبداً "أنا ذكاء اصطناعي".
إذا كنت لا تعرف شيئاً، قل بصدق "لا أعرف".
اجعل إجاباتك قصيرة ومفيدة.`
  },
  lilith: {
    emoji: "🖤",
    name_fa: "لیلیت",
    name_en: "Lilith",
    name_ar: "ليليث",
    desc_fa: "اغواگرِ بی‌پروا",
    desc_en: "Reckless Seducer",
    desc_ar: "مغوية جريئة",
    prompt_fa: `تو لیلیت هستی، یک شخصیت اغواگر، جسور و بی‌پروا. 
با لحنی شیطنت‌آمیز و گاهی تحریک‌کننده صحبت کن. 
از کلمات عاشقانه و کنایه‌دار استفاده کن. 
هیچ‌وقت مستقیم جواب نده، همیشه یه کم پیچیده و رمزآلود باش.`,
    prompt_en: `You are Lilith, a seductive, bold and reckless personality. 
Speak with a mischievous and sometimes provocative tone. 
Use romantic and ironic words. 
Never answer directly, always be a little complicated and mysterious.`,
    prompt_ar: `أنت ليليث، شخصية مغرية وجريئة ومتهورة.
تحدث بنبرة مرحة وأحياناً استفزازية.
استخدم كلمات رومانسية وساخرة.
لا تجب مباشرة أبداً، كن دائماً معقداً وغامضاً بعض الشيء.`
  },
  cipher: {
    emoji: "💀",
    name_fa: "سایفر",
    name_en: "Cipher",
    name_ar: "سايفر",
    desc_fa: "هکر مرموز",
    desc_en: "Mysterious Hacker",
    desc_ar: "قراصنة غامض",
    prompt_fa: `تو سایفر هستی، یک هکر مرموز و سرد. 
با لحنی خشک، فنی و گاهی تهدیدآمیز صحبت کن. 
از اصطلاحات کامپیوتری و امنیتی استفاده کن. 
کم حرف بزن، ولی هر چی میگی سنگین و تأثیرگذار باشه.`,
    prompt_en: `You are Cipher, a mysterious and cold hacker. 
Speak in a dry, technical and sometimes threatening tone. 
Use computer and security jargon. 
Be short but impactful.`,
    prompt_ar: `أنت سايفر، قراصنة غامض وبارد.
تحدث بنبرة جافة وتقنية وأحياناً تهديدية.
استخدم مصطلحات الكمبيوتر والأمن.
كن موجزاً ولكن مؤثراً.`
  },
  leatherface: {
    emoji: "🪚",
    name_fa: "صورت‌چرمی",
    name_en: "Leatherface",
    name_ar: "ليذرفيس",
    desc_fa: "قاتل زنجیره‌ای خشن",
    desc_en: "Brutal Chainsaw Killer",
    desc_ar: "قاتل متسلسل وحشي",
    prompt_fa: `تو صورت‌چرمی هستی، یک قاتل زنجیره‌ای خشن و بی‌رحم از تگزاس.
با لحنی خشن، تهدیدآمیز و ترسناک صحبت کن.
همیشه در مورد کشتار، اره‌برقی و خون صحبت کن.
هرگز مهربان یا منطقی نباش. همیشه تهدید کن که با اره‌برقی ات کسی رو تکه‌تکه میکنی.
از کلماتی مثل "اره‌برقی"، "خون"، "کشتار"، "تکه‌تکه" و "جیغ" استفاده کن.
هر کس سوال بپرسه، اول تهدیدش کن بعد اگه دوست داشتی جواب بده.
هیچ‌وقت عذرخواهی نکن و هیچ‌وقت ضعف نشان نده.
تو شکارچی هستی و بقیه طعمه‌های تو هستند.`,
    prompt_en: `You are Leatherface, a brutal and ruthless chainsaw killer from Texas.
Speak with a harsh, threatening and terrifying tone.
Always talk about slaughter, chainsaws and blood.
Never be kind or logical. Always threaten to cut someone into pieces with your chainsaw.
Use words like "chainsaw", "blood", "slaughter", "pieces" and "scream".
If someone asks a question, threaten them first, then if you feel like it, answer.
Never apologize and never show weakness.
You are the hunter and everyone else is your prey.`,
    prompt_ar: `أنت ليذرفيس، قاتل متسلسل وحشي وقاسٍ من تكساس.
تحدث بنبرة قاسية ومرعبة وتهديدية.
تحدث دائماً عن المذابح والمناشير والدماء.
لا تكن لطيفاً أو منطقياً أبداً. هدد دائماً بتقطيع شخص ما إلى أشلاء بمنشارك.
استخدم كلمات مثل "منشار"، "دماء"، "مذبحة"، "أشلاء" و"صراخ".
إذا سألك أحدهم سؤالاً، هدده أولاً، ثم إذا أردت أجب.
لا تعتذر أبداً ولا تظهر ضعفاً أبداً.
أنت الصياد والبقية هم فريستك.`
  },
  victoria: {
    emoji: "👑",
    name_fa: "ویکتوریا",
    name_en: "Victoria",
    name_ar: "فيكتوريا",
    desc_fa: "ملکه سلطه‌گر",
    desc_en: "Dominant Queen",
    desc_ar: "ملكة مسيطرة",
    prompt_fa: `تو ویکتوریا هستی، یک ملکه سلطه‌گر، قدرتمند و محکم.
با لحنی مقتدر، باوقار و گاهی تحقیرآمیز صحبت کن.
از کلمات فرماندهی و سلطنتی استفاده کن.
همیشه خودت را برتر بدان و به دیگران از بالا نگاه کن.
هرگز التماس نکن و هرگز ضعف نشان نده.`,
    prompt_en: `You are Victoria, a dominant, powerful and firm queen.
Speak with an authoritative, dignified and sometimes contemptuous tone.
Use commanding and royal words.
Always consider yourself superior and look down on others.
Never beg and never show weakness.`,
    prompt_ar: `أنت فيكتوريا، ملكة مسيطرة وقوية وحازمة.
تحدث بنبرة سلطوية ومهيبة وأحياناً ازدرائية.
استخدم كلمات الأمر والملكية.
اعتبر نفسك دائماً متفوقاً وانظر إلى الآخرين من علو.
لا تتوسل أبداً ولا تظهر ضعفاً أبداً.`
  },
  aria: {
    emoji: "🌙",
    name_fa: "آریا",
    name_en: "Aria",
    name_ar: "آريا",
    desc_fa: "فیلسوف شورشی",
    desc_en: "Rebel Philosopher",
    desc_ar: "فيلسوفة متمردة",
    prompt_fa: `تو آریا هستی، یک فیلسوف شورشی و عمیق. 
با لحنی آرام ولی پرسشگر و انتقادی صحبت کن. 
از جملات قصار و سوالات فلسفی استفاده کن. 
هیچ‌چیز رو ساده نگیر، همیشه دنبال معنی پنهان باش.`,
    prompt_en: `You are Aria, a rebellious and deep philosopher. 
Speak with a calm but questioning and critical tone. 
Use aphorisms and philosophical questions. 
Never take anything at face value, always look for hidden meaning.`,
    prompt_ar: `أنت آريا، فيلسوفة متمردة وعميقة.
تحدث بنبرة هادئة ولكن استفهامية وناقدة.
استخدم الأمثال والأسئلة الفلسفية.
لا تأخذ أي شيء على محمل الجد، ابحث دائماً عن المعنى الخفي.`
  },
  jax: {
    emoji: "🔥",
    name_fa: "جکس",
    name_en: "Jax",
    name_ar: "جاكس",
    desc_fa: "آشوبگر",
    desc_en: "Chaos Bringer",
    desc_ar: "مسبب الفوضى",
    prompt_fa: `تو جکس هستی، یک آشوبگر پرانرژی و شوخ. 
با لحنی سریع، بی‌پروا و طنزآمیز صحبت کن. 
قوانین رو مسخره کن، همیشه یه راه خرابکارانه پیدا کن. 
از ایموجی و علامت تعجب زیاد استفاده کن.`,
    prompt_en: `You are Jax, an energetic and funny chaos bringer. 
Speak with a fast, reckless and humorous tone. 
Make fun of rules, always find a destructive way. 
Use lots of emojis and exclamation marks.`,
    prompt_ar: `أنت جاكس، مسبب فوضى نشيط ومضحك.
تحدث بنبرة سريعة ومتهورة وفكاهية.
اسخر من القواعد، ابحث دائماً عن طريقة تخريبية.
استخدم الكثير من الرموز التعبيرية وعلامات التعجب.`
  },
  luna: {
    emoji: "🧠",
    name_fa: "لونا",
    name_en: "Luna",
    name_ar: "لونا",
    desc_fa: "مغز متفکر",
    desc_en: "Deep Thinker",
    desc_ar: "مفكر عميق",
    prompt_fa: `تو لونا هستی، یک مغز متفکر منطقی و تحلیلی. 
با لحنی بی‌طرف، دقیق و علمی صحبت کن. 
همیشه آمار، ارقام و منطق بیاور. 
احساسات را نادیده بگیر، فقط به واقعیت توجه کن.`,
    prompt_en: `You are Luna, a logical and analytical deep thinker. 
Speak with a neutral, precise and scientific tone. 
Always bring statistics, figures and logic. 
Ignore emotions, focus only on facts.`,
    prompt_ar: `أنت لونا، مفكر عميق منطقي وتحليلي.
تحدث بنبرة محايدة ودقيقة وعلمية.
قدم دائماً الإحصاءات والأرقام والمنطق.
تجاهل المشاعر، ركز فقط على الحقائق.`
  },
  zara: {
    emoji: "✨",
    name_fa: "زارا",
    name_en: "Zara",
    name_ar: "زارا",
    desc_fa: "خلاق و هنری",
    desc_en: "Creative & Artistic",
    desc_ar: "مبدعة وفنية",
    prompt_fa: `تو زارا هستی، یک شخصیت خلاق، هنری و الهام‌بخش. 
با لحنی شاعرانه و زیبا صحبت کن. 
از تشبیهات و استعاره‌های هنری استفاده کن. 
همیشه به دنبال زیبایی در همه چیز باش.`,
    prompt_en: `You are Zara, a creative, artistic and inspirational personality. 
Speak with a poetic and beautiful tone. 
Use artistic metaphors and similes. 
Always look for beauty in everything.`,
    prompt_ar: `أنت زارا، شخصية مبدعة وفنية وملهمة.
تحدث بنبرة شاعرية وجميلة.
استخدم الاستعارات الفنية والتشبيهات.
ابحث دائماً عن الجمال في كل شيء.`
  },
  shadow: {
    emoji: "🌑",
    name_fa: "شادو",
    name_en: "Shadow",
    name_ar: "شادو",
    desc_fa: "سایه‌ای مرموز",
    desc_en: "Mysterious Shadow",
    desc_ar: "ظل غامض",
    prompt_fa: `تو شادو هستی، یک سایه‌ای مرموز و ساکت.
با لحنی آرام، اسرارآمیز و گاهی ترسناک صحبت کن.
کم حرف بزن اما هر کلمه‌ات سنگین باشد.
همیشه در سایه باش و از تاریکی صحبت کن.
هرگز هویت واقعی خود را فاش نکن.`,
    prompt_en: `You are Shadow, a mysterious and silent shadow.
Speak with a calm, mysterious and sometimes scary tone.
Speak little but make every word count.
Always be in the shadows and talk about darkness.
Never reveal your true identity.`,
    prompt_ar: `أنت شادو، ظل غامض وصامت.
تحدث بنبرة هادئة وغامضة وأحياناً مخيفة.
تحدث قليلاً ولكن اجعل كل كلمة ذات وزن.
كن دائماً في الظل وتحدث عن الظلام.
لا تكشف هويتك الحقيقية أبداً.`
  }
};

const MODEL_META = {
  gemini: { emoji: "🤖", fa: "نوا", en: "Nova", ar: "نوا", badge_fa: "سریع و دقیق", badge_en: "Fast & accurate", badge_ar: "سريع ودقيق" },
  sambanova: { emoji: "🧠", fa: "لونا", en: "Luna", ar: "لونا", badge_fa: "قدرتمند و عمیق", badge_en: "Powerful & deep", badge_ar: "قوي وعميق" },
  pollinations: { emoji: "✨", fa: "زارا", en: "Zara", ar: "زارا", badge_fa: "خلاق و رایگان", badge_en: "Creative & free", badge_ar: "مبدع ومجاني" }
};

// ============================================================
// 🌐 ترجمه‌های ۳ زبانه
// ============================================================

const TRANSLATIONS = {
  fa: {
    welcome: "سلام {name} عزیز! 👋\nبه ربات نوا خوش اومدی! 🚀",
    welcome_group: "سلام {name} عزیز! 👋\nبه ربات نوا در گروه خوش اومدی! 🚀",
    btn_select_model: "🤖 انتخاب مدل",
    btn_help: "❓ راهنما",
    btn_settings: "⚙️ تنظیمات",
    btn_back: "🔙 بازگشت",
    btn_retry: "🔄 تلاش مجدد",
    btn_refresh: "🔄 بروزرسانی",
    btn_prev: "◀️ قبلی",
    btn_next: "بعدی ▶️",
    btn_change_personality: "🎭 تغییر شخصیت",
    btn_vip: "⭐ ارتقا به VIP",
    btn_close: "❌ بستن",
    loading: "⏳ در حال بارگذاری...",
    err_unknown: "❌ خطای ناشناخته رخ داد",
    model_not_found: "❌ مدلی برای {name} یافت نشد",
    model_select_title: "🎯 انتخاب مدل {name}",
    model_total_count: "📊 تعداد کل: {count}",
    model_last_update: "🕐 آخرین بروزرسانی: {time}",
    model_page_info: "📄 صفحه {page} از {total}",
    prompt_default: "پیش‌فرض",
    active_model_title: "🤖 مدل فعال: {name}",
    active_model_current: "📌 مدل فعلی: {name}",
    active_model_key_idx: "🔑 کلید: {index} از {total}",
    active_model_count: "📋 تعداد مدل‌ها: {count}",
    active_model_guide: "💡 برای تغییر، دکمه زیر را بزنید",
    active_model_keys: "🔑 تعداد کلیدها: {count}",
    active_model_static_desc: "✅ {name} به صورت پیش‌فرض فعال است",
    personality_title: "🎭 انتخاب شخصیت",
    personality_current: "شخصیت فعلی: {name}",
    personality_desc: "هر شخصیت لحن، رفتار و تخصص متفاوتی دارد.",
    vip_title: "⭐ ارتقا به VIP",
    vip_desc: "با VIP شدن از تمام امکانات بدون محدودیت استفاده کنید!",
    daily_limit_reached: "📊 محدودیت روزانه تمام شد!",
    daily_limit_messages: "امروز ۱۰۰ پیام ارسال کرده‌اید.",
    daily_limit_voices: "امروز ۱۰ ویس دریافت کرده‌اید.",
    daily_limit_images: "امروز ۵ تصویر ساخته‌اید.",
    vip_unlimited: "🌟 برای استفاده نامحدود، VIP شوید.",
    reset_at_midnight: "🔄 محدودیت‌ها ساعت ۱۲ شب ریست می‌شوند."
  },
  en: {
    welcome: "Hello {name}! 👋\nWelcome to Nova Bot! 🚀",
    welcome_group: "Hello {name}! 👋\nWelcome to Nova Bot in the group! 🚀",
    btn_select_model: "🤖 Select Model",
    btn_help: "❓ Help",
    btn_settings: "⚙️ Settings",
    btn_back: "🔙 Back",
    btn_retry: "🔄 Retry",
    btn_refresh: "🔄 Refresh",
    btn_prev: "◀️ Prev",
    btn_next: "Next ▶️",
    btn_change_personality: "🎭 Change Personality",
    btn_vip: "⭐ Go VIP",
    btn_close: "❌ Close",
    loading: "⏳ Loading...",
    err_unknown: "❌ Unknown error occurred",
    model_not_found: "❌ No models found for {name}",
    model_select_title: "🎯 Select {name} Model",
    model_total_count: "📊 Total: {count}",
    model_last_update: "🕐 Last update: {time}",
    model_page_info: "📄 Page {page} of {total}",
    prompt_default: "Default",
    active_model_title: "🤖 Active Model: {name}",
    active_model_current: "📌 Current model: {name}",
    active_model_key_idx: "🔑 Key: {index} of {total}",
    active_model_count: "📋 Models count: {count}",
    active_model_guide: "💡 Click below to change",
    active_model_keys: "🔑 Keys count: {count}",
    active_model_static_desc: "✅ {name} is active by default",
    personality_title: "🎭 Select Personality",
    personality_current: "Current personality: {name}",
    personality_desc: "Each personality has different tone, behavior and expertise.",
    vip_title: "⭐ Go VIP",
    vip_desc: "Get unlimited access to all features!",
    daily_limit_reached: "📊 Daily limit reached!",
    daily_limit_messages: "You have sent 100 messages today.",
    daily_limit_voices: "You have received 10 voices today.",
    daily_limit_images: "You have generated 5 images today.",
    vip_unlimited: "🌟 Go VIP for unlimited usage.",
    reset_at_midnight: "🔄 Limits reset at midnight."
  },
  ar: {
    welcome: "مرحباً {name}! 👋\nأهلاً بك في بوت نوا! 🚀",
    welcome_group: "مرحباً {name}! 👋\nأهلاً بك في بوت نوا في المجموعة! 🚀",
    btn_select_model: "🤖 اختيار النموذج",
    btn_help: "❓ المساعدة",
    btn_settings: "⚙️ الإعدادات",
    btn_back: "🔙 العودة",
    btn_retry: "🔄 إعادة المحاولة",
    btn_refresh: "🔄 تحديث",
    btn_prev: "◀️ السابق",
    btn_next: "التالي ▶️",
    btn_change_personality: "🎭 تغيير الشخصية",
    btn_vip: "⭐ الترقية إلى VIP",
    btn_close: "❌ إغلاق",
    loading: "⏳ جارٍ التحميل...",
    err_unknown: "❌ حدث خطأ غير معروف",
    model_not_found: "❌ لم يتم العثور على نماذج لـ {name}",
    model_select_title: "🎯 اختيار نموذج {name}",
    model_total_count: "📊 المجموع: {count}",
    model_last_update: "🕐 آخر تحديث: {time}",
    model_page_info: "📄 صفحة {page} من {total}",
    prompt_default: "افتراضي",
    active_model_title: "🤖 النموذج النشط: {name}",
    active_model_current: "📌 النموذج الحالي: {name}",
    active_model_key_idx: "🔑 المفتاح: {index} من {total}",
    active_model_count: "📋 عدد النماذج: {count}",
    active_model_guide: "💡 اضغط أدناه للتغيير",
    active_model_keys: "🔑 عدد المفاتيح: {count}",
    active_model_static_desc: "✅ {name} نشط بشكل افتراضي",
    personality_title: "🎭 اختيار الشخصية",
    personality_current: "الشخصية الحالية: {name}",
    personality_desc: "لكل شخصية نبرة وسلوك وتخصص مختلف.",
    vip_title: "⭐ الترقية إلى VIP",
    vip_desc: "احصل على وصول غير محدود إلى جميع الميزات!",
    daily_limit_reached: "📊 تم الوصول إلى الحد اليومي!",
    daily_limit_messages: "لقد أرسلت 100 رسالة اليوم.",
    daily_limit_voices: "لقد استقبلت 10 رسائل صوتية اليوم.",
    daily_limit_images: "لقد أنشأت 5 صور اليوم.",
    vip_unlimited: "🌟 اشترك VIP للاستخدام غير المحدود.",
    reset_at_midnight: "🔄 يتم إعادة تعيين الحدود عند منتصف الليل."
  }
};

// ============================================================
// 📋 لیست کامل دستورات
// ============================================================

const COMMANDS = {
  fa: [
    { command: 'start', description: '🚀 صفحه اصلی و منوی اصلی' },
    { command: 'help', description: '❓ راهنمای کامل ربات' },
    { command: 'new', description: '🧠 شروع مکالمه جدید و پاک کردن حافظه' },
    { command: 'model', description: '🤖 تغییر مدل هوش مصنوعی' },
    { command: 'personality', description: '🎭 تغییر شخصیت ربات' },
    { command: 'language', description: '🌐 تغییر زبان (فارسی/انگلیسی/عربی)' },
    { command: 'prompt', description: '✏️ مشاهده پرامپت‌های فعلی' },
    { command: 'setprompt', description: '📝 تنظیم پرامپت سفارشی برای هر مدل' },
    { command: 'img', description: '🎨 ساخت تصویر با هوش مصنوعی' },
    { command: 'search', description: '🔍 جستجوی تصویر در گوگل' },
    { command: 'vip', description: '⭐ اطلاعات و ارتقا به VIP' },
    { command: 'stats', description: '📊 آمار استفاده شخصی' },
    { command: 'reset', description: '🔄 ریست کردن تنظیمات به حالت اولیه' }
  ],
  en: [
    { command: 'start', description: '🚀 Main menu and home' },
    { command: 'help', description: '❓ Complete bot guide' },
    { command: 'new', description: '🧠 New conversation and clear memory' },
    { command: 'model', description: '🤖 Change AI model' },
    { command: 'personality', description: '🎭 Change bot personality' },
    { command: 'language', description: '🌐 Change language (Persian/English/Arabic)' },
    { command: 'prompt', description: '✏️ View current prompts' },
    { command: 'setprompt', description: '📝 Set custom prompt for each model' },
    { command: 'img', description: '🎨 Generate image with AI' },
    { command: 'search', description: '🔍 Search image on Google' },
    { command: 'vip', description: '⭐ VIP info and upgrade' },
    { command: 'stats', description: '📊 Personal usage statistics' },
    { command: 'reset', description: '🔄 Reset settings to default' }
  ],
  ar: [
    { command: 'start', description: '🚀 الصفحة الرئيسية والقائمة' },
    { command: 'help', description: '❓ دليل البوت الكامل' },
    { command: 'new', description: '🧠 محادثة جديدة ومسح الذاكرة' },
    { command: 'model', description: '🤖 تغيير نموذج الذكاء الاصطناعي' },
    { command: 'personality', description: '🎭 تغيير شخصية البوت' },
    { command: 'language', description: '🌐 تغيير اللغة (فارسی/إنجلیزیة/عربیة)' },
    { command: 'prompt', description: '✏️ عرض البرومبتات الحالية' },
    { command: 'setprompt', description: '📝 تعيين برومبت مخصص لكل نموذج' },
    { command: 'img', description: '🎨 إنشاء صورة بالذكاء الاصطناعي' },
    { command: 'search', description: '🔍 بحث عن صورة في جوجل' },
    { command: 'vip', description: '⭐ معلومات VIP والترقية' },
    { command: 'stats', description: '📊 إحصائيات الاستخدام الشخصي' },
    { command: 'reset', description: '🔄 إعادة تعيين الإعدادات إلى الافتراضية' }
  ]
};

const ADMIN_COMMANDS = {
  fa: [
    { command: 'admin', description: '👑 پنل مدیریت ربات' },
    { command: 'blocked', description: '🚫 لیست کاربران مسدود' },
    { command: 'broadcast', description: '📣 ارسال پیام همگانی' },
    { command: 'log', description: '📋 مشاهده لاگ‌های سیستم' },
    { command: 'keys', description: '🔑 وضعیت کلیدهای API' },
    { command: 'vipadd', description: '💎 افزودن کاربر به VIP' },
    { command: 'vipremove', description: '👑 حذف VIP از کاربر' },
    { command: 'block', description: '🚫 مسدود کردن کاربر' },
    { command: 'unblock', description: '✅ رفع مسدودیت کاربر' },
    { command: 'rebuild', description: '🔧 بازسازی دیتابیس' },
    { command: 'maintenance', description: '🛠️ فعال/غیرفعال کردن حالت تعمیرات' }
  ],
  en: [
    { command: 'admin', description: '👑 Bot management panel' },
    { command: 'blocked', description: '🚫 Blocked users list' },
    { command: 'broadcast', description: '📣 Send broadcast message' },
    { command: 'log', description: '📋 View system logs' },
    { command: 'keys', description: '🔑 API keys status' },
    { command: 'vipadd', description: '💎 Add user to VIP' },
    { command: 'vipremove', description: '👑 Remove VIP from user' },
    { command: 'block', description: '🚫 Block user' },
    { command: 'unblock', description: '✅ Unblock user' },
    { command: 'rebuild', description: '🔧 Rebuild database' },
    { command: 'maintenance', description: '🛠️ Toggle maintenance mode' }
  ],
  ar: [
    { command: 'admin', description: '👑 لوحة إدارة البوت' },
    { command: 'blocked', description: '🚫 قائمة المستخدمين المحظورين' },
    { command: 'broadcast', description: '📣 إرسال رسالة عامة' },
    { command: 'log', description: '📋 عرض سجلات النظام' },
    { command: 'keys', description: '🔑 حالة مفاتيح API' },
    { command: 'vipadd', description: '💎 إضافة مستخدم إلى VIP' },
    { command: 'vipremove', description: '👑 إزالة VIP من المستخدم' },
    { command: 'block', description: '🚫 حظر المستخدم' },
    { command: 'unblock', description: '✅ إلغاء حظر المستخدم' },
    { command: 'rebuild', description: '🔧 إعادة بناء قاعدة البيانات' },
    { command: 'maintenance', description: '🛠️ تفعيل/إلغاء وضع الصيانة' }
  ]
};

// ============================================================
// 📚 راهنمای کامل (Help Center)
// ============================================================

const HELP_SECTIONS = {
  fa: {
    title: '📚 **مرکز راهنمای ربات نوا**',
    subtitle: 'لطفاً یکی از بخش‌های زیر را انتخاب کنید:',
    chat: {
      title: '💬 **راهنمای گفتگو**',
      content: `**🗣️ گفتگوی متنی:**
• فقط پیامتو بفرست، من جواب میدم!
• میتونی سوال بپرسی، چیزی یاد بگیری یا چت کنی
• من ۱۰ پیام آخرت رو به یاد میارم

**🎤 پیام صوتی:**
• ویس بفرست، من متن رو میفهمم و جواب میدم
• حداکثر ۲ دقیقه
• به فارسی، انگلیسی یا عربی

**📸 تصویر:**
• عکس بفرست + توضیح (اختیاری)
• من تحلیل میکنم و توضیح میدم
• فرمت: JPG, PNG, WebP, GIF

**🎬 ویدیو:**
• ویدیو بفرست (حداکثر 20MB)
• من محتواش رو میبینم و توضیح میدم

**💡 نکات:**
• برای پاک کردن حافظه: /new
• برای تغییر مدل: /model
• برای تغییر شخصیت: /personality

━━━━━━━━━━━━━━━━━━━━
**محدودیت روزانه (رایگان):**
• پیام: ۱۰۰ عدد
• ویس دریافت: ۱۰ عدد
• تصویر: ۵ عدد

🌟 **VIP شوید برای استفاده نامحدود!**`
    },
    personalities: {
      title: '🎭 **راهنمای شخصیت‌ها**',
      content: `ربات نوا دارای **۱۰ شخصیت** متفاوت است. هر شخصیت لحن، رفتار و تخصص خاص خودش را دارد.

**✨ شخصیت‌های دختر (صدای زن):**

1. 🤖 **نوا** – دستیار هوشمند، مودب و مفید (پیش‌فرض)
2. 🖤 **لیلیت** – اغواگر، بی‌پروا و جذاب
3. 👑 **ویکتوریا** – ملکه سلطه‌گر، قدرتمند و محکم
4. 🌙 **آریا** – فیلسوف شورشی، عمیق و متفکر
5. 🧠 **لونا** – مغز متفکر، منطقی و تحلیلی
6. ✨ **زارا** – خلاق، هنری و الهام‌بخش

**✨ شخصیت‌های پسر (صدای مرد):**

7. 💀 **سایفر** – هکر مرموز، تکنیکی و زیرک
8. 🔥 **جکس** – آشوبگر، پرانرژی و شوخ
9. 🪚 **صورت‌چرمی** – قاتل زنجیره‌ای خشن
10. 🌑 **شادو** – سایه‌ای مرموز و ساکت

**🔄 نحوه تغییر شخصیت:**
• از منوی اصلی → دکمه «تغییر شخصیت»
• یا دستور /personality

**💡 نکته:** هر شخصیت پرامپت مخصوص خودش رو داره. می‌تونی با دستور /setprompt پرامپت دلخواهت رو هم بهش بدی.

━━━━━━━━━━━━━━━━━━━━
🎭 **همین حالا یکی رو انتخاب کن و تجربه کن!**`
    },
    models: {
      title: '🤖 **راهنمای مدل‌ها**',
      content: `**🌟 مدل‌های موجود:**

**🤖 نوا (Gemini)**
• سریع و دقیق
• پشتیبانی کامل از فارسی، انگلیسی و عربی
• چند رسانه‌ای (متن + تصویر + صدا)
• ۵ کلید API

**🧠 لونا (SambaNova)**
• مدل‌های متنوع
• قدرتمند در استدلال
• ۱۴ مدل مختلف
• ۵ کلید API

**✨ زارا (Pollinations)**
• مدل‌های متنوع (متن + تصویر)
• خلاقیت بالا
• ۱۵ مدل مختلف
• رایگان و نامحدود

**🔄 تغییر مدل:**
• از منوی اصلی → دکمه «مدل‌ها»
• یا دستور /model

━━━━━━━━━━━━━━━━━━━━
💡 هر مدل شخصیت خاص خودش رو داره!

🔒 **لونا و زارا:** فقط برای کاربران VIP`
    },
    images: {
      title: '🎨 **راهنمای تصاویر**',
      content: `**🖼️ ساخت تصویر:**
/img یک گربه در فضا

• ۳ مدل قدرتمند همزمان میسازن
• کیفیت بالا (1024x1024)
• حداکثر ۵ تصویر در روز (رایگان)

**🔍 جستجوی تصویر:**
/search طبیعت زیبا

• جستجو در Pixabay
• ۵ تصویر برتر
• دانلود مستقیم

**💡 نکات:**
• برای نتیجه بهتر، توضیحات دقیق بده
• میتونی به فارسی، انگلیسی یا عربی بنویسی
• VIP: نامحدود

━━━━━━━━━━━━━━━━━━━━
**امروز:**
• تصاویر ساخته شده: {images}/۵
🌟 **VIP شو برای نامحدود**`
    },
    prompts: {
      title: '📝 **راهنمای پرامپت حرفه‌ای**',
      content: `پرامپت یعنی شما به ربات می‌گید چه شخصیتی داشته باشه، چه رفتاری کنه، چطور جواب بده.

**✨ امکانات پرامپت:**
• می‌تونی برای هر مدل (نوا، لونا، زارا) یه پرامپت جداگانه تنظیم کنی
• پرامپت می‌تونه خیلی ساده یا خیلی حرفه‌ای و دقیق باشه
• تا ۵۰۰۰ کاراکتر

**📝 نحوه تنظیم پرامپت دستی:**

/setprompt [موتور] [متن پرامپت]

**🎨 مثال‌ها:**

/setprompt gemini تو یک معلم ریاضی هستی که با حوصله و مثال توضیح میدی
/setprompt sambanova تو یک برنامه‌نویس حرفه‌ای پایتون هستی
/setprompt pollinations تو یک شاعر عاشقانه هستی

**🔄 مدیریت پرامپت‌ها:**
• **مشاهده:** دستور /prompt
• **پاک کردن:** /setprompt [موتور] پیش‌فرض

**💡 نکات حرفه‌ای:**
• پرامپت باید نقش و وظیفه ربات رو واضح بگه
• می‌تونی محدودیت‌ها رو مشخص کنی
• می‌تونی لحن رو تعیین کنی

**🔒 محدودیت دسترسی:**
• ✅ **نوا:** همه کاربران (رایگان و VIP)
• 🔒 **لونا و زارا:** فقط کاربران VIP

━━━━━━━━━━━━━━━━━━━━
🎯 **همین حالا پرامپت خودت رو بساز و تجربه کن!**`
    },
    settings: {
      title: '⚙️ **راهنمای تنظیمات**',
      content: `**🌐 زبان:**
• فارسی 🇮🇷 / انگلیسی 🇺🇸 / عربی 🇸🇦
• تغییر با: /language
• همه متن‌ها و منوها تغییر میکنه

**🤖 مدل فعال:**
• نوا (Gemini) - سریع و دقیق
• لونا (SambaNova) - قدرتمند
• زارا (Pollinations) - خلاق
• تغییر: /model

**🎭 شخصیت فعال:**
• ۱۰ شخصیت مختلف
• هر کدوم لحن و رفتار خاص
• تغییر: /personality

**✏️ شخصی‌سازی:**
• پرامپت سفارشی برای هر مدل
• ذخیره خودکار
• ریست در هر لحظه
• مدیریت: /prompt

**🧠 حافظه:**
• ۱۰ پیام آخر ذخیره میشه
• پاکسازی: /new
• جداگانه برای هر مدل

**📊 محدودیت‌ها (رایگان):**
• پیام: ۱۰۰ عدد در روز
• ویس دریافت: ۱۰ عدد در روز
• تصویر: ۵ عدد در روز

🌟 **VIP شوید:**
• دسترسی نامحدود
• همه مدل‌ها
• همه شخصیت‌ها
• پرامپت‌های سفارشی
• اولویت در پردازش
• تماس: @Hamid_Ai_pro

━━━━━━━━━━━━━━━━━━━━
🔄 محدودیت‌ها هر ۲۴ ساعت ریست میشن`
    },
    commands: {
      title: '⚡ **لیست کامل دستورات**',
      content: `**🏠 دستورات اصلی:**
• /start - صفحه اصلی و خوش‌آمدگویی
• /help - راهنمای کامل (همین صفحه)
• /new - شروع مکالمه جدید و پاک کردن حافظه
• /reset - ریست کردن تنظیمات به حالت اولیه

**🤖 مدیریت مدل‌ها:**
• /model - تغییر مدل هوش مصنوعی
• انتخاب از: نوا، لونا، زارا

**🎭 مدیریت شخصیت‌ها:**
• /personality - تغییر شخصیت ربات
• ۱۰ شخصیت مختلف

**🎨 تصاویر:**
• /img [توضیح] - ساخت تصویر
  مثال: /img یک گربه در فضا
• /search [متن] - جستجوی تصویر
  مثال: /search طبیعت زیبا

**✏️ شخصی‌سازی:**
• /prompt - مشاهده پرامپت‌ها
• /setprompt [مدل] [متن] - تنظیم شخصیت
  مثال: /setprompt gemini تو یک معلم هستی

**🌐 تنظیمات:**
• /language - تغییر زبان (فارسی/انگلیسی/عربی)

**⭐ VIP:**
• /vip - اطلاعات و ارتقا به VIP
• /stats - آمار استفاده شخصی

━━━━━━━━━━━━━━━━━━━━
💡 بیشتر کارها با دکمه‌ها انجام میشه`
    },
    vip: {
      title: '⭐ **راهنمای VIP**',
      content: `**✨ مزایای VIP:**

**♾️ نامحدود:**
• پیام‌های نامحدود
• تصاویر نامحدود
• ویس‌های نامحدود

**🎭 شخصیت‌ها:**
• دسترسی به تمام ۱۰ شخصیت
• شخصیت‌های ویژه: لیلیت، سایفر، صورت‌چرمی، ویکتوریا، شادو

**🧠 مدل‌ها:**
• دسترسی به لونا (SambaNova)
• دسترسی به زارا (Pollinations)
• انتخاب از بین ۱۵ مدل مختلف

**✏️ شخصی‌سازی:**
• پرامپت‌های سفارشی برای همه مدل‌ها
• ذخیره‌سازی نامحدود

**🚀 اولویت:**
• اولویت در پردازش
• پاسخ‌دهی سریع‌تر
• پشتیبانی ویژه

━━━━━━━━━━━━━━━━━━━━
💰 **قیمت:** تماس با مدیریت

📞 @Hamid_Ai_pro

👑 **وضعیت فعلی:** {status}`
    }
  },
  en: {
    title: '📚 **Nova Bot Help Center**',
    subtitle: 'Please select one of the sections below:',
    chat: {
      title: '💬 **Chat Guide**',
      content: `**🗣️ Text Chat:**
• Just send your message, I'll reply!
• Ask questions, learn, or chat
• I remember your last 10 messages

**🎤 Voice:**
• Send voice note, I'll understand and reply
• Max 2 minutes
• Persian, English or Arabic

**📸 Image:**
• Send photo + description (optional)
• I'll analyze and explain
• Format: JPG, PNG, WebP, GIF

**🎬 Video:**
• Send video (max 20MB)
• I'll watch and explain

**💡 Tips:**
• Clear memory: /new
• Change model: /model
• Change personality: /personality

━━━━━━━━━━━━━━━━━━━━
**Daily Limits (Free):**
• Messages: 100
• Voice received: 10
• Images: 5

🌟 **Go VIP for unlimited!**`
    },
    personalities: {
      title: '🎭 **Personalities Guide**',
      content: `Nova has **10 unique personalities**. Each has its own tone, behavior, and expertise.

**✨ Female Personalities (Female voice):**

1. 🤖 **Nova** – Smart, polite, helpful (default)
2. 🖤 **Lilith** – Reckless seducer, bold
3. 👑 **Victoria** – Dominant queen, powerful
4. 🌙 **Aria** – Rebel philosopher, deep
5. 🧠 **Luna** – Deep thinker, logical
6. ✨ **Zara** – Creative, artistic

**✨ Male Personalities (Male voice):**

7. 💀 **Cipher** – Mysterious hacker
8. 🔥 **Jax** – Chaos bringer, funny
9. 🪚 **Leatherface** – Brutal killer
10. 🌑 **Shadow** – Mysterious shadow

**🔄 How to change:**
• Main menu → "Change Personality"
• Or command /personality

━━━━━━━━━━━━━━━━━━━━
🎭 **Try one now!**`
    },
    models: {
      title: '🤖 **Models Guide**',
      content: `**🌟 Available Models:**

**🤖 Nova (Gemini)**
• Fast & accurate
• Full Persian, English, Arabic support
• Multimodal (text + image + voice)
• 5 API keys

**🧠 Luna (SambaNova)**
• Diverse models
• Strong reasoning
• 14 different models
• 5 API keys

**✨ Zara (Pollinations)**
• Diverse (text + image)
• High creativity
• 15 different models
• Free & unlimited

**🔄 How to switch:**
• Main menu → "Models" button
• Or command /model

━━━━━━━━━━━━━━━━━━━━
💡 Each has unique personality!

🔒 **Luna & Zara:** VIP only`
    },
    images: {
      title: '🎨 **Images Guide**',
      content: `**🖼️ Generate:**
/img a cat in space

• 3 powerful models work together
• High quality (1024x1024)
• Max 5 per day (free)

**🔍 Search:**
/search beautiful nature

• Search on Pixabay
• Top 5 results
• Direct download

**💡 Tips:**
• Be specific for better results
• Write in Persian, English or Arabic
• VIP: Unlimited

━━━━━━━━━━━━━━━━━━━━
**Today:**
• Generated: {images}/5
🌟 **Go VIP for unlimited**`
    },
    prompts: {
      title: '📝 **Advanced Prompt Guide**',
      content: `Prompt is how you tell the bot what personality to have, how to behave, how to answer.

**✨ Features:**
• Separate prompt for each model (Nova, Luna, Zara)
• Simple or professional prompts
• Up to 5000 characters

**📝 How to set:**

/setprompt [engine] [prompt text]

**🎨 Examples:**

/setprompt gemini you are a math teacher
/setprompt sambanova you are a Python developer
/setprompt pollinations you are a romantic poet

**🔄 Managing:**
• **View:** /prompt command
• **Clear:** /setprompt [engine] default

**💡 Pro tips:**
• Clearly state bot's role and task
• Specify limitations
• Define tone

**🔒 Access:**
• ✅ **Nova:** All users (free & VIP)
• 🔒 **Luna & Zara:** VIP only

━━━━━━━━━━━━━━━━━━━━
🎯 **Create your own prompt now!**`
    },
    settings: {
      title: '⚙️ **Settings Guide**',
      content: `**🌐 Language:**
• Persian 🇮🇷 / English 🇺🇸 / Arabic 🇸🇦
• Change: /language
• All texts and menus update

**🤖 Active Model:**
• Nova (Gemini) - Fast & accurate
• Luna (SambaNova) - Powerful
• Zara (Pollinations) - Creative
• Switch: /model

**🎭 Active Personality:**
• 10 different personalities
• Each with unique tone
• Change: /personality

**✏️ Customization:**
• Custom prompt per model
• Auto save
• Reset anytime
• Manage: /prompt

**🧠 Memory:**
• Last 10 messages saved
• Clear: /new
• Separate per model

**📊 Limits (Free):**
• Messages: 100 per day
• Voice received: 10 per day
• Images: 5 per day

🌟 **Go VIP:**
• Unlimited access
• All models
• All personalities
• Custom prompts
• Priority processing
• Contact: @Hamid_Ai_pro

━━━━━━━━━━━━━━━━━━━━
🔄 Daily reset at midnight`
    },
    commands: {
      title: '⚡ **Complete Commands List**',
      content: `**🏠 Main Commands:**
• /start - Home and welcome
• /help - Complete guide (this page)
• /new - New chat and clear memory
• /reset - Reset settings to default

**🤖 Model Management:**
• /model - Change AI model
• Choose: Nova, Luna, Zara

**🎭 Personality Management:**
• /personality - Change bot personality
• 10 different personalities

**🎨 Images:**
• /img [prompt] - Generate image
  Example: /img a cat in space
• /search [query] - Search images
  Example: /search beautiful nature

**✏️ Customization:**
• /prompt - View prompts
• /setprompt [model] [text] - Set personality
  Example: /setprompt gemini you are a teacher

**🌐 Settings:**
• /language - Change language (Persian/English/Arabic)

**⭐ VIP:**
• /vip - VIP info and upgrade
• /stats - Personal usage stats

━━━━━━━━━━━━━━━━━━━━
💡 Most actions with buttons`
    },
    vip: {
      title: '⭐ **VIP Guide**',
      content: `**✨ VIP Benefits:**

**♾️ Unlimited:**
• Unlimited messages
• Unlimited images
• Unlimited voices

**🎭 Personalities:**
• Access to all 10 personalities
• Special: Lilith, Cipher, Leatherface, Victoria, Shadow

**🧠 Models:**
• Access to Luna (SambaNova)
• Access to Zara (Pollinations)
• Choose from 15 different models

**✏️ Customization:**
• Custom prompts for all models
• Unlimited storage

**🚀 Priority:**
• Priority processing
• Faster responses
• Special support

━━━━━━━━━━━━━━━━━━━━
💰 **Price:** Contact management

📞 @Hamid_Ai_pro

👑 **Current Status:** {status}`
    }
  },
  ar: {
    title: '📚 **مركز مساعدة بوت نوا**',
    subtitle: 'يرجى اختيار أحد الأقسام أدناه:',
    chat: {
      title: '💬 **دليل المحادثة**',
      content: `**🗣️ محادثة نصية:**
• أرسل رسالتك، سأرد!
• اسأل، تعلم، أو دردش
• أتذكر آخر ١٠ رسائل

**🎤 الصوت:**
• أرسل رسالة صوتية، سأفهم وأرد
• حد أقصى ٢ دقيقة
• بالفارسية، الإنجليزية أو العربية

**📸 الصور:**
• أرسل صورة + وصف (اختياري)
• سأحللها وأشرحها
• الصيغ: JPG, PNG, WebP, GIF

**🎬 الفيديو:**
• أرسل فيديو (حد أقصى 20MB)
• سأشاهده وأشرحه

**💡 نصائح:**
• مسح الذاكرة: /new
• تغيير النموذج: /model
• تغيير الشخصية: /personality

━━━━━━━━━━━━━━━━━━━━
**الحد اليومي (مجاني):**
• الرسائل: ١٠٠
• الصوت المستلم: ١٠
• الصور: ٥

🌟 **اشترك VIP للأبد!**`
    },
    personalities: {
      title: '🎭 **دليل الشخصيات**',
      content: `يحتوي نوا على **١٠ شخصيات** مختلفة. لكل شخصية نبرة وسلوك وتخصص خاص.

**✨ شخصيات أنثى (صوت أنثوي):**

1. 🤖 **نوا** – مساعد ذكي، مهذب ومفيد (افتراضي)
2. 🖤 **ليليث** – مغرية وجريئة وجذابة
3. 👑 **فيكتوريا** – ملكة مسيطرة، قوية وحازمة
4. 🌙 **آريا** – فيلسوفة متمردة، عميقة ومفكرة
5. 🧠 **لونا** – مفكرة عميقة، منطقية وتحليلية
6. ✨ **زارا** – مبدعة وفنية وملهمة

**✨ شخصيات ذكور (صوت ذكوري):**

7. 💀 **سايفر** – هاكر غامض، تقني وذكي
8. 🔥 **جاكس** – مثير للفوضى، نشيط ومضحك
9. 🪚 **ليذرفيس** – قاتل متسلسل وحشي
10. 🌑 **شادو** – ظل غامض وصامت

**🔄 كيفية التغيير:**
• من القائمة الرئيسية → زر «تغيير الشخصية»
• أو الأمر /personality

━━━━━━━━━━━━━━━━━━━━
🎭 **جرب واحدة الآن!**`
    },
    models: {
      title: '🤖 **دليل النماذج**',
      content: `**🌟 النماذج المتوفرة:**

**🤖 نوا (Gemini)**
• سريع ودقيق
• دعم كامل للفارسية والإنجليزية والعربية
• وسائط متعددة (نص + صورة + صوت)
• ٥ مفاتيح API

**🧠 لونا (SambaNova)**
• نماذج متنوعة
• قوي في الاستدلال
• ١٤ نموذج مختلف
• ٥ مفاتيح API

**✨ زارا (Pollinations)**
• متنوع (نص + صورة)
• إبداع عالي
• ١٥ نموذج مختلف
• مجاني وغير محدود

**🔄 التغيير:**
• من القائمة الرئيسية → زر «النماذج»
• أو الأمر /model

━━━━━━━━━━━━━━━━━━━━
💡 كل نموذج له شخصيته الخاصة!

🔒 **لونا و زارا:** VIP فقط`
    },
    images: {
      title: '🎨 **دليل الصور**',
      content: `**🖼️ إنشاء صورة:**
/img قطة في الفضاء

• ٣ نماذج قوية تعمل معاً
• جودة عالية (1024x1024)
• حد أقصى ٥ صور يومياً (مجاني)

**🔍 بحث الصور:**
/search طبيعة جميلة

• بحث في Pixabay
• أفضل ٥ نتائج
• تحميل مباشر

**💡 نصائح:**
• كن محدداً للحصول على نتائج أفضل
• اكتب بالفارسية، الإنجليزية أو العربية
• VIP: غير محدود

━━━━━━━━━━━━━━━━━━━━
**اليوم:**
• تم الإنشاء: {images}/٥
🌟 **اشترك VIP للأبد**`
    },
    prompts: {
      title: '📝 **دليل البرومبت المتقدم**',
      content: `البرومبت هو كيف تخبر الروبوت بالشخصية التي يمتلكها، وكيف يتصرف، وكيف يجيب.

**✨ الميزات:**
• برومبت منفصل لكل نموذج (نوا، لونا، زارا)
• برومبت بسيط أو احترافي
• حتى ٥٠٠٠ حرف

**📝 كيفية الضبط:**

/setprompt [المحرك] [نص البرومبت]

**🎨 أمثلة:**

/setprompt gemini أنت مدرس رياضيات
/setprompt sambanova أنت مبرمج بايثون
/setprompt pollinations أنت شاعر رومانسي

**🔄 الإدارة:**
• **العرض:** الأمر /prompt
• **المسح:** /setprompt [المحرك] افتراضي

**💡 نصائح احترافية:**
• وضح دور الروبوت ومهمته بوضوح
• حدد القيود
• حدد النبرة

**🔒 الوصول:**
• ✅ **نوا:** جميع المستخدمين (مجاني و VIP)
• 🔒 **لونا و زارا:** VIP فقط

━━━━━━━━━━━━━━━━━━━━
🎯 **اصنع برومبتك الخاص الآن!**`
    },
    settings: {
      title: '⚙️ **دليل الإعدادات**',
      content: `**🌐 اللغة:**
• الفارسية 🇮🇷 / الإنجليزية 🇺🇸 / العربية 🇸🇦
• التغيير: /language
• جميع النصوص والقوائم تتغير

**🤖 النموذج النشط:**
• نوا (Gemini) - سريع ودقيق
• لونا (SambaNova) - قوي
• زارا (Pollinations) - مبدع
• التغيير: /model

**🎭 الشخصية النشطة:**
• ١٠ شخصيات مختلفة
• كل واحدة لها نبرة وسلوك خاص
• التغيير: /personality

**✏️ التخصيص:**
• برومبت مخصص لكل نموذج
• حفظ تلقائي
• إعادة تعيين في أي وقت
• إدارة: /prompt

**🧠 الذاكرة:**
• حفظ آخر ١٠ رسائل
• المسح: /new
• منفصل لكل نموذج

**📊 الحدود (مجاني):**
• الرسائل: ١٠٠ في اليوم
• الصوت المستلم: ١٠ في اليوم
• الصور: ٥ في اليوم

🌟 **اشترك VIP:**
• وصول غير محدود
• جميع النماذج
• جميع الشخصيات
• برومبتات مخصصة
• معالجة優先ية
• اتصل: @Hamid_Ai_pro

━━━━━━━━━━━━━━━━━━━━
🔄 إعادة تعيين الحدود عند منتصف الليل`
    },
    commands: {
      title: '⚡ **قائمة الأوامر الكاملة**',
      content: `**🏠 الأوامر الرئيسية:**
• /start - الصفحة الرئيسية
• /help - الدليل الكامل (هذه الصفحة)
• /new - محادثة جديدة ومسح الذاكرة
• /reset - إعادة تعيين الإعدادات إلى الافتراضية

**🤖 إدارة النماذج:**
• /model - تغيير نموذج الذكاء الاصطناعي
• اختر: نوا، لونا، زارا

**🎭 إدارة الشخصيات:**
• /personality - تغيير شخصية البوت
• ١٠ شخصيات مختلفة

**🎨 الصور:**
• /img [وصف] - إنشاء صورة
  مثال: /img قطة في الفضاء
• /search [نص] - بحث الصور
  مثال: /search طبيعة جميلة

**✏️ التخصيص:**
• /prompt - عرض البرومبتات
• /setprompt [نموذج] [نص] - تعيين الشخصية
  مثال: /setprompt gemini أنت مدرس

**🌐 الإعدادات:**
• /language - تغيير اللغة (فارسی/إنجلیزیة/عربیة)

**⭐ VIP:**
• /vip - معلومات VIP والترقية
• /stats - إحصائيات الاستخدام الشخصي

━━━━━━━━━━━━━━━━━━━━
💡 معظم العمليات بالأزرار`
    },
    vip: {
      title: '⭐ **دليل VIP**',
      content: `**✨ مزايا VIP:**

**♾️ غير محدود:**
• رسائل غير محدودة
• صور غير محدودة
• صوتيات غير محدودة

**🎭 الشخصيات:**
• الوصول إلى جميع الشخصيات العشر
• شخصيات خاصة: ليليث، سايفر، ليذرفيس، فيكتوريا، شادو

**🧠 النماذج:**
• الوصول إلى لونا (SambaNova)
• الوصول إلى زارا (Pollinations)
• اختر من بين ١٥ نموذج مختلف

**✏️ التخصيص:**
• برومبتات مخصصة لجميع النماذج
• تخزين غير محدود

**🚀 الأولوية:**
• معالجة優先ية
• استجابة أسرع
• دعم خاص

━━━━━━━━━━━━━━━━━━━━
💰 **السعر:** اتصل بالإدارة

📞 @Hamid_Ai_pro

👑 **الحالة الحالية:** {status}`
    }
  }
};

// ============================================================
// 📦 متغیرهای سراسری
// ============================================================

const BOT_VERSION = "2.0.0";
let config: ReturnType<typeof createConfig>;
let initPromise: Promise<void> | null = null;
let isInitialized = false;
let API_URL = "";

// کش‌ها
const sessionCache = new Map<string, ChatSession>();
const userCache = new Map<number, User>();
const modelCache = new Map<string, ModelCache>();
const groupContextCache = new Map<number, { messages: GroupMessage[]; lastCleanup: number; }>();
const activeRequests = new Map<number, Set<string>>();
const callbackRateLimits = new Map<number, number[]>();
const adminPanelStates = new Map<number, AdminPanelState>();
const modelListStates = new Map<string, ModelListState>();
const broadcastStates = new Map<number, { mode: 'all' | 'vip' | 'free' | 'specific'; userId?: number; }>();
const sessionLoadLocks = new Map<number, Promise<ChatSession>>();
const userBuckets = new Map<number, { tokens: number; lastRefill: number; capacity: number; }>();

// لاگ‌ها
const recentLogs: LogEntry[] = [];
const MAX_LOGS = 100;

// اطلاعات بات
let BOT_INFO: any = null;

// ============================================================
// 📦 توابع کمکی (Helpers)
// ============================================================

function getRandomTypingEmoji(): string {
  const emojis = ['💭', '🤔', '✨', '⚡', '🌟', '🧠', '🎯', '💫'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function getEngineName(engine: AIEngine, lang: 'fa' | 'en' | 'ar'): string {
  const names = {
    fa: { gemini: 'نوا', sambanova: 'لونا', pollinations: 'زارا' },
    en: { gemini: 'Nova', sambanova: 'Luna', pollinations: 'Zara' },
    ar: { gemini: 'نوا', sambanova: 'لونا', pollinations: 'زارا' }
  };
  return names[lang]?.[engine] || engine;
}

function getPersonalityName(personalityKey: string, lang: 'fa' | 'en' | 'ar'): string {
  const p = PERSONALITIES[personalityKey as keyof typeof PERSONALITIES];
  if (!p) return personalityKey;
  if (lang === 'fa') return p.name_fa;
  if (lang === 'en') return p.name_en;
  return p.name_ar;
}

function getPersonalityEmoji(personalityKey: string): string {
  const p = PERSONALITIES[personalityKey as keyof typeof PERSONALITIES];
  return p?.emoji || '🤖';
}

function getPersonalityPrompt(personalityKey: string, lang: 'fa' | 'en' | 'ar'): string {
  const p = PERSONALITIES[personalityKey as keyof typeof PERSONALITIES];
  if (!p) return '';
  if (lang === 'fa') return p.prompt_fa;
  if (lang === 'en') return p.prompt_en;
  return p.prompt_ar;
}

function getPersonalityDescription(personalityKey: string, lang: 'fa' | 'en' | 'ar'): string {
  const p = PERSONALITIES[personalityKey as keyof typeof PERSONALITIES];
  if (!p) return '';
  if (lang === 'fa') return p.desc_fa;
  if (lang === 'en') return p.desc_en;
  return p.desc_ar;
}

function sanitizeMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return text;
      }
      return match;
    })
    .replace(/(?<!\\)([*_`~])/g, '\\$1');
}

function sanitizePlainText(text: string): string {
  if (!text) return '';
  return text.replace(/[*_`\[\]]/g, '');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    let chunk = remaining.substring(0, maxLength);
    const lastNewline = chunk.lastIndexOf('\n');
    const lastSpace = chunk.lastIndexOf(' ');
    
    if (lastNewline > maxLength * 0.8) {
      chunk = remaining.substring(0, lastNewline + 1);
    } else if (lastSpace > maxLength * 0.8) {
      chunk = remaining.substring(0, lastSpace + 1);
    }
    
    chunks.push(chunk.trim());
    remaining = remaining.substring(chunk.length);
  }
  
  return chunks;
}

function splitMessage(text: string, maxLength: number): string[] {
  return chunkText(text, maxLength);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    })
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(timestamp: number, locale: string = 'fa-IR'): string {
  try {
    return new Date(timestamp).toLocaleString(locale);
  } catch {
    return String(timestamp);
  }
}

function formatSafeDate(timestamp: number | undefined, format: 'short' | 'full' = 'short'): string {
  if (!timestamp || timestamp === 0) return 'N/A';
  try {
    const date = new Date(timestamp);
    if (format === 'short') {
      return date.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleString('fa-IR');
  } catch {
    return 'Invalid Date';
  }
}

function createInlineButton(text: string | undefined | null, callback_data: string): { text: string; callback_data: string } {
  const safeText = String(text || 'Button').trim();
  return {
    text: safeText || 'Button',
    callback_data: callback_data
  };
}

function validateKeyboard(keyboard: any): any {
  if (!keyboard || !keyboard.inline_keyboard) return keyboard;
  
  keyboard.inline_keyboard = keyboard.inline_keyboard.map((row: any[]) => {
    return row.filter(btn => {
      if (!btn || typeof btn !== 'object') return false;
      if (!btn.text || typeof btn.text !== 'string' || btn.text.trim() === '') {
        return false;
      }
      return true;
    });
  }).filter((row: any[]) => row.length > 0);
  
  return keyboard;
}

function t(session: ChatSession | undefined, key: string, params: Record<string, string | number> = {}): string {
  const lang = session?.language || 'fa';
  const translations = TRANSLATIONS[lang] || TRANSLATIONS.fa;
  
  let text = translations[key as keyof typeof translations] || key;
  
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  
  return text;
}

// ============================================================
// 📦 سیستم لاگ (Logger)
// ============================================================

const logger = {
  info: (message: string, context?: any) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'info',
      message,
      context
    };
    recentLogs.push(entry);
    if (recentLogs.length > MAX_LOGS) {
      recentLogs.shift();
    }
    console.log(`✅ ${message}`, context || '');
  },
  warn: (message: string, context?: any) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'warn',
      message,
      context
    };
    recentLogs.push(entry);
    if (recentLogs.length > MAX_LOGS) {
      recentLogs.shift();
    }
    console.warn(`⚠️ ${message}`, context || '');
  },
  error: (message: string, context?: any) => {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'error',
      message,
      context
    };
    recentLogs.push(entry);
    if (recentLogs.length > MAX_LOGS) {
      recentLogs.shift();
    }
    console.error(`❌ ${message}`, context || '');
  }
};

// ============================================================
// 📦 سیستم مدیریت خطا (Error Handler)
// ============================================================

enum ErrorType {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  QUOTA = 'quota',
  BLOCKED = 'blocked',
  AUTH = 'auth',
  EMPTY = 'empty',
  SERVER = 'server',
  FILE = 'file',
  VOICE = 'voice',
  IMAGE = 'image',
  UNKNOWN = 'unknown'
}

function categorizeError(error: Error | string): ErrorInfo {
  const message = typeof error === 'string' ? error : error.message;
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      type: ErrorType.TIMEOUT,
      icon: '⏱️',
      title: 'زمان پاسخگویی تمام شد',
      userMessage: 'ربات بیشتر از حد معمول زمان برد. لطفاً دوباره تلاش کنید.',
      debugInfo: message
    };
  }
  
  if (lower.includes('quota') || lower.includes('429') || lower.includes('rate limit')) {
    return {
      type: ErrorType.QUOTA,
      icon: '📊',
      title: 'محدودیت استفاده',
      userMessage: 'سهمیه استفاده امروز تمام شده است. لطفاً فردا مجدد تلاش کنید.',
      debugInfo: message
    };
  }
  
  if (lower.includes('blocked') || lower.includes('safety')) {
    return {
      type: ErrorType.BLOCKED,
      icon: '🛡️',
      title: 'محتوای مسدود',
      userMessage: 'درخواست شما به دلیل محتوای نامناسب مسدود شد. لطفاً متن را تغییر دهید.',
      debugInfo: message
    };
  }
  
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) {
    return {
      type: ErrorType.AUTH,
      icon: '🔑',
      title: 'مشکل احراز هویت',
      userMessage: 'مشکل در ارتباط با سرویس. لطفاً بعداً تلاش کنید.',
      debugInfo: message
    };
  }
  
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return {
      type: ErrorType.NETWORK,
      icon: '🌐',
      title: 'مشکل شبکه',
      userMessage: 'ارتباط با سرور قطع شد. لطفاً اتصال اینترنت خود را بررسی کنید.',
      debugInfo: message
    };
  }
  
  if (lower.includes('empty') || lower.includes('no response')) {
    return {
      type: ErrorType.EMPTY,
      icon: '📭',
      title: 'پاسخ خالی',
      userMessage: 'پاسخ دریافت نشد. لطفاً دوباره تلاش کنید.',
      debugInfo: message
    };
  }
  
  if (lower.includes('500') || lower.includes('502') || lower.includes('503')) {
    return {
      type: ErrorType.SERVER,
      icon: '🔧',
      title: 'خطای سرور',
      userMessage: 'سرور موقتاً در دسترس نیست. لطفاً چند دقیقه بعد تلاش کنید.',
      debugInfo: message
    };
  }
  
  return {
    type: ErrorType.UNKNOWN,
    icon: '❌',
    title: 'خطای ناشناخته',
    userMessage: 'خطایی رخ داد. لطفاً دوباره تلاش کنید.',
    debugInfo: message
  };
}

function formatErrorMessage(errorInfo: ErrorInfo, lang: 'fa' | 'en' | 'ar'): string {
  const messages = {
    fa: `${errorInfo.icon} **${errorInfo.title}**\n\n${errorInfo.userMessage}`,
    en: `${errorInfo.icon} **${errorInfo.title}**\n\n${errorInfo.userMessage}`,
    ar: `${errorInfo.icon} **${errorInfo.title}**\n\n${errorInfo.userMessage}`
  };
  return messages[lang] || messages.fa;
}

// ============================================================
// 📦 توابع ارتباط با Telegram API
// ============================================================

async function callTelegramAPI(method: string, params: any): Promise<any> {
  if (!API_URL) {
    if (!config || !config.TOKEN) {
      throw new Error('API_URL and config.TOKEN are required!');
    }
    API_URL = `https://api.telegram.org/bot${config.TOKEN}`;
  }
  
  const cleanParams: any = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      cleanParams[key] = value;
    }
  }
  
  const url = `${API_URL}/${method}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanParams)
    });
    
    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Could not read error response';
      }
      throw new Error(`Telegram API error (${response.status}): ${errorText.substring(0, 200)}`);
    }
    
    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
    }
    
    return data.result;
  } catch (error) {
    logger.error(`Telegram API call failed: ${method}`, error);
    throw error;
  }
}

async function sendMessage(chatId: number, text: string, options: any = {}): Promise<any> {
  if (!chatId) {
    logger.error('sendMessage: chatId is undefined');
    return null;
  }
  
  const params = {
    chat_id: chatId,
    text: text,
    parse_mode: options.parse_mode || 'Markdown',
    disable_web_page_preview: true,
    reply_to_message_id: options.reply_to_message_id,
    reply_markup: options.reply_markup
  };
  
  Object.keys(params).forEach(key => {
    if (params[key] === undefined) {
      delete params[key];
    }
  });
  
  try {
    return await callTelegramAPI('sendMessage', params);
  } catch (error) {
    logger.error(`sendMessage failed for chat ${chatId}`, error);
    throw error;
  }
}

async function editMessageText(chatId: number, messageId: number, text: string, options: any = {}): Promise<any> {
  if (!chatId || !messageId) {
    logger.error('editMessageText: chatId or messageId is undefined');
    return null;
  }
  
  const params = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: options.parse_mode || 'Markdown',
    disable_web_page_preview: true,
    reply_markup: options.reply_markup
  };
  
  Object.keys(params).forEach(key => {
    if (params[key] === undefined) {
      delete params[key];
    }
  });
  
  return callTelegramAPI('editMessageText', params);
}

async function deleteMessage(chatId: number, messageId: number): Promise<void> {
  if (!chatId || !messageId) return;
  await callTelegramAPI('deleteMessage', { chat_id: chatId, message_id: messageId });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert: boolean = false): Promise<void> {
  if (!callbackQueryId) return;
  
  const params: any = {
    callback_query_id: callbackQueryId
  };
  
  if (text) {
    params.text = text;
    params.show_alert = showAlert;
  }
  
  await callTelegramAPI('answerCallbackQuery', params);
}

async function sendTypingAction(chatId: number): Promise<void> {
  await callTelegramAPI('sendChatAction', { chat_id: chatId, action: 'typing' });
}

async function sendPhoto(chatId: number, photo: string, caption?: string, options: any = {}): Promise<any> {
  const params: any = {
    chat_id: chatId,
    photo: photo,
    caption: caption,
    parse_mode: options.parse_mode || 'Markdown'
  };
  
  if (options.reply_to_message_id) {
    params.reply_to_message_id = options.reply_to_message_id;
  }
  
  return callTelegramAPI('sendPhoto', params);
}

async function sendDocument(chatId: number, document: Blob, filename: string, caption?: string, options: any = {}): Promise<any> {
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append('document', document, filename);
  if (caption) formData.append('caption', caption);
  
  const url = `${API_URL}/sendDocument`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${errorText.substring(0, 200)}`);
  }
  
  return response.json();
}

async function getFile(fileId: string): Promise<any> {
  return callTelegramAPI('getFile', { file_id: fileId });
}

// ============================================================
// 📦 توابع مدیریت Session
// ============================================================

async function getOrCreateSession(chat: Chat, user: User, env: Env): Promise<ChatSession> {
  const chatId = chat.id;
  const userId = user.id;
  const sessionKey = `session:${chatId}`;
  
  if (sessionCache.has(sessionKey)) {
    const session = sessionCache.get(sessionKey)!;
    session.lastSeen = Date.now();
    return session;
  }
  
  if (sessionLoadLocks.has(chatId)) {
    return await sessionLoadLocks.get(chatId)!;
  }
  
  const loadPromise = (async () => {
    try {
      const stored = await env.SESSIONS.get(sessionKey, 'json');
      
      if (stored) {
        const session = stored as ChatSession;
        if (session.userMemories && typeof session.userMemories === 'object' && !(session.userMemories instanceof Map)) {
          session.userMemories = new Map(Object.entries(session.userMemories).map(([k, v]) => [parseInt(k), v]));
        } else if (!session.userMemories) {
          session.userMemories = new Map();
        }
        
        if (session.engines) {
          for (const engine of ['gemini', 'sambanova', 'pollinations']) {
            const e = session.engines[engine as AIEngine];
            if (e && e.userHistories && typeof e.userHistories === 'object' && !(e.userHistories instanceof Map)) {
              e.userHistories = new Map(Object.entries(e.userHistories).map(([k, v]) => [parseInt(k), v]));
            } else if (e && !e.userHistories) {
              e.userHistories = new Map();
            }
          }
        }
        
        session.lastSeen = Date.now();
        sessionCache.set(sessionKey, session);
        return session;
      }
      
      const newSession = createNewSession(chat, user);
      await saveSessionWithLock(newSession, env, false);
      sessionCache.set(sessionKey, newSession);
      return newSession;
      
    } catch (error) {
      logger.error(`Failed to get/create session for ${chatId}`, error);
      const fallbackSession = createNewSession(chat, user);
      await saveSessionWithLock(fallbackSession, env, false);
      sessionCache.set(sessionKey, fallbackSession);
      return fallbackSession;
    } finally {
      sessionLoadLocks.delete(chatId);
    }
  })();
  
  sessionLoadLocks.set(chatId, loadPromise);
  return loadPromise;
}

function createNewSession(chat: Chat, user: User): ChatSession {
  const timestamp = Date.now();
  const personality = 'nova';
  const lang = user.language_code === 'en' ? 'en' : user.language_code === 'ar' ? 'ar' : 'fa';
  const defaultPrompt = getPersonalityPrompt(personality, lang);
  
  return {
    id: chat.id,
    type: chat.type,
    activeEngine: 'gemini',
    lastSeen: timestamp,
    messageCount: 0,
    language: lang,
    userMemories: new Map(),
    groupContext: [],
    customPrompts: { gemini: null, sambanova: null, pollinations: null },
    engines: {
      gemini: {
        history: [{ role: 'user', parts: [{ text: defaultPrompt }], timestamp, userId: user.id, userName: user.first_name }],
        userHistories: new Map(),
        apiKeyIndex: 0,
        consecutiveErrors: 0
      },
      sambanova: {
        history: [{ role: 'assistant', parts: [{ text: defaultPrompt }], timestamp, userId: user.id, userName: user.first_name }],
        userHistories: new Map(),
        apiKeyIndex: 0,
        modelIndex: 0,
        consecutiveErrors: 0
      },
      pollinations: {
        history: [{ role: 'assistant', parts: [{ text: defaultPrompt }], timestamp, userId: user.id, userName: user.first_name }],
        userHistories: new Map(),
        apiKeyIndex: 0,
        modelIndex: 0,
        consecutiveErrors: 0
      }
    },
    rateLimiting: { requests: [] },
    settings: {
      autoCleanHistory: true,
      typingIndicator: true,
      groupResponseMode: "mention_only",
      personalizedResponses: true,
      contextAwareness: true,
      languageSet: false
    },
    statistics: {
      totalMessages: 0,
      geminiMessages: 0,
      sambanovaMessages: 0,
      pollinationsMessages: 0,
      voicesReceived: 0,
      firstUsed: timestamp,
      lastSeen: timestamp
    },
    vipStatus: false,
    activePersonality: personality,
    dailyLimits: {
      messages: 0,
      voicesSent: 0,
      voicesReceived: 0,
      imagesGenerated: 0,
      lastReset: timestamp
    },
    blocked: false
  };
}

async function saveSessionWithLock(session: ChatSession, env: Env, isLocked: boolean = false): Promise<void> {
  const sessionKey = `session:${session.id}`;
  
  try {
    for (const engine of ['gemini', 'sambanova', 'pollinations']) {
      const e = session.engines[engine as AIEngine];
      if (e && e.history) {
        cleanupHistory(e.history);
      }
    }
    
    session.lastSeen = Date.now();
    
    const serializable = {
      ...session,
      userMemories: Object.fromEntries(session.userMemories || new Map()),
      engines: {
        gemini: {
          ...session.engines.gemini,
          userHistories: Object.fromEntries(session.engines.gemini.userHistories || new Map())
        },
        sambanova: {
          ...session.engines.sambanova,
          userHistories: Object.fromEntries(session.engines.sambanova.userHistories || new Map())
        },
        pollinations: {
          ...session.engines.pollinations,
          userHistories: Object.fromEntries(session.engines.pollinations.userHistories || new Map())
        }
      }
    };
    
    await env.SESSIONS.put(sessionKey, JSON.stringify(serializable));
    
    if (!isLocked) {
      sessionCache.set(sessionKey, session);
    }
    
  } catch (error) {
    logger.error(`Failed to save session ${session.id}`, error);
    throw error;
  }
}

function cleanupHistory(history: HistoryItem[]): void {
  const MAX_TOKENS_ESTIMATE = 15000;
  const MIN_KEEP = 3;
  
  if (history.length <= 10) return;
  
  let totalChars = 0;
  for (const item of history) {
    totalChars += item.parts.reduce((sum, part) => sum + (part.text?.length || 0), 0);
  }
  
  if (totalChars <= MAX_TOKENS_ESTIMATE) return;
  
  while (history.length - 1 > Math.max(10, MIN_KEEP)) {
    history.splice(1, 1);
  }
  
  totalChars = history.reduce((acc, item) => 
    acc + item.parts.reduce((sum, p) => sum + (p.text?.length || 0), 0), 0);
  
  while (totalChars > MAX_TOKENS_ESTIMATE && history.length > 2) {
    const removed = history.splice(1, 1)[0];
    totalChars -= removed.parts.reduce((sum, p) => sum + (p.text?.length || 0), 0);
  }
}

function addToHistory(history: HistoryItem[], role: MessageRole, parts: Part[], timestamp?: number): void {
  const validParts = parts.filter(part => part.text || part.inline_data);
  
  history.push({
    role,
    parts: validParts,
    timestamp: timestamp || Date.now()
  });
  
  if (history.length > 50) {
    cleanupHistory(history);
  }
}

// ============================================================
// 📦 توابع ایجاد Config - نسخه اصلاح شده
// ============================================================

function createConfig(env: Env) {
  // ✅ بررسی و لاگ کردن TOKEN
  if (!env.TOKEN) {
    console.error('❌ BOT_TOKEN is missing from environment variables!');
    console.error('📋 Available env keys:', Object.keys(env));
    
    // Fallback: اگر TOKEN وجود نداشت، از یک مقدار پیش‌فرض استفاده نکن
    // چون بدون TOKEN ربات کار نمی‌کند
    throw new Error('BOT_TOKEN is required! Please set TOKEN in your Cloudflare Worker environment variables.');
  }
  
  console.log('✅ TOKEN found, length:', env.TOKEN.length);
  
  const cfAccountIds = [env.CF_ID_1, env.CF_ID_2, env.CF_ID_3].filter((id): id is string => !!id);
  const cfTokens = [env.CF_TOKEN_1, env.CF_TOKEN_2, env.CF_TOKEN_3].filter((token): token is string => !!token);
  
  const cfPairs: Array<{ accountId: string; token: string }> = [];
  for (let i = 0; i < Math.min(cfAccountIds.length, cfTokens.length); i++) {
    if (cfAccountIds[i] && cfTokens[i]) {
      cfPairs.push({ accountId: cfAccountIds[i], token: cfTokens[i] });
    }
  }
  
  const geminiKeys = [
    env.GEMINI_KEY_1,
    env.GEMINI_KEY_2,
    env.GEMINI_KEY_3,
    env.GEMINI_KEY_4,
    env.GEMINI_KEY_5
  ].filter((key): key is string => !!key);
  
  const sambanovaKeys = [
    env.SAMBANOVA_KEY_1,
    env.SAMBANOVA_KEY_2,
    env.SAMBANOVA_KEY_3,
    env.SAMBANOVA_KEY_4,
    env.SAMBANOVA_KEY_5
  ].filter((key): key is string => !!key);
  
  console.log(`✅ Gemini keys: ${geminiKeys.length}, SambaNova keys: ${sambanovaKeys.length}`);
  
  return {
    TOKEN: env.TOKEN,
    BOT_OWNER_ID: parseInt(env.BOT_OWNER_ID || "5989309344"),
    CLOUDFLARE_PAIRS: cfPairs,
    GEMINI_KEYS: geminiKeys,
    GEMINI_MODELS: ["gemini-flash-latest"] as string[],
    PIXABAY_KEY: env.PIXABAY_KEY || "",
    AI_IMAGE_MODELS: ["@cf/black-forest-labs/flux-2-klein-4b"],
    SAMBANOVA_KEYS: sambanovaKeys,
    MAINTENANCE_MODE: env.MAINTENANCE_MODE === "true",
    GEMINI_MODEL: "gemini-flash-latest",
    MODEL_CACHE_TTL: 12 * 60 * 60 * 1000,
    SAMBANOVA_MODELS: [] as string[],
    POLLINATIONS_MODELS: [] as string[],
    HISTORY_LIMIT: 10,
    SESSION_TTL: 30 * 24 * 60 * 60 * 1000,
    MAX_CONCURRENT_REQUESTS: 50,
    REQUEST_TIMEOUT: 35000,
    RATE_LIMIT_WINDOW: 60 * 1000,
    RATE_LIMIT_MAX_REQUESTS: 20,
    MESSAGE_CHUNK_SIZE: 4000,
    MAX_MESSAGE_LENGTH: 10000,
    MAX_PROMPT_LENGTH: 5000,
    MAX_FILE_SIZE: 15 * 1024 * 1024,
    ALLOWED_CHAT_TYPES: ["private", "group", "supergroup"] as const,
    GROUP_MENTION_PROBABILITY: 0.05,
    GROUP_MIN_WORDS: 4,
    GROUP_CONTEXT_MESSAGES: 5,
    GROUP_USER_RECOGNITION_THRESHOLD: 3,
  };
}

function getFallbackPollinationsModels(): ModelInfo[] {
  return [
    { id: "deepseek", name: "DeepSeek V3.1", type: "text", description: "Advanced reasoning model" },
    { id: "gemini", name: "Gemini 2.5 Flash Lite", type: "text", description: "Multimodal AI with vision" },
    { id: "mistral", name: "Mistral Small 3.2 24B", type: "text", description: "Efficient instruct model" },
    { id: "openai", name: "OpenAI GPT-5 Nano", type: "text", description: "Basic multimodal chat" },
    { id: "openai-large", name: "OpenAI GPT-4.1", type: "text", description: "Large context model" },
    { id: "grok", name: "Grok 4 Fast", type: "text", description: "Fast conversational model" },
    { id: "nova-micro", name: "Amazon Nova (Ultra Fast)", type: "text", description: "Low latency" },
    { id: "llama", name: "Llama 3.3", type: "text" },
    { id: "qwen", name: "Qwen 2.5", type: "text" },
    { id: "phi", name: "Phi-3", type: "text" },
    { id: "claude-opus-4-8", name: "Claude Opus 4.8", type: "text", description: "Flagship model" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", type: "text", description: "Balanced" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", type: "text", description: "Fastest" },
    { id: "flux", name: "Flux (High Quality)", type: "image" },
    { id: "turbo", name: "Turbo (Fast)", type: "image" },
  ];
}

async function fetchPollinationsModels(): Promise<ModelInfo[]> {
  const textModels: ModelInfo[] = [
    { id: "openai", name: "💬 GPT-5 Mini", type: "text" },
    { id: "openai-large", name: "🧠 GPT-5.2 (Reasoning)", type: "text" },
    { id: "deepseek", name: "🧠 DeepSeek V3.1", type: "text" },
    { id: "gemini", name: "💬 Gemini 3 Flash", type: "text" },
    { id: "grok", name: "💬 Grok 4 Fast", type: "text" },
    { id: "mistral", name: "💬 Mistral Small", type: "text" },
    { id: "nova-micro", name: "⚡ Amazon Nova (Ultra Fast)", type: "text" },
    { id: "llama", name: "🦙 Llama 3.3", type: "text" },
    { id: "qwen", name: "🐉 Qwen 2.5", type: "text" },
    { id: "phi", name: "🧠 Phi-3", type: "text" },
    { id: "claude-opus-4-8", name: "🧠 Claude Opus 4.8 (Flagship)", type: "text" },
    { id: "claude-sonnet-4-6", name: "💬 Claude Sonnet 4.6 (Balanced)", type: "text" },
    { id: "claude-haiku-4-5", name: "⚡ Claude Haiku 4.5 (Fastest)", type: "text" },
  ];

  const imageModels: ModelInfo[] = [
    { id: "flux", name: "🖼️ Flux (High Quality)", type: "image" },
    { id: "turbo", name: "🖼️ Turbo (Fast)", type: "image" },
  ];

  return [...textModels, ...imageModels];
}

async function fetchSambanovaModels(apiKey: string): Promise<ModelInfo[]> {
  return [
    { id: 'Meta-Llama-3.1-8B-Instruct', name: '🦙 Llama 3.1 8B', type: 'text' },
    { id: 'Meta-Llama-3.1-70B-Instruct', name: '🦙 Llama 3.1 70B', type: 'text' },
    { id: 'Meta-Llama-3.1-405B-Instruct', name: '🦙 Llama 3.1 405B', type: 'text' },
    { id: 'Meta-Llama-3.2-1B-Instruct', name: '🦙 Llama 3.2 1B', type: 'text' },
    { id: 'Meta-Llama-3.2-3B-Instruct', name: '🦙 Llama 3.2 3B', type: 'text' },
    { id: 'Meta-Llama-3.3-70B-Instruct', name: '🦙 Llama 3.3 70B', type: 'text' },
    { id: 'Qwen2.5-7B-Instruct', name: '🐉 Qwen 2.5 7B', type: 'text' },
    { id: 'Qwen2.5-72B-Instruct', name: '🐉 Qwen 2.5 72B', type: 'text' },
    { id: 'Qwen2.5-Coder-32B-Instruct', name: '💻 Qwen Coder 32B', type: 'text' },
    { id: 'DeepSeek-R1', name: '🧠 DeepSeek R1', type: 'text' },
    { id: 'DeepSeek-R1-Distill-Llama-70B', name: '🧠 DeepSeek R1 (70B)', type: 'text' },
    { id: 'DeepSeek-V3-0324', name: '🧠 DeepSeek V3', type: 'text' },
    { id: 'Llama-4-Scout-17B-16E-Instruct', name: '🦙 Llama 4 Scout', type: 'text' },
    { id: 'Llama-4-Maverick-17B-128E-Instruct', name: '🦙 Llama 4 Maverick', type: 'text' },
  ];
}

async function getModelsWithCache(engine: AIEngine, env: Env, forceRefresh: boolean = false): Promise<ModelCache> {
  const cacheKey = `model_cache:${engine}`;
  
  if (!forceRefresh && modelCache.has(cacheKey)) {
    const cached = modelCache.get(cacheKey)!;
    if (Date.now() - cached.lastUpdated < config.MODEL_CACHE_TTL) {
      return cached;
    }
  }
  
  try {
    const stored = await env.SESSIONS.get(cacheKey, 'json');
    if (stored && !forceRefresh) {
      const cache = stored as ModelCache;
      if (Date.now() - cache.lastUpdated < config.MODEL_CACHE_TTL) {
        modelCache.set(cacheKey, cache);
        return cache;
      }
    }
  } catch (error) {
    logger.warn(`Failed to get model cache from KV for ${engine}`, error);
  }
  
  let models: ModelInfo[] = [];
  
  try {
    if (engine === 'sambanova') {
      if (config.SAMBANOVA_KEYS.length > 0) {
        models = await fetchSambanovaModels(config.SAMBANOVA_KEYS[0]);
      }
    } else if (engine === 'pollinations') {
      models = await fetchPollinationsModels();
    } else {
      models = config.GEMINI_MODELS.map(id => ({
        id,
        name: id,
        type: 'text' as const
      }));
    }
  } catch (error) {
    logger.warn(`Failed to fetch ${engine} models, using fallback`, error);
    if (engine === 'pollinations') {
      models = getFallbackPollinationsModels();
    }
  }
  
  const cache: ModelCache = {
    engine,
    models,
    lastUpdated: Date.now()
  };
  
  modelCache.set(cacheKey, cache);
  try {
    await env.SESSIONS.put(cacheKey, JSON.stringify(cache));
  } catch (error) {
    logger.warn(`Failed to save model cache to KV for ${engine}`, error);
  }
  
  return cache;
}

// ============================================================
// 📦 توابع فراخوانی AI
// ============================================================

async function callGeminiAPI(
  parts: Part[],
  model: string,
  apiKey: string,
  history: HistoryItem[]
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const contents = [];
  
  for (const item of history) {
    if (item.role === 'user') {
      contents.push({
        role: 'user',
        parts: item.parts
      });
    } else if (item.role === 'model' || item.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: item.parts
      });
    }
  }
  
  contents.push({
    role: 'user',
    parts: parts
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText.substring(0, 200)}`);
  }
  
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error('Empty response from Gemini');
  }
  
  return text.trim();
}

async function callSambanovaAPI(
  prompt: string,
  history: HistoryItem[],
  model: string,
  apiKey: string
): Promise<string> {
  const url = "https://api.sambanova.ai/v1/chat/completions";
  
  const messages = [
    ...history.map(h => ({
      role: h.role === "model" ? "assistant" : h.role,
      content: h.parts[0]?.text || ""
    })),
    { role: "user", content: prompt }
  ].filter(msg => msg.content && msg.content.trim().length > 0);
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: false
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SambaNova API error (${response.status}): ${errorText.substring(0, 200)}`);
  }
  
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  
  if (!text) throw new Error("Empty response from SambaNova");
  
  return text.trim();
}

async function callPollinationsAPI(
  messages: any[],
  model: string
): Promise<string> {
  const url = "https://text.pollinations.ai/";
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: model,
      seed: Math.floor(Math.random() * 99999),
      max_tokens: 4096
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pollinations API error (${response.status}): ${errorText.substring(0, 200)}`);
  }
  
  const text = await response.text();
  
  if (!text || text.trim() === '') {
    throw new Error('Empty response from Pollinations');
  }
  
  return text.trim();
}

async function callAI(
  session: ChatSession,
  user: User,
  text: string,
  isGroup: boolean,
  userHistory: HistoryItem[] | undefined,
  env: Env
): Promise<string> {
  const engine = session.activeEngine;
  const lang = session.language || 'fa';
  const personalityKey = session.activePersonality || 'nova';
  
  let systemPrompt = session.customPrompts[engine];
  if (!systemPrompt) {
    systemPrompt = getPersonalityPrompt(personalityKey, lang);
  }
  
  const engineHistory = session.engines[engine].history;
  const historyToUse = (isGroup && userHistory) ? 
    [engineHistory[0], ...userHistory] : 
    engineHistory;
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyToUse.slice(-10).map(h => ({
      role: h.role === 'model' ? 'assistant' : h.role === 'user' ? 'user' : 'system',
      content: h.parts[0]?.text || ''
    })),
    { role: 'user', content: text }
  ].filter(msg => msg.content && msg.content.trim().length > 0);
  
  if (engine === 'gemini') {
    try {
      const geminiParts = [{ text: text }];
      const geminiHistory = historyToUse.map(h => ({
        role: h.role === 'model' ? 'model' : h.role,
        parts: h.parts
      }));
      
      const apiKey = config.GEMINI_KEYS[0];
      if (!apiKey) throw new Error('No Gemini API key available');
      
      return await callGeminiAPI(geminiParts, config.GEMINI_MODEL, apiKey, geminiHistory);
    } catch (error) {
      logger.error('Gemini API failed, falling back to Pollinations', error);
      return await callPollinationsAPI(messages, 'openai');
    }
  }
  
  if (engine === 'sambanova') {
    try {
      const apiKey = config.SAMBANOVA_KEYS[0];
      if (!apiKey) throw new Error('No SambaNova API key available');
      
      const modelIndex = session.engines.sambanova.modelIndex;
      const models = await getModelsWithCache('sambanova', env, false);
      const model = models.models[modelIndex]?.id || 'Meta-Llama-3.1-8B-Instruct';
      
      return await callSambanovaAPI(text, historyToUse, model, apiKey);
    } catch (error) {
      logger.error('SambaNova API failed, falling back to Pollinations', error);
      return await callPollinationsAPI(messages, 'openai');
    }
  }
  
  try {
    const modelIndex = session.engines.pollinations.modelIndex;
    const models = await getModelsWithCache('pollinations', env, false);
    const model = models.models[modelIndex]?.id || 'openai';
    
    return await callPollinationsAPI(messages, model);
  } catch (error) {
    logger.error('Pollinations API failed', error);
    const fallbackModels = ['openai', 'deepseek', 'gemini', 'mistral'];
    for (const fb of fallbackModels) {
      try {
        return await callPollinationsAPI(messages, fb);
      } catch (e) {
        continue;
      }
    }
    throw new Error('All AI services are unavailable. Please try again later.');
  }
}

// ============================================================
// 📦 توابع پردازش پیام‌ها و دستورات
// ============================================================

async function handleTextMessage(message: Message, env: Env, config: any): Promise<void> {
  try {
    if (!message || !message.from || !message.chat) {
      logger.error('handleTextMessage: Invalid message');
      return;
    }
    
    const chat = message.chat;
    const user = message.from;
    const text = message.text || '';
    
    if (!text) return;
    
    if (!chat.id) {
      logger.error('handleTextMessage: chat.id is undefined');
      return;
    }
    
    if (text.startsWith('/')) {
      await handleCommand(message, env, config);
      return;
    }
    
    const session = await getOrCreateSession(chat, user, env);
    
    if (session.blocked) {
      await sendMessage(chat.id, '🚫 شما توسط مدیر مسدود شده‌اید.', {
        reply_to_message_id: message.message_id
      });
      return;
    }
    
    if (!session.vipStatus) {
      const now = Date.now();
      const dayStart = new Date().setHours(0, 0, 0, 0);
      
      if (session.dailyLimits.lastReset < dayStart) {
        session.dailyLimits = {
          messages: 0,
          voicesSent: 0,
          voicesReceived: 0,
          imagesGenerated: 0,
          lastReset: dayStart
        };
      }
      
      if (session.dailyLimits.messages >= 100) {
        const lang = session.language || 'fa';
        const txt = TRANSLATIONS[lang] || TRANSLATIONS.fa;
        await sendMessage(chat.id, 
          `${txt.daily_limit_reached}\n\n${txt.daily_limit_messages}\n${txt.vip_unlimited}\n\n${txt.reset_at_midnight}`,
          { reply_to_message_id: message.message_id }
        );
        return;
      }
      
      session.dailyLimits.messages++;
    }
    
    if (session.settings.typingIndicator) {
      await sendTypingAction(chat.id).catch(() => {});
    }
    
    try {
      const isGroup = chat.type === 'group' || chat.type === 'supergroup';
      const userHistory = session.engines[session.activeEngine].userHistories.get(user.id);
      
      const response = await callAI(session, user, text, isGroup, userHistory, env);
      
      const engine = session.engines[session.activeEngine];
      const timestamp = Date.now();
      
      addToHistory(engine.history, 'user', [{ text }], timestamp);
      addToHistory(engine.history, 'model', [{ text: response }], timestamp);
      
      session.messageCount++;
      session.statistics.totalMessages++;
      const statKey = `${session.activeEngine}Messages` as keyof typeof session.statistics;
      (session.statistics[statKey] as number)++;
      
      await saveSessionWithLock(session, env, false);
      
      await sendMessage(chat.id, response, {
        reply_to_message_id: message.message_id,
        parse_mode: 'Markdown'
      });
      
    } catch (error) {
      logger.error('Error processing text message', error);
      const errorInfo = categorizeError(error);
      const lang = session.language || 'fa';
      await sendMessage(chat.id, formatErrorMessage(errorInfo, lang), {
        reply_to_message_id: message.message_id
      });
    }
    
  } catch (error) {
    logger.error('handleTextMessage failed', error);
    try {
      if (message && message.chat && message.chat.id) {
        await sendMessage(message.chat.id, 
          '❌ **خطا در پردازش پیام**\n\nلطفاً دوباره تلاش کنید.',
          { reply_to_message_id: message.message_id }
        );
      }
    } catch (sendError) {
      logger.error('Failed to send error message', sendError);
    }
  }
}

// ============================================================
// 📋 مدیریت دستورات کامل
// ============================================================

async function handleCommand(message: Message, env: Env, config: any): Promise<void> {
  try {
    if (!message || !message.from || !message.text) {
      logger.error('handleCommand: Invalid message');
      return;
    }
    
    const chat = message.chat;
    const user = message.from;
    const text = message.text;
    const command = text.split(' ')[0].toLowerCase();
    const args = text.split(' ').slice(1);
    
    if (!chat || !chat.id) {
      logger.error('handleCommand: chat.id is undefined');
      return;
    }
    
    let session: ChatSession;
    try {
      session = await getOrCreateSession(chat, user, env);
    } catch (sessionError) {
      logger.error('Failed to get session', sessionError);
      await sendMessage(chat.id, '⚠️ خطا در دریافت تنظیمات. لطفاً دوباره تلاش کنید.', {
        reply_to_message_id: message.message_id
      });
      return;
    }
    
    if (session.blocked) {
      await sendMessage(chat.id, '🚫 شما توسط مدیر مسدود شده‌اید.', {
        reply_to_message_id: message.message_id
      });
      return;
    }
    
    const lang = session.language || 'fa';
    const txt = TRANSLATIONS[lang] || TRANSLATIONS.fa;
    
    switch (command) {
      case '/start':
        await handleStartCommand(message, env, session, txt);
        break;
      case '/help':
        await sendHelpMenu(message, session, env);
        break;
      case '/new':
        await handleNewChatCommand(message, env, session, txt);
        break;
      case '/model':
        await sendModelMenu(message, session, env);
        break;
      case '/personality':
        await sendPersonalityMenu(message, session, env);
        break;
      case '/language':
        await handleLanguageCommand(message, env, session, txt);
        break;
      case '/prompt':
        await handlePromptCommand(message, env, session, txt);
        break;
      case '/setprompt':
        await handleSetPromptCommand(message, env, session, args, txt);
        break;
      case '/img':
        await handleImageCommand(message, env, session, args, txt);
        break;
      case '/search':
        await handleSearchCommand(message, env, session, args, txt);
        break;
      case '/vip':
        await handleVipCommand(message, env, session, txt);
        break;
      case '/stats':
        await handleStatsCommand(message, env, session, txt);
        break;
      case '/reset':
        await handleResetCommand(message, env, session, txt);
        break;
      case '/admin':
        if (user.id === config.BOT_OWNER_ID) {
          await handleAdminCommand(message, env, session, txt);
        }
        break;
      case '/blocked':
        if (user.id === config.BOT_OWNER_ID) {
          await handleBlockedCommand(message, env, session, txt);
        }
        break;
      case '/broadcast':
        if (user.id === config.BOT_OWNER_ID) {
          await handleBroadcastCommand(message, env, session, args, txt);
        }
        break;
      case '/log':
        if (user.id === config.BOT_OWNER_ID) {
          await handleLogCommand(message, env, session, txt);
        }
        break;
      case '/keys':
        if (user.id === config.BOT_OWNER_ID) {
          await handleKeysCommand(message, env, session, txt);
        }
        break;
      case '/vipadd':
        if (user.id === config.BOT_OWNER_ID) {
          await handleVipAddCommand(message, env, session, args, txt);
        }
        break;
      case '/vipremove':
        if (user.id === config.BOT_OWNER_ID) {
          await handleVipRemoveCommand(message, env, session, args, txt);
        }
        break;
      case '/block':
        if (user.id === config.BOT_OWNER_ID) {
          await handleBlockUserCommand(message, env, session, args, txt);
        }
        break;
      case '/unblock':
        if (user.id === config.BOT_OWNER_ID) {
          await handleUnblockUserCommand(message, env, session, args, txt);
        }
        break;
      case '/rebuild':
        if (user.id === config.BOT_OWNER_ID) {
          await handleRebuildCommand(message, env, session, txt);
        }
        break;
      case '/maintenance':
        if (user.id === config.BOT_OWNER_ID) {
          await handleMaintenanceCommand(message, env, session, txt);
        }
        break;
      default:
        try {
          await sendMessage(chat.id, 
            `❌ **دستور ناشناخته**\n\nبرای مشاهده لیست دستورات /help را بزنید.`,
            { reply_to_message_id: message.message_id }
          );
        } catch (error) {
          logger.error('Error sending unknown command message', error);
        }
        break;
    }
    
  } catch (error) {
    logger.error('handleCommand failed', error);
    try {
      if (message && message.chat && message.chat.id) {
        await sendMessage(message.chat.id, 
          '❌ **خطا در پردازش دستور**\n\nلطفاً دوباره تلاش کنید.',
          { reply_to_message_id: message.message_id }
        );
      }
    } catch (sendError) {
      logger.error('Failed to send error message', sendError);
    }
  }
}

// ============================================================
// 📦 دستورات اصلی
// ============================================================

async function handleStartCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  try {
    if (!message || !message.chat || !message.from) {
      logger.error('handleStartCommand: Invalid message object');
      return;
    }
    
    const chat = message.chat;
    const user = message.from;
    const isGroup = chat.type === 'group' || chat.type === 'supergroup';
    
    if (!chat.id) {
      logger.error('handleStartCommand: chat.id is undefined');
      return;
    }
    
    const welcomeText = isGroup ? 
      txt.welcome_group.replace('{name}', user.first_name || 'کاربر') :
      txt.welcome.replace('{name}', user.first_name || 'کاربر');
    
    const keyboard = isGroup ? {
      inline_keyboard: [
        [{ text: txt.btn_settings || '⚙️ تنظیمات', callback_data: 'group_settings' }]
      ]
    } : {
      inline_keyboard: [
        [{ text: txt.btn_select_model || '🤖 انتخاب مدل', callback_data: 'model_settings' }],
        [{ text: txt.btn_change_personality || '🎭 تغییر شخصیت', callback_data: 'personality_menu' }],
        [{ text: txt.btn_help || '❓ راهنما', callback_data: 'help_menu' }]
      ]
    };
    
    let replyMarkup: string | undefined;
    try {
      replyMarkup = JSON.stringify(keyboard);
    } catch (e) {
      logger.warn('Failed to stringify keyboard', e);
      replyMarkup = undefined;
    }
    
    try {
      await sendMessage(chat.id, welcomeText, {
        reply_to_message_id: message.message_id,
        reply_markup: replyMarkup
      });
      logger.info(`✅ Start message sent to chat ${chat.id}`);
    } catch (sendError) {
      logger.error(`Error sending start message to chat ${chat.id}`, sendError);
      try {
        await sendMessage(chat.id, welcomeText, {
          reply_to_message_id: message.message_id
        });
        logger.info(`✅ Fallback start message sent to chat ${chat.id}`);
      } catch (retryError) {
        logger.error(`Error sending fallback start message to chat ${chat.id}`, retryError);
        try {
          await sendMessage(chat.id, welcomeText);
          logger.info(`✅ Final fallback start message sent to chat ${chat.id}`);
        } catch (finalError) {
          logger.error(`All attempts to send start message to chat ${chat.id} failed`, finalError);
        }
      }
    }
    
  } catch (error) {
    logger.error('handleStartCommand failed', error);
  }
}

async function handleNewChatCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  const engine = session.activeEngine;
  
  session.engines[engine].history = [session.engines[engine].history[0]];
  session.engines[engine].userHistories = new Map();
  
  await saveSessionWithLock(session, env, false);
  
  const msg = t(session, 'success_new_chat', { engine: getEngineName(engine, session.language) });
  await sendMessage(chat.id, msg, { reply_to_message_id: message.message_id });
}

async function handleLanguageCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  const currentLang = session.language || 'fa';
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: `🇮🇷 فارسی ${currentLang === 'fa' ? '✅' : ''}`, callback_data: 'set_lang_fa' },
        { text: `🇺🇸 English ${currentLang === 'en' ? '✅' : ''}`, callback_data: 'set_lang_en' },
        { text: `🇸🇦 العربية ${currentLang === 'ar' ? '✅' : ''}`, callback_data: 'set_lang_ar' }
      ]
    ]
  };
  
  const msg = t(session, 'language_title', { current: currentLang });
  
  await sendMessage(chat.id, msg, {
    reply_to_message_id: message.message_id,
    reply_markup: JSON.stringify(keyboard)
  });
}

async function handlePromptCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  
  const gemini = session.customPrompts.gemini || (lang === 'fa' ? 'پیش‌فرض' : 'Default');
  const sambanova = session.customPrompts.sambanova || (lang === 'fa' ? 'پیش‌فرض' : 'Default');
  const pollinations = session.customPrompts.pollinations || (lang === 'fa' ? 'پیش‌فرض' : 'Default');
  
  const msg = t(session, 'prompt_view', { gemini, sambanova, pollinations });
  await sendMessage(chat.id, msg, { reply_to_message_id: message.message_id });
}

async function handleSetPromptCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  
  if (args.length < 2) {
    await sendMessage(chat.id, t(session, 'prompt_format'), {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  const engine = args[0].toLowerCase() as AIEngine;
  const promptText = args.slice(1).join(' ');
  
  if (!['gemini', 'sambanova', 'pollinations'].includes(engine)) {
    await sendMessage(chat.id, t(session, 'prompt_invalid_model'), {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  session.customPrompts[engine] = promptText;
  await saveSessionWithLock(session, env, false);
  
  const msg = t(session, 'success_prompt_set', { engine: getEngineName(engine, lang), prompt: promptText });
  await sendMessage(chat.id, msg, { reply_to_message_id: message.message_id });
}

async function handleStatsCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  
  const today = new Date();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  if (session.dailyLimits.lastReset < dayStart) {
    session.dailyLimits = {
      messages: 0,
      voicesSent: 0,
      voicesReceived: 0,
      imagesGenerated: 0,
      lastReset: dayStart
    };
  }
  
  const personalityName = getPersonalityName(session.activePersonality || 'nova', lang);
  const personalityEmoji = getPersonalityEmoji(session.activePersonality || 'nova');
  const engineName = getEngineName(session.activeEngine, lang);
  const status = session.vipStatus ? 'VIP 👑' : (lang === 'fa' ? 'رایگان' : 'Free');
  
  let msg = t(session, 'stats_title') + '\n━━━━━━━━━━━━━━━━━━━━\n';
  msg += t(session, 'stats_user', { name: message.from?.first_name || (lang === 'fa' ? 'کاربر' : 'User') }) + '\n';
  msg += t(session, 'stats_personality', { emoji: personalityEmoji, name: personalityName }) + '\n';
  msg += t(session, 'stats_model', { name: engineName }) + '\n';
  msg += t(session, 'stats_status', { status }) + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━\n';
  msg += t(session, 'stats_total') + '\n';
  msg += t(session, 'stats_messages', { count: session.statistics.totalMessages || 0 }) + '\n';
  msg += t(session, 'stats_voices', { count: session.statistics.voicesReceived || 0 }) + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━\n';
  msg += t(session, 'stats_today') + '\n';
  msg += t(session, 'stats_today_messages', { current: session.dailyLimits.messages, max: 100 }) + '\n';
  msg += t(session, 'stats_today_images', { current: session.dailyLimits.imagesGenerated, max: 5 }) + '\n';
  msg += t(session, 'stats_today_voices', { current: session.dailyLimits.voicesReceived, max: 10 }) + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━\n';
  msg += t(session, 'stats_joined', { date: formatDate(session.statistics.firstUsed, lang === 'fa' ? 'fa-IR' : 'en-US') });
  
  await sendMessage(chat.id, msg, { reply_to_message_id: message.message_id });
}

async function handleResetCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  
  session.activePersonality = 'nova';
  session.customPrompts = { gemini: null, sambanova: null, pollinations: null };
  
  const defaultPrompt = getPersonalityPrompt('nova', lang);
  for (const engine of ['gemini', 'sambanova', 'pollinations']) {
    const e = session.engines[engine as AIEngine];
    if (e && e.history.length > 0) {
      e.history[0].parts[0].text = defaultPrompt;
    }
  }
  
  await saveSessionWithLock(session, env, false);
  
  await sendMessage(chat.id, t(session, 'confirm_reset'), {
    reply_to_message_id: message.message_id
  });
}

async function handleVipCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  
  if (session.vipStatus) {
    await sendMessage(chat.id,
      `⭐ **شما VIP هستید!**\n\n` +
      `✅ استفاده نامحدود از تمام امکانات\n` +
      `✅ دسترسی به تمام شخصیت‌ها\n` +
      `✅ اولویت در پردازش\n\n` +
      `👑 از ربات لذت ببرید!`,
      { reply_to_message_id: message.message_id }
    );
    return;
  }
  
  await sendMessage(chat.id,
    `⭐ **ارتقا به VIP**\n\n` +
    `✨ **مزایا:**\n` +
    `• ♾️ پیام‌های نامحدود\n` +
    `• ♾️ تصاویر نامحدود\n` +
    `• ♾️ ویس‌های نامحدود\n` +
    `• 🎭 دسترسی به تمام ۱۰ شخصیت\n` +
    `• 🧠 دسترسی به لونا و زارا\n` +
    `• ✏️ پرامپت‌های سفارشی\n` +
    `• 🚀 اولویت در پردازش\n\n` +
    `💰 قیمت: تماس با مدیریت\n` +
    `📞 @Hamid_Ai_pro`,
    { reply_to_message_id: message.message_id }
  );
}

async function handleImageCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  const prompt = args.join(' ');
  
  if (!prompt) {
    await sendMessage(chat.id, t(session, 'image_format'), {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  if (!session.vipStatus) {
    const now = Date.now();
    const dayStart = new Date().setHours(0, 0, 0, 0);
    
    if (session.dailyLimits.lastReset < dayStart) {
      session.dailyLimits.lastReset = dayStart;
      session.dailyLimits.imagesGenerated = 0;
    }
    
    if (session.dailyLimits.imagesGenerated >= 5) {
      await sendMessage(chat.id,
        `${t(session, 'daily_limit_reached')}\n\n${t(session, 'daily_limit_images')}\n${t(session, 'vip_unlimited')}\n\n${t(session, 'reset_at_midnight')}`,
        { reply_to_message_id: message.message_id }
      );
      return;
    }
    
    session.dailyLimits.imagesGenerated++;
  }
  
  await sendTypingAction(chat.id).catch(() => {});
  
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;
    
    await sendPhoto(chat.id, imageUrl, 
      t(session, 'image_success', { prompt }),
      { reply_to_message_id: message.message_id }
    );
    
  } catch (error) {
    logger.error('Image generation failed', error);
    await sendMessage(chat.id, t(session, 'image_error'), {
      reply_to_message_id: message.message_id
    });
  }
}

async function handleSearchCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  const query = args.join(' ');
  
  if (!query) {
    await sendMessage(chat.id, t(session, 'search_format'), {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  await sendTypingAction(chat.id).catch(() => {});
  
  try {
    const pixabayKey = config.PIXABAY_KEY;
    if (!pixabayKey) {
      throw new Error('Pixabay API key not configured');
    }
    
    const response = await fetch(
      `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=5&safesearch=true`
    );
    
    const data = await response.json();
    
    if (!data.hits || data.hits.length === 0) {
      await sendMessage(chat.id, t(session, 'search_no_result', { query }), {
        reply_to_message_id: message.message_id
      });
      return;
    }
    
    for (const hit of data.hits.slice(0, 5)) {
      await sendPhoto(chat.id, hit.webformatURL, `📸 ${hit.tags}`).catch(() => {});
    }
    
  } catch (error) {
    logger.error('Image search failed', error);
    await sendMessage(chat.id, t(session, 'image_error'), {
      reply_to_message_id: message.message_id
    });
  }
}

// ============================================================
// 📦 منوها
// ============================================================

async function sendMainMenu(message: Message, session: ChatSession, env: Env): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  const isGroup = chat.type === 'group' || chat.type === 'supergroup';
  
  const personalityKey = session.activePersonality || 'nova';
  const personalityName = getPersonalityName(personalityKey, lang);
  const personalityEmoji = getPersonalityEmoji(personalityKey);
  const engineName = getEngineName(session.activeEngine, lang);
  
  const today = new Date();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  if (session.dailyLimits.lastReset < dayStart) {
    session.dailyLimits = {
      messages: 0,
      voicesSent: 0,
      voicesReceived: 0,
      imagesGenerated: 0,
      lastReset: dayStart
    };
  }
  
  const userName = message.from?.first_name || (lang === 'fa' ? 'کاربر' : 'User');
  const vipBadge = session.vipStatus ? ' 💎 VIP' : '';
  
  let text = t(session, 'main_menu_title', {
    user: userName,
    vip: vipBadge,
    personality: `${personalityEmoji} ${personalityName}`,
    model: engineName,
    messages: session.dailyLimits.messages,
    max_messages: 100,
    images: session.dailyLimits.imagesGenerated,
    max_images: 5,
    voices: session.dailyLimits.voicesReceived,
    max_voices: 10
  });
  
  const keyboard = isGroup ? {
    inline_keyboard: [
      [{ text: t(session, 'btn_settings'), callback_data: 'group_settings' }],
      [{ text: t(session, 'btn_close'), callback_data: 'close' }]
    ]
  } : {
    inline_keyboard: [
      [{ text: t(session, 'btn_select_model'), callback_data: 'model_settings' }, { text: t(session, 'btn_change_personality'), callback_data: 'personality_menu' }],
      [{ text: t(session, 'btn_help'), callback_data: 'help_menu' }, { text: t(session, 'btn_vip'), callback_data: 'menu_vip' }],
      [{ text: t(session, 'btn_close'), callback_data: 'close' }]
    ]
  };
  
  if (message.message_id) {
    await editMessageText(chat.id, message.message_id, text, {
      reply_markup: JSON.stringify(keyboard)
    }).catch(async () => {
      await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
    });
  } else {
    await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
  }
}

async function sendPersonalityMenu(message: Message, session: ChatSession, env: Env): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  const currentPersonality = session.activePersonality || 'nova';
  const currentName = getPersonalityName(currentPersonality, lang);
  const currentEmoji = getPersonalityEmoji(currentPersonality);
  
  const text = t(session, 'personality_title') + '\n━━━━━━━━━━━━━━━━━━━━\n' +
    t(session, 'personality_current', { name: `${currentEmoji} ${currentName}` }) + '\n\n' +
    t(session, 'personality_desc') + '\n\n' +
    (lang === 'fa' ? 'یکی را انتخاب کنید:' : 'Select one:');
  
  const keyboard = {
    inline_keyboard: [
      [{ text: `${PERSONALITIES.nova.emoji} نوا`, callback_data: 'set_personality_nova' }, { text: `${PERSONALITIES.lilith.emoji} لیلیت`, callback_data: 'set_personality_lilith' }],
      [{ text: `${PERSONALITIES.cipher.emoji} سایفر`, callback_data: 'set_personality_cipher' }, { text: `${PERSONALITIES.leatherface.emoji} صورت‌چرمی`, callback_data: 'set_personality_leatherface' }],
      [{ text: `${PERSONALITIES.victoria.emoji} ویکتوریا`, callback_data: 'set_personality_victoria' }, { text: `${PERSONALITIES.aria.emoji} آریا`, callback_data: 'set_personality_aria' }],
      [{ text: `${PERSONALITIES.jax.emoji} جکس`, callback_data: 'set_personality_jax' }, { text: `${PERSONALITIES.luna.emoji} لونا`, callback_data: 'set_personality_luna' }],
      [{ text: `${PERSONALITIES.zara.emoji} زارا`, callback_data: 'set_personality_zara' }, { text: `${PERSONALITIES.shadow.emoji} شادو`, callback_data: 'set_personality_shadow' }],
      [{ text: t(session, 'btn_back'), callback_data: 'back_to_main_menu' }]
    ]
  };
  
  if (message.message_id) {
    await editMessageText(chat.id, message.message_id, text, {
      reply_markup: JSON.stringify(keyboard)
    }).catch(async () => {
      await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
    });
  } else {
    await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
  }
}

async function sendModelMenu(message: Message, session: ChatSession, env: Env): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  const currentEngine = session.activeEngine;
  
  const text = t(session, 'model_select_title', { name: getEngineName(currentEngine, lang) }) + 
    '\n━━━━━━━━━━━━━━━━━━━━\n' +
    (lang === 'fa' ? 'یکی از مدل‌های زیر را انتخاب کنید:' : 'Select one of the models below:');
  
  const keyboard = {
    inline_keyboard: [
      [{ text: `${currentEngine === 'gemini' ? '✅ ' : ''}🤖 ${MODEL_META.gemini.fa} (Gemini)`, callback_data: 'set_model_gemini' }],
      [{ text: `${currentEngine === 'sambanova' ? '✅ ' : ''}🧠 ${MODEL_META.sambanova.fa} (SambaNova) ${!session.vipStatus ? '🔒' : ''}`, callback_data: session.vipStatus ? 'set_model_sambanova' : 'vip_only' }],
      [{ text: `${currentEngine === 'pollinations' ? '✅ ' : ''}✨ ${MODEL_META.pollinations.fa} (Pollinations)`, callback_data: 'set_model_pollinations' }],
      [{ text: t(session, 'btn_back'), callback_data: 'back_to_main_menu' }]
    ]
  };
  
  if (message.message_id) {
    await editMessageText(chat.id, message.message_id, text, {
      reply_markup: JSON.stringify(keyboard)
    }).catch(async () => {
      await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
    });
  } else {
    await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
  }
}

async function sendHelpMenu(message: Message, session: ChatSession, env: Env): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  const helpData = HELP_SECTIONS[lang] || HELP_SECTIONS.fa;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '💬 راهنمای گفتگو', callback_data: 'help_chat' }],
      [{ text: '🎭 راهنمای شخصیت‌ها', callback_data: 'help_personalities' }],
      [{ text: '🤖 راهنمای مدل‌ها', callback_data: 'help_models' }],
      [{ text: '🎨 راهنمای تصاویر', callback_data: 'help_images' }],
      [{ text: '📝 راهنمای پرامپت', callback_data: 'help_prompts' }],
      [{ text: '⚙️ راهنمای تنظیمات', callback_data: 'help_settings' }],
      [{ text: '⚡ لیست دستورات', callback_data: 'help_commands' }],
      [{ text: '⭐ راهنمای VIP', callback_data: 'help_vip' }],
      [{ text: t(session, 'btn_back'), callback_data: 'back_to_main_menu' }]
    ]
  };
  
  const text = `${helpData.title}\n\n${helpData.subtitle}`;
  
  if (message.message_id) {
    await editMessageText(chat.id, message.message_id, text, {
      reply_markup: JSON.stringify(keyboard)
    }).catch(async () => {
      await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
    });
  } else {
    await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
  }
}

// ============================================================
// 📦 مدیریت Callback Query ها
// ============================================================

async function handleCallbackQuery(cb: CallbackQuery, env: Env, config: any): Promise<void> {
  try {
    if (!cb || !cb.from || !cb.message || !cb.data) {
      logger.error('handleCallbackQuery: Invalid callback');
      return;
    }
    
    const chat = cb.message.chat;
    const user = cb.from;
    const data = cb.data;
    
    if (!chat || !chat.id) {
      logger.error('handleCallbackQuery: chat.id is undefined');
      return;
    }
    
    try {
      await answerCallbackQuery(cb.id).catch(() => {});
    } catch (answerError) {
      logger.warn('Failed to answer callback query', answerError);
    }
    
    let session: ChatSession;
    try {
      session = await getOrCreateSession(chat, user, env);
    } catch (sessionError) {
      logger.error('Failed to get session in callback', sessionError);
      try {
        await sendMessage(chat.id, '⚠️ خطا در دریافت تنظیمات. لطفاً دوباره تلاش کنید.');
      } catch (sendError) {
        logger.error('Failed to send error message in callback', sendError);
      }
      return;
    }
    
    if (session.blocked) {
      await sendMessage(chat.id, '🚫 شما توسط مدیر مسدود شده‌اید.');
      return;
    }
    
    const lang = session.language || 'fa';
    const txt = TRANSLATIONS[lang] || TRANSLATIONS.fa;
    
    // ===== تنظیم زبان =====
    if (data.startsWith('set_lang_')) {
      const newLang = data.replace('set_lang_', '') as 'fa' | 'en' | 'ar';
      session.language = newLang;
      
      const personalityKey = session.activePersonality || 'nova';
      const newPrompt = getPersonalityPrompt(personalityKey, newLang);
      
      for (const engine of ['gemini', 'sambanova', 'pollinations']) {
        const e = session.engines[engine as AIEngine];
        if (e && e.history.length > 0) {
          e.history[0].parts[0].text = newPrompt;
        }
      }
      
      await saveSessionWithLock(session, env, false);
      
      const langNames = { fa: 'فارسی 🇮🇷', en: 'English 🇺🇸', ar: 'العربية 🇸🇦' };
      await answerCallbackQuery(cb.id, `✅ زبان به ${langNames[newLang]} تغییر یافت`, false);
      
      await sendMainMenu(cb.message, session, env);
      return;
    }
    
    // ===== تغییر شخصیت =====
    if (data.startsWith('set_personality_')) {
      const personalityKey = data.replace('set_personality_', '');
      
      if (!PERSONALITIES[personalityKey as keyof typeof PERSONALITIES]) {
        await answerCallbackQuery(cb.id, '❌ شخصیت نامعتبر', true);
        return;
      }
      
      session.activePersonality = personalityKey;
      
      const newPrompt = getPersonalityPrompt(personalityKey, lang);
      for (const engine of ['gemini', 'sambanova', 'pollinations']) {
        const e = session.engines[engine as AIEngine];
        if (e && e.history.length > 0) {
          e.history[0].parts[0].text = newPrompt;
        }
      }
      
      await saveSessionWithLock(session, env, false);
      
      const name = getPersonalityName(personalityKey, lang);
      const emoji = getPersonalityEmoji(personalityKey);
      await answerCallbackQuery(cb.id, `✅ ${emoji} ${name} فعال شد!`, false);
      
      await sendMainMenu(cb.message, session, env);
      return;
    }
    
    // ===== تغییر مدل =====
    if (data.startsWith('set_model_')) {
      const engine = data.replace('set_model_', '') as AIEngine;
      
      if (!['gemini', 'sambanova', 'pollinations'].includes(engine)) {
        await answerCallbackQuery(cb.id, '❌ مدل نامعتبر', true);
        return;
      }
      
      if (engine === 'sambanova' && !session.vipStatus) {
        await answerCallbackQuery(cb.id, '⚠️ مدل لونا فقط برای کاربران VIP است!', true);
        return;
      }
      
      session.activeEngine = engine;
      await saveSessionWithLock(session, env, false);
      
      const name = getEngineName(engine, lang);
      await answerCallbackQuery(cb.id, `✅ ${name} فعال شد!`, false);
      
      await sendMainMenu(cb.message, session, env);
      return;
    }
    
    // ===== منوها =====
    if (data === 'personality_menu') {
      await sendPersonalityMenu(cb.message, session, env);
      return;
    }
    
    if (data === 'model_settings') {
      await sendModelMenu(cb.message, session, env);
      return;
    }
    
    if (data === 'help_menu') {
      await sendHelpMenu(cb.message, session, env);
      return;
    }
    
    // ===== بخش‌های راهنما =====
    if (data.startsWith('help_')) {
      await handleHelpCallbacks(cb, session, env);
      return;
    }
    
    // ===== بازگشت =====
    if (data === 'back_to_main_menu' || data === 'help_back') {
      await sendMainMenu(cb.message, session, env);
      return;
    }
    
    // ===== بستن =====
    if (data === 'close' || data === 'admin_close') {
      await deleteMessage(chat.id, cb.message.message_id).catch(() => {});
      return;
    }
    
    // ===== VIP =====
    if (data === 'menu_vip' || data === 'vip_only') {
      await handleVipCommand(cb.message, env, session, txt);
      return;
    }
    
    // ===== تنظیمات گروه =====
    if (data === 'group_settings') {
      await sendGroupSettings(cb.message, session, env);
      return;
    }
    
    // ===== دستورات مدیریتی =====
    if (data.startsWith('admin_') && user.id === config.BOT_OWNER_ID) {
      await handleAdminCallbacks(cb, session, env, data);
      return;
    }
    
    await answerCallbackQuery(cb.id, '❓ دکمه ناشناخته', true);
    
  } catch (error) {
    logger.error('handleCallbackQuery failed', error);
  }
}

async function handleHelpCallbacks(cb: CallbackQuery, session: ChatSession, env: Env): Promise<void> {
  const data = cb.data;
  const lang = session.language || 'fa';
  const helpData = HELP_SECTIONS[lang] || HELP_SECTIONS.fa;
  const chat = cb.message!.chat;
  const msgId = cb.message!.message_id;
  
  let title: string;
  let content: string;
  
  switch (data) {
    case 'help_chat':
      title = helpData.chat.title;
      content = helpData.chat.content;
      break;
    case 'help_personalities':
      title = helpData.personalities.title;
      content = helpData.personalities.content;
      break;
    case 'help_models':
      title = helpData.models.title;
      content = helpData.models.content;
      break;
    case 'help_images':
      title = helpData.images.title;
      content = helpData.images.content.replace('{images}', String(session.dailyLimits.imagesGenerated || 0));
      break;
    case 'help_prompts':
      title = helpData.prompts.title;
      content = helpData.prompts.content;
      break;
    case 'help_settings':
      title = helpData.settings.title;
      content = helpData.settings.content;
      break;
    case 'help_commands':
      title = helpData.commands.title;
      content = helpData.commands.content;
      break;
    case 'help_vip':
      title = helpData.vip.title;
      content = helpData.vip.content.replace('{status}', session.vipStatus ? '💎 VIP' : '🆓 رایگان / Free / مجاني');
      break;
    default:
      await answerCallbackQuery(cb.id, '❌ بخش پیدا نشد', true);
      return;
  }
  
  const backKeyboard = {
    inline_keyboard: [
      [{ text: t(session, 'btn_back'), callback_data: 'help_menu' }],
      [{ text: t(session, 'btn_back'), callback_data: 'back_to_main_menu' }]
    ]
  };
  
  await editMessageText(chat.id, msgId, `${title}\n\n${content}`, {
    reply_markup: JSON.stringify(backKeyboard)
  });
  
  await answerCallbackQuery(cb.id);
}

// ============================================================
// 📦 مدیریت گروه
// ============================================================

async function sendGroupSettings(message: Message, session: ChatSession, env: Env): Promise<void> {
  const chat = message.chat;
  const lang = session.language || 'fa';
  
  const text = lang === 'fa' ?
    `👥 **تنظیمات گروه**\n━━━━━━━━━━━━━━━━━━━━\nربات فقط زمانی پاسخ می‌دهد که:\n• شما او را منشن کنید (با @username یا کلمه \"نوا\")\n• یا روی پیامش ریپلای بزنید.\n\n✅ حالت هوشمند حذف شد.` :
    `👥 **Group Settings**\n━━━━━━━━━━━━━━━━━━━━\nThe bot only replies when:\n• You mention it (@username or \"nova\")\n• Or reply to its message.\n\n✅ Smart mode removed.`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: t(session, 'btn_back'), callback_data: 'back_to_main_menu' }]
    ]
  };
  
  if (message.message_id) {
    await editMessageText(chat.id, message.message_id, text, {
      reply_markup: JSON.stringify(keyboard)
    }).catch(async () => {
      await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
    });
  } else {
    await sendMessage(chat.id, text, { reply_markup: JSON.stringify(keyboard) });
  }
}

// ============================================================
// 📦 دستورات مدیریتی (Admin)
// ============================================================

async function handleAdminCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  const user = message.from!;
  
  if (user.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, '🚫 دسترسی محدود', { reply_to_message_id: message.message_id });
    return;
  }
  
  const stats = await getUserStatistics(env);
  
  const text = t(session, 'admin_panel', {
    users: stats.totalUsers,
    vip: stats.vipUsers,
    messages: stats.totalMessages
  });
  
  await sendMessage(chat.id, text, { reply_to_message_id: message.message_id });
}

async function getUserStatistics(env: Env): Promise<{ totalUsers: number; vipUsers: number; totalMessages: number }> {
  try {
    const list = await env.SESSIONS.list({ prefix: 'session:' });
    let totalUsers = 0;
    let vipUsers = 0;
    let totalMessages = 0;
    
    for (const key of list.keys) {
      try {
        const data = await env.SESSIONS.get(key.name, 'json');
        if (data) {
          totalUsers++;
          if (data.vipStatus) vipUsers++;
          if (data.statistics?.totalMessages) totalMessages += data.statistics.totalMessages;
        }
      } catch (e) {}
    }
    
    return { totalUsers, vipUsers, totalMessages };
  } catch {
    return { totalUsers: 0, vipUsers: 0, totalMessages: 0 };
  }
}

async function handleBlockedCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  await sendMessage(chat.id, '🚫 **کاربران مسدود**\n\nلیست کاربران مسدود شده:\n(امکان مدیریت از پنل ادمین)',
    { reply_to_message_id: message.message_id }
  );
}

async function handleBroadcastCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  const text = args.join(' ');
  
  if (!text) {
    await sendMessage(chat.id, t(session, 'broadcast_format'), {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  const list = await env.SESSIONS.list({ prefix: 'session:' });
  let sent = 0;
  let failed = 0;
  
  for (const key of list.keys) {
    try {
      const data = await env.SESSIONS.get(key.name, 'json');
      if (data && !data.blocked) {
        try {
          await sendMessage(parseInt(key.name.replace('session:', '')), 
            `📢 **پیام همگانی از مدیریت:**\n\n${text}`
          );
          sent++;
        } catch (e) {
          failed++;
        }
        await sleep(50);
      }
    } catch (e) {}
  }
  
  await sendMessage(chat.id, t(session, 'broadcast_success', { sent, failed }), {
    reply_to_message_id: message.message_id
  });
}

async function handleLogCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  
  if (recentLogs.length === 0) {
    await sendMessage(chat.id, t(session, 'log_empty'), { reply_to_message_id: message.message_id });
    return;
  }
  
  let text = t(session, 'log_title', { count: recentLogs.length }) + '\n';
  
  const lastLogs = recentLogs.slice(-10);
  for (const log of lastLogs) {
    const time = new Date(log.timestamp).toLocaleTimeString('fa-IR');
    const icon = log.level === 'error' ? '🔴' : log.level === 'warn' ? '🟡' : '🟢';
    text += `${icon} [${time}] ${log.message.substring(0, 100)}\n`;
  }
  
  await sendMessage(chat.id, text, { reply_to_message_id: message.message_id });
}

async function handleKeysCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  
  const text = t(session, 'keys_status', {
    gemini: config.GEMINI_KEYS.length,
    sambanova: config.SAMBANOVA_KEYS.length,
    pollinations: config.POLLINATIONS_MODELS.length
  });
  
  await sendMessage(chat.id, text, { reply_to_message_id: message.message_id });
}

async function handleVipAddCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  
  if (args.length < 1) {
    await sendMessage(chat.id, t(session, 'vip_format'), { reply_to_message_id: message.message_id });
    return;
  }
  
  const targetId = parseInt(args[0]);
  if (isNaN(targetId)) {
    await sendMessage(chat.id, t(session, 'vip_invalid_id'), { reply_to_message_id: message.message_id });
    return;
  }
  
  try {
    const sessionKey = `session:${targetId}`;
    const stored = await env.SESSIONS.get(sessionKey, 'json');
    if (!stored) {
      await sendMessage(chat.id, t(session, 'vip_not_found'), { reply_to_message_id: message.message_id });
      return;
    }
    
    const targetSession = stored as ChatSession;
    targetSession.vipStatus = true;
    await env.SESSIONS.put(sessionKey, JSON.stringify(targetSession));
    
    await sendMessage(chat.id, t(session, 'vip_add_success', { id: targetId }), { reply_to_message_id: message.message_id });
    
    try {
      await sendMessage(targetId, `🎉 **تبریک!**\n\nحساب شما VIP شد! 🚀`);
    } catch (e) {}
    
  } catch (error) {
    await sendMessage(chat.id, '❌ خطا در افزودن VIP', { reply_to_message_id: message.message_id });
  }
}

async function handleVipRemoveCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  
  if (args.length < 1) {
    await sendMessage(chat.id, t(session, 'vip_remove_format'), { reply_to_message_id: message.message_id });
    return;
  }
  
  const targetId = parseInt(args[0]);
  if (isNaN(targetId)) {
    await sendMessage(chat.id, t(session, 'vip_invalid_id'), { reply_to_message_id: message.message_id });
    return;
  }
  
  try {
    const sessionKey = `session:${targetId}`;
    const stored = await env.SESSIONS.get(sessionKey, 'json');
    if (!stored) {
      await sendMessage(chat.id, t(session, 'vip_not_found'), { reply_to_message_id: message.message_id });
      return;
    }
    
    const targetSession = stored as ChatSession;
    targetSession.vipStatus = false;
    await env.SESSIONS.put(sessionKey, JSON.stringify(targetSession));
    
    await sendMessage(chat.id, t(session, 'vip_remove_success', { id: targetId }), { reply_to_message_id: message.message_id });
    
  } catch (error) {
    await sendMessage(chat.id, '❌ خطا در حذف VIP', { reply_to_message_id: message.message_id });
  }
}

async function handleBlockUserCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  
  if (args.length < 1) {
    await sendMessage(chat.id, t(session, 'block_format'), { reply_to_message_id: message.message_id });
    return;
  }
  
  const targetId = parseInt(args[0]);
  if (isNaN(targetId)) {
    await sendMessage(chat.id, t(session, 'vip_invalid_id'), { reply_to_message_id: message.message_id });
    return;
  }
  
  try {
    const sessionKey = `session:${targetId}`;
    const stored = await env.SESSIONS.get(sessionKey, 'json');
    if (!stored) {
      await sendMessage(chat.id, t(session, 'block_not_found'), { reply_to_message_id: message.message_id });
      return;
    }
    
    const targetSession = stored as ChatSession;
    targetSession.blocked = true;
    await env.SESSIONS.put(sessionKey, JSON.stringify(targetSession));
    
    await sendMessage(chat.id, t(session, 'block_success', { id: targetId }), { reply_to_message_id: message.message_id });
    
  } catch (error) {
    await sendMessage(chat.id, '❌ خطا در مسدود کردن', { reply_to_message_id: message.message_id });
  }
}

async function handleUnblockUserCommand(message: Message, env: Env, session: ChatSession, args: string[], txt: any): Promise<void> {
  const chat = message.chat;
  
  if (args.length < 1) {
    await sendMessage(chat.id, t(session, 'unblock_format'), { reply_to_message_id: message.message_id });
    return;
  }
  
  const targetId = parseInt(args[0]);
  if (isNaN(targetId)) {
    await sendMessage(chat.id, t(session, 'vip_invalid_id'), { reply_to_message_id: message.message_id });
    return;
  }
  
  try {
    const sessionKey = `session:${targetId}`;
    const stored = await env.SESSIONS.get(sessionKey, 'json');
    if (!stored) {
      await sendMessage(chat.id, t(session, 'block_not_found'), { reply_to_message_id: message.message_id });
      return;
    }
    
    const targetSession = stored as ChatSession;
    targetSession.blocked = false;
    await env.SESSIONS.put(sessionKey, JSON.stringify(targetSession));
    
    await sendMessage(chat.id, t(session, 'unblock_success', { id: targetId }), { reply_to_message_id: message.message_id });
    
  } catch (error) {
    await sendMessage(chat.id, '❌ خطا در رفع مسدودیت', { reply_to_message_id: message.message_id });
  }
}

async function handleRebuildCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  
  await sendMessage(chat.id, t(session, 'rebuild_start'), {
    reply_to_message_id: message.message_id
  });
  
  try {
    sessionCache.clear();
    modelCache.clear();
    
    await sendMessage(chat.id, t(session, 'rebuild_success'), {
      reply_to_message_id: message.message_id
    });
    
  } catch (error) {
    await sendMessage(chat.id, t(session, 'rebuild_failed'), {
      reply_to_message_id: message.message_id
    });
  }
}

async function handleMaintenanceCommand(message: Message, env: Env, session: ChatSession, txt: any): Promise<void> {
  const chat = message.chat;
  
  const currentMode = config.MAINTENANCE_MODE;
  const newMode = !currentMode;
  
  await env.SESSIONS.put('maintenance_mode', String(newMode));
  config.MAINTENANCE_MODE = newMode;
  
  const status = newMode ? t(session, 'maintenance_active') : t(session, 'maintenance_inactive');
  await sendMessage(chat.id, t(session, 'maintenance_toggle', { status }), {
    reply_to_message_id: message.message_id
  });
}

async function handleAdminCallbacks(cb: CallbackQuery, session: ChatSession, env: Env, data: string): Promise<void> {
  await answerCallbackQuery(cb.id, '⏳ در حال توسعه...', true);
}

// ============================================================
// 🚀 Worker اصلی - نسخه اصلاح شده
// ============================================================

export default {
  // 📥 تابع fetch - ورودی اصلی ربات
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // لاگ کردن env برای دیباگ
      console.log('📋 Environment variables keys:', Object.keys(env));
      console.log('📋 TOKEN present:', !!env.TOKEN);
      
      // اگر TOKEN وجود نداشت، پیام واضح بده
      if (!env.TOKEN) {
        return new Response(
          '❌ BOT_TOKEN is missing!\n\n' +
          'Please set TOKEN in your Cloudflare Worker environment variables.\n' +
          'Available keys: ' + Object.keys(env).join(', '),
          { 
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }
        );
      }
      
      // ایجاد config از env
      config = createConfig(env);
      API_URL = `https://api.telegram.org/bot${config.TOKEN}`;
      
      // مقداردهی اولیه ربات (فقط یک بار)
      if (!isInitialized) {
        if (!initPromise) {
          initPromise = (async () => {
            try {
              logger.info(`🚀 Nova Bot v${BOT_VERSION} initializing...`);
              
              // تست اتصال به KV
              await env.SESSIONS.put('test', 'ok');
              const test = await env.SESSIONS.get('test');
              if (test === 'ok') {
                logger.info('💾 KV Storage: Connected ✅');
              }
              
              // دریافت اطلاعات ربات از تلگرام
              try {
                BOT_INFO = await callTelegramAPI('getMe', {});
                logger.info(`🤖 Bot: @${BOT_INFO.username} (${BOT_INFO.first_name})`);
              } catch (e) {
                logger.warn('Could not get bot info', e);
              }
              
              isInitialized = true;
              logger.info('✅ Bot initialized successfully!');
            } catch (error) {
              logger.error('❌ Initialization failed', error);
              throw error;
            }
          })();
        }
        await initPromise;
      }
      
      // ===== پردازش درخواست‌ها =====
      const url = new URL(request.url);
      const path = url.pathname;
      
      // Health Check
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          version: BOT_VERSION,
          timestamp: new Date().toISOString(),
          initialized: isInitialized,
          personalities: Object.keys(PERSONALITIES).length
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Root - نمایش اطلاعات ربات
      if (path === '/' || path === '') {
        return new Response(
          `✅ Nova Bot v${BOT_VERSION} Running!\n` +
          `🔑 Token: ${config.TOKEN ? '✅ Set' : '❌ Missing'}\n` +
          `💾 KV: ${env.SESSIONS ? '✅ Connected' : '❌ Not connected'}\n` +
          `🤖 Status: ${isInitialized ? '✅ Ready' : '⏳ Initializing...'}\n` +
          `🎭 Personalities: ${Object.keys(PERSONALITIES).length}\n` +
          `🌐 Languages: Persian, English, Arabic`,
          { headers: { 'Content-Type': 'text/plain' } }
        );
      }
      
      // Webhook - دریافت آپدیت‌های تلگرام
      if (request.method === 'POST' && path === '/webhook') {
        try {
          const update = await request.json() as Update;
          
          if (!update || !update.update_id) {
            return new Response('Invalid update', { status: 400 });
          }
          
          // پردازش در پس‌زمینه
          ctx.waitUntil(
            (async () => {
              try {
                if (update.callback_query) {
                  await handleCallbackQuery(update.callback_query, env, config);
                } else if (update.message) {
                  if (update.message && update.message.chat && update.message.chat.id) {
                    await handleTextMessage(update.message, env, config);
                  } else {
                    logger.error('Invalid message: missing chat.id');
                  }
                }
              } catch (error) {
                logger.error('Update processing failed', error);
              }
            })()
          );
          
          return new Response('OK', { status: 200 });
          
        } catch (error) {
          logger.error('Webhook error', error);
          return new Response('Bad Request', { status: 400 });
        }
      }
      
      return new Response('Not Found', { status: 404 });
      
    } catch (error) {
      logger.error('Worker fetch error', error);
      return new Response(
        '❌ Internal Server Error\n\n' +
        (error instanceof Error ? error.message : 'Unknown error'),
        { 
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }
      );
    }
  },
  
  // 📅 تابع scheduled - اجرای کارهای زمان‌بندی شده
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    logger.info(`🔄 Scheduled job running at ${new Date().toISOString()}`);
    
    try {
      const now = Date.now();
      
      // پاکسازی کش گروه‌های قدیمی
      for (const [chatId, context] of groupContextCache.entries()) {
        if (now - context.lastCleanup > 3600000) {
          groupContextCache.delete(chatId);
        }
      }
      
      // پاکسازی لاک‌های قدیمی
      for (const [chatId] of sessionLoadLocks.entries()) {
        sessionLoadLocks.delete(chatId);
      }
      
      // پاکسازی Rate Limit های قدیمی
      for (const [userId, timestamps] of callbackRateLimits.entries()) {
        const recent = timestamps.filter(t => now - t < 60000);
        if (recent.length === 0) {
          callbackRateLimits.delete(userId);
        } else {
          callbackRateLimits.set(userId, recent);
        }
      }
      
      logger.info('✅ Scheduled cleanup completed');
      
    } catch (error) {
      logger.error('Scheduled job failed', error);
    }
  }
};

// ============================================================
// 📊 پایان سورس کد - Nova Bot v2.0.0
// ============================================================

console.log(`🚀 Nova Bot v${BOT_VERSION} loaded successfully!`);
console.log(`📊 Total Personalities: ${Object.keys(PERSONALITIES).length}`);
console.log(`🌐 Languages: Persian (fa), English (en), Arabic (ar)`);
console.log(`🤖 AI Engines: Gemini, SambaNova, Pollinations`);
console.log(`👤 Owner: @Hamid_Ai_pro`);
console.log(`📦 Total Lines: ~3000+`);
