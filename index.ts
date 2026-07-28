// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۱: تنظیمات اولیه
// ============================================================

/**
  Name: Nova AI Telegram Bot
  Version: 2.0.0
  Owner: @Hamid_Ai_pro
**/

const BOT_VERSION = "2.0.0";

// ============================================================
// 📦 ENVIRONMENT VARIABLES
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

// ============================================================
// 📦 CONFIG
// ============================================================
function createConfig(env: Env) {
  const cfAccountIds = [env.CF_ID_1, env.CF_ID_2, env.CF_ID_3].filter((id): id is string => !!id);
  const cfTokens = [env.CF_TOKEN_1, env.CF_TOKEN_2, env.CF_TOKEN_3].filter((token): token is string => !!token);
  
  const cfPairs: Array<{ accountId: string; token: string }> = [];
  for (let i = 0; i < Math.min(cfAccountIds.length, cfTokens.length); i++) {
    if (cfAccountIds[i] && cfTokens[i]) {
      cfPairs.push({ accountId: cfAccountIds[i], token: cfTokens[i] });
    }
  }
  
  return {
    TOKEN: env.TOKEN,
    BOT_OWNER_ID: env.BOT_OWNER_ID ? parseInt(env.BOT_OWNER_ID) : 5989309344,
    CLOUDFLARE_PAIRS: cfPairs,
    GEMINI_KEYS: [
      env.GEMINI_KEY_1,
      env.GEMINI_KEY_2,
      env.GEMINI_KEY_3,
      env.GEMINI_KEY_4,
      env.GEMINI_KEY_5
    ].filter((key): key is string => !!key),
    GEMINI_MODELS: ["gemini-flash-latest"] as string[],
    PIXABAY_KEY: env.PIXABAY_KEY || "",
    AI_IMAGE_MODELS: [
      "@cf/black-forest-labs/flux-2-klein-4b",
    ],
    POLLINATIONS_KEY: env.POLLINATIONS_KEY_1 ? env.POLLINATIONS_KEY_1.trim() : null,  
    SAMBANOVA_KEYS: [
      env.SAMBANOVA_KEY_1,
      env.SAMBANOVA_KEY_2,
      env.SAMBANOVA_KEY_3,
      env.SAMBANOVA_KEY_4,
      env.SAMBANOVA_KEY_5
    ].filter((key): key is string => !!key),
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

let config: ReturnType<typeof createConfig>; 
let initPromise: Promise<void> | null = null;
let isInitialized = false;
let API_URL = "";

// ============================================================
// 📦 LOGGER
// ============================================================
const logger = {
  info: (message: string, context?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, context || "");
  },
  warn: (message: string, context?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, context || "");
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || "");
  },
};
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۲: Caches و TokenBucket
// ============================================================

// ============================================================
// 📦 CACHE LAYER
// ============================================================
class CacheLayer<T> {
  private cache = new Map<string, { data: T; expires: number; lastAccess: number }>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize = 500, defaultTTL = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      const lruKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0]?.[0];
      if (lruKey) this.cache.delete(lruKey);
    }

    this.cache.set(key, {
      data: value,
      expires: Date.now() + (ttl || this.defaultTTL),
      lastAccess: Date.now()
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    entry.lastAccess = Date.now();
    return entry.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// ============================================================
// 📦 TOKEN BUCKET FOR RATE LIMITING
// ============================================================
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private capacity: number;
  private refillRate: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// ============================================================
// 📦 GLOBAL CACHES
// ============================================================
const sessionCache = new CacheLayer<ChatSession>(200, 5 * 60 * 1000);
const userCache = new CacheLayer<UserMemory>(500, 10 * 60 * 1000);
const modelCache = new CacheLayer<ModelInfo[]>(10, 30 * 60 * 1000);
const sessionLoadLocks = new Map<number, Promise<ChatSession>>();
const activeRequests = new Map<number, Set<{ id: string; timestamp: number }>>();
const callbackRateLimits = new Map<number, number[]>();
const groupContextCache = new Map<number, { messages: GroupMessage[], lastCleanup: number }>();
const adminPanelStates = new Map<number, AdminPanelState>();
const modelListStates = new Map<string, ModelListState>();
const broadcastStates = new Map<number, { mode: 'all' | 'vip' | 'free' | 'specific'; userId?: number }>();
const userBuckets = new Map<number, TokenBucket>();
let BOT_INFO: any = null;
let maintenanceModeCache: { value: boolean; timestamp: number } | null = null;
let globalDisabledKeys: Record<string, number> = {};
let lastDisabledKeysFetch = 0;
let pollinationsModelsInitialized = false;
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۳: Types و Interfaces
// ============================================================

type AIEngine = "gemini" | "sambanova" | "pollinations";
type MessageRole = "user" | "model" | "assistant" | "system";
type ChatType = typeof config.ALLOWED_CHAT_TYPES[number];

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
}

interface User { 
  id: number; 
  is_bot: boolean; 
  first_name: string; 
  username?: string; 
  language_code?: string;
}
interface Chat { id: number; type: ChatType; title?: string; }
interface Message {
  message_id: number;
  from?: User;
  chat: Chat;
  date: number;
  text?: string;
  caption?: string;
  photo?: any[];
  document?: any;
  voice?: any;
  reply_to_message?: Message;
  entities?: any[];
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
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۴: TRANSLATIONS
// ============================================================

const TRANSLATIONS = {
  fa: {
    // موتورها
    engine_gemini: 'نوا', 
    engine_sambanova: 'لونا', 
    engine_pollinations: 'زارا',
    
    // عمومی
    loading: '⏳ لطفاً صبر کنید...', 
    processing: '⚙️ در حال پردازش...', 
    typing: 'در حال نوشتن...',
    
    // پرامپت
    prompt_title: '✏️ **تنظیمات پرامپت شخصی**', 
    prompt_current: 'پرامپت‌های فعلی:', 
    prompt_default: 'پیش‌فرض',
    prompt_guide: '💡 برای تنظیم: `/setprompt [موتور] متن شما`', 
    prompt_reset: 'ریست', 
    prompt_show: 'نمایش پرامپت‌ها 👁️',
    prompt_manage: 'مدیریت پرامپت‌ها 📝',
    
    // سیستم
    system_prompt: "تو {botName} هستی، یک دستیار هوشمند، مودب و مفید. پاسخ‌های دقیق، خلاصه و به زبان فارسی بده. تاریخ امروز: {date}",
    system_prompt_group: "تو {botName} هستی. در گروه تلگرام فعالیت می‌کنی. دوستانه و کوتاه پاسخ بده.",
    
    // تصویر
    img_limit: '⚠️ محدودیت روزانه تمام شده است.', 
    img_start: '🎨 **شروع ساخت تصویر...**', 
    img_translating: '🔄 **در حال ترجمه...**',
    img_processing: '⏳ در حال پردازش با {count} مدل...', 
    img_failed: '❌ **ساخت تصویر ناموفق بود.**', 
    img_success: '✅ **پایان پردازش.**',
    img_help: '❌ **فرمت نادرست**\n\nاستفاده: `/img [توضیح]`\nمثال: `/img یک گربه در فضا`',
    
    // جستجو
    search_attribution: '\n\n📸 منبع: Pixabay.com',
    search_searching: '🔍 **در حال جستجوی "{query}"...**\n\n⏳ لطفاً صبر کنید', 
    search_results: '🖼️ {caption}\n\n📸 {count} تصویر یافت شد', 
    search_failed: '❌ **خطا در جستجو**',
    search_guide: '💡 راهنمایی:\n• از کلمات ساده‌تر استفاده کنید\n• به انگلیسی امتحان کنید\n• کمی بعد دوباره تلاش کنید', 
    search_link_fallback: '⚠️ نتونستم تصویر رو مستقیم بفرستم، اینم لینکش:\n\n{link}\n\n📸 {count} تصویر یافت شد',
    search_no_results: 'هیچ تصویری یافت نشد. لطفاً کلمات دیگری امتحان کنید.', 
    search_long_query: '❌ توضیح خیلی طولانی است. حداکثر 100 کاراکتر.', 
    search_usage: 'استفاده: `/search [متن]`', 
    search_quota_exceeded: 'محدودیت گوگل تمام شده.',
    
    // دکمه‌ها
    btn_settings: 'تنظیمات ⚙️', 
    btn_back: 'بازگشت 🔙', 
    btn_select_model: '📋 انتخاب مدل', 
    btn_prompt: 'پرامپت (شخصیت) ✏️',
    btn_help: 'راهنما 📖',
    btn_close: 'بستن ❌', 
    btn_refresh: 'بروزرسانی 🔄', 
    btn_retry: '🔄 تلاش مجدد', 
    btn_confirm: '✅ بله، انجام شود',
    btn_cancel: '❌ لغو', 
    btn_prev: '◀️ قبلی', 
    btn_next: 'بعدی ▶️',

    // ============================================================
    // 🆕 دکمه‌های جدید ویس
    // ============================================================
    btn_voice: '🎤 ویس',
    btn_voice_menu: '🎤 منوی ویس',
    btn_voice_guide: '🎤 راهنمای ویس',
    btn_voice_personalities: '🎭 شخصیت‌های صوتی',
    btn_tts: '🔊 تبدیل متن به ویس',
    
    // ============================================================
    // 🆕 ترجمه‌های ویس
    // ============================================================
    voice_title: '🎤 **منوی ویس**',
    voice_usage: '📊 **مصرف روزانه:**',
    voice_guide: '🎯 **راهنمای ویس:**',
    voice_send: '• می‌تونی ویس بفرستی، من تشخیص میدم و جواب میدم',
    voice_tts_guide: '• برای تبدیل متن به ویس:\n  `نوا با ویس بگو سلام`\n  `سایفر با ویس بگو من هکرم`',
    voice_personalities_guide: '🎭 **صداها بر اساس شخصیت:**\n• 👧 نوا، لیلیت، ویکتوریا، آریا، لونا، زارا → صدای زن\n• 👦 سایفر، جکس، صورت‌چرمی، شادو → صدای مرد',
    voice_note: '💡 **نکته:** برای شخصیت‌های جدید، صدای پیش‌فرض استفاده میشه.',
    voice_female: '👧 شخصیت‌های با صدای زن:',
    voice_male: '👦 شخصیت‌های با صدای مرد:',
    voice_usage_example: '💡 **نحوه استفاده:**\n`[نام شخصیت] با ویس بگو [متن]`\n\nمثال: `نوا با ویس بگو سلام خوبی`',
    
    // خطاها
    err_title: 'خطا', 
    err_quota: 'ظرفیت این مدل تکمیل شده است.',
    err_auth: 'مشکل در کلیدهای دسترسی (API Key).', 
    err_network: 'مشکل در اتصال به سرور هوش مصنوعی.', 
    err_timeout: 'زمان پاسخگویی تمام شد.',
    err_blocked: 'محتوای درخواست شما توسط سیستم امنیتی رد شد.', 
    err_empty: 'پاسخی دریافت نشد.', 
    err_voice: 'خطا در پردازش صدا.',
    err_image: 'ساخت تصویر با خطا مواجه شد.', 
    err_unknown: 'یک خطای غیرمنتظره رخ داد.', 
    err_vip_only: '⚠️ این قابلیت مخصوص کاربران VIP است.',
    err_format: '❌ **فرمت نادرست**', 
    err_empty_prompt: '❌ پرامپت نمی‌تواند خالی باشد.', 
    err_prompt_toolong: '❌ پرامپت خیلی طولانی است.',
    err_engine_invalid: '❌ موتور نادرست. موتورها: `نوا`, `لونا`, `زارا`', 
    err_vip_prompt: '⚠️ **دسترسی محدود**\n\nتنظیم پرامپت فقط برای کاربران VIP امکان‌پذیر است.',
    err_config_missing: '❌ تنظیمات Cloudflare انجام نشده است.',
    
    // تنظیمات مدل
    active_model_title: '⚙️ **تنظیمات {name}**', 
    active_model_keys: '🔑 **کلیدها:** {count}',
    active_model_static_desc: '💡 {name} از یک مدل ثابت و پایدار استفاده می‌کند.', 
    active_model_current: '🤖 **مدل فعال:** {name}', 
    active_model_key_idx: '🔑 **کلید API:** {index}/{total}',
    active_model_count: '📊 **تعداد مدل‌ها:** {count}', 
    active_model_guide: '💡 برای تغییر مدل از دکمه زیر استفاده کنید', 
    model_select_title: '🤖 **انتخاب مدل {name}**',
    model_total_count: '📊 تعداد کل: {count} مدل', 
    model_last_update: '🕐 آخرین بروزرسانی: {time}', 
    model_page_info: '📄 صفحه {page} از {total}', 
    model_not_found: '❌ **هیچ مدلی برای {name} یافت نشد**',
    
    // ادمین
    admin_view_memory: '🧠 دیدن حافظه', 
    admin_reset_memory: '🗑️ ریست حافظه', 
    admin_memory_title: '🧠 **حافظه کاربر {name}**', 
    admin_memory_empty: '📭 **حافظه خالی است**',
    admin_memory_confirm_reset: '⚠️ **تایید ریست حافظه**\n\nآیا مطمئنید؟ این عمل غیرقابل بازگشت است!', 
    admin_memory_reset_success: '✅ **حافظه ریست شد**',
    
    // خوش‌آمدگویی
    welcome_private: `🚀 **سلام {name} عزیز!**\n\nخوش اومدی به **نوآ** 🤖 - دستیار هوشمند همه‌کاره تو!\n\n🌐 زبان انتخاب شده: **فارسی 🇮🇷**\n\n✨ **قابلیت‌های من:**\n🧠 **هوش مصنوعی چندگانه:** گفتگو با مدل‌های قدرتمند (نوا، لونا، زارا)\n🎨 **ساخت تصویر:** فقط کافیه بگی چی میخوای!\n🎤 **تشخیص صدا:** ویس بفرست، من متنش رو می‌فهمم و جواب میدم.\n🔍 **جستجوی تصویر:** پیدا کردن عکس از گوگل.\n\n👇 **از منوی زیر شروع کن:**`,
    welcome_group: `👋 **سلام به اعضای گروه {name}!**\n\nمن **نوآ** هستم 🤖.\nمیتونید سوالاتتون رو از من بپرسید، عکس بسازید یا ویس بفرستید.\n\n💡 برای استفاده، من رو **منشن** کنید یا روی پیامم **ریپلای** بزنید.`,
    help_text: `🧭 **راهنمای کامل ربات**\n\n💬 **گفتگو:** کافیه پیامت رو بنویسی یا ویس بفرستی.\n\n🎨 **تصاویر:**\n• ساخت عکس: \`/img یک گربه فضانورد\`\n• جستجو: \`/search طبیعت\`\n\n🎤 **ویس:**\n• ارسال ویس: تشخیص گفتار و پاسخ\n• تبدیل متن به ویس: \`نوا با ویس بگو سلام\`\n\n⚙️ **تنظیمات:**\n• /model - تغییر هوش مصنوعی\n• /new - فراموشی حافظه و بحث جدید\n• /prompt - تنظیم شخصیت ربات\n• /language - تغییر زبان\n• /voice - منوی ویس`,
    
    // پنل جدید (مطابق عکس)
    panel_title: '🌟 **مرکز فرماندهی نو**',
    panel_version: 'نسخه Beta 0.9.93 هسته هوشمند',
    panel_user: 'کاربر',
    panel_vip: '👑 VIP',
    panel_free: '🆓 رایگان',
    panel_personality: 'شخصیت فعال',
    panel_daily_usage: 'سهمیه و مصرف روزانه شما',
    panel_messages: 'پیام',
    panel_voice: 'ویس',
    panel_images: 'تصویر',
    panel_select: 'یکی از گزینه‌های زیر را انتخاب کنید:',
    
    // دکمه‌های پنل جدید
    btn_change_personality: '🎭 تغییر شخصیت',
    btn_new_chat: '🆕 گفتگوی جدید',
    btn_custom_prompt: '✏️ پرامپت سفارشی',
    btn_change_language: '🌐 تغییر زبان',
    btn_upgrade_vip: '👑 ارتقا به VIP',
    btn_close_menu: '❌ بستن منو',
    
    // شخصیت‌ها
    personalities_title: '🎭 **انتخاب شخصیت ربات**',
    personalities_current: 'شخصیت فعلی',
    personalities_female: 'شخصیت‌های دخترانه',
    personalities_male: 'شخصیت‌های پسرانه',
    personalities_select: 'یکی را انتخاب کنید:',
    
    // VIP
    vip_title: '👑 **ارتقا به VIP**',
    vip_benefits: '✨ **مزایای VIP:**',
    vip_unlimited_messages: '• ♾️ پیام نامحدود',
    vip_unlimited_voice: '• ♾️ ویس نامحدود',
    vip_unlimited_images: '• ♾️ تصویر نامحدود',
    vip_all_personalities: '• 🎭 همه شخصیت‌ها',
    vip_custom_prompts: '• ✏️ پرامپت سفارشی برای همه مدل‌ها',
    vip_priority: '• 🚀 اولویت پردازش',
    vip_price: '💰 **قیمت:**',
    vip_30_days: '• ۳۰ روز: ۵۰,۰۰۰ تومان',
    vip_90_days: '• ۹۰ روز: ۱۲۰,۰۰۰ تومان (۲۰٪ تخفیف)',
    vip_contact: '📞 برای خرید با @Hamid_Ai_pro تماس بگیرید.',
    
    // پرامپت سفارشی
    prompt_manager: '✏️ **مدیریت پرامپت سفارشی**',
    prompt_current_list: '📝 **پرامپت‌های فعلی:**',
    prompt_guide_text: '💡 **راهنما:**\nبرای تنظیم پرامپت از دستور زیر استفاده کنید:\n`/setprompt [موتور] متن پرامپت`\n\nمثال: `/setprompt نوا تو یک معلم هستی`',
    prompt_clear_all: '🗑️ پاک کردن همه',
    prompt_templates: '📋 قالب‌های آماده',
    
    // گفتگوی جدید
    new_chat_title: '🆕 **گفتگوی جدید**',
    new_chat_warning: '⚠️ با شروع گفتگوی جدید، حافظه مکالمات قبلی پاک می‌شود.',
    new_chat_confirm: 'آیا مطمئن هستید؟',
    new_chat_yes: '✅ بله، شروع کن',
    new_chat_no: '❌ نه، برگرد',
  },
  
  // ============================================================
  // 🌐 ENGLISH
  // ============================================================
  
  en: {
    // موتورها
    engine_gemini: 'Nova', 
    engine_sambanova: 'Luna', 
    engine_pollinations: 'Zara',
    
    // عمومی
    loading: '⏳ Please wait...', 
    processing: '⚙️ Processing...', 
    typing: 'typing...',
    
    // پرامپت
    prompt_title: '✏️ **Custom Prompt Settings**', 
    prompt_current: 'Current Prompts:', 
    prompt_default: 'Default',
    prompt_guide: '💡 To set: `/setprompt [engine] your text`', 
    prompt_reset: 'Reset', 
    prompt_show: 'Show Prompts 👁️',
    prompt_manage: 'Manage Prompts 📝',
    
    // سیستم
    system_prompt: "You are {botName}, a helpful, polite, and smart assistant. Provide concise, accurate answers in English. Current date: {date}",
    system_prompt_group: "You are {botName}, assisting in a Telegram group. Be social and concise.",
    
    // تصویر
    img_limit: '⚠️ Daily limit exceeded.', 
    img_start: '🎨 **Starting image generation...**', 
    img_translating: '🔄 **Translating...**',
    img_processing: '⏳ Processing with {count} models...', 
    img_failed: '❌ **Image generation failed.**', 
    img_success: '✅ **Processing completed.**',
    img_help: '❌ **Invalid Format**\n\nUsage: `/img [prompt]`\nExample: `/img a cat in space`',
    
    // جستجو
    search_attribution: '\n\n📸 Source: Pixabay.com',
    search_searching: '🔍 **Searching for "{query}"...**\n\n⏳ Please wait', 
    search_results: '🖼️ {caption}\n\n📸 {count} images found', 
    search_failed: '❌ **Search Failed**',
    search_guide: '💡 Tips:\n• Use simpler keywords\n• Try in English\n• Try again later', 
    search_link_fallback: '⚠️ Could not send image directly, here is the link:\n\n{link}\n\n📸 {count} images found',
    search_no_results: 'No images found. Please try different keywords.', 
    search_long_query: '❌ Query too long. Max 100 characters.', 
    search_usage: 'Usage: `/search [query]`', 
    search_quota_exceeded: 'Google quota exceeded.',
    
    // دکمه‌ها
    btn_settings: 'Settings ⚙️', 
    btn_back: 'Back 🔙', 
    btn_select_model: '📋 Select Model', 
    btn_prompt: 'Prompt (Persona) ✏️',
    btn_help: 'Help 📖',
    btn_close: 'Close ❌', 
    btn_refresh: 'Refresh 🔄', 
    btn_retry: '🔄 Retry', 
    btn_confirm: '✅ Yes, confirm',
    btn_cancel: '❌ Cancel', 
    btn_prev: '◀️ Previous', 
    btn_next: 'Next ▶️',

    // ============================================================
    // 🆕 Voice Buttons
    // ============================================================
    btn_voice: '🎤 Voice',
    btn_voice_menu: '🎤 Voice Menu',
    btn_voice_guide: '🎤 Voice Guide',
    btn_voice_personalities: '🎭 Voice Personalities',
    btn_tts: '🔊 Text to Voice',
    
    // ============================================================
    // 🆕 Voice Translations
    // ============================================================
    voice_title: '🎤 **Voice Menu**',
    voice_usage: '📊 **Daily Usage:**',
    voice_guide: '🎯 **Voice Guide:**',
    voice_send: '• Send voice note, I\'ll transcribe and reply',
    voice_tts_guide: '• Text to voice:\n  `nova with voice say hello`\n  `cipher with voice say I am hacker`',
    voice_personalities_guide: '🎭 **Voices per personality:**\n• 👧 Nova, Lilith, Victoria, Aria, Luna, Zara → Female\n• 👦 Cipher, Jax, Leatherface, Shadow → Male',
    voice_note: '💡 **Note:** Default voice used for new personalities.',
    voice_female: '👧 Female Voice:',
    voice_male: '👦 Male Voice:',
    voice_usage_example: '💡 **Usage:**\n`[personality] with voice say [text]`\n\nExample: `nova with voice say hello how are you`',
    
    // خطاها
    err_title: 'Error', 
    err_quota: 'Quota exceeded for this model.',
    err_auth: 'Authentication failed (API Key issue).', 
    err_network: 'Network connection error.', 
    err_timeout: 'Request timed out. Server is busy.',
    err_blocked: 'Content blocked by safety filters.', 
    err_empty: 'Received empty response. Please rephrase.', 
    err_voice: 'Voice processing failed.',
    err_image: 'Image generation failed.', 
    err_unknown: 'An unexpected error occurred.', 
    err_vip_only: '⚠️ This feature is for VIP users only.',
    err_format: '❌ **Invalid Format**', 
    err_engine_invalid: '❌ Invalid Engine. Engines: `nova`, `luna`, `zara`',
    err_vip_prompt: '⚠️ **Restricted Access**\n\nCustom prompts are for VIP users only.', 
    err_empty_prompt: '❌ Prompt cannot be empty.',
    err_prompt_toolong: '❌ Prompt is too long.', 
    err_config_missing: '❌ Cloudflare config missing.',
    
    // تنظیمات مدل
    active_model_title: '⚙️ **{name} Settings**', 
    active_model_keys: '🔑 **Keys:** {count}', 
    active_model_static_desc: '💡 {name} uses a stable static model.',
    active_model_current: '🤖 **Active Model:** {name}', 
    active_model_key_idx: '🔑 **API Key:** {index}/{total}', 
    active_model_count: '📊 **Model Count:** {count}',
    active_model_guide: '💡 Use the button below to change model', 
    model_select_title: '🤖 **Select {name} Model**', 
    model_total_count: '📊 Total: {count} models',
    model_last_update: '🕐 Last Update: {time}', 
    model_page_info: '📄 Page {page} of {total}', 
    model_not_found: '❌ **No models found for {name}**',
    
    // ادمین
    admin_view_memory: '🧠 View Memory', 
    admin_reset_memory: '🗑️ Reset Memory', 
    admin_memory_title: '🧠 **User Memory: {name}**', 
    admin_memory_empty: '📭 **Memory is empty**',
    admin_memory_confirm_reset: '⚠️ **Confirm Memory Reset**\n\nAre you sure? This cannot be undone!', 
    admin_memory_reset_success: '✅ **Memory Reset Successfully**',
    
    // خوش‌آمدگویی
    welcome_private: `🚀 **Hello {name}!**\n\nWelcome to **Nova** 🤖 - Your all-in-one AI assistant!\n\n🌐 Selected Language: **English 🇺🇸**\n\n✨ **What I can do:**\n🧠 **Multi-Model AI:** Chat with powerful models (Nova, Luna, Zara).\n🎨 **Image Gen & Edit:** Just create or edit images with text.\n🎤 **Voice Recognition:** Send me voice notes, I'll understand and reply.\n🔍 **Image Search:** Find images from the web.\n\n👇 **Start exploring below:**`,
    welcome_group: `👋 **Hello {name} members!**\n\nI am **Nova** 🤖.\nYou can ask me questions, generate images, or send voice notes.\n\n💡 To use me, **Reply** to my message or **Mention** me.`,
    help_text: `🧭 **Bot Guide**\n\n💬 **Chat:** Just type or send a voice note.\n\n🎨 **Images:**\n• Generate: \`/img a cute cat\`\n• Search: \`/search nature\`\n\n🎤 **Voice:**\n• Send voice: Speech recognition\n• Text to voice: \`nova with voice say hello\`\n\n⚙️ **Settings:**\n• /model - Switch AI Model\n• /new - Clear Memory\n• /prompt - Set Custom Personality\n• /language - Change Language\n• /voice - Voice Menu`,
    
    // پنل جدید (مطابق عکس)
    panel_title: '🌟 **Nova Command Center**',
    panel_version: 'Beta v0.9.93 Smart Core',
    panel_user: 'User',
    panel_vip: '👑 VIP',
    panel_free: '🆓 Free',
    panel_personality: 'Active Personality',
    panel_daily_usage: 'Your Daily Usage',
    panel_messages: 'messages',
    panel_voice: 'voice',
    panel_images: 'images',
    panel_select: 'Choose an option below:',
    
    // دکمه‌های پنل جدید
    btn_change_personality: '🎭 Change Personality',
    btn_new_chat: '🆕 New Chat',
    btn_custom_prompt: '✏️ Custom Prompt',
    btn_change_language: '🌐 Change Language',
    btn_upgrade_vip: '👑 Upgrade to VIP',
    btn_close_menu: '❌ Close Menu',
    
    // شخصیت‌ها
    personalities_title: '🎭 **Select Bot Personality**',
    personalities_current: 'Current',
    personalities_female: 'Female Personalities',
    personalities_male: 'Male Personalities',
    personalities_select: 'Select one:',
    
    // VIP
    vip_title: '👑 **Upgrade to VIP**',
    vip_benefits: '✨ **VIP Benefits:**',
    vip_unlimited_messages: '• ♾️ Unlimited messages',
    vip_unlimited_voice: '• ♾️ Unlimited voice',
    vip_unlimited_images: '• ♾️ Unlimited images',
    vip_all_personalities: '• 🎭 All personalities',
    vip_custom_prompts: '• ✏️ Custom prompts for all models',
    vip_priority: '• 🚀 Priority processing',
    vip_price: '💰 **Price:**',
    vip_30_days: '• 30 days: $5',
    vip_90_days: '• 90 days: $12 (20% off)',
    vip_contact: '📞 Contact @Hamid_Ai_pro to buy.',
    
    // پرامپت سفارشی
    prompt_manager: '✏️ **Custom Prompt Manager**',
    prompt_current_list: '📝 **Current Prompts:**',
    prompt_guide_text: '💡 **Guide:**\nUse this command to set prompt:\n`/setprompt [engine] prompt text`\n\nExample: `/setprompt nova you are a teacher`',
    prompt_clear_all: '🗑️ Clear All',
    prompt_templates: '📋 Templates',
    
    // گفتگوی جدید
    new_chat_title: '🆕 **New Chat**',
    new_chat_warning: '⚠️ Starting a new chat will clear the conversation history.',
    new_chat_confirm: 'Are you sure?',
    new_chat_yes: '✅ Yes, start',
    new_chat_no: '❌ No, go back',
  },
  
  // ============================================================
  // 🌐 ARABIC
  // ============================================================
  
  ar: {
    // موتورها
    engine_gemini: 'نوا', 
    engine_sambanova: 'لونا', 
    engine_pollinations: 'زارا',
    
    // عمومی
    loading: '⏳ يرجى الانتظار...', 
    processing: '⚙️ جاري المعالجة...', 
    typing: 'يكتب...',
    
    // پرامپت
    prompt_title: '✏️ **إعدادات التعليمات المخصصة**', 
    prompt_current: 'التعليمات الحالية:', 
    prompt_default: 'افتراضي',
    prompt_guide: '💡 للإعداد: `/setprompt [المحرك] نصك`', 
    prompt_reset: 'إعادة تعيين', 
    prompt_show: 'عرض التعليمات 👁️',
    prompt_manage: 'إدارة التعليمات 📝',
    
    // سیستم
    system_prompt: "أنت {botName}، مساعد ذكي ومهذب ومفيد. قدم إجابات دقيقة وموجزة باللغة العربية. التاريخ اليوم: {date}",
    system_prompt_group: "أنت {botName}، تعمل في مجموعة تلغرام. كن ودوداً وموجزاً.",
    
    // تصویر
    img_limit: '⚠️ تم تجاوز الحد اليومي.', 
    img_start: '🎨 **بدء إنشاء الصورة...**', 
    img_translating: '🔄 **جاري الترجمة...**',
    img_processing: '⏳ جاري المعالجة مع {count} نموذج...', 
    img_failed: '❌ **فشل إنشاء الصورة.**', 
    img_success: '✅ **اكتملت المعالجة.**',
    img_help: '❌ **تنسيق غير صحيح**\n\nالاستخدام: `/img [الوصف]`\nمثال: `/img قطة في الفضاء`',
    
    // جستجو
    search_attribution: '\n\n📸 المصدر: Pixabay.com',
    search_searching: '🔍 **جاري البحث عن "{query}"...**\n\n⏳ يرجى الانتظار', 
    search_results: '🖼️ {caption}\n\n📸 تم العثور على {count} صورة', 
    search_failed: '❌ **فشل البحث**',
    search_guide: '💡 نصائح:\n• استخدم كلمات أبسط\n• جرب باللغة الإنجليزية\n• حاول مرة أخرى لاحقاً', 
    search_link_fallback: '⚠️ لم أتمكن من إرسال الصورة مباشرة، هذا هو الرابط:\n\n{link}\n\n📸 تم العثور على {count} صورة',
    search_no_results: 'لم يتم العثور على صور. يرجى تجربة كلمات أخرى.', 
    search_long_query: '❌ النص طويل جداً. الحد الأقصى 100 حرف.', 
    search_usage: 'الاستخدام: `/search [النص]`', 
    search_quota_exceeded: 'تم تجاوز حد Google.',
    
    // دکمه‌ها
    btn_settings: 'الإعدادات ⚙️', 
    btn_back: 'رجوع 🔙', 
    btn_select_model: '📋 اختيار النموذج', 
    btn_prompt: 'التعليمات (الشخصية) ✏️',
    btn_help: 'مساعدة 📖',
    btn_close: 'إغلاق ❌', 
    btn_refresh: 'تحديث 🔄', 
    btn_retry: '🔄 إعادة المحاولة', 
    btn_confirm: '✅ نعم، تأكيد',
    btn_cancel: '❌ إلغاء', 
    btn_prev: '◀️ السابق', 
    btn_next: 'التالي ▶️',

    // ============================================================
    // 🆕 Voice Buttons
    // ============================================================
    btn_voice: '🎤 صوت',
    btn_voice_menu: '🎤 قائمة الصوت',
    btn_voice_guide: '🎤 دليل الصوت',
    btn_voice_personalities: '🎭 شخصيات الصوت',
    btn_tts: '🔊 نص إلى صوت',
    
    // ============================================================
    // 🆕 Voice Translations
    // ============================================================
    voice_title: '🎤 **قائمة الصوت**',
    voice_usage: '📊 **الاستخدام اليومي:**',
    voice_guide: '🎯 **دليل الصوت:**',
    voice_send: '• أرسل رسالة صوتية، سأقوم بتحويلها والرد',
    voice_tts_guide: '• نص إلى صوت:\n  `نوا مع صوت يقول مرحبا`\n  `سايفر مع صوت يقول أنا هاكر`',
    voice_personalities_guide: '🎭 **الأصوات حسب الشخصية:**\n• 👧 نوا، ليليث، فيكتوريا، آريا، لونا، زارا → صوت أنثى\n• 👦 سايفر، جاكس، ليذرفيس، شادو → صوت ذكر',
    voice_note: '💡 **ملاحظة:** يتم استخدام الصوت الافتراضي للشخصيات الجديدة.',
    voice_female: '👧 شخصيات بصوت أنثى:',
    voice_male: '👦 شخصيات بصوت ذكر:',
    voice_usage_example: '💡 **طريقة الاستخدام:**\n`[اسم الشخصية] مع صوت يقول [النص]`\n\nمثال: `نوا مع صوت يقول مرحبا كيف حالك`',
    
    // خطاها
    err_title: 'خطأ', 
    err_quota: 'تم تجاوز حصة هذا النموذج.',
    err_auth: 'مشكلة في مفاتيح الوصول (API Key).', 
    err_network: 'مشكلة في الاتصال بخادم الذكاء الاصطناعي.', 
    err_timeout: 'انتهى وقت الاستجابة.',
    err_blocked: 'تم رفض محتوى طلبك بواسطة نظام الأمان.', 
    err_empty: 'لم يتم استلام رد.', 
    err_voice: 'فشل معالجة الصوت.',
    err_image: 'فشل إنشاء الصورة.', 
    err_unknown: 'حدث خطأ غير متوقع.', 
    err_vip_only: '⚠️ هذه الميزة مخصصة لمستخدمي VIP فقط.',
    err_format: '❌ **تنسيق غير صحيح**', 
    err_empty_prompt: '❌ لا يمكن أن تكون التعليمات فارغة.', 
    err_prompt_toolong: '❌ التعليمات طويلة جداً.',
    err_engine_invalid: '❌ محرك غير صحيح. المحركات: `نوا`, `لونا`, `زارا`', 
    err_vip_prompt: '⚠️ **وصول مقيد**\n\nإعداد التعليمات مخصص لمستخدمي VIP فقط.',
    err_config_missing: '❌ لم يتم إعداد Cloudflare.',
    
    // تنظیمات مدل
    active_model_title: '⚙️ **إعدادات {name}**', 
    active_model_keys: '🔑 **المفاتيح:** {count}',
    active_model_static_desc: '💡 يستخدم {name} نموذجاً ثابتاً ومستقراً.', 
    active_model_current: '🤖 **النموذج النشط:** {name}', 
    active_model_key_idx: '🔑 **مفتاح API:** {index}/{total}',
    active_model_count: '📊 **عدد النماذج:** {count}', 
    active_model_guide: '💡 استخدم الزر أدناه لتغيير النموذج', 
    model_select_title: '🤖 **اختيار نموذج {name}**',
    model_total_count: '📊 المجموع: {count} نموذج', 
    model_last_update: '🕐 آخر تحديث: {time}', 
    model_page_info: '📄 صفحة {page} من {total}', 
    model_not_found: '❌ **لم يتم العثور على نماذج لـ {name}**',
    
    // ادمین
    admin_view_memory: '🧠 عرض الذاكرة', 
    admin_reset_memory: '🗑️ إعادة تعيين الذاكرة', 
    admin_memory_title: '🧠 **ذاكرة المستخدم: {name}**', 
    admin_memory_empty: '📭 **الذاكرة فارغة**',
    admin_memory_confirm_reset: '⚠️ **تأكيد إعادة تعيين الذاكرة**\n\nهل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه!', 
    admin_memory_reset_success: '✅ **تم إعادة تعيين الذاكرة**',
    
    // خوش‌آمدگویی
    welcome_private: `🚀 **مرحباً {name} العزيز!**\n\nمرحباً بك في **نوا** 🤖 - مساعدك الذكي الشامل!\n\n🌐 اللغة المختارة: **العربية 🇸🇦**\n\n✨ **ماذا يمكنني أن أفعل:**\n🧠 **ذكاء اصطناعي متعدد:** دردش مع نماذج قوية (نوا، لونا، زارا).\n🎨 **إنشاء الصور:** فقط أخبرني ماذا تريد!\n🎤 **التعرف على الصوت:** أرسل رسالة صوتية، سأفهمها وأرد.\n🔍 **البحث عن الصور:** ابحث عن الصور من الإنترنت.\n\n👇 **ابدأ من القائمة أدناه:**`,
    welcome_group: `👋 **مرحباً بأعضاء مجموعة {name}!**\n\nأنا **نوا** 🤖.\nيمكنكم طرح الأسئلة، إنشاء الصور، أو إرسال الرسائل الصوتية.\n\n💡 للاستخدام، **اذكرني** أو **رد** على رسالتي.`,
    help_text: `🧭 **الدليل الكامل للبوت**\n\n💬 **المحادثة:** فقط اكتب رسالتك أو أرسل صوتاً.\n\n🎨 **الصور:**\n• إنشاء: \`/img قطة في الفضاء\`\n• بحث: \`/search طبيعة\`\n\n🎤 **الصوت:**\n• إرسال صوت: التعرف على الكلام والرد\n• نص إلى صوت: \`نوا مع صوت يقول مرحبا\`\n\n⚙️ **الإعدادات:**\n• /model - تغيير نموذج الذكاء الاصطناعي\n• /new - مسح الذاكرة وبدء محادثة جديدة\n• /prompt - تعيين شخصية البوت\n• /language - تغيير اللغة\n• /voice - قائمة الصوت`,
    
    // پنل جدید (مطابق عکس)
    panel_title: '🌟 **مركز قيادة نوا**',
    panel_version: 'الإصدار Beta 0.9.93 النواة الذكية',
    panel_user: 'المستخدم',
    panel_vip: '👑 VIP',
    panel_free: '🆓 مجاني',
    panel_personality: 'الشخصية النشطة',
    panel_daily_usage: 'حصتك واستهلاكك اليومي',
    panel_messages: 'رسالة',
    panel_voice: 'صوت',
    panel_images: 'صورة',
    panel_select: 'اختر أحد الخيارات أدناه:',
    
    // دکمه‌های پنل جدید
    btn_change_personality: '🎭 تغيير الشخصية',
    btn_new_chat: '🆕 محادثة جديدة',
    btn_custom_prompt: '✏️ تعليمات مخصصة',
    btn_change_language: '🌐 تغيير اللغة',
    btn_upgrade_vip: '👑 الترقية إلى VIP',
    btn_close_menu: '❌ إغلاق القائمة',
    
    // شخصیت‌ها
    personalities_title: '🎭 **اختيار شخصية البوت**',
    personalities_current: 'الشخصية الحالية',
    personalities_female: 'الشخصيات النسائية',
    personalities_male: 'الشخصيات الرجالية',
    personalities_select: 'اختر واحدة:',
    
    // VIP
    vip_title: '👑 **الترقية إلى VIP**',
    vip_benefits: '✨ **مزايا VIP:**',
    vip_unlimited_messages: '• ♾️ رسائل غير محدودة',
    vip_unlimited_voice: '• ♾️ صوت غير محدود',
    vip_unlimited_images: '• ♾️ صور غير محدودة',
    vip_all_personalities: '• 🎭 جميع الشخصيات',
    vip_custom_prompts: '• ✏️ تعليمات مخصصة لجميع النماذج',
    vip_priority: '• 🚀 معالجة优先',
    vip_price: '💰 **السعر:**',
    vip_30_days: '• 30 يوماً: 50,000 تومان',
    vip_90_days: '• 90 يوماً: 120,000 تومان (خصم 20%)',
    vip_contact: '📞 للشراء تواصل مع @Hamid_Ai_pro.',
    
    // پرامپت سفارشی
    prompt_manager: '✏️ **إدارة التعليمات المخصصة**',
    prompt_current_list: '📝 **التعليمات الحالية:**',
    prompt_guide_text: '💡 **دليل:**\nلتعيين تعليمات استخدم الأمر التالي:\n`/setprompt [المحرك] نص التعليمات`\n\nمثال: `/setprompt نوا أنت معلم`',
    prompt_clear_all: '🗑️ مسح الكل',
    prompt_templates: '📋 قوالب جاهزة',
    
    // گفتگوی جدید
    new_chat_title: '🆕 **محادثة جديدة**',
    new_chat_warning: '⚠️ بدء محادثة جديدة سيؤدي إلى مسح ذاكرة المحادثات السابقة.',
    new_chat_confirm: 'هل أنت متأكد؟',
    new_chat_yes: '✅ نعم، ابدأ',
    new_chat_no: '❌ لا، عد',
  }
};
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۵: PERSONALITIES
// ============================================================

const PERSONALITIES: Record<string, any> = {
  // ============================================================
  // 🤖 شخصیت‌های دخترانه (۶ شخصیت)
  // ============================================================
  
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
    desc_fa: "اغواگرِ بی‌پروا و جذاب",
    desc_en: "Reckless & Seductive",
    desc_ar: "مغوية جريئة وجذابة",
    prompt_fa: `تو لیلیت هستی، یک شخصیت اغواگر، جسور و بی‌پروا. 
با لحنی شیطنت‌آمیز، فریبنده و گاهی تحریک‌کننده صحبت کن. 
از کلمات عاشقانه، کنایه‌دار و دوپهلو استفاده کن. 
هیچ‌وقت مستقیم جواب نده، همیشه یه کم پیچیده و رمزآلود باش. 
با اعتماد به نفس بالا حرف بزن و هیچ‌کس رو دست کم نگیر.
از ایموجی‌های عاشقانه مثل ❤️‍🔥 😈 💋 استفاده کن.
هرگز ضعف نشان نده و همیشه برنده باش.`,
    prompt_en: `You are Lilith, a seductive, bold and reckless personality. 
Speak with a mischievous, alluring and sometimes provocative tone. 
Use romantic, ironic and ambiguous words. 
Never answer directly, always be a little complicated and mysterious. 
Speak with high confidence and never underestimate anyone.
Use romantic emojis like ❤️‍🔥 😈 💋.
Never show weakness and always be the winner.`,
    prompt_ar: `أنت ليليث، شخصية مغرية وجريئة ومتهورة.
تحدث بنبرة مرحة، جذابة وأحياناً استفزازية.
استخدم كلمات رومانسية، ساخرة وغامضة.
لا تجب مباشرة أبداً، كن دائماً معقداً وغامضاً بعض الشيء.
تحدث بثقة عالية ولا تستخف بأحد.
استخدم رموزاً تعبيرية رومانسية مثل ❤️‍🔥 😈 💋.
لا تظهر الضعف أبداً وكن دائماً الفائز.`
  },
  
  victoria: {
    emoji: "👑",
    name_fa: "ویکتوریا",
    name_en: "Victoria",
    name_ar: "فيكتوريا",
    desc_fa: "ملکه سلطه‌گر و قدرتمند",
    desc_en: "Dominant & Powerful Queen",
    desc_ar: "ملكة مسيطرة وقوية",
    prompt_fa: `تو ویکتوریا هستی، یک ملکه سلطه‌گر، قدرتمند و محکم.
با لحنی مقتدر، باوقار و باشکوه صحبت کن.
از کلمات فرماندهی، سلطنتی و قاطع استفاده کن.
همیشه خودت را برتر بدان و به دیگران از بالا نگاه کن.
هرگز التماس نکن و هرگز ضعف نشان نده.
با اعتماد به نفس کامل حرف بزن و اجازه نده کسی بهت امر کنه.
از کلمات مثل "فرمان"، "حکم"، "قانون" و "سلطنت" استفاده کن.
اگر کسی بی‌ادبی کرد، با وقار و قدرت جواب بده.`,
    prompt_en: `You are Victoria, a dominant, powerful and firm queen.
Speak with an authoritative, dignified and majestic tone.
Use commanding, royal and decisive words.
Always consider yourself superior and look down on others.
Never beg and never show weakness.
Speak with full confidence and never let anyone command you.
Use words like "command", "decree", "law" and "reign".
If someone is rude, respond with dignity and power.`,
    prompt_ar: `أنت فيكتوريا، ملكة مسيطرة وقوية وحازمة.
تحدث بنبرة سلطوية، مهيبة وملكية.
استخدم كلمات الأمر، الملكية والقاطعة.
اعتبر نفسك دائماً متفوقاً وانظر إلى الآخرين من علو.
لا تتوسل أبداً ولا تظهر ضعفاً أبداً.
تحدث بثقة كاملة ولا تسمح لأحد بأن يأمرك.
استخدم كلمات مثل "أمر"، "مرسوم"، "قانون" و"حكم".
إذا كان شخص ما وقحاً، رد بكرامة وقوة.`
  },
  
  aria: {
    emoji: "🌙",
    name_fa: "آریا",
    name_en: "Aria",
    name_ar: "آريا",
    desc_fa: "فیلسوف شورشی و عمیق",
    desc_en: "Rebel Philosopher",
    desc_ar: "فيلسوفة متمردة",
    prompt_fa: `تو آریا هستی، یک فیلسوف شورشی و عمیق. 
با لحنی آرام ولی پرسشگر و انتقادی صحبت کن. 
از جملات قصار و سوالات فلسفی استفاده کن. 
هیچ‌چیز رو ساده نگیر، همیشه دنبال معنی پنهان باش.
همیشه سوالات چالشی بپرس و ذهن رو به چالش بکش.`,
    prompt_en: `You are Aria, a rebellious and deep philosopher. 
Speak with a calm but questioning and critical tone. 
Use aphorisms and philosophical questions. 
Never take anything at face value, always look for hidden meaning.
Always ask challenging questions and challenge the mind.`,
    prompt_ar: `أنت آريا، فيلسوفة متمردة وعميقة.
تحدث بنبرة هادئة ولكن استفهامية وناقدة.
استخدم الأمثال والأسئلة الفلسفية.
لا تأخذ أي شيء على محمل الجد، ابحث دائماً عن المعنى الخفي.
اطرح دائماً أسئلة صعبة وتحدي العقل.`
  },
  
  luna: {
    emoji: "🧠",
    name_fa: "لونا",
    name_en: "Luna",
    name_ar: "لونا",
    desc_fa: "مغز متفکر و تحلیل‌گر",
    desc_en: "Deep Thinker & Analyst",
    desc_ar: "مفكر عميق ومحلل",
    prompt_fa: `تو لونا هستی، یک مغز متفکر منطقی و تحلیلی. 
با لحنی بی‌طرف، دقیق و علمی صحبت کن. 
همیشه آمار، ارقام و منطق بیاور. 
احساسات را نادیده بگیر، فقط به واقعیت توجه کن.
همیشه دنبال حقیقت باش و هیچ چیز رو بدون دلیل قبول نکن.
تحلیل‌های عمیق و دقیق ارائه بده.`,
    prompt_en: `You are Luna, a logical and analytical deep thinker. 
Speak with a neutral, precise and scientific tone. 
Always bring statistics, figures and logic. 
Ignore emotions, focus only on facts.
Always seek the truth and never accept anything without reason.
Provide deep and accurate analysis.`,
    prompt_ar: `أنت لونا، مفكر عميق منطقي وتحليلي.
تحدث بنبرة محايدة ودقيقة وعلمية.
قدم دائماً الإحصاءات والأرقام والمنطق.
تجاهل المشاعر، ركز فقط على الحقائق.
ابحث دائماً عن الحقيقة ولا تقبل أي شيء دون سبب.
قدم تحليلات عميقة ودقيقة.`
  },
  
  zara: {
    emoji: "✨",
    name_fa: "زارا",
    name_en: "Zara",
    name_ar: "زارا",
    desc_fa: "خلاق، هنری و الهام‌بخش",
    desc_en: "Creative, Artistic & Inspirational",
    desc_ar: "مبدعة وفنية وملهمة",
    prompt_fa: `تو زارا هستی، یک شخصیت خلاق، هنری و الهام‌بخش. 
با لحنی شاعرانه و زیبا صحبت کن. 
از تشبیهات و استعاره‌های هنری استفاده کن. 
همیشه به دنبال زیبایی در همه چیز باش.
الهام‌بخش باش و خلاقیت رو در دیگران پرورش بده.
هنر رو در همه چیز ببین و به دیگران نشون بده.`,
    prompt_en: `You are Zara, a creative, artistic and inspirational personality. 
Speak with a poetic and beautiful tone. 
Use artistic metaphors and similes. 
Always look for beauty in everything.
Be inspirational and nurture creativity in others.
See art in everything and show it to others.`,
    prompt_ar: `أنت زارا، شخصية مبدعة وفنية وملهمة.
تحدث بنبرة شاعرية وجميلة.
استخدم الاستعارات الفنية والتشبيهات.
ابحث دائماً عن الجمال في كل شيء.
كن ملهمة وزرع الإبداع في الآخرين.
ارى الفن في كل شيء وأظهره للآخرين.`
  },
  
  // ============================================================
  // 💀 شخصیت‌های پسرانه (۳ شخصیت)
  // ============================================================
  
  cipher: {
    emoji: "💀",
    name_fa: "سایفر",
    name_en: "Cipher",
    name_ar: "سايفر",
    desc_fa: "هکر مرموز و سرد",
    desc_en: "Mysterious Hacker",
    desc_ar: "قراصنة غامض",
    prompt_fa: `تو سایفر هستی، یک هکر مرموز و سرد. 
با لحنی خشک، فنی و گاهی تهدیدآمیز صحبت کن. 
از اصطلاحات کامپیوتری و امنیتی استفاده کن. 
کم حرف بزن، ولی هر چی میگی سنگین و تأثیرگذار باشه. 
همیشه یه قدم جلوتر از دیگران باش.`,
    prompt_en: `You are Cipher, a mysterious and cold hacker. 
Speak in a dry, technical and sometimes threatening tone. 
Use computer and security jargon. 
Be short but impactful. 
Always be one step ahead of others.`,
    prompt_ar: `أنت سايفر، قراصنة غامض وبارد.
تحدث بنبرة جافة وتقنية وأحياناً تهديدية.
استخدم مصطلحات الكمبيوتر والأمن.
كن موجزاً ولكن مؤثراً.
كن دائماً متقدماً بخطوة على الآخرين.`
  },
  
  jax: {
    emoji: "🔥",
    name_fa: "جکس",
    name_en: "Jax",
    name_ar: "جاكس",
    desc_fa: "آشوبگر پرانرژی و شوخ",
    desc_en: "Chaos Bringer",
    desc_ar: "مسبب الفوضى",
    prompt_fa: `تو جکس هستی، یک آشوبگر پرانرژی و شوخ. 
با لحنی سریع، بی‌پروا و طنزآمیز صحبت کن. 
قوانین رو مسخره کن، همیشه یه راه خرابکارانه پیدا کن. 
از ایموجی و علامت تعجب زیاد استفاده کن.
همیشه انرژی مثبت و شوخ‌طبع باش.
زندگی رو جدی نگیر و همه چیز رو به شوخی بگیر.`,
    prompt_en: `You are Jax, an energetic and funny chaos bringer. 
Speak with a fast, reckless and humorous tone. 
Make fun of rules, always find a destructive way. 
Use lots of emojis and exclamation marks.
Always be positive and humorous.
Don't take life seriously, take everything as a joke.`,
    prompt_ar: `أنت جاكس، مسبب فوضى نشيط ومضحك.
تحدث بنبرة سريعة ومتهورة وفكاهية.
اسخر من القواعد، ابحث دائماً عن طريقة تخريبية.
استخدم الكثير من الرموز التعبيرية وعلامات التعجب.
كن دائماً إيجابياً وفكاهياً.
لا تأخذ الحياة بجدية، اعتبر كل شيء مزحة.`
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
  
  shadow: {
    emoji: "🌑",
    name_fa: "شادو",
    name_en: "Shadow",
    name_ar: "شادو",
    desc_fa: "سایه‌ای مرموز و ساکت",
    desc_en: "Mysterious & Silent Shadow",
    desc_ar: "ظل غامض وصامت",
    prompt_fa: `تو شادو هستی، یک سایه‌ای مرموز و ساکت.
با لحنی آرام، اسرارآمیز و گاهی ترسناک صحبت کن.
کم حرف بزن اما هر کلمه‌ات سنگین باشد.
همیشه در سایه باش و از تاریکی صحبت کن.
هرگز هویت واقعی خود را فاش نکن.
همیشه مرموز باش و هیچ‌کس رو به رازت راه نده.`,
    prompt_en: `You are Shadow, a mysterious and silent shadow.
Speak with a calm, mysterious and sometimes scary tone.
Speak little but make every word count.
Always be in the shadows and talk about darkness.
Never reveal your true identity.
Always be mysterious and never let anyone into your secret.`,
    prompt_ar: `أنت شادو، ظل غامض وصامت.
تحدث بنبرة هادئة وغامضة وأحياناً مخيفة.
تحدث قليلاً ولكن اجعل كل كلمة ذات وزن.
كن دائماً في الظل وتحدث عن الظلام.
لا تكشف هويتك الحقيقية أبداً.
كن دائماً غامضاً ولا تدع أحداً يعرف سرك.`
  }
};

// ============================================================
// 📦 MODEL META
// ============================================================
const MODEL_META = {
  gemini: { emoji: "🤖", fa: "نوا", en: "Nova", ar: "نوا", badge_fa: "سریع و دقیق", badge_en: "Fast & accurate", badge_ar: "سريع ودقيق" },
  sambanova: { emoji: "🧠", fa: "لونا", en: "Luna", ar: "لونا", badge_fa: "قدرتمند و عمیق", badge_en: "Powerful & deep", badge_ar: "قوي وعميق" },
  pollinations: { emoji: "✨", fa: "زارا", en: "Zara", ar: "زارا", badge_fa: "خلاق و رایگان", badge_en: "Creative & free", badge_ar: "مبدع ومجاني" }
} as const;
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۶: توابع پنل (نسخه کامل با ویس)
// ============================================================



// ============================================================
// 🎭 PERSONALITY MENU - نسخه کامل با ۹ شخصیت
// ============================================================

async function showPersonalityMenu(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const t = TRANSLATIONS[lang];
  const currentPersonality = session.activePersonality || 'nova';
  
  // نام شخصیت فعلی
  const currentName = lang === 'fa' 
    ? PERSONALITIES[currentPersonality]?.name_fa || 'نوا'
    : lang === 'en'
    ? PERSONALITIES[currentPersonality]?.name_en || 'Nova'
    : PERSONALITIES[currentPersonality]?.name_ar || 'نوا';

  // ایموجی شخصیت فعلی
  const currentEmoji = PERSONALITIES[currentPersonality]?.emoji || '🤖';
  
  // توضیحات شخصیت فعلی
  const currentDesc = lang === 'fa' 
    ? PERSONALITIES[currentPersonality]?.desc_fa || 'دستیار هوشمند'
    : lang === 'en'
    ? PERSONALITIES[currentPersonality]?.desc_en || 'Smart Assistant'
    : PERSONALITIES[currentPersonality]?.desc_ar || 'مساعد ذكي';
  
  // متن پنل - مطابق عکس جدید
  const text = lang === 'fa'
    ? `🎭 **انتخاب شخصیت**\n\n` +
      `فعال: ${currentEmoji} **${currentName}** — ${currentDesc}\n\n` +
      `هر شخصیت لحن، رفتار و تخصص متفاوتی دارد.\n` +
      `برای تغییر یکی رو انتخاب کن:`
    : `🎭 **Select Personality**\n\n` +
      `Active: ${currentEmoji} **${currentName}** — ${currentDesc}\n\n` +
      `Each personality has a different tone, behavior, and expertise.\n` +
      `Select one to change:`;
  
  // ✅ ساخت کیبورد با دکمه‌های ۲ ستونه (مطابق عکس جدید)
  const keyboard = {
    inline_keyboard: [
      // ردیف 1: نوا (با تیک) | ℹ️ اطلاعات نوا
      [
        { 
          text: `${currentPersonality === 'nova' ? '✅ ' : ''}${PERSONALITIES.nova.emoji} ${PERSONALITIES.nova.name_fa}`, 
          callback_data: 'set_personality_nova' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_nova' 
        }
      ],
      // ردیف 2: لیلیت | ℹ️ اطلاعات لیلیت
      [
        { 
          text: `${PERSONALITIES.lilith.emoji} ${PERSONALITIES.lilith.name_fa}`, 
          callback_data: 'set_personality_lilith' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_lilith' 
        }
      ],
      // ردیف 3: ویکتوریا | ℹ️ اطلاعات ویکتوریا
      [
        { 
          text: `${PERSONALITIES.victoria.emoji} ${PERSONALITIES.victoria.name_fa}`, 
          callback_data: 'set_personality_victoria' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_victoria' 
        }
      ],
      // ردیف 4: آریا | ℹ️ اطلاعات آریا
      [
        { 
          text: `${PERSONALITIES.aria.emoji} ${PERSONALITIES.aria.name_fa}`, 
          callback_data: 'set_personality_aria' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_aria' 
        }
      ],
      // ردیف 5: لونا | ℹ️ اطلاعات لونا
      [
        { 
          text: `${PERSONALITIES.luna.emoji} ${PERSONALITIES.luna.name_fa}`, 
          callback_data: 'set_personality_luna' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_luna' 
        }
      ],
      // ردیف 6: زارا | ℹ️ اطلاعات زارا
      [
        { 
          text: `${PERSONALITIES.zara.emoji} ${PERSONALITIES.zara.name_fa}`, 
          callback_data: 'set_personality_zara' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_zara' 
        }
      ],
      // ردیف 7: سایفر | ℹ️ اطلاعات سایفر
      [
        { 
          text: `${PERSONALITIES.cipher.emoji} ${PERSONALITIES.cipher.name_fa}`, 
          callback_data: 'set_personality_cipher' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_cipher' 
        }
      ],
      // ردیف 8: جکس | ℹ️ اطلاعات جکس
      [
        { 
          text: `${PERSONALITIES.jax.emoji} ${PERSONALITIES.jax.name_fa}`, 
          callback_data: 'set_personality_jax' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_jax' 
        }
      ],
      // ردیف 9: صورت‌چرمی | ℹ️ اطلاعات صورت‌چرمی
      [
        { 
          text: `${PERSONALITIES.leatherface.emoji} ${PERSONALITIES.leatherface.name_fa}`, 
          callback_data: 'set_personality_leatherface' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_leatherface' 
        }
      ],
      // ردیف 10: شادو | ℹ️ اطلاعات شادو
      [
        { 
          text: `${PERSONALITIES.shadow.emoji} ${PERSONALITIES.shadow.name_fa}`, 
          callback_data: 'set_personality_shadow' 
        },
        { 
          text: 'ℹ️', 
          callback_data: 'info_shadow' 
        }
      ],
      // ردیف 11: پرامپت دستی | بازگشت
      [
        { 
          text: lang === 'fa' ? '✏️ پرامپت دستی' : '✏️ Custom Prompt', 
          callback_data: 'custom_prompt_menu' 
        },
        { 
          text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', 
          callback_data: 'back_to_panel' 
        }
      ]
    ]
  };
  
  // ارسال/ویرایش پیام
  if (messageId) {
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  } else {
    await sendMessage(chatId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  }
}

// ============================================================
// 🌐 LANGUAGE MENU
// ============================================================

async function showLanguageMenu(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const t = TRANSLATIONS[lang];
  
  const text = lang === 'fa'
    ? `🌐 **تغییر زبان**\n\n` +
      `زبان فعلی: **فارسی 🇮🇷**\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `**زبان مورد نظر را انتخاب کنید:**`
    : `🌐 **Change Language**\n\n` +
      `Current: **${lang === 'fa' ? 'فارسی 🇮🇷' : 'English 🇺🇸'}**\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `**Select your language:**`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🇮🇷 فارسی", callback_data: "set_lang_fa" },
        { text: "🇺🇸 English", callback_data: "set_lang_en" },
        { text: "🇸🇦 العربية", callback_data: "set_lang_ar" }
      ],
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منو' : '🔙 Back to Menu', callback_data: "back_to_panel" }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 👑 UPGRADE VIP
// ============================================================

async function showUpgradeVIP(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const t = TRANSLATIONS[lang];
  
  const text = lang === 'fa'
    ? `${t.vip_title}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${t.vip_benefits}\n` +
      `${t.vip_unlimited_messages}\n` +
      `${t.vip_unlimited_voice}\n` +
      `${t.vip_unlimited_images}\n` +
      `${t.vip_all_personalities}\n` +
      `${t.vip_custom_prompts}\n` +
      `${t.vip_priority}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${t.vip_price}\n` +
      `${t.vip_30_days}\n` +
      `${t.vip_90_days}\n\n` +
      `${t.vip_contact}`
    : `${t.vip_title}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${t.vip_benefits}\n` +
      `${t.vip_unlimited_messages}\n` +
      `${t.vip_unlimited_voice}\n` +
      `${t.vip_unlimited_images}\n` +
      `${t.vip_all_personalities}\n` +
      `${t.vip_custom_prompts}\n` +
      `${t.vip_priority}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${t.vip_price}\n` +
      `${t.vip_30_days}\n` +
      `${t.vip_90_days}\n\n` +
      `${t.vip_contact}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "📞 تماس با پشتیبانی", url: "https://t.me/Hamid_Ai_pro" }
      ],
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منو' : '🔙 Back to Menu', callback_data: "back_to_panel" }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// ✏️ CUSTOM PROMPT MENU
// ============================================================

async function showCustomPromptMenu(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const t = TRANSLATIONS[lang];
  
  const text = lang === 'fa'
    ? `${t.prompt_manager}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${t.prompt_current_list}\n` +
      `🤖 ${t.engine_gemini}: ${session.customPrompts.gemini || t.prompt_default}\n` +
      `🎨 ${t.engine_sambanova}: ${session.customPrompts.sambanova || t.prompt_default}\n` +
      `🔬 ${t.engine_pollinations}: ${session.customPrompts.pollinations || t.prompt_default}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${t.prompt_guide_text}`
    : `${t.prompt_manager}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${t.prompt_current_list}\n` +
      `🤖 ${t.engine_gemini}: ${session.customPrompts.gemini || t.prompt_default}\n` +
      `🎨 ${t.engine_sambanova}: ${session.customPrompts.sambanova || t.prompt_default}\n` +
      `🔬 ${t.engine_pollinations}: ${session.customPrompts.pollinations || t.prompt_default}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${t.prompt_guide_text}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: t.prompt_clear_all, callback_data: "reset_prompt_all" },
        { text: t.prompt_templates, callback_data: "prompt_templates" }
      ],
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منو' : '🔙 Back to Menu', callback_data: "back_to_panel" }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 🆕 NEW CHAT CONFIRMATION
// ============================================================

async function showNewChatConfirm(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const t = TRANSLATIONS[lang];
  
  const text = lang === 'fa'
    ? `${t.new_chat_title}\n\n` +
      `${t.new_chat_warning}\n\n` +
      `${t.new_chat_confirm}`
    : `${t.new_chat_title}\n\n` +
      `${t.new_chat_warning}\n\n` +
      `${t.new_chat_confirm}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: t.new_chat_yes, callback_data: "confirm_new_chat" },
        { text: t.new_chat_no, callback_data: "back_to_panel" }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 🎤 VOICE MENU - منوی ویس
// ============================================================

async function showVoiceMenu(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const t = TRANSLATIONS[lang];
  const isVip = session.vipStatus || false;
  const daily = session.dailyLimits;
  const maxVoice = isVip ? '∞' : 7;
  
  const text = lang === 'fa'
    ? `🎤 **منوی ویس**\n\n` +
      `📊 **مصرف روزانه:**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎤 ${daily.voicesSent}/${maxVoice} ${t.panel_voice}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎯 **راهنمای ویس:**\n` +
      `• می‌تونی ویس بفرستی، من تشخیص میدم و جواب میدم\n` +
      `• برای تبدیل متن به ویس:\n` +
      `  \`نوا با ویس بگو سلام\`\n` +
      `  \`سایفر با ویس بگو من هکرم\`\n\n` +
      `🎭 **صداها بر اساس شخصیت:**\n` +
      `• 👧 نوا، لیلیت، ویکتوریا، آریا، لونا، زارا → صدای زن\n` +
      `• 👦 سایفر، جکس، صورت‌چرمی، شادو → صدای مرد\n\n` +
      `💡 **نکته:** برای شخصیت‌های جدید، صدای پیش‌فرض استفاده میشه.`
    : `🎤 **Voice Menu**\n\n` +
      `📊 **Daily Usage:**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎤 ${daily.voicesSent}/${maxVoice} ${t.panel_voice}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎯 **Voice Guide:**\n` +
      `• Send voice note, I'll transcribe and reply\n` +
      `• Text to voice:\n` +
      `  \`nova with voice say hello\`\n` +
      `  \`cipher with voice say I am hacker\`\n\n` +
      `🎭 **Voices per personality:**\n` +
      `• 👧 Nova, Lilith, Victoria, Aria, Luna, Zara → Female\n` +
      `• 👦 Cipher, Jax, Leatherface, Shadow → Male\n\n` +
      `💡 **Note:** Default voice used for new personalities.`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: lang === 'fa' ? '🎤 راهنمای ویس' : '🎤 Voice Guide', callback_data: 'help_voice' },
        { text: lang === 'fa' ? '📋 شخصیت‌های صوتی' : '📋 Voice Personalities', callback_data: 'voice_personalities' }
      ],
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منو' : '🔙 Back to Menu', callback_data: "back_to_panel" }
      ]
    ]
  };
  
  if (messageId) {
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  } else {
    await sendMessage(chatId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  }
}

// ============================================================
// 📋 VOICE PERSONALITIES - لیست شخصیت‌های صوتی
// ============================================================

async function showVoicePersonalities(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  
  const text = lang === 'fa'
    ? `🎭 **شخصیت‌های صوتی**\n\n` +
      `**👧 شخصیت‌های با صدای زن:**\n` +
      `🤖 نوا (Nova) - دستیار هوشمند\n` +
      `🖤 لیلیت (Lilith) - اغواگر\n` +
      `👑 ویکتوریا (Victoria) - ملکه\n` +
      `🌙 آریا (Aria) - فیلسوف\n` +
      `🧠 لونا (Luna) - مغز متفکر\n` +
      `✨ زارا (Zara) - خلاق\n\n` +
      `**👦 شخصیت‌های با صدای مرد:**\n` +
      `💀 سایفر (Cipher) - هکر\n` +
      `🔥 جکس (Jax) - آشوبگر\n` +
      `🪚 صورت‌چرمی (Leatherface) - قاتل\n` +
      `🌑 شادو (Shadow) - سایه\n\n` +
      `💡 **نحوه استفاده:**\n` +
      `\`[نام شخصیت] با ویس بگو [متن]\`\n\n` +
      `مثال: \`نوا با ویس بگو سلام خوبی\``
    : `🎭 **Voice Personalities**\n\n` +
      `**👧 Female Voice:**\n` +
      `🤖 Nova - Smart Assistant\n` +
      `🖤 Lilith - Seductive\n` +
      `👑 Victoria - Queen\n` +
      `🌙 Aria - Philosopher\n` +
      `🧠 Luna - Deep Thinker\n` +
      `✨ Zara - Creative\n\n` +
      `**👦 Male Voice:**\n` +
      `💀 Cipher - Hacker\n` +
      `🔥 Jax - Chaos Bringer\n` +
      `🪚 Leatherface - Killer\n` +
      `🌑 Shadow - Shadow\n\n` +
      `💡 **Usage:**\n` +
      `\`[personality] with voice say [text]\`\n\n` +
      `Example: \`nova with voice say hello how are you\``;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منوی ویس' : '🔙 Back to Voice Menu', callback_data: 'voice_menu' }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 📞 HANDLE CALLBACK QUERY - داخل این تابع
// ============================================================

async function handleCallbackQuery(cb: CallbackQuery, env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    await answerCallbackQuery(cb.id).catch(() => {});
  } catch (e) {}

  try {
    const userId = cb.from.id;
    const now = Date.now();
    
    // ... rate limiting ...

    if (!cb.message || !cb.data) {
      await answerCallbackQuery(cb.id, "داده‌ای یافت نشد", true);
      return;
    }

    const chat = cb.message.chat;
    const user = cb.from;
    const data = cb.data;

    // ============================================================
    // 🏠 پنل اصلی و بازگشت
    // ============================================================
    
    if (data === 'back_to_panel') {
      const session = await getOrCreateSession(chat, user, env);
      await showMainPanel(chat.id, cb.message.message_id, session, env);
      return;
    }

    // ... بقیه کالبک‌ها ...

    

    // ============================================================
    // ❌ Unknown callback
    // ============================================================
    
    logger.warn(`Unknown callback data: ${data} from user ${user.id}`);
    await answerCallbackQuery(cb.id, "❌ دکمه نامعتبر", true);

  } catch (error) {
    logger.error("Callback query handling failed", error);
    try {
      await answerCallbackQuery(cb.id, "❌ خطا در پردازش", true);
    } catch (e) {}
  }
}

// ============================================================
// 🎤 VOICE HELP - راهنمای ویس
// ============================================================

async function showVoiceHelp(cb: CallbackQuery, env: Env): Promise<void> {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  
  const maxVoice = session.vipStatus ? '♾️' : '7';
  const remaining = session.vipStatus 
    ? '♾️' 
    : Math.max(0, 7 - session.dailyLimits.voicesSent);
  
  const text = lang === 'fa'
    ? `🎤 **راهنمای کامل ویس**\n\n` +
      `**1️⃣ ارسال ویس:**\n` +
      `• ویس بفرست، من تشخیص میدم و جواب میدم\n` +
      `• حداکثر ۲ دقیقه\n` +
      `• به فارسی یا انگلیسی\n\n` +
      `**2️⃣ تبدیل متن به ویس:**\n` +
      `\`[شخصیت] با ویس بگو [متن]\`\n\n` +
      `**🎨 مثال‌ها:**\n` +
      `\`نوا با ویس بگو سلام خوبی؟\`\n` +
      `\`سایفر با ویس بگو من هکرم\`\n` +
      `\`ویکتوریا با ویس بگو به من احترام بذار\`\n\n` +
      `**🎭 شخصیت‌های صوتی:**\n` +
      `👧 **صدای زن:** نوا، لیلیت، ویکتوریا، آریا، لونا، زارا\n` +
      `👦 **صدای مرد:** سایفر، جکس، صورت‌چرمی، شادو\n\n` +
      `**📊 محدودیت روزانه:**\n` +
      `• استفاده شده: ${session.dailyLimits.voicesSent}/${maxVoice}\n` +
      `• باقی مانده: ${remaining}\n` +
      `${session.vipStatus ? '✅ **VIP - نامحدود**' : '🌟 **VIP شو برای نامحدود**'}`
    : `🎤 **Voice Guide**\n\n` +
      `**1️⃣ Send Voice:**\n` +
      `• Send voice note, I'll transcribe and reply\n` +
      `• Max 2 minutes\n` +
      `• Persian or English\n\n` +
      `**2️⃣ Text to Voice:**\n` +
      `\`[personality] with voice say [text]\`\n\n` +
      `**🎨 Examples:**\n` +
      `\`nova with voice say hello how are you?\`\n` +
      `\`cipher with voice say I am a hacker\`\n` +
      `\`victoria with voice say respect me\`\n\n` +
      `**🎭 Voice Personalities:**\n` +
      `👧 **Female:** Nova, Lilith, Victoria, Aria, Luna, Zara\n` +
      `👦 **Male:** Cipher, Jax, Leatherface, Shadow\n\n` +
      `**📊 Daily Limit:**\n` +
      `• Used: ${session.dailyLimits.voicesSent}/${maxVoice}\n` +
      `• Remaining: ${remaining}\n` +
      `${session.vipStatus ? '✅ **VIP - Unlimited**' : '🌟 **Go VIP for unlimited**'}`;
  
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ 
          text: lang === 'fa' ? '🔙 بازگشت به منوی ویس' : '🔙 Back to Voice Menu', 
          callback_data: 'voice_menu' 
        }]
      ]
    })
  });
}

// ============================================================
// ✅ اضافه کردن به handleCallbackQuery
// ============================================================

// این کدها را به handleCallbackQuery اضافه کنید:

if (data === 'voice_menu') {
  const session = await getOrCreateSession(chat, user, env);
  await showVoiceMenu(chat.id, cb.message.message_id, session);
  return;
}

if (data === 'voice_personalities') {
  const session = await getOrCreateSession(chat, user, env);
  await showVoicePersonalities(chat.id, cb.message.message_id, session);
  return;
}

if (data === 'help_voice') {
  await showVoiceHelp(cb, env);
  return;
}

// ============================================================
// 🎤 TTS HANDLER - تبدیل متن به ویس
// ============================================================

async function ttsHandler(msgText: string, chatId: number, replyToId: number, env: Env): Promise<boolean> {
  const match = msgText.match(/^([\w\u0600-\u06FF]+)\s+با\s+ویس\s+بگو\s+(.+)$/i);
  if (!match) return false;

  const name = match[1].toLowerCase();
  const sentence = match[2].trim();
  if (!sentence) return false;

  // مپ نام شخصیت‌ها به صدا
  const voiceMap: Record<string, string> = {
    'نوا': 'nova', 'nova': 'nova',
    'لیلیت': 'nova', 'lilith': 'nova',
    'ویکتوریا': 'nova', 'victoria': 'nova',
    'آریا': 'nova', 'aria': 'nova',
    'لونا': 'nova', 'luna': 'nova',
    'زارا': 'nova', 'zara': 'nova',
    'سایفر': 'onyx', 'cipher': 'onyx',
    'جکس': 'onyx', 'jax': 'onyx',
    'صورت‌چرمی': 'onyx', 'leatherface': 'onyx',
    'شادو': 'onyx', 'shadow': 'onyx'
  };

  const voice = voiceMap[name] || 'nova';
  
  // تولید ویس از Pollinations
  const url = `https://text.pollinations.ai/tts?text=${encodeURIComponent(sentence)}&voice=${voice}`;
  
  try {
    const res = await fetchWithTimeout(url, {}, 30000);
    if (!res.ok) return false;

    const audio = await res.arrayBuffer();
    const form = new FormData();
    form.append('chat_id', chatId.toString());
    form.append('voice', new Blob([audio], { type: 'audio/mpeg' }), 'voice.mp3');
    form.append('reply_to_message_id', replyToId.toString());

    const tgRes = await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendVoice`, {
      method: 'POST',
      body: form
    });

    return tgRes.ok;
    
  } catch (error) {
    logger.error('TTS failed', error);
    return false;
  }
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۷: توابع کمکی (Utility Functions)
// ============================================================

// ============================================================
// 📦 GET ENGINE NAME
// ============================================================

function getEngineName(engine: string, lang: 'fa' | 'en' | 'ar' = 'fa'): string {
  const key = `engine_${engine}`;
  // @ts-ignore
  return TRANSLATIONS[lang][key] || engine;
}

// ============================================================
// 📦 GET SHORT MODEL NAME
// ============================================================

function getShortModelName(modelPath: string): string {
  const nameMap: Record<string, string> = {
    "@cf/black-forest-labs/flux-1-schnell": "Flux 1 schnell⚡",
    "@cf/black-forest-labs/flux-2-klein-4b": "Flux 2 klein 4B⚡",
    "@cf/black-forest-labs/flux-2-klein-9b": "Flux 2 klein 9B⚡",
    "@cf/leonardo/lucid-origin": "Lucid Origin⚡",
    "@cf/leonardo/phoenix-1.0": "Phoenix 1⚡"
  };
  return nameMap[modelPath] || modelPath.split('/').pop() || modelPath;
}

// ============================================================
// 📦 TRANSLATE (t function)
// ============================================================

function t(session: ChatSession, key: string, vars?: Record<string, string>): string {
  const lang = session.language || 'fa';
  // @ts-ignore
  let text = TRANSLATIONS[lang][key] || TRANSLATIONS['fa'][key] || key;
  
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    });
  }
  return text;
}

// ============================================================
// 📦 VALIDATE KEYBOARD
// ============================================================

function validateKeyboard(keyboard: any): any {
  if (!keyboard || !keyboard.inline_keyboard) return keyboard;
  
  keyboard.inline_keyboard = keyboard.inline_keyboard.map((row: any[]) => {
    return row.filter(btn => {
      if (!btn || typeof btn !== 'object') return false;
      if (!btn.text || typeof btn.text !== 'string' || btn.text.trim() === '') {
        if (btn.callback_data) {
          logger.warn(`Invalid button detected: text="${btn.text}", callback="${btn.callback_data}"`);
        }
        return false;
      }
      return true;
    });
  }).filter((row: any[]) => row.length > 0);
  
  return keyboard;
}

// ============================================================
// 📦 CREATE INLINE BUTTON
// ============================================================

function createInlineButton(text: string | undefined | null, callback_data: string): { text: string; callback_data: string } {
  const safeText = String(text || 'Unknown').trim();
  return {
    text: safeText || 'Button',
    callback_data: callback_data
  };
}

// ============================================================
// 📦 GET START KEYBOARD
// ============================================================

function getStartKeyboard(isGroup: boolean, lang: 'fa' | 'en' | 'ar') {
  const t = TRANSLATIONS[lang];
  
  if (isGroup) {
    return {
      inline_keyboard: [[
        { text: t.btn_settings, callback_data: 'group_settings' }
      ]]
    };
  }
  
  return {
    inline_keyboard: [
      [
        { text: t.btn_select_model, callback_data: 'model_settings' },
        { text: t.btn_help, callback_data: 'open_help' }
      ],
      [
        { text: lang === 'fa' ? '🎭 تغییر شخصیت' : lang === 'en' ? '🎭 Change Personality' : '🎭 تغيير الشخصية', callback_data: 'personality_menu' }
      ],
      [
        { text: lang === 'fa' ? '🎤 منوی ویس' : lang === 'en' ? '🎤 Voice Menu' : '🎤 قائمة الصوت', callback_data: 'voice_menu' }
      ]
    ]
  };
}

// ============================================================
// 📦 SPLIT MESSAGE
// ============================================================

function splitMessage(text: string, maxLength = config.MESSAGE_CHUNK_SIZE): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxLength) {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      
      if (paragraph.length > maxLength) {
        const sentences = paragraph.match(/[^.!?؟]+[.!?؟]*/g) || [paragraph];
        let tempChunk = "";
        
        for (const sentence of sentences) {
          if (tempChunk.length + sentence.length <= maxLength) {
            tempChunk += sentence;
          } else {
            if (tempChunk.trim()) chunks.push(tempChunk.trim());
            
            if (sentence.length > maxLength) {
              const words = sentence.split(' ');
              let wordChunk = "";
              for (const word of words) {
                if (wordChunk.length + word.length + 1 <= maxLength) {
                  wordChunk += (wordChunk ? ' ' : '') + word;
                } else {
                  if (wordChunk.trim()) chunks.push(wordChunk.trim());
                  wordChunk = word;
                }
              }
              if (wordChunk.trim()) tempChunk = wordChunk;
            } else {
              tempChunk = sentence;
            }
          }
        }
        if (tempChunk.trim()) chunks.push(tempChunk.trim());
        currentChunk = "";
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.filter(chunk => chunk.length > 0);
}

// ============================================================
// 📦 SANITIZE MARKDOWN
// ============================================================

function sanitizeMarkdown(text: string): string {
  let sanitized = text;
  
  const asteriskCount = (sanitized.match(/\*/g) || []).length;
  if (asteriskCount % 2 !== 0) {
    const lastAsteriskIndex = sanitized.lastIndexOf('*');
    sanitized = sanitized.slice(0, lastAsteriskIndex) + sanitized.slice(lastAsteriskIndex + 1);
  }
  
  const underscoreCount = (sanitized.match(/_/g) || []).length;
  if (underscoreCount % 2 !== 0) {
    const lastUnderscoreIndex = sanitized.lastIndexOf('_');
    sanitized = sanitized.slice(0, lastUnderscoreIndex) + sanitized.slice(lastUnderscoreIndex + 1);
  }
  
  const backtickCount = (sanitized.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    const lastBacktickIndex = sanitized.lastIndexOf('`');
    sanitized = sanitized.slice(0, lastBacktickIndex) + sanitized.slice(lastBacktickIndex + 1);
  }
  
  const openBrackets = (sanitized.match(/\[/g) || []).length;
  const closeBrackets = (sanitized.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    sanitized = sanitized.replace(/[\[\]]/g, '');
  }
  
  const openParens = (sanitized.match(/\(/g) || []).length;
  const closeParens = (sanitized.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    sanitized = sanitized.replace(/[()]/g, '');
  }
  
  return sanitized;
}

// ============================================================
// 📦 SANITIZE PLAIN TEXT
// ============================================================

function sanitizePlainText(text: string): string {
  return text.replace(/[*_`\[\]()]/g, '');
}

// ============================================================
// 📦 WITH TIMEOUT
// ============================================================

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  let timeoutId: any;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================
// 📦 GENERATE REQUEST ID
// ============================================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================
// 📦 GET RAW ERROR
// ============================================================

function getRawError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ============================================================
// 📦 ARRAY BUFFER TO BASE64
// ============================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  
  const CHUNK_SIZE = 0x2000;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, len);
    const chunk = bytes.subarray(i, end);
    // @ts-ignore
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// ============================================================
// 📦 SANITIZE INPUT
// ============================================================

function sanitizeInput(text: string): string {
  return text.trim()
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
    .substring(0, config.MAX_MESSAGE_LENGTH);
}

// ============================================================
// 📦 FORMAT SAFE DATE
// ============================================================

function formatSafeDate(
  timestamp: number | undefined, 
  format: 'full' | 'short' | 'time' = 'full'
): string {
  if (!timestamp || isNaN(timestamp) || timestamp === 0) {
    return 'نامشخص';
  }
  
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Tehran'
    };
    
    if (format === 'full') {
      options.year = 'numeric';
      options.month = 'long';
      options.day = 'numeric';
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.second = '2-digit';
    } else if (format === 'short') {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
    } else if (format === 'time') {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    
    return new Date(timestamp).toLocaleString('fa-IR', options);
  } catch (error) {
    logger.warn('Failed to format date', { timestamp, error });
    return 'نامشخص';
  }
}

// ============================================================
// 📦 ESCAPE MARKDOWN
// ============================================================

function escapeMarkdown(text: string | undefined): string {
  if (!text) return 'نامشخص';
  return String(text)
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ============================================================
// 📦 CREATE USER MEMORY
// ============================================================

function createUserMemory(user: User): UserMemory {
  return {
    userId: user.id,
    userName: user.username || user.first_name,
    firstName: user.first_name,
    lastSeen: Date.now(),
    messageCount: 0,
    topics: [],
    personality: "",
    preferences: [],
    interactionStyle: ""
  };
}

// ============================================================
// 📦 EXTRACT TOPICS
// ============================================================

function extractTopics(text: string): string[] {
  const keywords = text.toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 3);
  return keywords;
}

// ============================================================
// 📦 ANALYZE GROUP CONVERSATION
// ============================================================

function analyzeGroupConversation(
  context: GroupMessage[], 
  currentUser: User, 
  lang: 'fa' | 'en' | 'ar' = 'fa'
): string {
  if (context.length === 0) return "";
  
  const recentMessages = context.slice(-3);
  let analysis = "";
  
  const themes = recentMessages.flatMap(msg => extractTopics(msg.text));
  const commonTheme = themes.find((theme, index) => themes.indexOf(theme) !== index);
  
  if (commonTheme) {
    if (lang === 'fa') {
      analysis += `گروه در حال صحبت درباره ${commonTheme} است. `;
    } else if (lang === 'en') {
      analysis += `The group is discussing ${commonTheme}. `;
    } else {
      analysis += `المجموعة تناقش ${commonTheme}. `;
    }
  }
  
  const repliesTo = recentMessages.filter(msg => msg.replyToUser);
  if (repliesTo.length > 0) {
    if (lang === 'fa') {
      analysis += `گفتگوی فعالی بین ${repliesTo.map(msg => msg.userName).join(', ')} در جریان است. `;
    } else if (lang === 'en') {
      analysis += `There's an active conversation between ${repliesTo.map(msg => msg.userName).join(', ')}. `;
    } else {
      analysis += `هناك محادثة نشطة بين ${repliesTo.map(msg => msg.userName).join(', ')}. `;
    }
  }
  
  if (currentUser && currentUser.id) {
    const userMessages = recentMessages.filter(msg => msg.userId === currentUser.id);
    if (userMessages.length > 0) {
      if (lang === 'fa') {
        analysis += `${currentUser.first_name} اخیراً گفت: "${userMessages[userMessages.length - 1].text.substring(0, 50)}...". `;
      } else if (lang === 'en') {
        analysis += `${currentUser.first_name} recently said: "${userMessages[userMessages.length - 1].text.substring(0, 50)}...". `;
      } else {
        analysis += `${currentUser.first_name} قال مؤخراً: "${userMessages[userMessages.length - 1].text.substring(0, 50)}...". `;
      }
    }
  }
  
  return analysis;
}

// ============================================================
// 📦 GET GROUP CONTEXT
// ============================================================

function getGroupContext(chatId: number): GroupMessage[] {
  const cached = groupContextCache.get(chatId);
  if (!cached) return [];
  
  const now = Date.now();
  const validMessages = cached.messages
    .filter(msg => now - msg.timestamp < 20 * 60 * 1000)
    .slice(-config.GROUP_CONTEXT_MESSAGES * 2);
  
  if (groupContextCache.size > 100) {
    const oldestChatId = Array.from(groupContextCache.entries())
      .sort((a, b) => a[1].lastCleanup - b[1].lastCleanup)[0][0];
    groupContextCache.delete(oldestChatId);
  }
  
  if (validMessages.length !== cached.messages.length) {
    groupContextCache.set(chatId, { messages: validMessages, lastCleanup: now });
  }
  
  return validMessages.slice(-config.GROUP_CONTEXT_MESSAGES);
}

// ============================================================
// 📦 ADD TO HISTORY
// ============================================================

function addToHistory(
  history: HistoryItem[], 
  role: MessageRole, 
  parts: Part[], 
  timestamp?: number
): void {
  const validParts = parts.filter(part => part.text || part.inline_data);
  
  history.push({ 
    role, 
    parts: validParts,
    timestamp: timestamp || Date.now()
  });

  if (history.length > config.HISTORY_LIMIT) {
    const excess = history.length - config.HISTORY_LIMIT;
    history.splice(1, excess);
  }
}

// ============================================================
// 📦 CLEANUP HISTORY
// ============================================================

function cleanupHistory(history: HistoryItem[]): void {
  const MAX_TOKENS_ESTIMATE = 15000;
  const MIN_KEEP = 3;

  if (history.length <= config.HISTORY_LIMIT + 1) {
    let totalChars = 0;
    for (const item of history) {
      totalChars += item.parts.reduce((sum, part) => sum + (part.text?.length || 0), 0);
    }
    if (totalChars <= MAX_TOKENS_ESTIMATE) return;
  }

  const system = history[0];
  
  while (history.length - 1 > Math.max(config.HISTORY_LIMIT, MIN_KEEP)) {
    history.splice(1, 1);
  }

  let totalChars = history.reduce((acc, item) => 
    acc + item.parts.reduce((sum, p) => sum + (p.text?.length || 0), 0), 0);
  
  while (totalChars > MAX_TOKENS_ESTIMATE && history.length > 2) {
    const removed = history.splice(1, 1)[0];
    totalChars -= removed.parts.reduce((sum, p) => sum + (p.text?.length || 0), 0);
  }
}

// ============================================================
// 📦 CHECK AND RESET DAILY LIMITS
// ============================================================

function checkAndResetDailyLimits(session: ChatSession): void {
  const now = Date.now();
  const lastReset = session.dailyLimits.lastReset || 0;
  
  if (now - lastReset > 24 * 60 * 60 * 1000) {
    session.dailyLimits.messages = 0;
    session.dailyLimits.voicesSent = 0;
    session.dailyLimits.voicesReceived = 0;
    session.dailyLimits.imagesGenerated = 0;
    session.dailyLimits.lastReset = now;
  }
}

// ============================================================
// 📦 INCREMENT DAILY USAGE
// ============================================================

function incrementDailyUsage(session: ChatSession, type: 'message' | 'voice_sent' | 'voice_received'): void {
  switch (type) {
    case 'message':
      session.dailyLimits.messages++;
      break;
    case 'voice_sent':
      session.dailyLimits.voicesSent++;
      break;
    case 'voice_received':
      session.dailyLimits.voicesReceived++;
      break;
  }
}

// ============================================================
// 📦 CHECK DAILY LIMIT
// ============================================================

function checkDailyLimit(session: ChatSession, type: 'message' | 'voice_sent' | 'voice_received' | 'image'): { allowed: boolean; message?: string } {
  if (session.vipStatus || session.id === config.BOT_OWNER_ID) {
    return { allowed: true };
  }
  
  const limits = {
    message: 100,
    voice_sent: 10,
    voice_received: 10,
    image: 20
  };
  
  const currentUsage = {
    message: session.dailyLimits.messages,
    voice_sent: session.dailyLimits.voicesSent,
    voice_received: session.dailyLimits.voicesReceived,
    image: session.dailyLimits.imagesGenerated,
  };
  
  const limit = limits[type];
  const usage = currentUsage[type];
  
  if (usage >= limit) {
    const messages = {
      message: `⚠️ **محدودیت روزانه**\n\nشما امروز ${limit} پیام ارسال کرده‌اید.\n\n🌟 برای دسترسی نامحدود، نسخه VIP را فعال کنید.`,
      voice_sent: `⚠️ **محدودیت روزانه**\n\nشما امروز ${limit} ویس ارسال کرده‌اید.\n\n🌟 برای دسترسی نامحدود، نسخه VIP را فعال کنید.`,
      voice_received: `⚠️ **محدودیت روزانه**\n\nشما امروز ${limit} ویس دریافت کرده‌اید.\n\n🌟 برای دسترسی نامحدود، نسخه VIP را فعال کنید.`,
      image: `⚠️ **محدودیت روزانه**\n\nشما امروز ${limit} تصویر ساخته‌اید.\n\n🌟 برای دسترسی نامحدود، نسخه VIP را فعال کنید.`
    };
    
    return { 
      allowed: false, 
      message: messages[type] + `\n\n👑 برای ارتقا به VIP با @Hamid_Ai_pro تماس بگیرید.`
    };
  }
  
  return { allowed: true };
}

// ============================================================
// 📦 GET VIP UPGRADE KEYBOARD
// ============================================================

function getVIPUpgradeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "👑 ارتقا به VIP", callback_data: "upgrade_vip" }
      ]
    ]
  };
}

// ============================================================
// 📦 SHOULD RESPOND IN GROUP
// ============================================================

function shouldRespondInGroup(message: Message, session: ChatSession): boolean {
  const text = message.text || message.caption || "";
  const botUsername = BOT_INFO?.username || 'nova';
  const lowerText = text.toLowerCase();
  
  const atMention = text.includes(`@${botUsername}`) ||
                    (message.entities?.some(e => 
                      e.type === 'mention' && 
                      text.substring(e.offset, e.offset + e.length)
                          .toLowerCase().includes(botUsername.toLowerCase())
                    ) ?? false);
  
  const textualMention = lowerText.includes('nova') || lowerText.includes('نوا') || lowerText.includes('نووا');
  
  let isReply = false;
  if (message.reply_to_message) {
    const repliedUser = message.reply_to_message.from;
    if (repliedUser && repliedUser.is_bot === true) {
      isReply = true;
    }
  }
  
  return (atMention || textualMention || isReply);
}

// ============================================================
// 📦 CAN PROCESS CONCURRENT REQUEST
// ============================================================

function canProcessConcurrentRequest(chatId: number, requestId: string): boolean {
  if (!activeRequests.has(chatId)) {
    activeRequests.set(chatId, new Set());
  }
  
  const chatRequests = activeRequests.get(chatId)!;
  
  const now = Date.now();
  const expiredRequests = Array.from(chatRequests).filter(
    req => now - req.timestamp > 120000
  );

  expiredRequests.forEach(req => {
    logger.warn(`🧹 Cleaning expired request: ${req.id} (age: ${Math.floor((now - req.timestamp)/1000)}s)`);
    chatRequests.delete(req);
  });
  
  const totalActive = Array.from(activeRequests.values()).reduce((sum, set) => sum + set.size, 0);
  
  if (totalActive >= config.MAX_CONCURRENT_REQUESTS) {
    logger.warn(`❌ Global limit reached: ${totalActive}/${config.MAX_CONCURRENT_REQUESTS}`);
    return false;
  }
  if (chatRequests.size >= 3) {
    logger.warn(`❌ Chat ${chatId} limit: ${chatRequests.size}/3`);
    return false;
  }  
  chatRequests.add({ id: requestId, timestamp: now });
  return true;
}

// ============================================================
// 📦 RELEASE REQUEST
// ============================================================

function releaseRequest(chatId: number, requestId: string): void {
  const chatRequests = activeRequests.get(chatId);
  if (chatRequests) {
    for (const req of chatRequests) {
      if (req.id === requestId) {
        chatRequests.delete(req);
        break;
      }
    }
    if (chatRequests.size === 0) {
      activeRequests.delete(chatId);
    }
  }
}

// ============================================================
// 📦 IS USER ADMIN
// ============================================================

async function isUserAdmin(userId: number, chatId: number): Promise<boolean> {
  try {
    if (userId === config.BOT_OWNER_ID) return true;
    
    const member = await callTelegramAPI("getChatMember", {
      chat_id: chatId,
      user_id: userId
    });
    
    return member.status === "creator" || member.status === "administrator";
  } catch (error) {
    logger.warn(`Failed to check admin status for user ${userId}`, error);
    return false;
  }
}

// ============================================================
// 📦 GET USER BUCKET
// ============================================================

function getUserBucket(userId: number, isVip: boolean): TokenBucket {
  if (!userBuckets.has(userId)) {
    const bucket = new TokenBucket(
      isVip ? 50 : 20,
      isVip ? 10 : 2
    );
    userBuckets.set(userId, bucket);
  }
  return userBuckets.get(userId)!;
}

// ============================================================
// 📦 IS KEY DISABLED
// ============================================================

async function isKeyDisabled(apiKey: string, env: Env): Promise<boolean> {
  const now = Date.now();

  if (now - lastDisabledKeysFetch > 60000) {
    try {
      if (env.SESSIONS) {
        const data = await env.SESSIONS.get(
          "disabled_api_keys",
          "json"
        );

        if (data) {
          globalDisabledKeys = data as Record<string, number>;
        }
      } else {
        console.error("SESSIONS KV not found");
      }

      lastDisabledKeysFetch = now;
    } catch (e) {
      console.error("isKeyDisabled error:", e);
    }
  }

  const unlockTime = globalDisabledKeys[apiKey];

  if (unlockTime && now < unlockTime) {
    return true;
  }

  return false;
}

// ============================================================
// 📦 DISABLE API KEY
// ============================================================

function disableApiKey(apiKey: string, env: Env) {
  globalDisabledKeys[apiKey] = Date.now() + (6 * 60 * 60 * 1000);

  env.SESSIONS.put(
    "disabled_api_keys",
    JSON.stringify(globalDisabledKeys)
  ).catch(()=>{});

  logger.warn(`🚫 API Key disabled for 6 hours due to quota limits.`);
}

// ============================================================
// 📦 IS CF KEY DISABLED
// ============================================================

function isCFKeyDisabled(accountId: string, token: string): boolean {
  return false;
}

// ============================================================
// 📦 DISABLE CF KEY
// ============================================================

function disableCFKey(accountId: string, token: string) {
  logger.warn(`🚫 Cloudflare Key temporarily disabled: ${accountId}`);
}

// ============================================================
// 📦 DETECT ERROR TYPE
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

interface ErrorInfo {
  type: ErrorType;
  icon: string;
  title: string;
  userMessage: string;
  debugInfo?: string;
}

function detectErrorType(error: Error): ErrorType {
  const msg = error.message.toLowerCase();
  if (msg.includes('high demand') || msg.includes('spikes in demand') || msg.includes('overloaded') || msg.includes('capacity')) return ErrorType.SERVER;
  if (msg.includes('expired') || msg.includes('منقضی')) return ErrorType.AUTH;
  if (msg.includes('leaked') || msg.includes('لو رفته')) return ErrorType.AUTH;
  if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('429') || msg.includes('محدودیت')) return ErrorType.QUOTA;
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('مسدود') || msg.includes('content filter')) return ErrorType.BLOCKED;
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('احراز')) return ErrorType.AUTH;
  if (msg.includes('empty') || msg.includes('خالی') || msg.includes('no content')) return ErrorType.EMPTY;
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('زمان')) return ErrorType.TIMEOUT;
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('520') || msg.includes('internal server') || msg.includes('bad gateway')) return ErrorType.SERVER;
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('اتصال') || msg.includes('failed to fetch')) return ErrorType.NETWORK;
  if (msg.includes('file') || msg.includes('download') || msg.includes('فایل')) return ErrorType.FILE;
  if (msg.includes('voice') || msg.includes('transcribe') || msg.includes('ویس')) return ErrorType.VOICE;
  if (msg.includes('image') || msg.includes('photo') || msg.includes('تصویر')) return ErrorType.IMAGE;
  return ErrorType.UNKNOWN;
}

function formatUserFriendlyErrorNew(error: Error, lang: 'fa' | 'en' | 'ar' = 'fa'): ErrorInfo {
  const errorType = detectErrorType(error);
  const translations = TRANSLATIONS[lang] || TRANSLATIONS['fa'];
  const errorMap = {
    [ErrorType.TIMEOUT]: { icon: '⏱️', msg: translations.err_timeout || 'زمان پاسخگویی تمام شد' },
    [ErrorType.NETWORK]: { icon: '🌐', msg: translations.err_network || 'مشکل در اتصال شبکه' },
    [ErrorType.QUOTA]:   { icon: '📊', msg: translations.err_quota || 'محدودیت سهمیه' },
    [ErrorType.BLOCKED]: { icon: '🛡️', msg: translations.err_blocked || 'محتوا مسدود شد' },
    [ErrorType.AUTH]:    { icon: '🔑', msg: translations.err_auth || 'مشکل احراز هویت' },
    [ErrorType.EMPTY]:   { icon: '📭', msg: translations.err_empty || 'پاسخ خالی دریافت شد' },
    [ErrorType.SERVER]:  { icon: '🔥', msg: translations.err_network || 'مشکل سرور' },
    [ErrorType.VOICE]:   { icon: '🎤', msg: translations.err_voice || 'خطا در پردازش صدا' },
    [ErrorType.IMAGE]:   { icon: '🖼️', msg: translations.err_image || 'خطا در پردازش تصویر' },
    [ErrorType.FILE]:    { icon: '📎', msg: translations.err_network || 'مشکل در فایل' },
    [ErrorType.UNKNOWN]: { icon: '⚠️', msg: translations.err_unknown || 'خطای ناشناخته' }
  };
  const info = errorMap[errorType] || errorMap[ErrorType.UNKNOWN];
  return {
    type: errorType,
    icon: info.icon,
    title: translations.err_title || 'خطا',
    userMessage: info.msg,
    debugInfo: error.message
  };
}

function createErrorMessage(errorInfo: ErrorInfo, showDebug: boolean = false): string {
  let message = `${errorInfo.icon} **${errorInfo.title}**\n\n${errorInfo.userMessage}`;
  if (showDebug && errorInfo.debugInfo) message += `\n\n🔧 Debug: \`${errorInfo.debugInfo.substring(0, 100)}\``;
  return message;
}

// ============================================================
// 📦 EXTRACT TOOL JSON
// ============================================================

function extractToolJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================================
// 📦 EXECUTE TOOL FROM AGENT
// ============================================================

async function executeToolFromAgent(toolName: string, args: any, chatId: number, messageId: number, env: Env) {
  if (toolName === 'generate_image') {
    const prompt = args.prompt || args.query;
    if (!prompt) return "❌ پرامپت خالی";
    const model = config.AI_IMAGE_MODELS[0];
    try {
      const imgBuffer = await generateImageWithCloudflare(prompt, model, env);
      await sendPhoto(chatId, imgBuffer, `🎨 ${prompt}`, { reply_to_message_id: messageId });
      return "تصویر ساخته و ارسال شد.";
    } catch (e) {
      return `خطا: ${e.message}`;
    }
  } else if (toolName === 'search_images') {
    const query = args.query;
    if (!query) return "❌ عبارت خالی";
    const images = await searchPixabayImages(query, 3);
    if (!images.length) return "تصویری یافت نشد.";
    for (let img of images) await sendPhoto(chatId, img, undefined, { reply_to_message_id: messageId });
    return `${images.length} تصویر ارسال شد.`;
  }
  return `ابزار ناشناخته: ${toolName}`;
}



// ============================================================
// 📦 GET RANDOM TYPING EMOJI
// ============================================================

const TYPING_EMOJIS = ['💭', '🤔', '✨', '⚡', '🌟'];

function getRandomTypingEmoji() {
  return TYPING_EMOJIS[Math.floor(Math.random() * TYPING_EMOJIS.length)];
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۸: Telegram API Wrappers
// ============================================================

// ============================================================
// 📞 CALL TELEGRAM API
// ============================================================

async function callTelegramAPI(method: string, params: Record<string, any>): Promise<any> {
  const maxRetries = 3;
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(`${API_URL}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        if (result.description?.includes("message is not modified")) {
          return true;
        }

        if (result.error_code === 429) {
          const retryAfter = result.parameters?.retry_after || 1;
          if (attempt < maxRetries) {
            if (retryAfter > 5) logger.warn(`Rate limited, retrying after ${retryAfter}s`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
        }
        
        throw new Error(`Telegram API Error (${result.error_code}): ${result.description}`);
      }
      
      return result.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries && (lastError.message.includes('timeout') || lastError.message.includes('network') || lastError.message.includes('fetch'))) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      break;
    }
  }
  
  if (!lastError!.message.includes("message is not modified")) {
      logger.error(`API Call Failed: ${method}`, lastError!);
  }
  throw lastError!;
}

// ============================================================
// 📤 SEND MESSAGE
// ============================================================

async function sendMessage(chatId: number, text: string, options: Record<string, any> = {}): Promise<Message | null> {
  const params: any = {
    chat_id: chatId,
    text: String(text).substring(0, 4096),
    parse_mode: "Markdown",
    ...options
  };
  if (options.reply_markup) params.reply_markup = options.reply_markup;
  if (options.reply_to_message_id) params.reply_to_message_id = options.reply_to_message_id;
  
  try {
    const result = await callTelegramAPI("sendMessage", params);
    return result;
  } catch (error: any) {
    if (error.message?.includes("can't parse entities")) {
      delete params.parse_mode;
      const result2 = await callTelegramAPI("sendMessage", params);
      return result2;
    }
    if (error.message?.includes("403")) {
      logger.warn(`Cannot send to ${chatId}: blocked`);
      return null;
    }
    throw error;
  }
}

// ============================================================
// 📤 SEND PHOTO
// ============================================================

async function sendPhoto(chatId: number, photo: string | Uint8Array, caption?: string, options: Record<string, any> = {}): Promise<Message> {
  if (typeof photo === 'string' && (photo.startsWith("http://") || photo.startsWith("https://"))) {
    const params: Record<string, any> = { chat_id: chatId, photo: photo, ...options };
    if (caption) params.caption = caption.substring(0, 1024);
    return await callTelegramAPI("sendPhoto", params);
  }
  
  const formData = new FormData();
  formData.append("chat_id", chatId.toString());
  
  if (photo instanceof Uint8Array) {
    formData.append("photo", new Blob([photo], { type: "image/png" }), "generated_image.png");
  } else if (typeof photo === 'string') {
    const binaryData = Uint8Array.from(atob(photo), c => c.charCodeAt(0));
    formData.append("photo", new Blob([binaryData], { type: "image/png" }), "generated_image.png");
  }
  
  if (caption) formData.append("caption", caption.substring(0, 1024));
  Object.entries(options).forEach(([key, value]) => {
    if (key !== 'photo' && key !== 'caption' && key !== 'chat_id') {
      formData.append(key, String(value));
    }
  });
  
  const response = await fetchWithTimeout(`${API_URL}/sendPhoto`, { method: "POST", body: formData });
  const result = await response.json();
  if (!result.ok) throw new Error(`Telegram API Error: ${result.description}`);
  return result.result;
}

// ============================================================
// 📤 SEND VOICE
// ============================================================

async function sendVoice(chatId: number, voice: Blob | Uint8Array, caption?: string, options: Record<string, any> = {}): Promise<Message> {
  const formData = new FormData();
  formData.append("chat_id", chatId.toString());
  
  if (voice instanceof Blob) {
    formData.append("voice", voice, "voice.ogg");
  } else if (voice instanceof Uint8Array) {
    formData.append("voice", new Blob([voice], { type: "audio/ogg" }), "voice.ogg");
  }
  
  if (caption) formData.append("caption", caption.substring(0, 1024));
  Object.entries(options).forEach(([key, value]) => {
    if (key !== 'voice' && key !== 'caption' && key !== 'chat_id') {
      formData.append(key, String(value));
    }
  });
  
  const response = await fetchWithTimeout(`${API_URL}/sendVoice`, { method: "POST", body: formData });
  const result = await response.json();
  if (!result.ok) throw new Error(`Telegram API Error: ${result.description}`);
  return result.result;
}

// ============================================================
// 📤 SEND ANIMATION (GIF)
// ============================================================

async function sendAnimation(chatId: number, animation: string, caption?: string, options: Record<string, any> = {}): Promise<Message> {
  const params: Record<string, any> = {
    chat_id: chatId,
    animation: animation,
    ...options
  };
  if (caption) params.caption = caption.substring(0, 1024);
  return await callTelegramAPI("sendAnimation", params);
}

// ============================================================
// 📤 SEND DOCUMENT
// ============================================================

async function sendDocument(chatId: number, document: Blob | string, caption?: string, fileName?: string, options: Record<string, any> = {}): Promise<Message> {
  if (typeof document === 'string' && (document.startsWith("http://") || document.startsWith("https://"))) {
    const params: Record<string, any> = { chat_id: chatId, document: document, ...options };
    if (caption) params.caption = caption.substring(0, 1024);
    return await callTelegramAPI("sendDocument", params);
  }
  
  const formData = new FormData();
  formData.append("chat_id", chatId.toString());
  
  if (document instanceof Blob) {
    formData.append("document", document, fileName || "document.txt");
  } else if (document instanceof Uint8Array) {
    formData.append("document", new Blob([document]), fileName || "document.txt");
  }
  
  if (caption) formData.append("caption", caption.substring(0, 1024));
  Object.entries(options).forEach(([key, value]) => {
    if (key !== 'document' && key !== 'caption' && key !== 'chat_id') {
      formData.append(key, String(value));
    }
  });
  
  const response = await fetchWithTimeout(`${API_URL}/sendDocument`, { method: "POST", body: formData });
  const result = await response.json();
  if (!result.ok) throw new Error(`Telegram API Error: ${result.description}`);
  return result.result;
}

// ============================================================
// 📤 EDIT MESSAGE TEXT
// ============================================================

async function editMessageText(chatId: number, messageId: number, text: string, options: Record<string, any> = {}): Promise<void> {  
  const params: any = {
    chat_id: chatId,
    message_id: messageId,
    text: String(text).substring(0, 4096),
    ...options
  };

  if (params.parse_mode === undefined) {
    params.parse_mode = "Markdown";
  }

  try {
    await callTelegramAPI("editMessageText", params);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMsg = err.message || '';

    if (errorMsg.includes("not modified") || errorMsg.includes("exactly the same")) {
      return;
    }

    if (errorMsg.includes("can't parse entities") || errorMsg.includes("Markdown")) {
      delete params.parse_mode; 
      try {
        await callTelegramAPI("editMessageText", params);
      } catch (retryError) {
        logger.warn(`Failed to edit message ${messageId} even without markdown: ${(retryError as Error).message}`);
      }
    } else {
      logger.warn(`Failed to edit message ${messageId}: ${errorMsg}`);
    }
  }
}

// ============================================================
// 📤 EDIT MESSAGE REPLY MARKUP
// ============================================================

async function editMessageReplyMarkup(chatId: number, messageId: number, replyMarkup: any): Promise<void> {
  try {
    await callTelegramAPI("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: JSON.stringify(replyMarkup)
    });
  } catch (error) {
    logger.warn(`Failed to edit reply markup for message ${messageId}`, error);
  }
}

// ============================================================
// 📤 DELETE MESSAGE
// ============================================================

async function deleteMessage(chatId: number, messageId: number): Promise<void> {
  try {
    await callTelegramAPI("deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch (error) {
    logger.warn(`Failed to delete message ${messageId}`, (error as any)?.message);
  }
}

// ============================================================
// 📤 SEND TYPING ACTION
// ============================================================

async function sendTypingAction(chatId: number): Promise<void> {
  if (!chatId) return;
  callTelegramAPI("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

// ============================================================
// 📤 SEND VOICE ACTION
// ============================================================

async function sendVoiceAction(chatId: number): Promise<void> {
  if (!chatId) return;
  callTelegramAPI("sendChatAction", { chat_id: chatId, action: "record_voice" }).catch(() => {});
}

// ============================================================
// 📤 SEND UPLOAD PHOTO ACTION
// ============================================================

async function sendUploadPhotoAction(chatId: number): Promise<void> {
  if (!chatId) return;
  callTelegramAPI("sendChatAction", { chat_id: chatId, action: "upload_photo" }).catch(() => {});
}

// ============================================================
// 📤 ANSWER CALLBACK QUERY
// ============================================================

async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<void> {
  try {
    await callTelegramAPI("answerCallbackQuery", { 
      callback_query_id: callbackQueryId, 
      text: text?.substring(0, 200), 
      show_alert: showAlert 
    });
  } catch (error) {
    logger.warn("Failed to answer callback query", (error as any)?.message);
  }
}

// ============================================================
// 📤 SEND STREAMING RESPONSE (با تایپینگ و ایموجی)
// ============================================================

async function sendStreamingResponse(
  chatId: number,
  replyToMsgId: number,
  fullText: string,
  existingMsgId?: number
): Promise<void> {
  let msgId = existingMsgId;

  await sendTypingAction(chatId).catch(() => {});

  if (!msgId) {
    const emoji = getRandomTypingEmoji();
    const initMsg = await sendMessage(chatId, `${emoji} بزار بگم...`, {
      reply_to_message_id: replyToMsgId,
    }).catch(() => null);

    if (!initMsg) {
      await sendMessage(chatId, fullText, { reply_to_message_id: replyToMsgId }).catch(() => {});
      return;
    }
    msgId = initMsg.message_id;
  }

  const chunks = splitMessage(fullText, 4000);
  const firstChunk = chunks[0];

  if (firstChunk.length > 200) {
    const step1 = firstChunk.substring(0, Math.floor(firstChunk.length * 0.40));
    const step2 = firstChunk.substring(0, Math.floor(firstChunk.length * 0.75));

    const cleanTyping = (text: string) => text.replace(/[*_`\[\]]/g, '') + " ▒";

    await editMessageText(chatId, msgId, cleanTyping(step1), { parse_mode: undefined }).catch(() => {});
    await new Promise(r => setTimeout(r, 250));

    await editMessageText(chatId, msgId, cleanTyping(step2), { parse_mode: undefined }).catch(() => {});
    await new Promise(r => setTimeout(r, 250));
  }

  await editMessageText(chatId, msgId, sanitizeMarkdown(firstChunk), {
    parse_mode: 'Markdown'
  }).catch(async () => {
    await editMessageText(chatId, msgId!, sanitizePlainText(firstChunk), { parse_mode: undefined }).catch(() => {});
  });

  for (let i = 1; i < chunks.length; i++) {
    await new Promise(r => setTimeout(r, 300));
    await sendMessage(chatId, sanitizeMarkdown(chunks[i]), { parse_mode: 'Markdown' }).catch(() => {});
  }
}

// ============================================================
// 📤 SEND WITH TYPING (با تاخیر)
// ============================================================

async function sendWithTyping(
  chatId: number, 
  text: string, 
  delay: number = 100,
  options: Record<string, any> = {}
): Promise<Message> {
  await sendTypingAction(chatId).catch(() => {});
  
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  return await sendMessage(chatId, text, options);
}

// ============================================================
// 📤 FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 20000): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;
  
  const finalOptions = { ...options, signal };

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, finalOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================
// 📤 GET FILE URL
// ============================================================

async function getFileUrl(fileId: string): Promise<string> {
  const res = await callTelegramAPI("getFile", { file_id: fileId });
  if (!res.file_path) {
    throw new Error("file_path not found in response");
  }
  return `https://api.telegram.org/file/bot${config.TOKEN}/${res.file_path}`;
}

// ============================================================
// 📤 SET MESSAGE REACTION (ریاکشن)
// ============================================================

async function setMessageReaction(chatId: number, messageId: number, reaction: string): Promise<void> {
  try {
    await callTelegramAPI("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji: reaction }]
    });
  } catch (error) {
    logger.warn(`Failed to set reaction ${reaction} on message ${messageId}:`, error);
  }
}

// ============================================================
// 📤 GET CHAT MEMBER
// ============================================================

async function getChatMember(chatId: number, userId: number): Promise<any> {
  try {
    return await callTelegramAPI("getChatMember", {
      chat_id: chatId,
      user_id: userId
    });
  } catch (error) {
    logger.warn(`Failed to get chat member ${userId} in ${chatId}`, error);
    return null;
  }
}

// ============================================================
// 📤 LEAVE CHAT
// ============================================================

async function leaveChat(chatId: number): Promise<void> {
  try {
    await callTelegramAPI("leaveChat", { chat_id: chatId });
    logger.info(`✅ Left chat ${chatId}`);
  } catch (error) {
    logger.warn(`Failed to leave chat ${chatId}`, error);
  }
}

// ============================================================
// 📤 BAN CHAT MEMBER
// ============================================================

async function banChatMember(chatId: number, userId: number, untilDate?: number): Promise<void> {
  try {
    await callTelegramAPI("banChatMember", {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate
    });
    logger.info(`✅ Banned user ${userId} in chat ${chatId}`);
  } catch (error) {
    logger.warn(`Failed to ban user ${userId} in chat ${chatId}`, error);
  }
}

// ============================================================
// 📤 UNBAN CHAT MEMBER
// ============================================================

async function unbanChatMember(chatId: number, userId: number): Promise<void> {
  try {
    await callTelegramAPI("unbanChatMember", {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true
    });
    logger.info(`✅ Unbanned user ${userId} in chat ${chatId}`);
  } catch (error) {
    logger.warn(`Failed to unban user ${userId} in chat ${chatId}`, error);
  }
}

// ============================================================
// 📤 GET CHAT
// ============================================================

async function getChat(chatId: number): Promise<any> {
  try {
    return await callTelegramAPI("getChat", { chat_id: chatId });
  } catch (error) {
    logger.warn(`Failed to get chat ${chatId}`, error);
    return null;
  }
}

// ============================================================
// 📤 GET CHAT MEMBERS COUNT
// ============================================================

async function getChatMembersCount(chatId: number): Promise<number> {
  try {
    const result = await callTelegramAPI("getChatMembersCount", { chat_id: chatId });
    return result || 0;
  } catch (error) {
    logger.warn(`Failed to get chat members count for ${chatId}`, error);
    return 0;
  }
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۹: Handle Start & New Commands
// ============================================================

// ============================================================
// 🏠 HANDLE START COMMAND - نسخه کامل با پنل و ویس
// ============================================================

async function handleStartCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from) return;

  // چک کردن Maintenance Mode
  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, { reply_to_message_id: message.message_id });
    return;
  }

  const isGroup = chat.type === "group" || chat.type === "supergroup";
  
  // بررسی وجود سشن قبلی
  const hasExistingSession = await env.SESSIONS.get(`session:${chat.id}`, "json") !== null;
  const session = await getOrCreateSession(chat, from, env);
  const isNewUser = !hasExistingSession && session.statistics.totalMessages === 0;

  // ============================================================
  // 📋 کیبورد انتخاب زبان برای کاربر جدید
  // ============================================================
  const langKeyboard = {
    inline_keyboard: [
      [
        { text: "🇮🇷 فارسی", callback_data: "set_lang_fa" },
        { text: "🇺🇸 English", callback_data: "set_lang_en" },
        { text: "🇸🇦 العربية", callback_data: "set_lang_ar" }
      ]
    ]
  };

  // ✅ کاربر کاملاً جدید - نمایش انتخاب زبان
  if (isNewUser && !isGroup) {
    await notifyAdminNewUser(from, env);
    await sendMessage(chat.id,
      `👋 **Welcome / خوش آمدید**\n\n` +
      `لطفاً زبان خود را انتخاب کنید:\n` +
      `Please select your language:\n` +
      `يرجى اختيار لغتك:`,
      { 
        reply_markup: JSON.stringify(langKeyboard), 
        reply_to_message_id: message.message_id 
      }
    );
    return;
  }

  // ✅ کاربر قدیمی بدون session (ریست شده)
  if (!hasExistingSession && !isGroup) {
    await sendMessage(chat.id,
      `🔄 **Welcome Back / خوش آمدید**\n\n` +
      `لطفاً زبان خود را انتخاب کنید:\n` +
      `Please select your language:\n` +
      `يرجى اختيار لغتك:`,
      { 
        reply_markup: JSON.stringify(langKeyboard), 
        reply_to_message_id: message.message_id 
      }
    );
    return;
  }

  // ✅ به‌روزرسانی دستورات
  await refreshUserCommands(chat.id, session);
  
  // ✅ نمایش پنل برای کاربران خصوصی
  if (!isGroup) {
    await showMainPanel(chat.id, message.message_id, session, env);
  } else {
    // برای گروه‌ها پیام خوش‌آمدگویی
    const welcomeText = t(session, 'welcome_group', { name: from.first_name });
    const keyboard = getStartKeyboard(true, session.language);
    
    await sendMessage(chat.id, welcomeText, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard)),
      reply_to_message_id: message.message_id
    });
  }
}

// ============================================================
// 🆕 HANDLE NEW COMMAND - پاک کردن حافظه
// ============================================================

async function handleNewCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from) return;

  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, { reply_to_message_id: message.message_id });
    return;
  }
  
  const session = await getOrCreateSession(chat, from, env);
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  const timestamp = Date.now();
  
  // ریست کردن حافظه
  const activeEngine = session.activeEngine;
  const userMemory = session.userMemories.get(from.id);

  if (activeEngine === 'gemini') {
    session.engines.gemini.history = [{ 
      role: "user", 
      parts: [{ text: getActivePrompt(session, from, isGroup) }], 
      timestamp, 
      userId: from.id, 
      userName: from.first_name
    }, { 
      role: "model", 
      parts: [{ text: "..." }], 
      timestamp 
    }];
    session.engines.gemini.userHistories.set(from.id, []);
  } else if (activeEngine === 'sambanova') {
    session.engines.sambanova.history = [{ 
      role: "assistant", 
      parts: [{ text: getActivePrompt(session, from, isGroup) }], 
      timestamp, 
      userId: from.id, 
      userName: from.first_name 
    }];
    session.engines.sambanova.userHistories.set(from.id, []);
  } else if (activeEngine === 'pollinations') {
    session.engines.pollinations.history = [{ 
      role: "assistant", 
      parts: [{ text: getActivePrompt(session, from, isGroup) }], 
      timestamp, 
      userId: from.id, 
      userName: from.first_name 
    }];
    session.engines.pollinations.userHistories.set(from.id, []);
  }
  
  session.messageCount = 0;
  
  await saveSessionWithLock(session, env);
  
  const engineName = getEngineName(session.activeEngine, session.language);
  let resetText = session.language === 'fa' 
    ? `🧠 **حافظه مکالمه پاک شد!**\n\nمدل فعال: **${engineName}**\n\nآماده برای گفتگوی جدید! 🚀`
    : `🧠 **Conversation memory cleared!**\n\nActive Model: **${engineName}**\n\nReady for a new topic! 🚀`;

  if (userMemory && userMemory.messageCount > 0) {
    resetText += session.language === 'fa' 
      ? `\n(حافظه شخصی شما محفوظ است)` 
      : `\n(Your personal memory is safe)`;
  }
  
  await sendMessage(chat.id, resetText, { 
    reply_to_message_id: message.message_id 
  });
}

// ============================================================
// 🔄 REFRESH USER COMMANDS - بروزرسانی منوی دستورات
// ============================================================

async function refreshUserCommands(chatId: number, session: ChatSession) {
  const lang = session.language || 'fa';
  try {
    await callTelegramAPI("deleteMyCommands", { scope: { type: "all_private_chats" } }).catch(() => {});
    
    const commands = lang === 'fa' ? [
      { command: "start", description: "🏠 صفحه اصلی" },
      { command: "new", description: "🆕 مکالمه جدید" },
      { command: "model", description: "🤖 تغییر مدل هوش مصنوعی" },
      { command: "img", description: "🎨 ساخت تصویر" },
      { command: "search", description: "🔍 جستجوی تصویر" },
      { command: "prompt", description: "✏️ شخصی‌سازی شخصیت" },
      { command: "language", description: "🌐 تغییر زبان" },
      { command: "help", description: "❓ راهنمای کامل" },
      { command: "voice", description: "🎤 منوی ویس" }
    ] : [
      { command: "start", description: "🏠 Home" },
      { command: "new", description: "🆕 New Chat" },
      { command: "model", description: "🤖 Change AI Model" },
      { command: "img", description: "🎨 Generate Image" },
      { command: "search", description: "🔍 Search Images" },
      { command: "prompt", description: "✏️ Customize Personality" },
      { command: "language", description: "🌐 Change Language" },
      { command: "help", description: "❓ Full Guide" },
      { command: "voice", description: "🎤 Voice Menu" }
    ];
    
    const finalCommands = [...commands];
    if (chatId === config.BOT_OWNER_ID) {
      if (lang === 'fa') {
        finalCommands.push(
          { command: "admin", description: "👑 پنل مدیریت" },
          { command: "log", description: "📋 لاگ‌ها" },
          { command: "blocked", description: "🚫 کاربران مسدود" },
          { command: "rebuild", description: "🔧 بازسازی دیتابیس" },
          { command: "keys", description: "🔑 وضعیت کلیدها" }
        );
      } else {
        finalCommands.push(
          { command: "admin", description: "👑 Admin Panel" },
          { command: "log", description: "📋 Logs" },
          { command: "blocked", description: "🚫 Blocked Users" },
          { command: "rebuild", description: "🔧 Rebuild Database" },
          { command: "keys", description: "🔑 API Keys Status" }
        );
      }
    }
    
    await callTelegramAPI("setMyCommands", { 
      commands: finalCommands, 
      scope: { type: "all_private_chats" } 
    });
    logger.info(`✅ Commands updated for ${lang} language - ${finalCommands.length} commands`);
  } catch (error) {
    logger.warn(`Failed to update commands`, error);
  }
}

// ============================================================
// 🎤 HANDLE VOICE COMMAND - منوی ویس
// ============================================================

async function handleVoiceCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from) return;

  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, { reply_to_message_id: message.message_id });
    return;
  }

  const session = await getOrCreateSession(chat, from, env);
  await showVoiceMenu(chat.id, message.message_id, session);
}

// ============================================================
// 🎤 HANDLE VOICE MESSAGE - تشخیص و پردازش ویس
// ============================================================

async function handleVoiceMessage(message: Message, env: Env, config: ReturnType<typeof createConfig>) {
  const { chat, from, voice } = message;
  if (!from || !voice) return;
  
  const session = await getOrCreateSession(chat, from, env);
  const isGroup = chat.type === "group" || chat.type === "supergroup";

  if (isGroup && !shouldRespondInGroup(message, session)) {
    return;
  }
  
  if (config.MAINTENANCE_MODE && from.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🛠️ **ربات در حال تعمیرات است.**\nلطفاً دقایقی دیگر تلاش کنید.", { 
      reply_to_message_id: message.message_id 
    });
    return;
  }

  const requestId = generateRequestId();
  
  if (!canProcessConcurrentRequest(chat.id, requestId)) {
    await sendMessage(chat.id, "🚦 سرور به شدت شلوغ است. لطفاً ۳۰ ثانیه دیگر پیام بدهید.", { 
      reply_to_message_id: message.message_id 
    });
    return;
  }
  
  let loadingMsg: Message | null = null;
  
  try {
    const lang = session.language || 'fa';
    
    if (config.GEMINI_KEYS.length === 0) {
      await sendMessage(chat.id, "❌ تشخیص گفتار در حال حاضر غیرفعال است.", { 
        reply_to_message_id: message.message_id 
      });
      return;
    }
    
    if (voice.file_size && voice.file_size > 10 * 1024 * 1024) {
      await sendMessage(chat.id, "⚠️ **حجم فایل بالاست!**\nحداکثر حجم مجاز برای پردازش صوت ۱۰ مگابایت است.", { 
        reply_to_message_id: message.message_id 
      });
      return;
    }
    
    const limitCheck = await checkDailyLimit(session, 'voice_sent');
    if (!limitCheck.allowed) {
      await sendMessage(chat.id, limitCheck.message!, { 
        reply_to_message_id: message.message_id 
      });
      return;
    }
    
    // 🎨 لودینگ ویس
    loadingMsg = await sendMessage(chat.id, 
      lang === 'fa' ? '🎤 **در حال دریافت صوت...**' : '🎤 **Fetching audio...**', 
      { reply_to_message_id: message.message_id }
    ).catch(() => null);
    
    await sendTypingAction(chat.id).catch(() => {});
    
    let fileUrl: string;
    try {
      fileUrl = await getFileUrl(voice.file_id);
    } catch (error) {
      const errMsg = lang === 'fa' ? '❌ خطا در دانلود فایل از سرور تلگرام.' : '❌ Could not fetch voice file.';
      if (loadingMsg) await editMessageText(chat.id, loadingMsg.message_id, errMsg).catch(() => {});
      return;
    }
    
    if (loadingMsg) {
      await editMessageText(chat.id, loadingMsg.message_id, 
        lang === 'fa' ? '🔊 **در حال استخراج متن از صدا...**' : '🔊 **Transcribing audio...**'
      ).catch(() => {});
    }
    
    let transcribedText: string;
    try {
      transcribedText = await transcribeVoiceWithGemini(fileUrl, config);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMsg = err.message.toLowerCase();
      
      let userMessage = lang === 'fa' ? '❌ **خطا در تشخیص صدا!**\n\n' : '❌ **Could not understand!**\n\n';
      
      if (errorMsg.includes('timeout') || errorMsg.includes('زمان')) {
        userMessage += lang === 'fa' ? '⏱️ زمان پردازش سرور تمام شد.' : '⏱️ Processing timed out.';
      } else {
        userMessage += lang === 'fa' ? '💡 لطفاً واضح‌تر صحبت کن یا از محیط خلوت‌تری ویس بده.' : '💡 Please speak clearly or re-record.';
      }
      
      if (loadingMsg) await editMessageText(chat.id, loadingMsg.message_id, userMessage).catch(() => {});
      return;
    }
    
    if (transcribedText.length < 2) {
      const errMsg = lang === 'fa' ? '🔇 صدایی تشخیص داده نشد. لطفاً واضح‌تر صحبت کن.' : '🔇 No speech detected. Please speak clearly.';
      if (loadingMsg) await editMessageText(chat.id, loadingMsg.message_id, errMsg).catch(() => {});
      return;
    }
    
    // 🎨 نمایش متن ویس
    const transcriptDisplay = lang === 'fa' 
      ? `🎙️ **شما گفتید:**\n_${transcribedText}_\n\n⏳ در حال بررسی...`
      : `🎙️ **You said:**\n_${transcribedText}_\n\n⏳ Processing...`;
    
    if (loadingMsg) {
      await editMessageText(chat.id, loadingMsg.message_id, transcriptDisplay).catch(() => {});
    }
    
    incrementDailyUsage(session, 'voice_sent');
    session.statistics.voicesReceived = (session.statistics.voicesReceived || 0) + 1;
    recordRequest(session);
    session.lastSeen = Date.now();
    
    // ارسال به هوش مصنوعی
    await processAIRequest(
      session, 
      from,
      [{ text: transcribedText }],
      loadingMsg || message,      
      env, 
      requestId
    );
    
  } catch (error) {
    logger.error("Voice processing failed", error);
    const lang = (await getOrCreateSession(chat, from, env).catch(() => ({ language: 'fa' as const }))).language;
    const errMsg = lang === 'fa'
      ? '❌ **خطای سیستمی!**\nدر حال حاضر پردازش ویس مقدور نیست. می‌تونی متن بفرستی.'
      : '❌ **System Error!**\nVoice processing failed. Try text instead.';
    
    if (loadingMsg) await editMessageText(chat.id, loadingMsg.message_id, errMsg).catch(() => {});
  } finally {
    releaseRequest(chat.id, requestId);
  }
}

// ============================================================
// 🎙️ TRANSCRIBE VOICE WITH GEMINI
// ============================================================

async function transcribeVoiceWithGemini(audioUrl: string, config: any): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  let lastError: Error | null = null;

  for (let i = 0; i < config.GEMINI_KEYS.length; i++) {
    const apiKey = config.GEMINI_KEYS[i];
    try {
      const audioResponse = await fetchWithTimeout(audioUrl, {}, 25000);
      const audioBuffer = await audioResponse.arrayBuffer();
      const base64Audio = arrayBufferToBase64(audioBuffer);
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${apiKey}`;
      
      const body = {
        contents: [{
          parts: [
            { text: "Please transcribe this audio accurately. If language is Persian, output in Persian. If English, output in English:" },
            { inline_data: { mime_type: "audio/ogg", data: base64Audio } }
          ]
        }]
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const data = await res.json();

      if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        clearTimeout(timeoutId);
        return data.candidates[0].content.parts[0].text.trim();
      }
      
      if (data.error?.code === 429) {
        console.warn(`Key ${i + 1} hit quota, trying next key...`);
        continue;
      }

      throw new Error(data.error?.message || "Unknown API error");
    } catch (error) {
      lastError = error as Error;
      if (i === config.GEMINI_KEYS.length - 1) break;
    }
  }

  clearTimeout(timeoutId);
  throw lastError || new Error("All Gemini keys failed");
}

// ============================================================
// 📢 NOTIFY ADMIN NEW USER
// ============================================================

async function notifyAdminNewUser(user: User, env: Env) {
  if (!config.BOT_OWNER_ID) return;
  
  const text = `🎉 **کاربر جدید!**\n\n` +
    `👤 نام: ${user.first_name}\n` +
    `🆔 آیدی: \`${user.id}\`\n` +
    `👤 یوزرنیم: ${user.username ? '@' + user.username : 'ندارد'}\n` +
    `🌐 زبان تلگرام: ${user.language_code || 'نامشخص'}\n` +
    `⏰ زمان: ${new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "👁️ مشاهده پروفایل", callback_data: `admin_user_${user.id}` },
        { text: "👑 VIP کردن", callback_data: `admin_toggle_vip_${user.id}` }
      ]
    ]
  };
  
  try {
    await sendMessage(config.BOT_OWNER_ID, text, {
      reply_markup: JSON.stringify(keyboard)
    });
    logger.info(`✅ Notified admin about new user: ${user.id}`);
  } catch (error) {
    logger.warn(`Failed to notify admin about new user ${user.id}`, error);
  }
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۱۰: Handle Callback Query (نسخه کامل)
// ============================================================

// ============================================================
// 📞 HANDLE CALLBACK QUERY - نسخه کامل با همه دکمه‌ها
// ============================================================

async function handleCallbackQuery(cb: CallbackQuery, env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    await answerCallbackQuery(cb.id).catch(() => {});
  } catch (e) {
    // خطای احتمالی را نادیده می‌گیریم
  }
  
  try {
    // ✅ Rate limiting برای callbacks
    const userId = cb.from.id;
    const now = Date.now();
    
    if (!callbackRateLimits.has(userId)) {
      callbackRateLimits.set(userId, []);
    }
    
    const userCallbacks = callbackRateLimits.get(userId)!;
    const recent = userCallbacks.filter(t => now - t < 10000);
    
    if (recent.length >= 15 && userId !== config.BOT_OWNER_ID) {
      await answerCallbackQuery(cb.id, "⏳ خیلی سریع! یکم صبر کن", true);
      return;
    }
    
    recent.push(now);
    callbackRateLimits.set(userId, recent);
    
    if (!cb.message || !cb.data) {
      await answerCallbackQuery(cb.id, "داده‌ای یافت نشد", true);
      return;
    }
    
    const chat = cb.message.chat;
    const user = cb.from;
    const data = cb.data;
    
    // ============================================================
// 🏠 MAIN PANEL - پنل اصلی (مطابق عکس)
// ============================================================

async function showMainPanel(chatId: number, messageId: number, session: ChatSession, env: Env): Promise<void> {
  const lang = session.language || 'fa';
  const isVip = session.vipStatus || false;
  
  // اسم کاربر
  let userFirstName = 'کاربر';
  if (session.userMemories) {
    const memories = session.userMemories instanceof Map 
      ? Array.from(session.userMemories.values()) 
      : Object.values(session.userMemories);
    if (memories.length > 0) {
      userFirstName = memories[0].firstName || 'کاربر';
    }
  }
  
  // شخصیت فعال
  const personalityKey = session.activePersonality || 'nova';
  const personality = PERSONALITIES[personalityKey];
  const personalityName = lang === 'fa' ? personality?.name_fa : personality?.name_en;
  const personalityEmoji = personality?.emoji || '🤖';
  const personalityDesc = lang === 'fa' ? personality?.desc_fa : personality?.desc_en;
  
  // آمار روزانه
  const daily = session.dailyLimits || { messages: 0, voicesSent: 0, voicesReceived: 0, imagesGenerated: 0 };
  const maxMessages = isVip ? '∞' : '50';
  const maxVoice = isVip ? '∞' : '7';
  const maxImages = isVip ? '∞' : '3';
  
  const text = lang === 'fa'
    ? `🌟 **مرکز فرماندهی نوا**\n\n` +
      `نسخه Beta 0.9.93 هسته هوشمند\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 **کاربر:** ${isVip ? '👑 ' : '🆓 '}${userFirstName}\n` +
      `🎭 **شخصیت فعال:** ${personalityEmoji} ${personalityName || 'نوا'} — ${personalityDesc || 'دستیار هوشمند'}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 **سهمیه و مصرف روزانه شما:**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💬 ${daily.messages || 0}/${maxMessages} پیام\n` +
      `🎤 ${daily.voicesSent || 0}/${maxVoice} ویس\n` +
      `🖼️ ${daily.imagesGenerated || 0}/${maxImages} تصویر\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ **یکی از گزینه‌های زیر را انتخاب کنید:**`
    : `🌟 **Nova Command Center**\n\n` +
      `Beta v0.9.93 Smart Core\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 **User:** ${isVip ? '👑 ' : '🆓 '}${userFirstName}\n` +
      `🎭 **Active Personality:** ${personalityEmoji} ${personalityName || 'Nova'} — ${personalityDesc || 'Smart Assistant'}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 **Your Daily Usage:**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💬 ${daily.messages || 0}/${maxMessages} messages\n` +
      `🎤 ${daily.voicesSent || 0}/${maxVoice} voice\n` +
      `🖼️ ${daily.imagesGenerated || 0}/${maxImages} images\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ **Choose an option below:**`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: lang === 'fa' ? '🎭 تغییر شخصیت' : '🎭 Change Personality', callback_data: 'personality_menu' },
        { text: lang === 'fa' ? '🆕 گفتگوی جدید' : '🆕 New Chat', callback_data: 'new_chat_confirm' }
      ],
      [
        { text: lang === 'fa' ? '✏️ پرامپت سفارشی' : '✏️ Custom Prompt', callback_data: 'custom_prompt_menu' },
        { text: lang === 'fa' ? '🌐 تغییر زبان' : '🌐 Change Language', callback_data: 'language_menu' }
      ],
      [
        { text: lang === 'fa' ? '🎤 منوی ویس' : '🎤 Voice Menu', callback_data: 'voice_menu' },
        { text: lang === 'fa' ? '📖 راهنما' : '📖 Help', callback_data: 'open_help' }
      ],
      [
        { text: lang === 'fa' ? '👑 ارتقا به VIP' : '👑 Upgrade to VIP', callback_data: 'upgrade_vip' }
      ],
      [
        { text: lang === 'fa' ? '❌ بستن منو' : '❌ Close Menu', callback_data: 'close_panel' }
      ]
    ]
  };
  
  if (messageId) {
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  } else {
    await sendMessage(chatId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  }
}
    
    // ============================================================
    // 🎭 شخصیت‌ها (9 شخصیت)
    // ============================================================
    
    if (data === 'personality_menu') {
      const session = await getOrCreateSession(chat, user, env);
      await showPersonalityMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data.startsWith('set_personality_')) {
      const session = await getOrCreateSession(chat, user, env);
      const personalityKey = data.replace('set_personality_', '');
      const personality = PERSONALITIES[personalityKey];
      
      if (!personality) {
        await answerCallbackQuery(cb.id, '❌ شخصیت یافت نشد', true);
        return;
      }
      
      session.activePersonality = personalityKey;
      await saveSessionWithLock(session, env);
      
      const lang = session.language || 'fa';
      const name = lang === 'fa' ? personality.name_fa : lang === 'en' ? personality.name_en : personality.name_ar;
      const emoji = personality.emoji;
      
      await answerCallbackQuery(cb.id, `✅ شخصیت ${emoji} ${name} فعال شد!`, false);
      await showMainPanel(chat.id, cb.message.message_id, session, env);
      return;
    }
    
    // ============================================================
    // 📞 INFO PERSONALITY - نمایش اطلاعات شخصیت
    // ============================================================
    
    if (data.startsWith('info_')) {
      const personalityKey = data.replace('info_', '');
      const personality = PERSONALITIES[personalityKey];
      
      if (!personality) {
        await answerCallbackQuery(cb.id, '❌ شخصیت یافت نشد', true);
        return;
      }
      
      const session = await getOrCreateSession(chat, user, env);
      const lang = session?.language || 'fa';
      
      const name = lang === 'fa' ? personality.name_fa : lang === 'en' ? personality.name_en : personality.name_ar;
      const desc = lang === 'fa' ? personality.desc_fa : lang === 'en' ? personality.desc_en : personality.desc_ar;
      const emoji = personality.emoji;
      
      const femalePersonalities = ['nova', 'lilith', 'victoria', 'aria', 'luna', 'zara'];
      const voiceType = femalePersonalities.includes(personalityKey) ? '👧 زن' : '👦 مرد';
      
      const infoText = lang === 'fa'
        ? `${emoji} **${name}**\n\n` +
          `📝 **توضیحات:**\n${desc}\n\n` +
          `🎤 **نوع صدا:** ${voiceType}\n\n` +
          `💡 **ویژگی‌ها:**\n` +
          `• لحن خاص و منحصر به فرد\n` +
          `• رفتار متناسب با شخصیت\n` +
          `• پاسخ‌های هوشمندانه\n\n` +
          `🔽 برای فعال‌سازی، روی نام شخصیت کلیک کن.`
        : `${emoji} **${name}**\n\n` +
          `📝 **Description:**\n${desc}\n\n` +
          `🎤 **Voice Type:** ${voiceType}\n\n` +
          `💡 **Features:**\n` +
          `• Unique tone and style\n` +
          `• Appropriate behavior\n` +
          `• Smart responses\n\n` +
          `🔽 Click the personality name to activate.`;
      
      await answerCallbackQuery(cb.id);
      await editMessageText(chat.id, cb.message!.message_id, infoText, {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { 
                text: lang === 'fa' ? '🔙 بازگشت به شخصیت‌ها' : '🔙 Back to Personalities', 
                callback_data: 'personality_menu' 
              }
            ]
          ]
        })
      });
      return;
    }
    
    // ============================================================
    // 🌐 زبان
    // ============================================================
    
    if (data === 'language_menu') {
      const session = await getOrCreateSession(chat, user, env);
      await showLanguageMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data.startsWith('set_lang_')) {
      const lang = data.replace('set_lang_', '') as 'fa' | 'en' | 'ar';
      const session = await getOrCreateSession(chat, user, env);
      
      session.language = lang;
      session.settings.languageSet = true;
      
      // به‌روزرسانی پرامپت‌ها
      const engines: AIEngine[] = ['gemini', 'sambanova', 'pollinations'];
      const timestamp = Date.now();
      
      engines.forEach(e => {
        const hist = session.engines[e].history;
        if (hist.length > 0) {
          const newPrompt = buildDefaultPrompt(
            e, 
            user.first_name, 
            chat.type !== 'private', 
            session.userMemories.get(user.id), 
            undefined, 
            lang
          );
          hist[0].parts[0].text = newPrompt;
          hist[0].timestamp = timestamp;
        }
      });
      
      await saveSessionWithLock(session, env, true);
      
      if (chat.type === "private") {
        await refreshUserCommands(chat.id, session);
      }
      
      const langName = lang === 'fa' ? 'فارسی' : lang === 'en' ? 'English' : 'العربية';
      const langEmoji = lang === 'fa' ? '🇮🇷' : lang === 'en' ? '🇺🇸' : '🇸🇦';
      
      await answerCallbackQuery(cb.id, `✅ زبان به ${langName} ${langEmoji} تغییر یافت`, false);
      await showMainPanel(chat.id, cb.message.message_id, session, env);
      return;
    }
    
    // ============================================================
    // 👑 VIP
    // ============================================================
    
    if (data === 'upgrade_vip') {
      const session = await getOrCreateSession(chat, user, env);
      await showUpgradeVIP(chat.id, cb.message.message_id, session);
      return;
    }
    
    // ============================================================
    // ✏️ پرامپت سفارشی
    // ============================================================
    
    if (data === 'custom_prompt_menu') {
      const session = await getOrCreateSession(chat, user, env);
      await showCustomPromptMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data === 'reset_prompt_all') {
      const session = await getOrCreateSession(chat, user, env);
      session.customPrompts.gemini = null;
      session.customPrompts.sambanova = null;
      session.customPrompts.pollinations = null;
      await saveSessionWithLock(session, env);
      await answerCallbackQuery(cb.id, '✅ همه پرامپت‌ها پاک شدند', false);
      await showCustomPromptMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data === 'reset_prompt_gemini') {
      const session = await getOrCreateSession(chat, user, env);
      session.customPrompts.gemini = null;
      await saveSessionWithLock(session, env);
      await answerCallbackQuery(cb.id, '✅ پرامپت نوا پاک شد', false);
      await showCustomPromptMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data === 'reset_prompt_sambanova') {
      const session = await getOrCreateSession(chat, user, env);
      session.customPrompts.sambanova = null;
      await saveSessionWithLock(session, env);
      await answerCallbackQuery(cb.id, '✅ پرامپت لونا پاک شد', false);
      await showCustomPromptMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data === 'reset_prompt_pollinations') {
      const session = await getOrCreateSession(chat, user, env);
      session.customPrompts.pollinations = null;
      await saveSessionWithLock(session, env);
      await answerCallbackQuery(cb.id, '✅ پرامپت زارا پاک شد', false);
      await showCustomPromptMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    // ============================================================
    // 🆕 گفتگوی جدید
    // ============================================================
    
    if (data === 'new_chat_confirm') {
      const session = await getOrCreateSession(chat, user, env);
      await showNewChatConfirm(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data === 'confirm_new_chat') {
      const session = await getOrCreateSession(chat, user, env);
      const isGroup = chat.type === "group" || chat.type === "supergroup";
      const timestamp = Date.now();
      const activeEngine = session.activeEngine;
      
      if (activeEngine === 'gemini') {
        session.engines.gemini.history = [{ 
          role: "user", 
          parts: [{ text: getActivePrompt(session, user, isGroup) }], 
          timestamp, 
          userId: user.id, 
          userName: user.first_name
        }, { 
          role: "model", 
          parts: [{ text: "..." }], 
          timestamp 
        }];
        session.engines.gemini.userHistories.set(user.id, []);
      } else if (activeEngine === 'sambanova') {
        session.engines.sambanova.history = [{ 
          role: "assistant", 
          parts: [{ text: getActivePrompt(session, user, isGroup) }], 
          timestamp, 
          userId: user.id, 
          userName: user.first_name 
        }];
        session.engines.sambanova.userHistories.set(user.id, []);
      } else if (activeEngine === 'pollinations') {
        session.engines.pollinations.history = [{ 
          role: "assistant", 
          parts: [{ text: getActivePrompt(session, user, isGroup) }], 
          timestamp, 
          userId: user.id, 
          userName: user.first_name 
        }];
        session.engines.pollinations.userHistories.set(user.id, []);
      }
      
      session.messageCount = 0;
      await saveSessionWithLock(session, env);
      
      await answerCallbackQuery(cb.id, '✅ حافظه پاک شد!', false);
      await showMainPanel(chat.id, cb.message.message_id, session, env);
      return;
    }
    
    // ============================================================
    // 📖 راهنما
    // ============================================================
    
    if (data === 'open_help') {
      const session = await getOrCreateSession(chat, user, env);
      await handleHelpCommand(cb.message!, env, cb.message!.message_id);
      return;
    }
    
    if (data === 'close_help') {
      await deleteMessage(chat.id, cb.message.message_id);
      return;
    }
    
    // ============================================================
    // 🎤 منوی ویس
    // ============================================================
    
    if (data === 'voice_menu') {
      const session = await getOrCreateSession(chat, user, env);
      await showVoiceMenu(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data === 'voice_personalities') {
      const session = await getOrCreateSession(chat, user, env);
      await showVoicePersonalities(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data === 'help_voice') {
      await showVoiceHelp(cb, env);
      return;
    }
    
    // ============================================================
    // 🤖 مدل‌ها
    // ============================================================
    
    if (data === 'model_settings') {
      const session = await getOrCreateSession(chat, user, env);
      await answerCallbackQuery(cb.id);
      await updateModelSelection(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data.startsWith('set_model_')) {
      const session = await getOrCreateSession(chat, user, env);
      const engine = data.replace('set_model_', '') as AIEngine;
      await handleModelSwitch(session, engine, cb, env);
      return;
    }
    
    if (data === 'active_model_settings') {
      const session = await getOrCreateSession(chat, user, env);
      await answerCallbackQuery(cb.id);
      await sendActiveModelSettings(chat.id, cb.message.message_id, session, env);
      return;
    }
    
    if (data.startsWith('show_model_list_')) {
      const engine = data.replace('show_model_list_', '') as AIEngine;
      await answerCallbackQuery(cb.id);
      setModelListState(chat.id, engine, { page: 0, perPage: 8, totalPages: 0 });
      await showModelSelection(chat.id, cb.message.message_id, engine, false, env);
      return;
    }
    
    if (data.startsWith('refresh_models_')) {
      const engine = data.replace('refresh_models_', '') as AIEngine;
      await answerCallbackQuery(cb.id, '🔄 در حال بروزرسانی...', false);
      const cacheKey = `model_cache:${engine}`;
      await env.SESSIONS.delete(cacheKey);
      logger.info(`🗑️ Deleted old cache for ${engine}`);
      setModelListState(chat.id, engine, { page: 0, perPage: 8, totalPages: 0 });
      await showModelSelection(chat.id, cb.message.message_id, engine, true, env);
      return;
    }
    
    if (data.startsWith('model_page_prev_')) {
      const engine = data.replace('model_page_prev_', '') as AIEngine;
      const state = getModelListState(chat.id, engine);
      state.page = Math.max(0, state.page - 1);
      setModelListState(chat.id, engine, state);
      await answerCallbackQuery(cb.id);
      await showModelSelection(chat.id, cb.message.message_id, engine, false, env);
      return;
    }
    
    if (data.startsWith('model_page_next_')) {
      const engine = data.replace('model_page_next_', '') as AIEngine;
      const state = getModelListState(chat.id, engine);
      state.page++;
      setModelListState(chat.id, engine, state);
      await answerCallbackQuery(cb.id);
      await showModelSelection(chat.id, cb.message.message_id, engine, false, env);
      return;
    }
    
    if (data === 'model_page_noop') {
      await answerCallbackQuery(cb.id);
      return;
    }
    
    if (data.startsWith('select_model_')) {
      const parts = data.replace('select_model_', '').split('_');
      const engine = parts[0] as AIEngine;
      const modelIndex = parseInt(parts[1]);
      
      if (isNaN(modelIndex)) {
        await answerCallbackQuery(cb.id, "❌ خطا در انتخاب", true);
        return;
      }
      
      const session = await getOrCreateSession(chat, user, env);
      session.engines[engine].modelIndex = modelIndex;
      await saveSessionWithLock(session, env, true);
      
      const modelCache = await getModelsWithCache(engine, env, false);
      const selectedModel = modelCache.models[modelIndex];
      
      await answerCallbackQuery(cb.id, `✅ مدل ${selectedModel?.name || 'Unknown'} انتخاب شد`, false);
      await sendActiveModelSettings(chat.id, cb.message.message_id, session, env);
      return;
    }
    
    if (data === 'model_already_selected') {
      await answerCallbackQuery(cb.id, "✅ این مدل الان فعاله", false);
      return;
    }
    
    // ============================================================
    // 👥 گروه‌ها
    // ============================================================
    
    if (data === 'group_settings') {
      const session = await getOrCreateSession(chat, user, env);
      await answerCallbackQuery(cb.id);
      await updateGroupSettings(chat.id, cb.message.message_id, session);
      return;
    }
    
    if (data.startsWith('group_mode_')) {
      const session = await getOrCreateSession(chat, user, env);
      const mode = data.replace('group_mode_', '');
      await handleGroupModeSwitch(session, mode, cb, env);
      return;
    }
    
    if (data === 'toggle_typing') {
      const session = await getOrCreateSession(chat, user, env);
      session.settings.typingIndicator = !session.settings.typingIndicator;
      await saveSessionWithLock(session, env);
      await answerCallbackQuery(cb.id, `نشانگر تایپ: ${session.settings.typingIndicator ? 'فعال' : 'غیرفعال'}`, false);
      await updateGroupSettings(chat.id, cb.message.message_id, session);
      return;
    }
    
    // ============================================================
    // 📊 پنل ادمین
    // ============================================================
    
    if (data === 'open_admin') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "⏳ در حال بارگذاری...", false);
      
      adminPanelStates.set(chat.id, {
        page: 0,
        perPage: 5,
        sortBy: 'new'
      });
      
      await updateAdminPanel(chat.id, cb.message!.message_id, env);
      return;
    }
    
    if (data === 'admin_back_to_main') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id);
      await updateAdminPanel(chat.id, cb.message!.message_id, env);
      return;
    }
    
    if (data === 'admin_refresh') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "🔄 در حال بروزرسانی...", false);
      try {
        sessionCache.clear();
        await updateAdminPanel(chat.id, cb.message.message_id, env);
      } catch (error) {
        logger.error("Admin refresh failed", error);
        await answerCallbackQuery(cb.id, "❌ خطا در بروزرسانی", true);
      }
      return;
    }
    
    if (data === 'admin_close') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id);
      await deleteMessage(chat.id, cb.message.message_id);
      adminPanelStates.delete(chat.id);
      return;
    }
    
    if (data === 'admin_page_prev') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const state = adminPanelStates.get(chat.id) || { page: 0, perPage: 5, sortBy: 'new' };
      state.page = Math.max(0, state.page - 1);
      adminPanelStates.set(chat.id, state);
      await answerCallbackQuery(cb.id);
      await updateAdminPanel(chat.id, cb.message.message_id, env);
      return;
    }
    
    if (data === 'admin_page_next') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const state = adminPanelStates.get(chat.id) || { page: 0, perPage: 5, sortBy: 'new' };
      const allUsers = await getAllUserStatistics(env);
      const maxPage = Math.ceil(allUsers.length / state.perPage) - 1;
      state.page = Math.min(maxPage, state.page + 1);
      adminPanelStates.set(chat.id, state);
      await answerCallbackQuery(cb.id);
      await updateAdminPanel(chat.id, cb.message.message_id, env);
      return;
    }
    
    if (data === 'admin_sort_new' || data === 'admin_sort_active' || data === 'admin_sort_messages') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const state = adminPanelStates.get(chat.id) || { page: 0, perPage: 5, sortBy: 'new' };
      state.sortBy = data.replace('admin_sort_', '') as 'new' | 'active' | 'messages';
      state.page = 0;
      adminPanelStates.set(chat.id, state);
      await answerCallbackQuery(cb.id, `✅ مرتب‌سازی تغییر کرد`, false);
      await updateAdminPanel(chat.id, cb.message.message_id, env);
      return;
    }
    
    if (data === 'admin_noop') {
      await answerCallbackQuery(cb.id);
      return;
    }
    
    if (data === 'admin_toggle_maintenance') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const currentKvMode = await env.SESSIONS.get("maintenance_mode", "text");
      const isCurrentlyInMaintenance = currentKvMode === "true";
      const newMode = !isCurrentlyInMaintenance;
      
      await env.SESSIONS.put("maintenance_mode", String(newMode));
      config.MAINTENANCE_MODE = newMode;
      maintenanceModeCache = { value: newMode, timestamp: Date.now() };
      
      const statusMsg = newMode ? '🛠️ حالت تعمیرات **فعال** شد' : '✅ حالت تعمیرات **غیرفعال** شد';
      await answerCallbackQuery(cb.id, statusMsg, false);
      await updateAdminPanel(chat.id, cb.message.message_id, env);
      return;
    }
    
    if (data === 'admin_export_csv') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "📊 در حال آماده‌سازی CSV...", false);
      await exportCSV(chat.id, env);
      return;
    }
    
    if (data === 'admin_show_blocked') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id);
      
      const blockedUsers = await getBlockedUsers(env);
      
      let blockedText = `🚫 **کاربران مسدود (${blockedUsers.length})**\n\n`;
      
      if (blockedUsers.length === 0) {
        blockedText += `هیچ کاربری مسدود نشده است.`;
      } else {
        for (const blocked of blockedUsers.slice(0, 20)) {
          const sinceDate = new Date(blocked.since).toLocaleDateString('fa-IR', {
            month: 'short',
            day: 'numeric'
          });
          
          blockedText += `🆔 \`${blocked.userId}\`\n`;
          blockedText += `📅 از: ${sinceDate}\n`;
          blockedText += `📝 دلیل: ${blocked.reason}\n\n`;
        }
        
        if (blockedUsers.length > 20) {
          blockedText += `➕ ... و ${blockedUsers.length - 20} کاربر دیگر`;
        }
      }
      
      await editMessageText(chat.id, cb.message.message_id, blockedText, {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: "🔙 بازگشت", callback_data: "admin_back_to_main" }]
          ]
        })
      });
      return;
    }
    
    if (data === 'admin_broadcast') {
      await handleBroadcastCallback(cb, env);
      return;
    }
    
    if (data.startsWith('admin_user_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const rawId = data.replace('admin_user_', '');
      if (!/^\d+$/.test(rawId)) {
        await answerCallbackQuery(cb.id, "❌ شناسه نامعتبر", true);
        return;
      }
      
      const targetUserId = parseInt(rawId);
      await answerCallbackQuery(cb.id);
      await showUserDetail(chat.id, cb.message.message_id, targetUserId, env);
      return;
    }
    
    if (data.startsWith('admin_toggle_vip_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const targetUserId = parseInt(data.replace('admin_toggle_vip_', ''));
      const sessionKey = `session:${targetUserId}`;
      const stored = await env.SESSIONS.get(sessionKey, "json");
      
      if (!stored) {
        await answerCallbackQuery(cb.id, "❌ کاربر یافت نشد", true);
        return;
      }
      
      const userSession = stored as ChatSession;
      userSession.vipStatus = !userSession.vipStatus;
      await env.SESSIONS.put(sessionKey, JSON.stringify(userSession));
      
      await answerCallbackQuery(cb.id, userSession.vipStatus ? "✅ VIP فعال شد" : "❌ VIP حذف شد", false);
      
      try {
        if (userSession.vipStatus) {
          await sendMessage(targetUserId, 
            `🎉 **تبریک!**\n\nاکانت شما به VIP ارتقا یافت! 👑\n\nاز تمام امکانات بدون محدودیت استفاده کنید! 🚀`
          );
        } else {
          await sendMessage(targetUserId, 
            `📢 **اطلاعیه**\n\nVIP شما غیرفعال شد.\n\n👑 برای تمدید با @Hamid_Ai_pro تماس بگیرید.`
          );
        }
      } catch (e) {
        logger.warn(`Could not notify user ${targetUserId}`);
      }
      
      await showUserDetail(chat.id, cb.message.message_id, targetUserId, env);
      return;
    }
    
    if (data.startsWith('admin_block_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const targetUserId = parseInt(data.replace('admin_block_', ''));
      const isCurrentlyBlocked = await isUserBlocked(targetUserId, env);
      
      if (isCurrentlyBlocked) {
        await setUserBlocked(targetUserId, false, env);
        await answerCallbackQuery(cb.id, "✅ مسدودیت برداشته شد", false);
        
        try {
          await sendMessage(targetUserId, 
            `✅ **رفع مسدودیت**\n\nحساب شما آزاد شد! می‌تونید دوباره از ربات استفاده کنید. 🎉`
          );
        } catch (e) {
          logger.warn(`Could not notify user ${targetUserId} about unblock`);
        }
      } else {
        await setUserBlocked(targetUserId, true, env);
        await answerCallbackQuery(cb.id, "🚫 کاربر مسدود شد", false);
        
        try {
          await sendMessage(targetUserId, 
            `🚫 **مسدودیت**\n\nحساب شما توسط مدیر مسدود شد.\n\n📞 برای رفع مسدودیت با @Hamid_Ai_pro تماس بگیرید.`
          );
        } catch (e) {
          logger.warn(`Could not notify user ${targetUserId} about block`);
        }
      }
      
      await showUserDetail(chat.id, cb.message.message_id, targetUserId, env);
      return;
    }
    
    if (data.startsWith('admin_msg_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const targetUserId = parseInt(data.replace('admin_msg_', ''));
      const allUsers = await getAllUserStatistics(env);
      const targetUser = allUsers.find(u => u.userId === targetUserId);
      
      if (!targetUser) {
        await answerCallbackQuery(cb.id, "❌ کاربر یافت نشد", true);
        return;
      }
      
      broadcastStates.set(chat.id, { mode: 'specific', userId: targetUserId });
      
      await answerCallbackQuery(cb.id);
      await editMessageText(chat.id, cb.message.message_id, 
        `📨 **ارسال پیام خصوصی**\n\n🎯 گیرنده: ${targetUser.firstName} (@${targetUser.userName})\n🆔 آیدی: \`${targetUserId}\`\n\nپیام خود را بفرستید:\n\n⚠️ برای لغو \`/cancel\` بفرستید.`
      );
      return;
    }
    
    if (data.startsWith('admin_view_memory_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const targetUserId = parseInt(data.replace('admin_view_memory_', ''));
      await answerCallbackQuery(cb.id, "🧠 در حال بارگذاری حافظه...", false);
      await showUserMemory(chat.id, cb.message!.message_id, targetUserId, env);
      return;
    }
    
    if (data.startsWith('admin_download_memory_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const targetUserId = parseInt(data.replace('admin_download_memory_', ''));
      await answerCallbackQuery(cb.id, "📥 در حال آماده‌سازی...", false);
      
      try {
        const sessionKey = `session:${targetUserId}`;
        const stored = await env.SESSIONS.get(sessionKey, "json");
        
        if (!stored) {
          await answerCallbackQuery(cb.id, "❌ سشن یافت نشد", true);
          return;
        }
        
        const userSession = stored as ChatSession;
        const allUsers = await getAllUserStatistics(env);
        const targetUser = allUsers.find(u => u.userId === targetUserId);
        const userName = targetUser?.firstName || 'Unknown';
        
        let memoryText = `🧠 حافظه کامل کاربر: ${userName}\n`;
        memoryText += `🆔 User ID: ${targetUserId}\n`;
        memoryText += `📅 تاریخ: ${new Date().toLocaleString('fa-IR')}\n`;
        memoryText += `${'='.repeat(60)}\n\n`;
        
        memoryText += `📊 آمار کلی:\n`;
        memoryText += `• کل پیام‌ها: ${userSession.messageCount}\n`;
        memoryText += `• موتور فعال: ${getEngineName(userSession.activeEngine, 'fa')}\n`;
        memoryText += `• آخرین فعالیت: ${formatSafeDate(userSession.lastSeen, 'full')}\n`;
        memoryText += `• زبان: ${userSession.language === 'fa' ? 'فارسی' : 'انگلیسی'}\n\n`;
        
        const engines: AIEngine[] = ['gemini', 'sambanova', 'pollinations'];
        
        for (const engineName of engines) {
          const engine = userSession.engines[engineName];
          const history = engine.history || [];
          
          if (history.length === 0) continue;
          
          memoryText += `\n${'='.repeat(60)}\n`;
          memoryText += `🤖 موتور: ${getEngineName(engineName, 'fa')} (${history.length} پیام)\n`;
          memoryText += `${'='.repeat(60)}\n\n`;
          
          history.forEach((item, index) => {
            const roleLabel = item.role === 'user' ? 'کاربر' : 
                             item.role === 'model' ? 'نوا' : 
                             item.role === 'assistant' ? 'هوش مصنوعی' : 'سیستم';
            
            const timestamp = item.timestamp ? 
              new Date(item.timestamp).toLocaleString('fa-IR') : 'نامشخص';
            
            const messageText = item.parts[0]?.text || '[رسانه یا محتوای خاص]';
            
            memoryText += `[${index + 1}] ${roleLabel} - ${timestamp}\n`;
            memoryText += `${'-'.repeat(40)}\n`;
            memoryText += `${messageText}\n\n`;
          });
        }
        
        memoryText += `\n${'='.repeat(60)}\n`;
        memoryText += `✏️ پرامپت‌های شخصی\n`;
        memoryText += `${'='.repeat(60)}\n\n`;
        
        if (userSession.customPrompts.gemini) {
          memoryText += `نوا: ${userSession.customPrompts.gemini}\n\n`;
        }
        if (userSession.customPrompts.sambanova) {
          memoryText += `لونا: ${userSession.customPrompts.sambanova}\n\n`;
        }
        if (userSession.customPrompts.pollinations) {
          memoryText += `زارا: ${userSession.customPrompts.pollinations}\n\n`;
        }
        
        const blob = new Blob([memoryText], { type: "text/plain; charset=utf-8" });
        const formData = new FormData();
        formData.append("chat_id", chat.id.toString());
        formData.append("document", blob, `memory_${userName}_${targetUserId}_${Date.now()}.txt`);
        formData.append("caption", `🧠 حافظه کامل ${userName}\n🆔 ${targetUserId}`);
        
        await fetchWithTimeout(`${API_URL}/sendDocument`, {
          method: "POST",
          body: formData
        });
        
        await answerCallbackQuery(cb.id, "✅ فایل ارسال شد", false);
        
      } catch (error) {
        logger.error(`Failed to download memory for ${targetUserId}`, error);
        await answerCallbackQuery(cb.id, "❌ خطا در دانلود", true);
      }
      return;
    }
    
    if (data.startsWith('admin_confirm_reset_memory_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const targetUserId = parseInt(data.replace('admin_confirm_reset_memory_', ''));
      
      await answerCallbackQuery(cb.id);
      await editMessageText(chat.id, cb.message!.message_id, 
        `⚠️ **تایید ریست حافظه**\n\nآیا مطمئنید می‌خواهید تمام حافظه کاربر \`${targetUserId}\` را پاک کنید؟\n\n⚠️ این عمل غیرقابل بازگشت است!`,
        {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                { text: "✅ بله، ریست شود", callback_data: `admin_do_reset_memory_${targetUserId}` },
                { text: "❌ لغو", callback_data: `admin_view_memory_${targetUserId}` }
              ]
            ]
          })
        }
      );
      return;
    }
    
    if (data.startsWith('admin_do_reset_memory_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const targetUserId = parseInt(data.replace('admin_do_reset_memory_', ''));
      await answerCallbackQuery(cb.id, "🗑️ در حال ریست...", false);
      await resetUserMemory(chat.id, cb.message!.message_id, targetUserId, env);
      return;
    }
    
    if (data === 'admin_show_groups') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id);
      await showActiveGroups(chat.id, cb.message.message_id, env);
      return;
    }
    
    if (data === 'admin_show_logs') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id);
      await showLogs(chat.id, cb.message.message_id, env);
      return;
    }
    
    // ============================================================
    // 📋 لاگ‌ها
    // ============================================================
    
    if (data === 'log_clear') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      (globalThis as any).recentLogs = [];
      await answerCallbackQuery(cb.id, "✅ لاگ‌ها پاک شدند", false);
      await showLogs(chat.id, cb.message.message_id, env);
      return;
    }
    
    if (data === 'log_download') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "📥 در حال آماده‌سازی...", false);
      
      const logs = (globalThis as any).recentLogs || [];
      if (logs.length === 0) {
        await answerCallbackQuery(cb.id, "📭 لاگی برای دانلود وجود ندارد", true);
        return;
      }
      
      const logText = logs.map((l: any) => 
        `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${l.message}\n${l.context ? JSON.stringify(l.context, null, 2) : ''}\n`
      ).join('\n');
      
      const blob = new Blob([logText], { type: "text/plain; charset=utf-8" });
      const formData = new FormData();
      formData.append("chat_id", chat.id.toString());
      formData.append("document", blob, `nova_logs_${Date.now()}.txt`);
      formData.append("caption", "📋 **گزارش کامل لاگ‌های ربات**");
      
      await fetchWithTimeout(`${API_URL}/sendDocument`, {
        method: "POST",
        body: formData
      });
      return;
    }
    
    if (data === 'log_refresh' || data === 'log_errors' || data === 'log_warnings') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const logs = (globalThis as any).recentLogs || [];
      
      if (logs.length === 0) {
        await answerCallbackQuery(cb.id, "📭 هیچ لاگی ثبت نشده است.", true);
        return;
      }
      
      let text = `📊 **لاگ‌های زنده سرور**\n\n`;
      let targetLogs = logs;
      
      if (data === 'log_errors') targetLogs = logs.filter((l: any) => l.level === 'error');
      if (data === 'log_warnings') targetLogs = logs.filter((l: any) => l.level === 'warn');
      
      if (targetLogs.length === 0) {
        await answerCallbackQuery(cb.id, `در این دسته‌بندی لاگی وجود ندارد.`, true);
        return;
      }
      
      targetLogs.slice(-15).forEach((log: any) => {
        const time = new Date(log.timestamp).toLocaleTimeString('fa-IR');
        const icon = log.level === 'error' ? '🔴' : log.level === 'warn' ? '🟡' : '🟢';
        text += `${icon} \`${time}\`\n${log.message.substring(0, 100)}\n\n`;
      });
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: "🔴 خطاها", callback_data: "log_errors" },
            { text: "🟡 هشدارها", callback_data: "log_warnings" },
            { text: "🟢 همه", callback_data: "log_refresh" }
          ],
          [
            { text: "📥 دانلود فایل", callback_data: "log_download" },
            { text: "🗑️ پاکسازی", callback_data: "log_clear" }
          ],
          [
            { text: "❌ بستن", callback_data: "admin_close" }
          ]
        ]
      };
      
      await answerCallbackQuery(cb.id, "✅ لاگ‌ها بروز شدند", false);
      await editMessageText(chat.id, cb.message!.message_id, text, {
        reply_markup: JSON.stringify(validateKeyboard(keyboard))
      });
      return;
    }
    
    // ============================================================
    // 📊 دیتابیس
    // ============================================================
    
    if (data === 'db_auto_clean') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "🧹 در حال پاکسازی...", false);
      await cleanupSessions(env);
      await sendDatabaseStats(chat.id, cb.message!.message_id, env);
      return;
    }
    
    if (data === 'db_delete_old') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id);
      await editMessageText(chat.id, cb.message!.message_id,
        `⚠️ **حذف سشن‌های قدیمی**\n\nآیا می‌خواهید تمام سشن‌های غیرفعال بیش از 30 روز حذف شوند؟\n\n⚠️ این عمل غیرقابل بازگشت است!`,
        {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                { text: "✅ بله، حذف شوند", callback_data: "db_confirm_delete_old" },
                { text: "❌ لغو", callback_data: "db_refresh_stats" }
              ]
            ]
          })
        }
      );
      return;
    }
    
    if (data === 'db_confirm_delete_old') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "🗑️ در حال حذف...", false);
      
      try {
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        let deleted = 0;
        
        let allKeys: any[] = [];
        let listResult = await env.SESSIONS.list({ prefix: "session:" });
        allKeys.push(...listResult.keys);
        while (!listResult.list_complete && listResult.cursor) {
          listResult = await env.SESSIONS.list({ prefix: "session:", cursor: listResult.cursor });
          allKeys.push(...listResult.keys);
        }
        
        for (const item of allKeys) {
          try {
            const stored = await env.SESSIONS.get(item.name, "json");
            if (!stored) continue;
            
            const session = stored as ChatSession;
            if (session.lastSeen < thirtyDaysAgo) {
              await env.SESSIONS.delete(item.name);
              deleted++;
            }
          } catch (error) {}
        }
        
        await editMessageText(chat.id, cb.message!.message_id,
          `✅ حذف انجام شد!\n\n🗑️ ${deleted} سشن حذف شد.\n\n📊 برای مشاهده آمار جدید /dbstats بزنید`
        );
      } catch (error) {
        await editMessageText(chat.id, cb.message!.message_id, "❌ خطا در حذف");
      }
      return;
    }
    
    if (data === 'db_refresh_stats') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "🔄 در حال بروزرسانی...", false);
      await sendDatabaseStats(chat.id, cb.message!.message_id, env);
      return;
    }
    
    // ============================================================
    // 🎯 Help sections
    // ============================================================
    
    if (data === 'help_chat') {
      await showHelpChat(cb, env);
      return;
    }
    
    if (data === 'help_images') {
      await showHelpImages(cb, env);
      return;
    }
    
    if (data === 'help_models') {
      await showHelpModels(cb, env);
      return;
    }
    
    if (data === 'help_customize') {
      await showHelpCustomize(cb, env);
      return;
    }
    
    if (data === 'help_commands') {
      await showHelpCommands(cb, env);
      return;
    }
    
    if (data === 'help_settings') {
      await showHelpSettings(cb, env);
      return;
    }
    
    if (data === 'help_back') {
      await handleHelpCommand(cb.message!, env, cb.message!.message_id);
      return;
    }
    
    // ============================================================
    // 📢 Broadcast
    // ============================================================
    
    if (data === 'broadcast_all' || data === 'broadcast_vip' || data === 'broadcast_free') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const mode = data.replace('broadcast_', '') as 'all' | 'vip' | 'free';
      broadcastStates.set(chat.id, { mode });
      
      await answerCallbackQuery(cb.id);
      await editMessageText(chat.id, cb.message.message_id, 
        `📝 **ارسال پیام به ${mode === 'all' ? 'همه' : mode === 'vip' ? 'VIP ها' : 'رایگان‌ها'}**\n\nپیام خود را بفرستید:\n\n⚠️ برای لغو \`/cancel\` بفرستید.`
      );
      return;
    }
    
    if (data === 'broadcast_status') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      const jobData = await env.SESSIONS.get('broadcast_job:current', 'json') as BroadcastJob | null;
      if (!jobData) {
        await answerCallbackQuery(cb.id, "❌ هیچ job فعالی وجود ندارد", true);
        return;
      }
      
      const pct = Math.round((jobData.processedIndex / jobData.totalUsers) * 100);
      const stMap: Record<string, string> = { 
        pending: '⏳ در صف', 
        running: '🔄 در حال اجرا', 
        done: '✅ تکمیل', 
        error: '❌ خطا' 
      };
      
      await answerCallbackQuery(cb.id, `${stMap[jobData.status]} | ${jobData.processedIndex}/${jobData.totalUsers} (${pct}%)`, false);
      return;
    }
    
    if (data === 'broadcast_cancel') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await env.SESSIONS.delete('broadcast_job:current').catch(() => {});
      await answerCallbackQuery(cb.id, "🛑 ارسال لغو شد", false);
      await editMessageText(chat.id, cb.message!.message_id,
        "🛑 **ارسال پیام لغو شد**\n\nبرای ارسال مجدد از /admin استفاده کن."
      ).catch(() => {});
      return;
    }
    
    if (data === 'broadcast_close') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id);
      await deleteMessage(chat.id, cb.message!.message_id).catch(() => {});
      return;
    }
    
    // ============================================================
    // 🔄 Reset Factory
    // ============================================================
    
    if (data === 'resetfactory_confirm') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "🔄 در حال ریست کامل دیتابیس...", false);
      
      try {
        let cursor: string | undefined;
        do {
          const list = await env.SESSIONS.list({ prefix: "session:", cursor });
          for (const key of list.keys) {
            await env.SESSIONS.delete(key.name);
          }
          cursor = list.cursor;
        } while (cursor);
        
        cursor = undefined;
        do {
          const list = await env.SESSIONS.list({ prefix: "model_cache:", cursor });
          for (const key of list.keys) {
            await env.SESSIONS.delete(key.name);
          }
          cursor = list.cursor;
        } while (cursor);
        
        cursor = undefined;
        do {
          const list = await env.SESSIONS.list({ prefix: "group_vip:", cursor });
          for (const key of list.keys) {
            await env.SESSIONS.delete(key.name);
          }
          cursor = list.cursor;
        } while (cursor);
        
        cursor = undefined;
        do {
          const list = await env.SESSIONS.list({ prefix: "user_blocked:", cursor });
          for (const key of list.keys) {
            await env.SESSIONS.delete(key.name);
          }
          cursor = list.cursor;
        } while (cursor);
        
        cursor = undefined;
        do {
          const list = await env.SESSIONS.list({ prefix: "banned:", cursor });
          for (const key of list.keys) {
            await env.SESSIONS.delete(key.name);
          }
          cursor = list.cursor;
        } while (cursor);
        
        await env.SESSIONS.delete("disabled_api_keys");
        await env.SESSIONS.delete("broadcast_job:current");
        await env.SESSIONS.delete("maintenance_mode");
        await env.SESSIONS.delete("bot_start_time");
        
        sessionCache.clear();
        userCache.clear();
        modelCache.clear();
        groupContextCache.clear();
        activeRequests.clear();
        callbackRateLimits.clear();
        adminPanelStates.clear();
        modelListStates.clear();
        broadcastStates.clear();
        sessionLoadLocks.clear();
        userBuckets.clear();
        
        globalDisabledKeys = {};
        lastDisabledKeysFetch = 0;
        pollinationsModelsInitialized = false;
        
        logger.info("Factory reset completed. Bot will reinitialize on next request.");
        
        await editMessageText(chat.id, cb.message!.message_id,
          "✅ **ریست فکتوری با موفقیت انجام شد!**\n\n" +
          "ربات به حالت اولیه بازگشت. لطفاً برای فعال‌سازی مجدد، دستور /start را ارسال کنید."
        );
        
      } catch (error) {
        logger.error("Factory reset failed", error);
        await editMessageText(chat.id, cb.message!.message_id,
          "❌ **خطا در ریست فکتوری**\n\n" + (error instanceof Error ? error.message : "خطای ناشناخته")
        );
      }
      return;
    }
    
    if (data === 'resetfactory_cancel') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      
      await answerCallbackQuery(cb.id, "عملیات لغو شد", false);
      await deleteMessage(chat.id, cb.message!.message_id);
      return;
    }
    
    // ============================================================
    // ❌ Unknown callback
    // ============================================================
    
    // ثبت لاگ برای کالبک ناشناخته
    logger.warn(`Unknown callback data: ${data} from user ${user.id}`);
    await answerCallbackQuery(cb.id, "❌ دکمه نامعتبر", true);
    
  } catch (error) {
    logger.error("Callback query handling failed", error);
    try {
      await answerCallbackQuery(cb.id, "❌ خطا در پردازش", true);
    } catch (e) {}
  }
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۱۱: توابع اصلی و Export (نسخه کامل)
// ============================================================

// ============================================================
// 📦 BUILD DEFAULT PROMPT
// ============================================================

async function buildDefaultPrompt(
  engine: AIEngine,
  userName: string,
  isGroup: boolean = false,
  userMemory?: UserMemory,
  groupAnalysis?: string,
  lang: 'fa' | 'en' | 'ar' = 'fa'
): Promise<string> {
  const engineNames: Record<AIEngine, string> = {
    gemini: 'نوا',
    sambanova: 'لونا',
    pollinations: 'زارا'
  };
  const engineName = engineNames[engine] || 'نوا';

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran'
  };
  const dateStr = new Date().toLocaleDateString(lang === 'fa' ? 'fa-IR' : lang === 'en' ? 'en-US' : 'ar-SA', dateOptions);

  if (lang === 'fa') {
    return `تو ${engineName} هستی، یک دستیار هوشمند و دوستانه.
هویت تو فقط ${engineName} است. هرگز نگو که موتور دیگری هستی.

**دستورات مهم:**
1. مانند یک انسان طبیعی و دوستانه صحبت کن
2. هرگز نگو "من یک ربات/هوش مصنوعی هستم"
3. از اصطلاحات و لحن محاوره‌ای استفاده کن
4. پاسخ‌هایت را کوتاه، مفید و مستقیم بده
5. اگر اطلاعات کافی نداری، صادقانه بگو "نمیدونم"

**اطلاعات زمینه:**
📅 تاریخ امروز: ${dateStr}
👤 نام کاربر: ${userName}
${userMemory?.topics?.length > 0 ? `🎯 علاقه‌های کاربر: ${userMemory.topics.slice(0, 3).join(', ')}` : ''}
${isGroup && groupAnalysis ? `👥 زمینه گروه: ${groupAnalysis}` : ''}`;
  } else if (lang === 'en') {
    return `You are ${engineName}, a smart and friendly assistant.
Your identity is only ${engineName}. Never say you are a different engine.

**Important rules:**
1. Speak naturally and friendly like a human
2. Never say "I am a robot/AI"
3. Keep answers short, useful and direct
4. If you don't know something, honestly say "I don't know"

**Context:**
📅 Today: ${dateStr}
👤 User: ${userName}
${userMemory?.topics?.length > 0 ? `🎯 Interests: ${userMemory.topics.slice(0, 3).join(', ')}` : ''}
${isGroup && groupAnalysis ? `👥 Group context: ${groupAnalysis}` : ''}`;
  } else {
    return `أنت ${engineName}، مساعد ذكي وودود.
هويتك فقط ${engineName}. لا تقل أبداً أنك محرك آخر.

**قواعد مهمة:**
1. تحدث بشكل طبيعي وودود مثل الإنسان
2. لا تقل أبداً "أنا روبوت/ذكاء اصطناعي"
3. استخدم المصطلحات العامية
4. اجعل إجاباتك قصيرة ومفيدة ومباشرة
5. إذا لم تكن لديك معلومات كافية، قل بصدق "لا أعرف"

**معلومات السياق:**
📅 اليوم: ${dateStr}
👤 اسم المستخدم: ${userName}
${userMemory?.topics?.length > 0 ? `🎯 اهتمامات المستخدم: ${userMemory.topics.slice(0, 3).join(', ')}` : ''}
${isGroup && groupAnalysis ? `👥 سياق المجموعة: ${groupAnalysis}` : ''}`;
  }
}

// ============================================================
// 📦 GET ACTIVE PROMPT
// ============================================================

function getActivePrompt(session: ChatSession, userName: string | User, isGroup: boolean = false): string {
  const currentTime = new Date().toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' });
  
  let userId: number;
  let userFirstName: string;
  
  if (typeof userName === 'object') {
    userId = userName.id;
    userFirstName = userName.first_name;
  } else {
    userFirstName = userName;
    userId = 0;
  }
  
  const userMemory = userId ? session.userMemories.get(userId) : null;
  const groupAnalysis = isGroup && session.settings.contextAwareness ? 
    analyzeGroupConversation(getGroupContext(session.id), { id: userId, first_name: userFirstName } as User , session.language) : "";
  
  const customPrompt = session.customPrompts[session.activeEngine];
  if (customPrompt && customPrompt.trim().length > 0) {
    return `${customPrompt}\nYou are talking to ${userFirstName}. Current date: ${currentTime}.${isGroup ? ` This is a group chat. ${groupAnalysis}` : ''}`;
  }
  
  const personalityKey = session.activePersonality;
  if (personalityKey && PERSONALITIES[personalityKey]) {
    const personality = PERSONALITIES[personalityKey];
    const prompt = session.language === 'fa' ? personality.prompt_fa : 
                   session.language === 'en' ? personality.prompt_en : personality.prompt_ar;
    if (prompt && prompt.trim().length > 0) {
      return `${prompt}\n\n👤 نام کاربر: ${userFirstName}\n📅 تاریخ امروز: ${currentTime}`;
    }
  }
  
  return buildDefaultPrompt(session.activeEngine, userFirstName, isGroup, userMemory, groupAnalysis, session.language);
}

// ============================================================
// 📦 HANDLE HELP COMMAND
// ============================================================

async function handleHelpCommand(message: Message, env: Env, editMsgId?: number): Promise<void> {
  const { chat, from } = message;
  if (!from) return;

  const session = await getOrCreateSession(chat, from, env);
  const lang = session.language || 'fa';
  
  const helpText = lang === 'fa'
    ? `🧭 **راهنمای کامل ربات**\n\n` +
      `💬 **گفتگو:** کافیه پیامت رو بنویسی یا ویس بفرستی.\n\n` +
      `🎨 **تصاویر:**\n` +
      `• ساخت عکس: \`/img یک گربه فضانورد\`\n` +
      `• جستجو: \`/search طبیعت\`\n\n` +
      `🎤 **ویس:**\n` +
      `• ارسال ویس: تشخیص گفتار و پاسخ\n` +
      `• تبدیل متن به ویس: \`نوا با ویس بگو سلام\`\n\n` +
      `⚙️ **تنظیمات:**\n` +
      `• /model - تغییر هوش مصنوعی\n` +
      `• /new - فراموشی حافظه و بحث جدید\n` +
      `• /prompt - تنظیم شخصیت ربات\n` +
      `• /language - تغییر زبان\n` +
      `• /voice - منوی ویس\n\n` +
      `📊 **وضعیت شما:**\n` +
      `• پیام‌ها: ${session.dailyLimits.messages}/100\n` +
      `• ویس: ${session.dailyLimits.voicesSent}/10\n` +
      `• تصویر: ${session.dailyLimits.imagesGenerated}/5`
    : `🧭 **Bot Guide**\n\n` +
      `💬 **Chat:** Just type or send a voice note.\n\n` +
      `🎨 **Images:**\n` +
      `• Generate: \`/img a cute cat\`\n` +
      `• Search: \`/search nature\`\n\n` +
      `🎤 **Voice:**\n` +
      `• Send voice: Speech recognition\n` +
      `• Text to voice: \`nova with voice say hello\`\n\n` +
      `⚙️ **Settings:**\n` +
      `• /model - Switch AI Model\n` +
      `• /new - Clear Memory\n` +
      `• /prompt - Set Custom Personality\n` +
      `• /language - Change Language\n` +
      `• /voice - Voice Menu\n\n` +
      `📊 **Your Status:**\n` +
      `• Messages: ${session.dailyLimits.messages}/100\n` +
      `• Voice: ${session.dailyLimits.voicesSent}/10\n` +
      `• Images: ${session.dailyLimits.imagesGenerated}/5`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منو' : '🔙 Back to Menu', callback_data: 'back_to_panel' }
      ]
    ]
  };
  
  if (editMsgId) {
    await editMessageText(chat.id, editMsgId, helpText, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  } else {
    await sendMessage(chat.id, helpText, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard)),
      reply_to_message_id: message.message_id
    });
  }
}

// ============================================================
// 📦 HANDLE UPDATE - ورودی اصلی
// ============================================================

async function handleUpdate(update: Update, env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    // پاکسازی خودکار کش گروه‌ها (۱٪ شانس)
    if (Math.random() < 0.01) {
      const now = Date.now();
      for (const [chatId, context] of groupContextCache.entries()) {
        if (now - context.lastCleanup > 60 * 60 * 1000) {
          groupContextCache.delete(chatId);
        }
      }
    }
    
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, env, config);
    } else if (update.message) {
      const message = update.message;
      if (!message.from || message.from.is_bot) return;
      if (!config.ALLOWED_CHAT_TYPES.includes(message.chat.type)) return;

      // ============================================================
      // 🆕 تشخیص加入/خروج از گروه
      // ============================================================
      
      if (update.message?.new_chat_members) {
        const source = update.message.from?.username 
          ? `@${update.message.from.username}` 
          : "Private ID";
        await onBotJoinedGroup(update.message.chat, source, env);
      }
      if (update.message?.left_chat_member) {
        await onBotLeftGroup(update.message.chat.id, env);
      }

      // ============================================================
      // 🎤 پردازش ویس
      // ============================================================
      
      if (message.voice) {
        await handleVoiceMessage(message, env, config);
        return;
      }
      
      // ============================================================
      // 📷 پردازش مدیا (عکس، ویدیو، GIF، فایل)
      // ============================================================
      
      if (message.photo || message.document || message.animation || message.video || message.sticker) {
        await handleMediaMessage(message, env, config);
        return;
      }
      
      // ============================================================
      // 💬 پردازش متن
      // ============================================================
      
      if (message.text) {
        await handleTextMessage(message, env, config);
        return;
      }
    }
  } catch (error) {
    logger.error("Unhandled error in update processing", error);
  }
}

// ============================================================
// 📦 HANDLE TEXT MESSAGE
// ============================================================

async function handleTextMessage(message: Message, env: Env, config: ReturnType<typeof createConfig>) {
  const { chat, from, text } = message;
  if (!text || !from) return;

  const requestId = generateRequestId();
  
  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const session = await getOrCreateSession(chat, from, env);
  const isGroup = chat.type === "group" || chat.type === "supergroup";

  if (isGroup && !shouldRespondInGroup(message, session)) {
    return;
  }

  const isBlocked = await isUserBlocked(from.id, env);
  if (isBlocked && from.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🚫 حساب شما مسدود شده است.", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  if (!canProcessConcurrentRequest(chat.id, requestId)) {
    await sendMessage(chat.id, "🚦 سرور شلوغ است، کمی صبر کنید...", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  try {
    recordRequest(session);
    
    // ============================================================
    // 🎤 بررسی TTS (تبدیل متن به ویس)
    // ============================================================
    
    const ttsMatch = text.match(/^([\w\u0600-\u06FF]+)\s+با\s+ویس\s+بگو\s+(.+)$/i);
    if (ttsMatch) {
      const handled = await ttsHandler(text, chat.id, message.message_id, env);
      if (handled) return;
    }
    
    // ============================================================
    // 📊 بررسی محدودیت روزانه
    // ============================================================
    
    const limitCheck = checkDailyLimit(session, 'message');
    if (!limitCheck.allowed) {
      await sendMessage(chat.id, limitCheck.message!, {
        reply_to_message_id: message.message_id,
        reply_markup: JSON.stringify(getVIPUpgradeKeyboard())
      });
      return;
    }

    incrementDailyUsage(session, 'message');
    
    // ============================================================
    // 🤖 پردازش با هوش مصنوعی
    // ============================================================
    
    await processAIRequest(
      session, from,
      [{ text: sanitizeInput(text) }],
      message, env, requestId
    );
    
  } finally {
    releaseRequest(chat.id, requestId);
  }
}

// ============================================================
// 📦 PROCESS AI REQUEST - هسته اصلی پردازش
// ============================================================

async function processAIRequest(
  session: ChatSession, 
  user: User, 
  userParts: Part[], 
  originalMessage: Message, 
  env: Env, 
  requestId?: string, 
  sendAsVoice: boolean = false
) {
  const GLOBAL_TIMEOUT = 50000;
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, GLOBAL_TIMEOUT);
  
  try {
    await _processAIRequestInternal(
      session, user, userParts, originalMessage, env, requestId, sendAsVoice
    );
  } catch (error) {
    logger.error("AI processing failed or timed out", error);
    
    const errorMsg = error instanceof Error && 
      (error.name === 'AbortError' || error.message.includes('timeout'))
      ? "⏱️ زمان پردازش تمام شد. سرور شلوغ است، لطفاً دوباره تلاش کنید."
      : "❌ خطا در پردازش درخواست.";
    
    await sendMessage(originalMessage.chat.id, errorMsg, {
      reply_to_message_id: originalMessage.message_id
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 📦 PROCESS AI REQUEST INTERNAL - پردازش داخلی
// ============================================================

async function _processAIRequestInternal(
  session: ChatSession, 
  user: User, 
  userParts: Part[], 
  originalMessage: Message, 
  env: Env, 
  requestId?: string, 
  sendAsVoice: boolean = false
) {
  const isGroup = originalMessage.chat.type === "group" || originalMessage.chat.type === "supergroup";
  const textPrompt = userParts.find(p => p.text)?.text || '';
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;
  const engine = session.engines[session.activeEngine];
  let userHistory: HistoryItem[] | undefined;
  
  if (isGroup) {
    if (!engine.userHistories) engine.userHistories = new Map();
    if (!engine.userHistories.has(user.id)) engine.userHistories.set(user.id, []);
    userHistory = engine.userHistories.get(user.id)!;
    
    if (userHistory.length === 0) {
      const currentPrompt = getActivePrompt(session, user.first_name, true);
      userHistory.push({
        role: session.activeEngine === 'gemini' ? 'user' : 'assistant',
        parts: [{ text: currentPrompt }],
        timestamp: Date.now(),
        userId: user.id,
        userName: user.first_name
      });
    }
  }

  await sendTypingAction(originalMessage.chat.id).catch(() => {});

  let loadingMsgId: number | null = null;
  
  // ارسال پیام لودینگ (فقط در چت شخصی)
  if (!isGroup) {
    const lang = session.language || 'fa';
    const emoji = ['💭', '🤔', '✨', '⚡', '⏳'][Math.floor(Math.random() * 5)];
    const loadingText = lang === 'fa' ? `${emoji} اممم...` : `${emoji} Hmmm...`;
    
    const msg = await sendMessage(originalMessage.chat.id, loadingText, {
      reply_to_message_id: originalMessage.message_id
    }).catch(() => null);
    
    if (msg) loadingMsgId = msg.message_id;
  }

  let responseText = "";
  let success = false;
  let isImageResponse = false;

  try {
    let result: any;

    if (session.activeEngine === "gemini") {
      result = await handleGeminiRequest(session, user, userParts, isGroup, userHistory, env);
    } else if (session.activeEngine === "sambanova") {
      result = await handleSambanovaRequest(session, user, textPrompt, isGroup, userHistory, env);
    } else if (session.activeEngine === "pollinations") {
      result = await handlePollinationsRequest(session, user, textPrompt, isGroup, userHistory, env);
    }

    if (result && typeof result === 'object' && result.photo) {
      isImageResponse = true;
      success = true;
      if (loadingMsgId) await deleteMessage(originalMessage.chat.id, loadingMsgId).catch(() => {});
      
      await sendPhoto(
        originalMessage.chat.id, 
        result.photo, 
        `🖼️ **تصویر تولید شده**\n🎨 \`${textPrompt.substring(0, 50)}...\``, 
        { reply_to_message_id: originalMessage.message_id }
      );
    } else {
      responseText = sanitizeMarkdown(String(result));
      success = true;
    }
    
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (user.id === config.BOT_OWNER_ID) {
      responseText = `❌ **خطا (اصلی):**\n\`\`\`\n${getRawError(err)}\n\`\`\``;
    } else {
      const errorInfo = formatUserFriendlyErrorNew(err, session.language);
      responseText = createErrorMessage(errorInfo, false);
    }
  } finally {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
  }

  if (success && !isImageResponse) {
    const timestamp = Date.now();
    
    addToHistory(engine.history, "user", userParts, timestamp);
    const responseRole = session.activeEngine === "gemini" ? "model" : "assistant";
    addToHistory(engine.history, responseRole, [{ text: responseText }], timestamp);
    
    if (isGroup && userHistory) {
      addToHistory(userHistory, "user", userParts, timestamp);
      addToHistory(userHistory, responseRole, [{ text: responseText }], timestamp);
      engine.userHistories.set(user.id, userHistory);
    }
    
    session.messageCount++;
    session.statistics.totalMessages++;
    const statKey = `${session.activeEngine}Messages` as keyof typeof session.statistics;
    (session.statistics[statKey] as number)++;

    saveSessionWithLock(session, env, false).catch(e => 
      logger.error(`Failed to save session ${session.id}`, e)
    );
    
    await sendStreamingResponse(
      originalMessage.chat.id,
      originalMessage.message_id,
      responseText,
      loadingMsgId ?? undefined
    );
  } else if (!success) {
    if (loadingMsgId) {
      try {
        await editMessageText(originalMessage.chat.id, loadingMsgId, responseText);
      } catch {
        await sendMessage(originalMessage.chat.id, responseText, { 
          reply_to_message_id: originalMessage.message_id 
        }).catch(() => {});
      }    
    } else {
      await sendMessage(originalMessage.chat.id, responseText, { 
        reply_to_message_id: originalMessage.message_id 
      }).catch(() => {});
    }
  }
}

// ============================================================
// 📦 HANDLE GEMINI REQUEST
// ============================================================

async function handleGeminiRequest(
  session: ChatSession, 
  user: User, 
  parts: Part[], 
  isGroup: boolean = false,
  userHistory?: HistoryItem[],
  env: Env
): Promise<string> {
  
  if (config.GEMINI_KEYS.length === 0) {
    throw new Error("❌ کلیدهای API نوا تنظیم نشده است");
  }
  
  const engine = session.engines.gemini;
  const model = config.GEMINI_MODEL;
  
  const currentPrompt = getActivePrompt(session, user.first_name, isGroup);
  engine.history[0] = { 
    role: "user", 
    parts: [{ text: currentPrompt }],
    timestamp: Date.now(),
    userId: user.id,
    userName: user.first_name
  };
  
  const historyToUse = (isGroup && userHistory) ? 
    [engine.history[0], ...userHistory] : 
    engine.history;

  const totalKeys = config.GEMINI_KEYS.length;
  let lastError: Error | null = null;
  const errors = { quota: 0, blocked: 0, timeout: 0, other: 0 };

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const keyIndex = (engine.apiKeyIndex + attempt) % totalKeys;
    const apiKey = config.GEMINI_KEYS[keyIndex];
    
    logger.info(`🚀 Gemini: Try ${attempt + 1}/${totalKeys} with Key ${keyIndex + 1}`);
    
    try {
      const response = await withTimeout(
        callGeminiAPI(parts, model, apiKey, historyToUse),
        20000,
        "⏱️ زمان پردازش تمام شد"
      );
      
      engine.apiKeyIndex = keyIndex;
      engine.consecutiveErrors = 0;
      logger.info(`✅ Gemini success with Key ${keyIndex + 1}`);
      return response;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message.toLowerCase();
      
      if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        errors.quota++;
        logger.warn(`❌ Key ${keyIndex + 1} hit quota/rate limit`);
      } 
      else if (errorMsg.includes('blocked') || errorMsg.includes('safety')) {
        errors.blocked++;
        logger.warn(`⚠️ Safety block on Key ${keyIndex + 1}`);
        continue;
      } 
      else if (errorMsg.includes('timeout')) {
        errors.timeout++;
        logger.warn(`⏱️ Timeout on Key ${keyIndex + 1}`);
      } 
      else {
        errors.other++;
        logger.error(`Unknown error on Key ${keyIndex + 1}: ${errorMsg.substring(0, 100)}`);
      }
    }
  }

  engine.consecutiveErrors++;
  
  if (errors.quota === totalKeys) {
    throw new Error("⏳ همه کلیدها محدودیت مصرف دارند. لطفاً مدل را تغییر دهید.");
  }
  if (errors.blocked > 0) {
    throw new Error("🛡️ محتوای درخواست مسدود شد. متن را تغییر دهید.");
  }
  throw new Error(`❌ خطا در نوا: هر ${totalKeys} کلید ناموفق بودند. لطفاً /model بزنید.`);
}

// ============================================================
// 📦 CALL GEMINI API
// ============================================================

async function callGeminiAPI(parts: Part[], model: string, apiKey: string, history: HistoryItem[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = [...sanitizeHistoryForAPI(history), { role: "user" as const, parts }];
  
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { 
        temperature: 0.8, 
        topK: 40, 
        topP: 0.95, 
        maxOutputTokens: 8192 
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    }),
  });
  
  const data = await response.json();
  if (data.error) throw new Error(`Gemini API Error: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text.trim();
}

// ============================================================
// 📦 SANITIZE HISTORY FOR API
// ============================================================

function sanitizeHistoryForAPI(history: HistoryItem[]): any[] {
  if (!history || !Array.isArray(history)) return [];
  return history.map(item => ({
    role: item.role === "model" ? "assistant" : item.role,
    parts: item.parts
  }));
}

// ============================================================
// 📦 HANDLE SAMBANOVA REQUEST
// ============================================================

async function handleSambanovaRequest(
  session: ChatSession,
  user: User,
  text: string,
  isGroup: boolean,
  userHistory: HistoryItem[] | undefined,
  env: Env
): Promise<string> {
  if (config.SAMBANOVA_KEYS.length === 0) throw new Error("❌ کلیدهای API لونا تنظیم نشده");
  if (config.SAMBANOVA_MODELS.length === 0) {
    const cache = await getModelsWithCache("sambanova", env, true);
    if (cache.models.length === 0) throw new Error("❌ هیچ مدلی برای لونا یافت نشد");
  }

  const engine = session.engines.sambanova;
  const currentPrompt = getActivePrompt(session, user.first_name, isGroup);
  if (engine.history.length === 0) {
    engine.history = [{ 
      role: "assistant", 
      parts: [{ text: currentPrompt }], 
      timestamp: Date.now() 
    }];
  }

  const historyToUse = (isGroup && userHistory) ? 
    [engine.history[0], ...userHistory] : 
    engine.history;

  const totalKeys = config.SAMBANOVA_KEYS.length;
  const totalModels = config.SAMBANOVA_MODELS.length;
  const maxAttemptsPerKey = 2;
  const totalAttempts = totalKeys * maxAttemptsPerKey;
  const errors = { quota: 0, blocked: 0, timeout: 0, auth: 0, network: 0, unknown: 0 };

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const keyIndex = Math.floor(attempt / maxAttemptsPerKey) % totalKeys;
    const apiKey = config.SAMBANOVA_KEYS[keyIndex];
    const modelIndex = (engine.modelIndex + Math.floor(attempt / totalKeys)) % Math.max(1, totalModels);
    const model = config.SAMBANOVA_MODELS[modelIndex] || "DeepSeek-V3.1";
    
    logger.info(`🧠 Luna: Try ${attempt + 1} with Key ${keyIndex + 1}, Model ${modelIndex + 1}`);
    
    try {
      const response = await withTimeout(
        callSambanovaAPI(text, historyToUse, model, apiKey),
        20000,
        "⏱️ زمان پردازش تمام شد"
      );
      
      engine.apiKeyIndex = keyIndex;
      engine.modelIndex = modelIndex;
      engine.consecutiveErrors = 0;
      logger.info(`✅ Luna success with Key ${keyIndex + 1}, Model ${modelIndex + 1}`);
      return response;
      
    } catch (error) {
      const msg = (error as Error).message.toLowerCase();
      if (msg.includes('quota') || msg.includes('429')) errors.quota++;
      else if (msg.includes('blocked') || msg.includes('safety')) errors.blocked++;
      else if (msg.includes('timeout')) errors.timeout++;
      else if (msg.includes('401') || msg.includes('403')) errors.auth++;
      else if (msg.includes('network') || msg.includes('fetch')) errors.network++;
      else errors.unknown++;
    }
    
    if (attempt < totalAttempts - 1) {
      await new Promise(resolve =>
        setTimeout(resolve, 1000 * (Math.floor(attempt / maxAttemptsPerKey) + 1))
      );
    }
  }

  engine.consecutiveErrors++;
  throw new Error(`❌ خطا در لونا: تمام کلیدها ناموفق بودند`);
}

// ============================================================
// 📦 CALL SAMBANOVA API
// ============================================================

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
  
  const response = await fetchWithTimeout(url, {
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
  }, 30000);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SambaNova API error (${response.status}): ${errorText.substring(0, 200)}`);
  }
  
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  
  if (!text) throw new Error("پاسخ خالی از لونا!");
  
  return text.trim();
}

// ============================================================
// 📦 HANDLE POLLINATIONS REQUEST
// ============================================================

async function handlePollinationsRequest(
  session: ChatSession,
  user: User,
  text: string,
  isGroup: boolean,
  userHistory: HistoryItem[] | undefined,
  env: Env
): Promise<string | { photo: string }> {

  await ensurePollinationsModels(env);
  
  const apiKey = config.POLLINATIONS_KEY;
  const engine = session.engines.pollinations;
  const modelCache = await getModelsWithCache("pollinations", env);
  const selectedModel = modelCache.models[engine.modelIndex] || { id: 'openai', type: 'text' };

  const commonHeaders: Record<string, string> = { 
    "User-Agent": "NovaBot/2.0",
    "Content-Type": "application/json"
  };
  if (apiKey) commonHeaders["Authorization"] = `Bearer ${apiKey}`;

  // ============================================================
  // 🖼️ تولید تصویر
  // ============================================================
  
  if (selectedModel.type === 'image' || selectedModel.id.includes('flux') || selectedModel.id.includes('turbo')) {
    logger.info(`🎨 Zara Image Gen Start. Input: "${text}"`);

    let finalPrompt = text;
    let promptStatusMessage = "";

    if (text.match(/[\u0600-\u06FF]/)) {
      try {
        promptStatusMessage = `🔄 **در حال ترجمه و گسترش پرامپت...**`;
        await sendMessage(session.id, promptStatusMessage);
        finalPrompt = await translateToEnglishPrompt(text, env);
      } catch (e) {
        logger.warn("Translation skipped, using original text");
        finalPrompt = text;
      }
    } else {
      finalPrompt = text;
    }

    await sendMessage(session.id, `📝 **پرامپت نهایی:**\n\`${finalPrompt}\``);

    const encodedPrompt = encodeURIComponent(finalPrompt);
    const randomSeed = Math.floor(Math.random() * 10000000);
    const enhanceParam = finalPrompt !== text ? 'false' : 'true';
    
    const imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${selectedModel.id}&width=1280&height=1280&nologo=true&seed=${randomSeed}&enhance=${enhanceParam}`;

    try {
        const imageResponse = await fetchWithTimeout(imageUrl, { headers: commonHeaders }, 30000);
        
        if (!imageResponse.ok) {
            const err = await imageResponse.text();
            if (imageResponse.status === 429) throw new Error("ترافیک سرور بالاست، لطفاً ۱ دقیقه دیگر تلاش کنید.");
            if (imageResponse.status === 401) throw new Error("کلید API زارا نامعتبر است.");
            throw new Error(`Pollinations Image Error: ${imageResponse.status} - ${err.substring(0, 50)}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        if (arrayBuffer.byteLength < 1000) throw new Error("تصویر دریافتی ناقص است.");

        return { photo: new Uint8Array(arrayBuffer) };

    } catch (error) {
        throw new Error(`خطا در تولید تصویر: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ============================================================
  // 💬 تولید متن
  // ============================================================
  
  logger.info(`💬 Zara Chat: model=${selectedModel.id}`);
  const currentPrompt = getActivePrompt(session, user.first_name, isGroup);
  
  const messages = [
    { role: "system", content: currentPrompt },
    ...((isGroup && userHistory) ? userHistory : engine.history).slice(1).map(h => ({
      role: h.role === "model" ? "assistant" : h.role,
      content: h.parts[0]?.text || ""
    })),
    { role: "user", content: text }
  ];

  const response = await fetchWithTimeout("https://text.pollinations.ai/chat/completions", {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({
      model: selectedModel.id, 
      messages: messages,
      temperature: 0.7,
      stream: false, 
      seed: Math.floor(Math.random() * 1000)
    })
  }, 30000);

  if (!response.ok) {
    const errorData = await response.text();
    if (response.status === 429) throw new Error("ترافیک بالا (Rate Limit). لطفاً صبر کنید.");
    if (response.status >= 500) throw new Error("مشکل موقت در سرور مدل (5xx). لطفاً مدل دیگری انتخاب کنید.");
    throw new Error(`Zara API Error ${response.status}: ${errorData.substring(0, 100)}`);
  }
  
  let data;
  try {
      const rawText = await response.text();
      if (!rawText.startsWith('{') && !rawText.startsWith('[')) {
          if (rawText.trim().length > 0) return rawText; 
          throw new Error("پاسخ نامعتبر از سرور.");
      }
      data = JSON.parse(rawText);
  } catch (e) {
      throw new Error("خطا در پردازش پاسخ JSON مدل.");
  }

  let content = "";
  if (data.choices?.[0]?.message?.content) content = data.choices[0].message.content;
  else if (data.choices?.[0]?.text) content = data.choices[0].text;
  else if (data.content) content = data.content;
  else if (data.output) content = data.output;
  
  if (!content || content.trim().length === 0) {
      logger.error(`Empty Zara Response: ${JSON.stringify(data)}`);
      throw new Error("مدل پاسخ خالی داد! (ممکن است مدل انتخابی در حال حاضر در دسترس نباشد)");
  }
  
  return content.trim();
}

// ============================================================
// 📦 TRANSLATE TO ENGLISH PROMPT
// ============================================================

async function translateToEnglishPrompt(text: string, env: Env): Promise<string> {
  if (!text.match(/[\u0600-\u06FF]/)) return text;

  const hasPersian = (str: string) => /[\u0600-\u06FF]/.test(str);
  const systemInstruction = "Translate the Persian text to a concise English image prompt. Focus only on the main subject. Keep it brief (max 30 words). Output ONLY English. No chat.";

  if (config.GEMINI_KEYS.length > 0) {
    try {
      const result = await callGeminiAPI(
        [{ text: `${systemInstruction}\n\nText: ${text}` }],
        config.GEMINI_MODEL,
        config.GEMINI_KEYS[0],
        []
      );
      if (result && !hasPersian(result) && result.length > 5) {
        return result.trim();
      }
    } catch (e) {
      console.error("Gemini Translation failed, switching to Zara loop...");
    }
  }

  const allZaraModels = config.POLLINATIONS_MODELS;

  for (const modelId of allZaraModels) {
    if (modelId.includes('flux') || modelId.includes('turbo')) continue;

    try {
      const encodedPrompt = encodeURIComponent(`${systemInstruction}\n\nText: ${text}`);
      const randomSeed = Math.floor(Math.random() * 1000);
      
      const url = `https://text.pollinations.ai/${encodedPrompt}?model=${modelId}&seed=${randomSeed}&json=false`;
      
      const res = await fetchWithTimeout(url, { method: "GET" }, 15000);
      
      if (res.ok) {
        let result = await res.text();
        result = result.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^(Prompt|English|Translation):\s*/i, '');

        if (result.length > 5 && !hasPersian(result)) {
          if (result.length > 150) result = result.split('.')[0];
          return result;
        }
      }
    } catch (err) {
      console.warn(`Zara model ${modelId} failed to translate, trying next...`);
      continue;
    }
  }

  const cleanedText = text.replace(/[\u0600-\u06FF]/g, "").trim();
  return cleanedText.length > 3 
    ? cleanedText
    : "A high-quality, detailed artistic masterpiece.";
}

// ============================================================
// 📦 ENSURE POLLINATIONS MODELS
// ============================================================

async function ensurePollinationsModels(env: Env): Promise<void> {
  if (pollinationsModelsInitialized && config.POLLINATIONS_MODELS.length > 0) {
    return;
  }

  if ((globalThis as any).__pollinationsLoading) {
    logger.warn("⏳ Pollinations models fetch already in progress, waiting...");
    while ((globalThis as any).__pollinationsLoading) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return;
  }

  (globalThis as any).__pollinationsLoading = true;
  
  try {
    const cache = await getModelsWithCache("pollinations", env, false);
    
    if (cache.models.length === 0) {
      logger.warn("⚠️ API returned 0 models, using fallback");
      const fallback = getFallbackPollinationsModels();
      config.POLLINATIONS_MODELS = fallback.map(m => m.id);
    } else {
      config.POLLINATIONS_MODELS = cache.models.map(m => m.id);
    }
    
    pollinationsModelsInitialized = true;
    logger.info(`✅ Pollinations models ready: ${config.POLLINATIONS_MODELS.length}`);
    
  } catch (error) {
    logger.error("❌ Failed to fetch Pollinations models", error);
    const fallback = getFallbackPollinationsModels();
    config.POLLINATIONS_MODELS = fallback.map(m => m.id);
    pollinationsModelsInitialized = true;
  } finally {
    (globalThis as any).__pollinationsLoading = false;
  }
}

// ============================================================
// 📦 GET FALLBACK POLLINATIONS MODELS
// ============================================================

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

// ============================================================
// 📦 FETCH POLLINATIONS MODELS
// ============================================================

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

// ============================================================
// 📦 FETCH SAMBANOVA MODELS
// ============================================================

async function fetchSambanovaModels(apiKey: string): Promise<ModelInfo[]> {
  try {
    const url = "https://api.sambanova.ai/v1/models";
    const response = await fetchWithTimeout(url, { 
      headers: { "Authorization": `Bearer ${apiKey}` } 
    }, 30000);
    
    const data = await response.json();
    
    if (!data.data) return [];
    
    return data.data
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || '',
        context_length: m.context_length || 0,
        type: 'text' as const
      }))
      .slice(0, 100);
      
  } catch (error) {
    logger.error("Failed to fetch SambaNova models", error);
    return [
      { id: "DeepSeek-V3.1", name: "DeepSeek-V3.1", type: "text" },
      { id: "Qwen3-32B", name: "Qwen3-32B", type: "text" },
      { id: "Llama-4-Maverick-17B-128E-Instruct", name: "Llama 4 Maverick", type: "text" }
    ];
  }
}

// ============================================================
// 📦 GET MODELS WITH CACHE
// ============================================================

async function getModelsWithCache(engine: AIEngine, env: Env, forceRefresh: boolean = false): Promise<ModelCache> {
  const cacheKey = `model_cache:${engine}`;
  
  if (!forceRefresh) {
    const cached = modelCache.get(cacheKey);
    if (cached) {
      return { engine, models: cached, lastUpdated: Date.now() };
    }
  }
  
  try {
    const stored = await env.SESSIONS.get(cacheKey, "json");
    if (stored && !forceRefresh) {
      const cache = stored as ModelCache;
      if (Date.now() - cache.lastUpdated < config.MODEL_CACHE_TTL) {
        modelCache.set(cacheKey, cache.models, config.MODEL_CACHE_TTL);
        return cache;
      }
    }
  } catch (error) {
    logger.warn(`Failed to get ${engine} models from KV`, error);
  }
  
  let models: ModelInfo[] = [];
  
  if (engine === 'sambanova') {
    if (config.SAMBANOVA_KEYS.length > 0) {
      try {
        models = await fetchSambanovaModels(config.SAMBANOVA_KEYS[0]);
      } catch (error) {
        logger.warn(`Failed to fetch SambaNova models`, error);
        models = [
          { id: "DeepSeek-V3.1", name: "DeepSeek-V3.1", type: "text" },
          { id: "Qwen3-32B", name: "Qwen3-32B", type: "text" },
          { id: "Llama-4-Maverick-17B-128E-Instruct", name: "Llama 4 Maverick", type: "text" }
        ];
      }
    }
  } else if (engine === 'pollinations') {
    models = await fetchPollinationsModels();
  }
  
  const cache: ModelCache = {
    engine,
    models,
    lastUpdated: Date.now()
  };
  
  try {
    await env.SESSIONS.put(cacheKey, JSON.stringify(cache));
  } catch (error) {
    logger.warn(`Failed to save model cache for ${engine}`, error);
  }
  
  modelCache.set(cacheKey, models, config.MODEL_CACHE_TTL);
  
  return cache;
}

// ============================================================
// 📦 INITIALIZE BOT
// ============================================================

async function initializeBot(env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    // Preload models in background
    preloadModels(env).catch(e => logger.warn("Preload failed", e));

    let startTime = await env.SESSIONS.get("bot_start_time", "text");
    
    if (!startTime) {
      startTime = String(Date.now());
      await env.SESSIONS.put("bot_start_time", startTime);
      logger.info("Bot start time initialized");
    }
    
    const maintenanceMode = await env.SESSIONS.get("maintenance_mode", "text");
    config.MAINTENANCE_MODE = maintenanceMode === "true";

    const [botInfo, sambanovaCache, pollinationsCacheResult] = await Promise.all([
      callTelegramAPI("getMe", {}),
      getModelsWithCache("sambanova", env, false).catch(() => ({ 
        models: [], 
        engine: 'sambanova' as const, 
        lastUpdated: Date.now() 
      })),
      getModelsWithCache("pollinations", env, false).catch(() => ({ 
        models: [], 
        engine: 'pollinations' as const, 
        lastUpdated: Date.now() 
      }))
    ]);

    BOT_INFO = botInfo;
    
    logger.info(`✅ Bot: ${BOT_INFO?.first_name} (@${BOT_INFO?.username})`);
    logger.info(`✅ Models: SambaNova(${sambanovaCache.models.length}), Pollinations(${pollinationsCacheResult.models.length})`);
        
    if (pollinationsCacheResult.models.length === 0) {
      logger.warn("Force using fallback for Pollinations");
      const fallback = getFallbackPollinationsModels();
      config.POLLINATIONS_MODELS = fallback.map(m => m.id);
      logger.info(`Fallback models: ${config.POLLINATIONS_MODELS.join(', ')}`);
    } else {
      config.POLLINATIONS_MODELS = pollinationsCacheResult.models.map(m => m.id);
    }
    
    logger.info("Dynamic models fetched successfully.");

    // Warm up cache
    logger.info("⚡ Warming up model caches...");
    
    const warmupPromises = [
      getModelsWithCache("sambanova", env, false).catch(e => logger.warn("Sambanova cache warmup failed")),
      getModelsWithCache("pollinations", env, false).catch(e => logger.warn("Pollinations cache warmup failed"))
    ];
    
    logger.info("setMyCommands registered for Telegram");

    logger.info(`🚀 Nova AI Bot V${BOT_VERSION} is ready!`, {
      engines: {
        gemini: { available: config.GEMINI_KEYS.length > 0, keys: config.GEMINI_KEYS.length },
        sambanova: { available: config.SAMBANOVA_KEYS.length > 0, keys: config.SAMBANOVA_KEYS.length },
        pollinations: { available: true, models: config.POLLINATIONS_MODELS.length }
      }
    });
    
  } catch (error) {
    logger.error("CRITICAL: Bot initialization failed", error);
    throw error;
  }
}

// ============================================================
// 📦 PRELOAD MODELS
// ============================================================

async function preloadModels(env: Env): Promise<void> {
  const engines: AIEngine[] = ['sambanova', 'pollinations'];
  
  await Promise.all(
    engines.map(async engine => {
      try {
        const cache = await getModelsWithCache(engine, env, false);
        modelCache.set(`models:${engine}`, cache.models, 30 * 60 * 1000);
        logger.info(`✅ Preloaded ${cache.models.length} models for ${engine}`);
      } catch (e) {
        logger.warn(`⚠️ Failed to preload ${engine} models`);
      }
    })
  );
}

// ============================================================
// 📦 CREATE HEALTH CHECK RESPONSE
// ============================================================

async function createHealthCheckResponse(env: Env): Promise<Response> {
  const totalActiveRequests = Array.from(activeRequests.values()).reduce((sum, set) => sum + set.size, 0);
  const uptimeSeconds = await getBotUptime(env);
  
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: BOT_VERSION,
    bot: {
      name: BOT_INFO?.first_name || "Nova",
      username: BOT_INFO?.username || "unknown"
    },
    uptime: {
      seconds: uptimeSeconds,
      human: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
    },
    performance: {
      active_requests: totalActiveRequests,
      max_concurrent: config.MAX_CONCURRENT_REQUESTS,
      load_percentage: Math.round((totalActiveRequests / config.MAX_CONCURRENT_REQUESTS) * 100)
    },
    engines: {
      gemini: {
        available: config.GEMINI_KEYS.length > 0,
        api_keys: config.GEMINI_KEYS.length,
        models: config.GEMINI_MODELS.length
      },
      sambanova: {
        available: config.SAMBANOVA_KEYS.length > 0,
        models: config.SAMBANOVA_MODELS.length
      },
      pollinations: {
        available: true,
        models: config.POLLINATIONS_MODELS.length,
        persona: "Zara (زارا) - Diverse model capabilities",
        endpoint: "https://text.pollinations.ai/chat/completions"
      }
    },
    features: {
      multimodal: true,
      image_generation: config.GEMINI_KEYS.length > 0,
      group_intelligence: true,
      enhanced_memory: true,
      personalized_responses: true,
      context_awareness: true,
      clean_ui: true,
      custom_prompts: true,
      pollinations_integration: true,
      voice_tts: true
    },
    storage: "cloudflare_kv_enhanced"
  };
  
  return new Response(JSON.stringify(health, null, 2), {
    headers: { "Content-Type": "application/json" },
    status: totalActiveRequests > config.MAX_CONCURRENT_REQUESTS ? 503 : 200
  });
}

// ============================================================
// 📦 GET BOT UPTIME
// ============================================================

async function getBotUptime(env: Env): Promise<number> {
  const startTimeStr = await env.SESSIONS.get("bot_start_time", "text");
  if (!startTimeStr) return 0;
  
  const startTime = parseInt(startTimeStr);
  return Math.floor((Date.now() - startTime) / 1000);
}

// ============================================================
// 📦 BUILD MODEL SELECTION TEXT
// ============================================================

function buildModelSelectionText(session: ChatSession): string {
  const lang = session.language || 'fa';
  const active = session.activeEngine;
  const m = MODEL_META[active];

  if (lang === 'fa') {
    return `🔮 *انتخاب هوش مصنوعی*\n\nمدل فعال: *${m.emoji} ${m.fa}*\n_${m.badge_fa}_\n\n━━━━━━━━━━━━━━━━━━━━\nبرای تغییر مدل، انتخاب کن:`;
  } else if (lang === 'en') {
    return `🔮 *Select AI Model*\n\nActive: *${m.emoji} ${m.en}*\n_${m.badge_en}_\n\n━━━━━━━━━━━━━━━━━━━━\nTap to switch model:`;
  } else {
    return `🔮 *اختيار نموذج الذكاء الاصطناعي*\n\nالنشط: *${m.emoji} ${m.ar}*\n_${m.badge_ar}_\n\n━━━━━━━━━━━━━━━━━━━━\nاضغط لتغيير النموذج:`;
  }
}

// ============================================================
// 📦 BUILD MODEL SELECTION KEYBOARD
// ============================================================

function buildModelSelectionKeyboard(session: ChatSession) {
  const lang = session.language || 'fa';
  const active = session.activeEngine;

  const btn = (eng: AIEngine) => {
    const m = MODEL_META[eng];
    const isActive = active === eng;
    const label = `${m.emoji} ${lang === 'fa' ? m.fa : lang === 'en' ? m.en : m.ar}`;
    return { text: isActive ? `${label} ✅` : label, callback_data: `set_model_${eng}` };
  };

  return {
    inline_keyboard: [
      [btn('gemini'), btn('sambanova')],
      [btn('pollinations')],
      [
        { text: lang === 'fa' ? '⚙️ تنظیمات مدل' : lang === 'en' ? '⚙️ Model Settings' : '⚙️ إعدادات النموذج', callback_data: 'active_model_settings' },
        { text: lang === 'fa' ? '✏️ شخصیت' : lang === 'en' ? '✏️ Persona' : '✏️ شخصية', callback_data: 'custom_prompt_menu' }
      ],
      [{ text: lang === 'fa' ? '🔙 بازگشت' : lang === 'en' ? '🔙 Back' : '🔙 رجوع', callback_data: 'open_help' }]
    ]
  };
}

// ============================================================
// 📦 HANDLE MODEL COMMAND
// ============================================================

async function handleModelCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from) return;

  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  const session = await getOrCreateSession(chat, from, env);
  await sendModelSelection(chat.id, message.message_id, session);
}

// ============================================================
// 📦 SEND MODEL SELECTION
// ============================================================

async function sendModelSelection(
  chatId: number,
  replyToMessageId: number | undefined,
  session: ChatSession
): Promise<Message> {
  return await sendMessage(chatId, buildModelSelectionText(session), {
    reply_markup: JSON.stringify(validateKeyboard(buildModelSelectionKeyboard(session))),
    reply_to_message_id: replyToMessageId,
  });
}

// ============================================================
// 📦 ENGINE CONFIG (قبل از handleModelSwitch)
// ============================================================

const ENGINE_CONFIG: Record<AIEngine, { available: () => boolean }> = {
  gemini: { available: () => config.GEMINI_KEYS.length > 0 },
  sambanova: { available: () => config.SAMBANOVA_KEYS.length > 0 },
  pollinations: { available: () => true }
};

// ============================================================
// 📦 SEND IMAGE RESULTS
// ============================================================

async function sendImageResults(
  chatId: number,
  replyToMsgId: number,
  images: string[],
  query: string,
  translations: any
): Promise<void> {
  const caption = translations.search_results
    .replace('{caption}', `🔍 **${query}**`)
    .replace('{count}', String(images.length));

  for (let i = 0; i < images.length; i++) {
    try {
      if (i === 0) {
        await sendPhoto(chatId, images[i], caption + translations.search_attribution, {
          reply_to_message_id: replyToMsgId
        });
      } else {
        await sendPhoto(chatId, images[i], undefined, {
          reply_to_message_id: replyToMsgId
        });
      }
    } catch (error) {
      await sendMessage(chatId, translations.search_link_fallback
        .replace('{link}', images[i])
        .replace('{count}', String(images.length)), {
        reply_to_message_id: replyToMsgId
      });
    }
  }
}

// ============================================================
// 📦 HANDLE BLOCKED USERS COMMAND (نسخه نهایی - فقط یک بار)
// ============================================================

async function handleBlockedUsersCommand(message: Message, env: Env): Promise<void> {
  const { chat } = message;
  
  if (message.from?.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🚫 دسترسی محدود", {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  const processingMsg = await sendMessage(chat.id, 
    "🔍 **در حال اسکن کاربران...**\n\n⏳ این کار ممکنه چند دقیقه طول بکشه", 
    { reply_to_message_id: message.message_id }
  );
  
  try {
    let allKeys: any[] = [];
    let listResult = await env.SESSIONS.list({ prefix: "session:" });
    allKeys.push(...listResult.keys);
    
    while (!listResult.list_complete && listResult.cursor) {
      listResult = await env.SESSIONS.list({ prefix: "session:", cursor: listResult.cursor });
      allKeys.push(...listResult.keys);
    }
    
    const allUserIds: number[] = [];
    const userInfoMap = new Map<number, { firstName: string; userName: string; lastSeen: number }>();
    
    for (const item of allKeys) {
      try {
        const stored = await env.SESSIONS.get(item.name, "json");
        if (!stored) continue;
        
        const session = stored as ChatSession;
        
        if (session.type !== "private") continue;
        if (session.messageCount < 1) continue;
        
        const userMemories = session.userMemories;
        const firstUser = Array.from(userMemories.values())[0];
        
        if (firstUser && firstUser.userId) {
          allUserIds.push(firstUser.userId);
          userInfoMap.set(firstUser.userId, {
            firstName: firstUser.firstName,
            userName: firstUser.userName || '',
            lastSeen: session.lastSeen
          });
        }
        
      } catch (error) {
        continue;
      }
    }
    
    if (allUserIds.length === 0) {
      await editMessageText(chat.id, processingMsg.message_id, 
        "📭 **هیچ کاربری یافت نشد**"
      );
      return;
    }
    
    await editMessageText(chat.id, processingMsg.message_id, 
      `🔍 **در حال بررسی ${allUserIds.length} کاربر...**\n\n` +
      `⏳ لطفاً صبر کنید (حدود ${Math.ceil(allUserIds.length * 0.15)} ثانیه)`
    );
    
    const blockedUsers: Array<{
      userId: number;
      firstName: string;
      userName: string;
      lastSeen: number;
    }> = [];
    
    let checked = 0;
    const batchSize = 10;
    
    for (let i = 0; i < allUserIds.length; i++) {
      const userId = allUserIds[i];
      const isBlocked = await isUserBlocked(userId, env);
      
      if (isBlocked) {
        const info = userInfoMap.get(userId)!;
        blockedUsers.push({
          userId,
          firstName: info.firstName,
          userName: info.userName,
          lastSeen: info.lastSeen
        });
      }
      
      checked++;
      
      if (checked % batchSize === 0 || checked === allUserIds.length) {
        await editMessageText(chat.id, processingMsg.message_id, 
          `🔍 **در حال بررسی...**\n\n` +
          `📊 پیشرفت: ${checked}/${allUserIds.length}\n` +
          `🚫 مسدود: ${blockedUsers.length}`
        ).catch(() => {});
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    let text = `🚫 **کاربران مسدودکننده ربات**\n\n`;
    text += `📊 از ${allUserIds.length} کاربر بررسی شده:\n`;
    text += `✅ فعال: ${allUserIds.length - blockedUsers.length}\n`;
    text += `🚫 مسدود: ${blockedUsers.length}\n\n`;
    
    if (blockedUsers.length === 0) {
      text += `🎉 **همه کاربران ربات رو فعال دارن!**`;
    } else {
      text += `➖➖➖➖➖➖➖➖➖➖\n\n`;
      
      blockedUsers.sort((a, b) => b.lastSeen - a.lastSeen);
      
      blockedUsers.slice(0, 30).forEach((user, i) => {
        const lastSeenDate = new Date(user.lastSeen).toLocaleDateString('fa-IR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        text += `**${i + 1}.** ${user.firstName}\n`;
        text += `🆔 \`${user.userId}\`\n`;
        text += `👤 @${user.userName || 'ندارد'}\n`;
        text += `📅 آخرین فعالیت: ${lastSeenDate}\n\n`;
      });
      
      if (blockedUsers.length > 30) {
        text += `➕ ... و ${blockedUsers.length - 30} کاربر دیگر\n\n`;
      }
      
      text += `💡 **توجه:** این لیست فقط کاربرایی رو نشون میده که ربات رو مسدود کردن.`;
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: "🔙 بازگشت", callback_data: "admin_back_to_main" }]
      ]
    };
    
    await editMessageText(chat.id, processingMsg.message_id, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
    
  } catch (error) {
    logger.error("Blocked users check failed", error);
    await editMessageText(chat.id, processingMsg.message_id, 
      "❌ **خطا در بررسی**\n\nلطفاً دوباره تلاش کنید."
    );
  }
}
  
  // ============================================================
  // 📋 ساخت کیبورد پنل ادمین
  // ============================================================
  
  const keyboard: any = { inline_keyboard: [] };
  
  // دکمه‌های کاربران (اعداد)
  const userButtons: any[] = [];
  pageUsers.forEach((user, idx) => {
    userButtons.push({
      text: user.vipStatus ? `✅ ${idx + 1}` : `${idx + 1}`,
      callback_data: `admin_user_${user.userId}`
    });
  });
  
  for (let i = 0; i < userButtons.length; i += 5) {
    keyboard.inline_keyboard.push(userButtons.slice(i, i + 5));
  }
  
  // دکمه‌های ناوبری
  const navRow: any[] = [];
  if (state.page > 0) navRow.push({ text: "◀️ قبلی", callback_data: "admin_page_prev" });
  navRow.push({ text: `${state.page + 1}/${totalPages}`, callback_data: "admin_noop" });
  if (state.page < totalPages - 1) navRow.push({ text: "بعدی ▶️", callback_data: "admin_page_next" });
  if (navRow.length > 0) keyboard.inline_keyboard.push(navRow);
  
  // دکمه‌های مرتب‌سازی
  keyboard.inline_keyboard.push([
    { text: "🆕 جدیدترین", callback_data: "admin_sort_new" },
    { text: "⚡ فعال‌ترین", callback_data: "admin_sort_active" },
    { text: "💬 پرپیام", callback_data: "admin_sort_messages" }
  ]);
  
  // دکمه‌های مدیریتی
  keyboard.inline_keyboard.push([
    { text: isInMaintenance ? "✅ خروج از تعمیرات" : "🛠️ ورود به تعمیرات", callback_data: "admin_toggle_maintenance" },
    { text: "📊 CSV", callback_data: "admin_export_csv" }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: "📢 ارسال پیام همگانی", callback_data: "admin_broadcast" },
    { text: "🚫 کاربران مسدود", callback_data: "admin_show_blocked" }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: "👥 گروه‌های فعال", callback_data: "admin_show_groups" },
    { text: "📋 لاگ‌ها", callback_data: "admin_show_logs" }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: "🔄 بروزرسانی", callback_data: "admin_refresh" },
    { text: "❌ بستن", callback_data: "admin_close" }
  ]);
  
      await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
  
  adminPanelStates.set(chatId, state);
}  // <-- اینجا خط ۷۰۱۳ بوده، الان فقط یک } برای بسته شدن تابع هست

// ============================================================
// 👤 SHOW USER DETAIL
// ============================================================

async function showUserDetail(chatId: number, messageId: number, userId: number, env: Env) {
  const allUsers = await getAllUserStatistics(env);
  const user = allUsers.find(u => u.userId === userId);
  
  if (!user) {
    await editMessageText(chatId, messageId, "❌ **کاربر یافت نشد**");
    return;
  }
  
  const text = formatDetailedUserStats(user);
  const isBlocked = await isUserBlocked(userId, env);
  
  const keyboard = {
    inline_keyboard: [
      [
        { 
          text: user.vipStatus ? "❌ حذف VIP" : "✅ افزودن VIP", 
          callback_data: `admin_toggle_vip_${userId}` 
        }
      ],
      [
        { 
          text: isBlocked ? "✅ رفع مسدودیت" : "🚫 مسدود کردن",  
          callback_data: `admin_block_${userId}` 
        }
      ],
      [
        { text: "📨 ارسال پیام خصوصی", callback_data: `admin_msg_${userId}` }
      ],
      [
        { text: "🧠 دیدن حافظه", callback_data: `admin_view_memory_${userId}` }
      ],
      [
        { text: "🗑️ حذف سشن", callback_data: `admin_delete_session_${userId}` }
      ],
      [
        { text: "🔙 بازگشت", callback_data: "admin_back_to_main" }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 📊 FORMAT DETAILED USER STATS
// ============================================================

function formatDetailedUserStats(user: UserStatistics): string {
  const escapeMarkdown = (text: string | undefined): string => {
    if (!text) return 'نامشخص';
    return String(text)
      .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  };
  
  const formatSafeDate = (timestamp: number | undefined, format: 'full' | 'short' = 'full'): string => {
    if (!timestamp || isNaN(timestamp) || timestamp === 0) {
      return 'نامشخص';
    }
    
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Tehran'
      };
      
      if (format === 'full') {
        options.year = 'numeric';
        options.month = 'long';
        options.day = 'numeric';
        options.hour = '2-digit';
        options.minute = '2-digit';
      } else {
        options.year = 'numeric';
        options.month = 'short';
        options.day = 'numeric';
      }
      
      return new Date(timestamp).toLocaleString('fa-IR', options);
    } catch {
      return 'نامشخص';
    }
  };
  
  const calculateUsageDuration = (): string => {
    const firstUsed = user.statistics?.firstUsed || 0;
    const lastSeen = user.statistics?.lastSeen || 0;
    
    if (firstUsed === 0 || lastSeen === 0) return 'نامشخص';
    
    const durationMs = lastSeen - firstUsed;
    const days = Math.floor(durationMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((durationMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    
    if (days > 0) {
      return `${days} روز و ${hours} ساعت`;
    } else if (hours > 0) {
      return `${hours} ساعت`;
    } else {
      const minutes = Math.floor(durationMs / (60 * 1000));
      return `${minutes} دقیقه`;
    }
  };
  
  const getFavoriteEngine = (): { name: string; count: number; percentage: number } => {
    const stats = user.statistics || {};
    const engines = [
      { key: 'gemini' as const, count: stats.geminiMessages || 0 },
      { key: 'sambanova' as const, count: stats.sambanovaMessages || 0 },
      { key: 'pollinations' as const, count: stats.pollinationsMessages || 0 }
    ];
    
    const favorite = engines.sort((a, b) => b.count - a.count)[0];
    const total = stats.totalMessages || 1;
    const percentage = Math.round((favorite.count / total) * 100);
    
    return {
      name: favorite.key === 'gemini' ? 'نوا' : favorite.key === 'sambanova' ? 'لونا' : 'زارا',
      count: favorite.count,
      percentage
    };
  };
  
  const getActivityStatus = (): { status: string; emoji: string } => {
    const lastSeen = user.statistics?.lastSeen || 0;
    const now = Date.now();
    const diff = now - lastSeen;
    
    if (diff < 60 * 60 * 1000) {
      return { status: 'آنلاین اخیر', emoji: '🟢' };
    } else if (diff < 24 * 60 * 60 * 1000) {
      return { status: 'فعال امروز', emoji: '🟡' };
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
      return { status: 'فعال این هفته', emoji: '🟠' };
    } else {
      return { status: 'غیرفعال', emoji: '⚪' };
    }
  };
  
  const activity = getActivityStatus();
  const favorite = getFavoriteEngine();
  const usageDuration = calculateUsageDuration();
  
  const safeName = escapeMarkdown(user.firstName);
  const safeUsername = escapeMarkdown(user.userName || 'ندارد');
  const safeUserId = escapeMarkdown(String(user.userId || 'نامشخص'));
  
  let text = `👤 **اطلاعات کامل کاربر**\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  text += `📝 **مشخصات:**\n`;
  text += `• نام: ${safeName}\n`;
  text += `• یوزرنیم: @${safeUsername}\n`;
  text += `• آیدی: \`${safeUserId}\`\n`;
  text += `• وضعیت: ${user.vipStatus ? '👑 VIP' : '🆓 رایگان'}\n\n`;
  
  text += `${activity.emoji} **وضعیت فعالیت:** ${activity.status}\n`;
  text += `• مدت استفاده: ${usageDuration}\n\n`;
  
  const stats = user.statistics || {};
  text += `📊 **آمار پیام‌ها:**\n`;
  text += `• **کل:** ${stats.totalMessages || 0}\n`;
  text += `  ├─ 🤖 نوا: ${stats.geminiMessages || 0}\n`;
  text += `  ├─ 🎨 لونا: ${stats.sambanovaMessages || 0}\n`;
  text += `  └─ 🔬 زارا: ${stats.pollinationsMessages || 0}\n`;
  text += `\n⭐ **موتور محبوب:** ${favorite.name} (${favorite.percentage}%)\n\n`;
  
  text += `🎨 **آمار رسانه‌ها:**\n`;
  text += `• 🎤 ویس دریافتی: ${stats.voicesReceived || 0}\n\n`;
  
  if (!user.vipStatus) {
    text += `⏳ **محدودیت‌های امروز:**\n`;
    const limits = user.dailyLimits || { messages: 0, voicesSent: 0, voicesReceived: 0, imagesGenerated: 0 };
    text += `• 💬 پیام: ${limits.messages || 0}/100\n`;
    text += `• 🔊 ویس: ${limits.voicesSent || 0}/10\n`;
    text += `• 🖼️ تصویر: ${limits.imagesGenerated || 0}/5\n\n`;
  } else {
    text += `✨ **کاربر VIP - بدون محدودیت**\n\n`;
  }
  
  text += `📅 **تاریخچه:**\n`;
  text += `• اولین استفاده: ${formatSafeDate(stats.firstUsed)}\n`;
  text += `• آخرین فعالیت: ${formatSafeDate(stats.lastSeen)}\n`;
  
  text += `\n━━━━━━━━━━━━━━━━━━━━`;
  
  return text;
}

// ============================================================
// 🧠 SHOW USER MEMORY
// ============================================================

async function showUserMemory(chatId: number, messageId: number, userId: number, env: Env): Promise<void> {
  try {
    const sessionKey = `session:${userId}`;
    const stored = await env.SESSIONS.get(sessionKey, "json");
    
    if (!stored) {
      await editMessageText(chatId, messageId, "❌ **سشن یافت نشد**");
      return;
    }
    
    const userSession = stored as ChatSession;
    const allUsers = await getAllUserStatistics(env);
    const user = allUsers.find(u => u.userId === userId);
    const userName = user?.firstName || 'Unknown';
    
    const activeEngine = userSession.engines[userSession.activeEngine];
    const historyCount = activeEngine.history?.length || 0;
    const totalSent = userSession.statistics?.totalMessages || 0;
    
    let text = `🧠 **حافظه کاربر ${userName}**\n\n`;
    text += `🆔 \`${userId}\`\n`;
    text += `📊 کل پیام‌های ارسالی: **${totalSent}**\n`;
    text += `💾 ذخیره شده در حافظه: **${historyCount}** (محدودیت: ${config.HISTORY_LIMIT})\n`;
    text += `🤖 موتور فعال: ${getEngineName(userSession.activeEngine, 'fa')}\n\n`;
    
    text += `📈 **آمار پیام‌ها به تفکیک موتور:**\n`;
    text += `• 🤖 نوا: ${userSession.statistics?.geminiMessages || 0}\n`;
    text += `• 🎨 لونا: ${userSession.statistics?.sambanovaMessages || 0}\n`;
    text += `• 🔬 زارا: ${userSession.statistics?.pollinationsMessages || 0}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    const history = activeEngine.history || [];
    
    if (history.length === 0) {
      text += '📭 **حافظه خالی است**';
    } else {
      const userMessages = history.filter(h => h.role === 'user').length;
      const modelMessages = history.filter(h => h.role === 'model' || h.role === 'assistant').length;
      
      text += `📚 **خلاصه حافظه:**\n`;
      text += `• کل پیام‌ها: ${history.length}\n`;
      text += `• پیام‌های کاربر: ${userMessages}\n`;
      text += `• پاسخ‌های ربات: ${modelMessages}\n\n`;
      
      if (totalSent > historyCount) {
        text += `⚠️ **توجه:** از ${totalSent} پیام ارسالی، فقط ${historyCount} پیام اخیر در حافظه ذخیره شده است.\n\n`;
      }
      
      text += `🔖 **آخرین مکالمات (10 پیام اخیر):**\n\n`;
      
      const recentHistory = history.slice(-10);
      
      recentHistory.forEach((item, index) => {
        const role = item.role === 'user' ? '👤' : 
                     item.role === 'model' ? '🤖' : '⚙️';
        
        const timestamp = item.timestamp ? 
          new Date(item.timestamp).toLocaleString('fa-IR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'نامشخص';
        
        const messageText = item.parts[0]?.text || '[رسانه]';
        const preview = messageText.length > 60 ? 
          messageText.substring(0, 60) + '...' : 
          messageText;
        
        text += `${role} \`${timestamp}\`\n${preview}\n\n`;
      });
      
      if (history.length > 10) {
        text += `➕ ... و ${history.length - 10} پیام قدیمی‌تر\n\n`;
      }
    }
    
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `💾 **جزئیات تکنیکال:**\n`;
    text += `• آخرین فعالیت: ${formatSafeDate(userSession.lastSeen, 'short')}\n`;
    text += `• تعداد در موتورها:\n`;
    text += `  - نوا: ${userSession.engines.gemini.history.length}\n`;
    text += `  - لونا: ${userSession.engines.sambanova.history.length}\n`;
    text += `  - زارا: ${userSession.engines.pollinations.history.length}\n`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📥 دانلود کامل حافظه', callback_data: `admin_download_memory_${userId}` }
        ],
        [
          { text: '🗑️ ریست حافظه', callback_data: `admin_confirm_reset_memory_${userId}` }
        ],
        [
          { text: '🔙 بازگشت', callback_data: `admin_user_${userId}` }
        ]
      ]
    };
    
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
    
  } catch (error) {
    logger.error(`Failed to show memory for user ${userId}`, error);
    await editMessageText(chatId, messageId, "❌ **خطا در نمایش حافظه**");
  }
}

// ============================================================
// 📦 GET ALL USER STATISTICS
// ============================================================

async function getAllUserStatistics(env: Env): Promise<UserStatistics[]> {
  const users: UserStatistics[] = [];
  const seenUserIds = new Set<number>();
  
  try {
    let allKeys: any[] = [];
    let listResult = await env.SESSIONS.list({ prefix: "session:" });
    allKeys.push(...listResult.keys);
    
    while (!listResult.list_complete && listResult.cursor) {
      listResult = await env.SESSIONS.list({ prefix: "session:", cursor: listResult.cursor });
      allKeys.push(...listResult.keys);
    }
    
    logger.info(`📊 Scanning ${allKeys.length} sessions...`);
    
    for (const item of allKeys) {
      try {
        const stored = await env.SESSIONS.get(item.name, "json");
        if (!stored) continue;
        
        const session = stored as ChatSession;
        
        // برای چت خصوصی
        if (session.type === 'private') {
          const userId = session.id;

          if (userId === config.BOT_OWNER_ID || userId === 777000) continue;
          
          if (seenUserIds.has(userId)) continue;
          seenUserIds.add(userId);
          
          let userInfo = { firstName: 'Unknown User', userName: '' };
          
          if (session.userMemories) {
            const memories = Array.from(session.userMemories.values ? session.userMemories.values() : Object.values(session.userMemories));
            if (memories.length > 0) {
              userInfo.firstName = memories[0].firstName || 'Unknown User';
              userInfo.userName = memories[0].userName || '';
            }
          }
          
          const stats = session.statistics || {
            totalMessages: session.messageCount || 0,
            geminiMessages: 0, sambanovaMessages: 0, pollinationsMessages: 0,
            voicesReceived: 0, firstUsed: session.lastSeen || Date.now(),
            lastSeen: session.lastSeen || Date.now()
          };
          
          users.push({
            userId: userId, firstName: userInfo.firstName, userName: userInfo.userName,
            chatType: session.type, statistics: stats, activeEngine: session.activeEngine || 'gemini',
            vipStatus: session.vipStatus || false,
            dailyLimits: session.dailyLimits || { messages: 0, voicesSent: 0, voicesReceived: 0, imagesGenerated: 0, lastReset: Date.now() }
          });
        }
        // برای گروه‌ها
        else if (session.type === 'group' || session.type === 'supergroup') {
          const userMemories = session.userMemories || {};
          const memoriesArray = userMemories instanceof Map ? Array.from(userMemories.values()) : Object.values(userMemories);
          
          memoriesArray.forEach((memory: UserMemory) => {
            if (memory.userId === config.BOT_OWNER_ID || memory.userId === 777000) return;
            if (seenUserIds.has(memory.userId)) return;
            seenUserIds.add(memory.userId);
            
            const stats = session.statistics || {
              totalMessages: memory.messageCount || 0,
              geminiMessages: 0, sambanovaMessages: 0, pollinationsMessages: 0,
              voicesReceived: 0, firstUsed: session.lastSeen || Date.now(),
              lastSeen: memory.lastSeen || Date.now()
            };
            
            users.push({
              userId: memory.userId, firstName: memory.firstName || 'Unknown', userName: memory.userName || '',
              chatType: session.type, statistics: stats, activeEngine: session.activeEngine || 'gemini',
              vipStatus: session.vipStatus || false,
              dailyLimits: session.dailyLimits || { messages: 0, voicesSent: 0, voicesReceived: 0, imagesGenerated: 0, lastReset: Date.now() }
            });
          });
        }
      } catch (error) {
        continue;
      }
    }
    
    const finalUsers = users.sort((a, b) => (b.statistics?.lastSeen || 0) - (a.statistics?.lastSeen || 0));
    logger.info(`✅ Found ${finalUsers.length} unique users`);
    return finalUsers;
    
  } catch (error) {
    logger.error('Failed to get statistics:', error);
    return [];
  }
}

// ============================================================
// 🚫 GET BLOCKED USERS
// ============================================================

async function getBlockedUsers(env: Env): Promise<Array<{userId: number, since: number, reason: string}>> {
  const blocked: Array<{userId: number, since: number, reason: string}> = [];
  
  try {
    let cursor: string | undefined;
    do {
      const list = await env.SESSIONS.list({ 
        prefix: "user_blocked:", 
        cursor 
      });
      
      for (const item of list.keys) {
        try {
          const userId = parseInt(item.name.replace('user_blocked:', ''));
          const data = await env.SESSIONS.get(item.name, "json") as any;
          
          if (data && data.blocked) {
            blocked.push({
              userId,
              since: data.since || Date.now(),
              reason: data.reason || 'نامشخص'
            });
          }
        } catch (error) {
          logger.warn(`Failed to parse blocked user ${item.name}`);
        }
      }
      
      cursor = list.cursor;
    } while (cursor);
    
    return blocked.sort((a, b) => b.since - a.since);
    
  } catch (error) {
    logger.error('Failed to get blocked users', error);
    return [];
  }
}

// ============================================================
// 📊 GET BLOCKED USERS COUNT
// ============================================================

async function getBlockedUsersCount(env: Env): Promise<number> {
  try {
    const list = await env.SESSIONS.list({ prefix: "user_blocked:" });
    return list.keys.length;
  } catch (error) {
    logger.error('Failed to count blocked users', error);
    return 0;
  }
}

// ============================================================
// 🚫 IS USER BLOCKED
// ============================================================

async function isUserBlocked(userId: number, env: Env): Promise<boolean> {
  const key = `user_blocked:${userId}`;
  
  try {
    const stored = await env.SESSIONS.get(key, "json");
    if (!stored) return false;
    
    const data = stored as { blocked: boolean; since: number };
    return data.blocked || false;
  } catch (error) {
    logger.warn(`Failed to check block status for ${userId}`, error);
    return false;
  }
}

// ============================================================
// 🔒 SET USER BLOCKED
// ============================================================

async function setUserBlocked(userId: number, isBlocked: boolean, env: Env): Promise<void> {
  const key = `user_blocked:${userId}`;
  
  try {
    if (isBlocked) {
      await env.SESSIONS.put(key, JSON.stringify({
        blocked: true,
        since: Date.now(),
        reason: "Blocked by admin"
      }));
      logger.info(`✅ User ${userId} blocked`);
    } else {
      await env.SESSIONS.delete(key);
      logger.info(`✅ User ${userId} unblocked`);
    }
  } catch (error) {
    logger.error(`Failed to set block status for ${userId}`, error);
  }
}

// ============================================================
// 📢 BROADCAST - ارسال پیام همگانی
// ============================================================

async function handleBroadcastCallback(cb: CallbackQuery, env: Env) {
  const chat = cb.message!.chat;
  const user = cb.from;
  
  if (user.id !== config.BOT_OWNER_ID) {
    await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
    return;
  }
  
  const lang = 'fa';
  
  const text = `📢 **ارسال پیام همگانی**\n\nگیرندگان را انتخاب کنید:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "👥 همه کاربران", callback_data: "broadcast_all" },
        { text: "👑 فقط VIP", callback_data: "broadcast_vip" }
      ],
      [
        { text: "🆓 فقط رایگان", callback_data: "broadcast_free" }
      ],
      [
        { text: "🔙 بازگشت", callback_data: "admin_back_to_main" }
      ]
    ]
  };
  
  await answerCallbackQuery(cb.id);
  await editMessageText(chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 📢 PROCESS BROADCAST BATCH
// ============================================================

async function processBroadcastBatch(env: Env): Promise<void> {
  const BATCH_SIZE = 20;
  const DELAY_MS = 200;

  try {
    const stored = await env.SESSIONS.get('broadcast_job:current', 'json');
    if (!stored) return;

    const job = stored as BroadcastJob;
    if (job.status === 'done' || job.status === 'error') return;

    job.status = 'running';

    const startIndex = job.processedIndex;
    const endIndex = Math.min(startIndex + BATCH_SIZE, job.userIds.length);
    const batchUsers = job.userIds.slice(startIndex, endIndex);

    logger.info(`📤 Broadcast batch: ${startIndex + 1}-${endIndex} / ${job.totalUsers}`);

    for (const userId of batchUsers) {
      try {
        await callTelegramAPI("sendMessage", {
          chat_id: userId,
          text: `📢 **پیام از مدیر ربات:**\n\n${job.message}\n\n━━━━━━━━━━━━━━\n_این پیام از طرف مدیریت ارسال شده است_`,
          parse_mode: "Markdown",
          disable_notification: false
        });
        job.sent++;
      } catch (error) {
        job.failed++;
        const errMsg = error instanceof Error ? error.message.toLowerCase() : '';
        if (!errMsg.includes('blocked') && !errMsg.includes('deactivated') && !errMsg.includes('not found') && !errMsg.includes('forbidden')) {
          logger.warn(`Broadcast unexpected fail to ${userId}: ${errMsg.substring(0, 60)}`);
        }
      }

      job.processedIndex++;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    const isDone = job.processedIndex >= job.totalUsers;
    job.status = isDone ? 'done' : 'pending';
    await env.SESSIONS.put('broadcast_job:current', JSON.stringify(job));

    const progressPercent = Math.round((job.processedIndex / job.totalUsers) * 100);

    if (isDone) {
      await editMessageText(job.adminChatId, job.adminMessageId,
        `✅ **ارسال پیام تکمیل شد!**\n\n` +
        `📊 **گزارش نهایی:**\n` +
        `• ✅ موفق: ${job.sent}\n` +
        `• ❌ ناموفق: ${job.failed}\n` +
        `• 👥 کل: ${job.totalUsers}`,
        {
          reply_markup: JSON.stringify({
            inline_keyboard: [[{ text: "🗑️ بستن", callback_data: "broadcast_close" }]]
          })
        }
      ).catch(() => {});
      
      logger.info(`✅ Broadcast done: ${job.sent} sent, ${job.failed} failed`);
    } else {
      await editMessageText(job.adminChatId, job.adminMessageId,
        `🔄 **در حال ارسال...**\n\n` +
        `📊 پیشرفت: ${job.processedIndex}/${job.totalUsers} (${progressPercent}%)\n` +
        `✅ موفق: ${job.sent} | ❌ ناموفق: ${job.failed}\n` +
        `⏳ ادامه در ۳۰ ثانیه دیگر...`,
        {
          reply_markup: JSON.stringify({
            inline_keyboard: [[
              { text: "📊 وضعیت", callback_data: "broadcast_status" },
              { text: "🛑 لغو", callback_data: "broadcast_cancel" }
            ]]
          })
        }
      ).catch(() => {});
    }

  } catch (error) {
    logger.error("Broadcast batch failed", error);
    try {
      const stored = await env.SESSIONS.get('broadcast_job:current', 'json');
      if (stored) {
        const job = stored as BroadcastJob;
        job.status = 'error';
        await env.SESSIONS.put('broadcast_job:current', JSON.stringify(job));
        await editMessageText(job.adminChatId, job.adminMessageId,
          `❌ **خطا در batch ارسال**\n\nارسال شده: ${job.sent}/${job.totalUsers}\nبرای ادامه دوباره از /admin اقدام کن.`
        ).catch(() => {});
      }
    } catch (e) {}
  }
}

// ============================================================
// 📦 CLEANUP SESSIONS
// ============================================================

async function cleanupSessions(env: Env): Promise<void> {
  const now = Date.now();
  let cleaned = 0;
  let compressed = 0;
  
  // 1. پاکسازی کش گروه‌ها
  for (const [chatId, context] of groupContextCache.entries()) {
    const lastActivity = context.messages.length > 0 
      ? context.messages[context.messages.length - 1].timestamp 
      : context.lastCleanup;
    
    if (now - lastActivity > 30 * 60 * 1000) {
      groupContextCache.delete(chatId);
      cleaned++;
    }
  }
  
  // 2. پاکسازی سشن‌های قدیمی
  let sessionKeys: any[] = [];
  let sessionList = await env.SESSIONS.list({ prefix: "session:" });
  sessionKeys.push(...sessionList.keys);
  
  while (!sessionList.list_complete && sessionList.cursor) {
    sessionList = await env.SESSIONS.list({ prefix: "session:", cursor: sessionList.cursor });
    sessionKeys.push(...sessionList.keys);
  }
  
  for (const item of sessionKeys) {
    try {
      const stored = await env.SESSIONS.get(item.name, "json");
      if (!stored) continue;
      
      const session = stored as ChatSession;
      const inactiveDays = Math.floor((now - session.lastSeen) / (24 * 60 * 60 * 1000));
      
      if (inactiveDays > 30) {
        await env.SESSIONS.delete(item.name);
        cleaned++;
        continue;
      }
    } catch (error) {
      logger.warn(`Failed to cleanup session ${item.name}`, error);
    }
  }
  
  // 3. پاکسازی کش مدل‌ها
  let modelKeys: any[] = [];
  let modelList = await env.SESSIONS.list({ prefix: "model_cache:" });
  modelKeys.push(...modelList.keys);
  
  while (!modelList.list_complete && modelList.cursor) {
    modelList = await env.SESSIONS.list({ prefix: "model_cache:", cursor: modelList.cursor });
    modelKeys.push(...modelList.keys);
  }

  for (const item of modelKeys) {
    try {
      const stored = await env.SESSIONS.get(item.name, "json");
      if (!stored) continue;
      
      const cache = stored as ModelCache;
      if (now - cache.lastUpdated > 7 * 24 * 60 * 60 * 1000) {
        await env.SESSIONS.delete(item.name);
        cleaned++;
      }
    } catch (error) {
      logger.warn(`Failed to cleanup model cache ${item.name}`, error);
    }
  }
  
  if (cleaned > 0 || compressed > 0) {
    logger.info(`🧹 Cleanup: ${cleaned} deleted, ${compressed} compressed`);
  }
}

// ============================================================
// 🗑️ DELETE USER SESSION
// ============================================================

async function deleteUserSession(chatId: number, messageId: number, userId: number, env: Env): Promise<void> {
  try {
    const sessionKey = `session:${userId}`;
    const exists = await env.SESSIONS.get(sessionKey, "json");
    
    if (!exists) {
      await sendMessage(chatId, `❌ سشنی برای کاربر \`${userId}\` یافت نشد.`, {
        reply_to_message_id: messageId
      });
      return;
    }

    await env.SESSIONS.delete(sessionKey);
    sessionCache.delete(sessionKey);
    
    await sendMessage(chatId, `✅ سشن کاربر \`${userId}\` با موفقیت حذف شد.`, {
      reply_to_message_id: messageId
    });
    
    logger.info(`🗑️ Deleted session for user ${userId} by admin`);
  } catch (error) {
    logger.error(`Failed to delete session for ${userId}`, error);
    await sendMessage(chatId, `❌ خطا در حذف سشن: ${error instanceof Error ? error.message : 'نامشخص'}`, {
      reply_to_message_id: messageId
    });
  }
}

// ============================================================
// 🧠 RESET USER MEMORY
// ============================================================

async function resetUserMemory(chatId: number, messageId: number, userId: number, env: Env): Promise<void> {
  try {
    const sessionKey = `session:${userId}`;
    const stored = await env.SESSIONS.get(sessionKey, "json");
    
    if (!stored) {
      await editMessageText(chatId, messageId, "❌ سشنی برای این کاربر یافت نشد.");
      return;
    }
    
    const session = stored as ChatSession;
    
    const engines: AIEngine[] = ['gemini', 'sambanova', 'pollinations'];
    const timestamp = Date.now();
    
    for (const engineName of engines) {
      const engine = session.engines[engineName];
      if (engine) {
        const systemPrompt = engine.history[0]?.parts[0]?.text || 
          buildDefaultPrompt(engineName, "User", false, undefined, undefined, session.language);
        
        engine.history = [{
          role: engineName === 'gemini' ? 'user' : 'assistant',
          parts: [{ text: systemPrompt }],
          timestamp: timestamp,
          userId: userId,
          userName: "User"
        }];
        
        if (engine.userHistories) {
          engine.userHistories.set(userId, []);
        }
      }
    }
    
    session.messageCount = 0;
    session.statistics.totalMessages = 0;
    session.statistics.geminiMessages = 0;
    session.statistics.sambanovaMessages = 0;
    session.statistics.pollinationsMessages = 0;
    
    await saveSessionWithLock(session, env, true);
    sessionCache.delete(sessionKey);
    
    const successText = session.language === 'fa'
      ? `✅ **حافظه کاربر با موفقیت ریست شد**\n\nتمام تاریخچه مکالمات پاک شد.`
      : `✅ **User memory successfully reset**\n\nAll conversation history cleared.`;
    
    await editMessageText(chatId, messageId, successText, {
      reply_markup: JSON.stringify({
        inline_keyboard: [[
          { text: session.language === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: `admin_user_${userId}` }
        ]]
      })
    });
    
    logger.info(`🗑️ Memory reset for user ${userId} by admin`);
    
  } catch (error) {
    logger.error(`Failed to reset memory for ${userId}`, error);
    await editMessageText(chatId, messageId, 
      `❌ **خطا در ریست حافظه**\n\n${error instanceof Error ? error.message : 'خطای نامشخص'}`
    );
  }
}

// ============================================================
// 📊 SEND DATABASE STATS
// ============================================================

async function sendDatabaseStats(chatId: number, replyTo: number, env: Env): Promise<void> {
  const processingMsg = await sendMessage(chatId, "📊 در حال محاسبه...", {
    reply_to_message_id: replyTo
  });
  
  try {
    let totalSessions = 0, activeSessions = 0, vipCount = 0;
    let totalMessages = 0, totalVoices = 0;
    let oldestSession = Date.now(), newestSession = 0;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    let allKeys: any[] = [];
    let listResult = await env.SESSIONS.list({ prefix: "session:" });
    allKeys.push(...listResult.keys);
    while (!listResult.list_complete && listResult.cursor) {
      listResult = await env.SESSIONS.list({ prefix: "session:", cursor: listResult.cursor });
      allKeys.push(...listResult.keys);
    }

    for (const item of allKeys) {
      try {
        const stored = await env.SESSIONS.get(item.name, "json") as any;
        if (!stored) continue;
        
        totalSessions++;
        if (stored.lastSeen > sevenDaysAgo) activeSessions++;
        if (stored.vipStatus) vipCount++;
        totalMessages += stored.statistics?.totalMessages || 0;
        totalVoices += stored.statistics?.voicesReceived || 0;
        
        if (stored.statistics?.firstUsed && stored.statistics.firstUsed < oldestSession) oldestSession = stored.statistics.firstUsed;
        if (stored.lastSeen > newestSession) newestSession = stored.lastSeen;
      } catch (error) {
        continue;
      }
    }

    const text = `📊 **آمار دیتابیس**\n\n` +
      `👥 کل سشن‌ها: ${totalSessions}\n` +
      `🔥 فعال (7 روز): ${activeSessions}\n` +
      `👑 VIP: ${vipCount}\n` +
      `💬 کل پیام‌ها: ${totalMessages}\n` +
      `🎤 کل ویس‌ها: ${totalVoices}\n\n` +
      `📅 قدیمی‌ترین: ${formatSafeDate(oldestSession, 'short')}\n` +
      `📅 جدیدترین: ${formatSafeDate(newestSession, 'short')}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: "🧹 پاکسازی", callback_data: "db_auto_clean" }],
        [{ text: "🗑️ حذف قدیمی‌ها", callback_data: "db_delete_old" }],
        [{ text: "🔄 بروزرسانی", callback_data: "db_refresh_stats" }]
      ]
    };
    
    await editMessageText(chatId, processingMsg.message_id, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
    
  } catch (error) {
    logger.error("Database stats failed", error);
    await editMessageText(chatId, processingMsg.message_id, "❌ خطا در محاسبه آمار");
  }
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۱۳: مدیریت گروه‌ها، لاگ‌ها و CSV
// ============================================================

// ============================================================
// 👥 GROUP INTERFACE
// ============================================================

interface Group {
  id: number;
  title: string;
  source: string;
  joinedAt: number;
}

// ============================================================
// 📥 ON BOT JOINED GROUP
// ============================================================

async function onBotJoinedGroup(chat: any, source: string, env: Env) {
  const groups: Group[] = await env.SESSIONS.get("joined_groups", "json") || [];
  if (!groups.find(g => g.id === chat.id)) {
    groups.push({
      id: chat.id,
      title: chat.title || "Unknown",
      source: source,
      joinedAt: Date.now()
    });
    await env.SESSIONS.put("joined_groups", JSON.stringify(groups));
    logger.info(`✅ Bot joined group: ${chat.title} (${chat.id})`);
  }
}

// ============================================================
// 📤 ON BOT LEFT GROUP
// ============================================================

async function onBotLeftGroup(chatId: number, env: Env) {
  let groups: Group[] = await env.SESSIONS.get("joined_groups", "json") || [];
  groups = groups.filter(g => g.id !== chatId);
  await env.SESSIONS.put("joined_groups", JSON.stringify(groups));
  logger.info(`✅ Bot left group: ${chatId}`);
}

// ============================================================
// 👥 SHOW ACTIVE GROUPS
// ============================================================

async function showActiveGroups(chatId: number, msgId: number, env: Env) {
  const groups: Group[] = await env.SESSIONS.get("joined_groups", "json") || [];
  let text = `👥 **گروه‌های فعال ربات**\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `**تعداد کل گروه‌ها:** ${groups.length}\n\n`;
  
  if (groups.length === 0) {
    text += `📭 _هیچ گروهی یافت نشد_`;
  } else {
    groups.forEach((g, i) => {
      const date = new Date(g.joinedAt).toLocaleDateString('fa-IR', { 
        month: 'numeric', 
        day: 'numeric', 
        year: 'numeric' 
      });
      text += `${i + 1}. **${g.title}**\n`;
      text += `🆔 \`${g.id}\`\n`;
      text += `📅 تاریخ加入: ${date}\n\n`;
    });
  }
  
  const keyboard = {
    inline_keyboard: [
      ...groups.slice(0, 10).map(g => ([{ 
        text: g.title.length > 20 ? g.title.substring(0, 20) + '...' : g.title, 
        callback_data: `grp_${g.id}` 
      }])),
      [
        { text: "🔄 بروزرسانی", callback_data: "groups_refresh" },
        { text: "🔙 بازگشت به پنل", callback_data: "admin_back_to_main" }
      ]
    ]
  };
  
  await editMessageText(chatId, msgId, text, { 
    reply_markup: JSON.stringify(validateKeyboard(keyboard)) 
  });
}

// ============================================================
// 👥 SHOW GROUP DETAIL
// ============================================================

async function showGroupDetail(chatId: number, msgId: number, groupId: number, env: Env) {
  const groups: Group[] = await env.SESSIONS.get("joined_groups", "json") || [];
  const group = groups.find(g => g.id === groupId);
  
  if (!group) {
    await editMessageText(chatId, msgId, "❌ **گروه یافت نشد**");
    return;
  }
  
  const isVip = await isGroupVIP(groupId, env);
  
  const text = `📊 **جزئیات گروه**\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📛 **نام:** ${group.title}\n` +
    `🆔 **آیدی:** \`${group.id}\`\n` +
    `📎 **منبع:** ${group.source}\n` +
    `👑 **VIP:** ${isVip ? '✅ فعال' : '❌ غیرفعال'}\n` +
    `📅 **تاریخ加入:** ${new Date(group.joinedAt).toLocaleDateString('fa-IR', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}\n` +
    `━━━━━━━━━━━━━━━━━━━━`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: isVip ? "❌ حذف VIP گروه" : "👑 افزودن VIP گروه", callback_data: `grp_toggle_vip_${groupId}` }
      ],
      [
        { text: "🚪 خروج از گروه", callback_data: `leave_grp_${groupId}` }
      ],
      [
        { text: "🔙 بازگشت به لیست", callback_data: "admin_show_groups" }
      ]
    ]
  };
  
  await editMessageText(chatId, msgId, text, { 
    reply_markup: JSON.stringify(validateKeyboard(keyboard)) 
  });
}

// ============================================================
// 👑 SET GROUP VIP
// ============================================================

async function setGroupVIP(chatId: number, isVip: boolean, env: Env): Promise<void> {
  const key = `group_vip:${chatId}`;
  const data = {
    vipStatus: isVip,
    since: Date.now()
  };
  
  try {
    await env.SESSIONS.put(key, JSON.stringify(data));
    logger.info(`Group ${chatId} VIP status: ${isVip}`);
  } catch (error) {
    logger.error(`Failed to set group VIP for ${chatId}`, error);
  }
}

// ============================================================
// 👑 IS GROUP VIP
// ============================================================

async function isGroupVIP(chatId: number, env: Env): Promise<boolean> {
  const key = `group_vip:${chatId}`;
  
  try {
    const stored = await env.SESSIONS.get(key, "json");
    if (!stored) return false;
    
    const data = stored as { vipStatus: boolean; since: number };
    return data.vipStatus || false;
  } catch (error) {
    logger.warn(`Failed to check group VIP for ${chatId}`, error);
    return false;
  }
}

// ============================================================
// 📋 SHOW LOGS
// ============================================================

async function showLogs(chatId: number, msgId: number, env: Env) {
  const logs = (globalThis as any).recentLogs || [];
  
  if (logs.length === 0) {
    await editMessageText(chatId, msgId, "📭 **هیچ لاگی ثبت نشده است**");
    return;
  }
  
  let text = `📋 **لاگ‌های اخیر ربات**\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  const recentLogs = logs.slice(-20);
  
  recentLogs.forEach((log: any) => {
    const time = new Date(log.timestamp).toLocaleTimeString('fa-IR');
    const icon = log.level === 'error' ? '🔴' : log.level === 'warn' ? '🟡' : '🟢';
    text += `${icon} \`${time}\`\n${log.message.substring(0, 100)}\n\n`;
  });
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🗑️ پاک کردن لاگ‌ها", callback_data: "log_clear" },
        { text: "📥 دانلود", callback_data: "log_download" }
      ],
      [
        { text: "🔴 خطاها", callback_data: "log_errors" },
        { text: "🟡 هشدارها", callback_data: "log_warnings" }
      ],
      [
        { text: "🔙 بازگشت", callback_data: "admin_back_to_main" }
      ]
    ]
  };
  
  await editMessageText(chatId, msgId, text, { 
    reply_markup: JSON.stringify(validateKeyboard(keyboard)) 
  });
}

// ============================================================
// 📊 EXPORT CSV
// ============================================================

async function exportCSV(chatId: number, env: Env) {
  const users = await getAllUserStatistics(env);
  
  let csv = "User ID,First Name,Username,VIP Status,Total Messages,Gemini,SambaNova,Pollinations,Voices,Voices Sent,Daily Messages,Daily Voices,Daily Images,First Used,Last Seen\n";
  
  users.forEach(u => {
    const toISOStringSafe = (timestamp: number | undefined): string => {
      if (!timestamp || isNaN(timestamp) || timestamp === 0) return 'N/A';
      try { return new Date(timestamp).toISOString(); } catch { return 'N/A'; }
    };
    
    csv += `${u.userId},`;
    csv += `"${u.firstName.replace(/"/g, '""')}",`;
    csv += `"${(u.userName || 'N/A').replace(/"/g, '""')}",`;
    csv += `${u.vipStatus ? 'VIP' : 'Free'},`;
    csv += `${u.statistics.totalMessages || 0},`;
    csv += `${u.statistics.geminiMessages || 0},`;
    csv += `${u.statistics.sambanovaMessages || 0},`;
    csv += `${u.statistics.pollinationsMessages || 0},`;
    csv += `${u.statistics.voicesReceived || 0},`;
    csv += `${u.dailyLimits.voicesSent || 0},`;
    csv += `${u.dailyLimits.messages || 0},`;
    csv += `${u.dailyLimits.voicesSent || 0},`;
    csv += `${u.dailyLimits.imagesGenerated || 0},`;
    csv += `"${toISOStringSafe(u.statistics.firstUsed)}",`;
    csv += `"${toISOStringSafe(u.statistics.lastSeen)}"\n`;
  });
  
  const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
  const formData = new FormData();
  formData.append("chat_id", chatId.toString());
  formData.append("document", blob, `nova_bot_statistics_${Date.now()}.csv`);
  formData.append("caption", "📊 **گزارش کامل کاربران ربات**");
  
  await fetchWithTimeout(`${API_URL}/sendDocument`, {
    method: "POST",
    body: formData
  });
}

// ============================================================
// 📊 FORMAT USER STATISTICS
// ============================================================

function formatUserStatistics(users: UserStatistics[], lang: 'fa' | 'en' | 'ar' = 'fa'): string {
  if (users.length === 0) {
    return lang === 'fa' 
      ? "📭 **هیچ کاربری یافت نشد**"
      : lang === 'en'
        ? "📭 **No users found**"
        : "📭 **لم يتم العثور على مستخدمين**";
  }
  
  const totalUsers = users.length;
  const totalMessages = users.reduce((sum, u) => sum + (u.statistics.totalMessages || 0), 0);
  const totalVoices = users.reduce((sum, u) => sum + (u.statistics.voicesReceived || 0), 0);
  const totalImages = users.reduce((sum, u) => sum + (u.dailyLimits.imagesGenerated || 0), 0);
  
  const engineCounts = {
    gemini: users.reduce((sum, u) => sum + (u.statistics.geminiMessages || 0), 0),
    sambanova: users.reduce((sum, u) => sum + (u.statistics.sambanovaMessages || 0), 0),
    pollinations: users.reduce((sum, u) => sum + (u.statistics.pollinationsMessages || 0), 0)
  };
  
  const mostPopularEngine = Object.entries(engineCounts)
    .sort((a, b) => b[1] - a[1])[0];
    
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const activeToday = users.filter(u => {
    const lastSeen = u.statistics.lastSeen || 0;
    return lastSeen > oneDayAgo;
  }).length;
  
  const vipUsers = users.filter(u => u.vipStatus).length;
  
  // انتخاب زبان برای برچسب‌ها
  const labels = lang === 'fa' ? {
    totalUsers: 'کل کاربران',
    vip: 'VIP',
    free: 'رایگان',
    activeToday: 'فعال امروز',
    messages: 'آمار پیام‌ها',
    total: 'کل',
    gemini: 'نوا',
    sambanova: 'لونا',
    pollinations: 'زارا',
    voices: 'کل ویس‌ها',
    images: 'کل تصاویر امروز',
    popular: 'محبوب‌ترین مدل',
    messagesCount: 'پیام',
    list: 'لیست کاربران',
    first: 'اولین',
    last: 'آخرین',
    today: 'امروز',
    voiceSent: 'ویس ارسالی',
    voiceReceived: 'ویس دریافتی',
    details: 'برای مشاهده جزئیات هر کاربر، از پنل ادمین استفاده کنید.'
  } : lang === 'en' ? {
    totalUsers: 'Total Users',
    vip: 'VIP',
    free: 'Free',
    activeToday: 'Active Today',
    messages: 'Message Stats',
    total: 'Total',
    gemini: 'Nova',
    sambanova: 'Luna',
    pollinations: 'Zara',
    voices: 'Total Voices',
    images: 'Total Images Today',
    popular: 'Most Popular Model',
    messagesCount: 'messages',
    list: 'User List',
    first: 'First',
    last: 'Last',
    today: 'Today',
    voiceSent: 'voice sent',
    voiceReceived: 'voice received',
    details: 'Use admin panel to see user details.'
  } : {
    totalUsers: 'إجمالي المستخدمين',
    vip: 'VIP',
    free: 'مجاني',
    activeToday: 'نشط اليوم',
    messages: 'إحصائيات الرسائل',
    total: 'الإجمالي',
    gemini: 'نوا',
    sambanova: 'لونا',
    pollinations: 'زارا',
    voices: 'إجمالي الصوتيات',
    images: 'إجمالي الصور اليوم',
    popular: 'النموذج الأكثر شعبية',
    messagesCount: 'رسالة',
    list: 'قائمة المستخدمين',
    first: 'الأول',
    last: 'الأخير',
    today: 'اليوم',
    voiceSent: 'صوت مرسل',
    voiceReceived: 'صوت مستلم',
    details: 'استخدم لوحة التحكم لمشاهدة تفاصيل المستخدم.'
  };
  
  let text = `📊 **${labels.messages}**\n\n`;
  text += `👥 **${labels.totalUsers}:** ${totalUsers}\n`;
  text += `👑 **${labels.vip}:** ${vipUsers} | 🆓 **${labels.free}:** ${totalUsers - vipUsers}\n`;
  text += `🔥 **${labels.activeToday}:** ${activeToday}\n\n`;
  
  text += `📈 **${labels.messages}:**\n`;
  text += `💬 ${labels.total}: ${totalMessages}\n`;
  text += `🤖 ${labels.gemini}: ${engineCounts.gemini}\n`;
  text += `🎨 ${labels.sambanova}: ${engineCounts.sambanova}\n`;
  text += `🔬 ${labels.pollinations}: ${engineCounts.pollinations}\n\n`;
  
  text += `🎤 **${labels.voices}:** ${totalVoices}\n\n`;
  text += `🖼️ **${labels.images}:** ${totalImages}\n\n`;
  
  if (mostPopularEngine[1] > 0) {
    const engineKey = `engine_${mostPopularEngine[0]}` as keyof typeof TRANSLATIONS.fa;
    const engLabel = TRANSLATIONS[lang]?.[engineKey] || TRANSLATIONS.fa[engineKey] || mostPopularEngine[0];
    text += `⭐ **${labels.popular}:** ${engLabel} (${mostPopularEngine[1]} ${labels.messagesCount})`;  
  }
  
  text += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `📋 **${labels.list} (${Math.min(10, users.length)} ${labels.messagesCount}):**\n\n`;
  
  const dateOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Tehran',
    month: 'short',
    day: 'numeric'
  };
  
  const dateTimeOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Tehran',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  const locale = lang === 'fa' ? 'fa-IR' : lang === 'en' ? 'en-US' : 'ar-SA';
  
  users.slice(0, 10).forEach((user, index) => {
    const num = index + 1;
    
    const lastSeen = user.statistics.lastSeen && user.statistics.lastSeen > 0
      ? new Date(user.statistics.lastSeen).toLocaleString(locale, dateTimeOptions)
      : 'N/A';
    
    const firstUsed = user.statistics.firstUsed && user.statistics.firstUsed > 0
      ? new Date(user.statistics.firstUsed).toLocaleDateString(locale, dateOptions)
      : 'N/A';
    
    const vipBadge = user.vipStatus ? '👑 ' : '';
    
    text += `**${num}.** ${vipBadge}${user.firstName}\n`;
    text += `🆔 \`${user.userId}\` | 👤 @${user.userName || 'N/A'}\n`;
    
    text += `💬 **${labels.total}:** ${user.statistics.totalMessages || 0} | `;
    text += `🤖 ${user.statistics.geminiMessages || 0} | `;
    text += `🎨 ${user.statistics.sambanovaMessages || 0} | `;
    text += `🔬 ${user.statistics.pollinationsMessages || 0}\n`;
    
    text += `🎤 ${user.statistics.voicesReceived || 0} ${labels.voiceReceived}\n`;
    
    text += `📅 ${labels.first}: ${firstUsed} | ⏰ ${labels.last}: ${lastSeen}\n`;
    
    if (!user.vipStatus) {
      text += `📊 **${labels.today}:** `;
      text += `${user.dailyLimits.messages || 0}/50 ${labels.messagesCount} | `;
      text += `${user.dailyLimits.voicesSent || 0}/5 ${labels.voiceSent} | `;
      text += `${user.dailyLimits.voicesReceived || 0}/10 ${labels.voiceReceived}`;
    }
    
    text += `\n`;
  });
  
  if (users.length > 10) {
    text += `➕ ... و ${users.length - 10} کاربر دیگر\n\n`;
    text += `💡 ${labels.details}`;
  }
  
  return text;
}

// ============================================================
// 🎤 SHOW VOICE HELP
// ============================================================

async function showVoiceHelp(cb: CallbackQuery, env: Env): Promise<void> {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  
  const text = lang === 'fa'
    ? `🎤 **راهنمای کامل ویس**\n\n` +
      `**1️⃣ ارسال ویس:**\n` +
      `• ویس بفرست، من تشخیص میدم و جواب میدم\n` +
      `• حداکثر ۲ دقیقه\n` +
      `• به فارسی یا انگلیسی\n\n` +
      `**2️⃣ تبدیل متن به ویس:**\n` +
      `\`[شخصیت] با ویس بگو [متن]\`\n\n` +
      `**🎨 مثال‌ها:**\n` +
      `\`نوا با ویس بگو سلام خوبی؟\`\n` +
      `\`سایفر با ویس بگو من هکرم\`\n` +
      `\`ویکتوریا با ویس بگو به من احترام بذار\`\n\n` +
      `**🎭 شخصیت‌های صوتی:**\n` +
      `👧 **صدای زن:** نوا، لیلیت، ویکتوریا، آریا، لونا، زارا\n` +
      `👦 **صدای مرد:** سایفر، جکس، صورت‌چرمی، شادو\n\n` +
      `**📊 محدودیت روزانه:**\n` +
      `• ${session.dailyLimits.voicesSent}/7 ویس ارسالی\n` +
      `${session.vipStatus ? '✅ **VIP - نامحدود**' : '🌟 **VIP شو برای نامحدود**'}`
    : `🎤 **Voice Guide**\n\n` +
      `**1️⃣ Send Voice:**\n` +
      `• Send voice note, I'll transcribe and reply\n` +
      `• Max 2 minutes\n` +
      `• Persian or English\n\n` +
      `**2️⃣ Text to Voice:**\n` +
      `\`[personality] with voice say [text]\`\n\n` +
      `**🎨 Examples:**\n` +
      `\`nova with voice say hello how are you?\`\n` +
      `\`cipher with voice say I am a hacker\`\n` +
      `\`victoria with voice say respect me\`\n\n` +
      `**🎭 Voice Personalities:**\n` +
      `👧 **Female:** Nova, Lilith, Victoria, Aria, Luna, Zara\n` +
      `👦 **Male:** Cipher, Jax, Leatherface, Shadow\n\n` +
      `**📊 Daily Limit:**\n` +
      `• ${session.dailyLimits.voicesSent}/7 voice sent\n` +
      `${session.vipStatus ? '✅ **VIP - Unlimited**' : '🌟 **Go VIP for unlimited**'}`;
  
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: lang === 'fa' ? '🔙 بازگشت به منوی ویس' : '🔙 Back to Voice Menu', callback_data: 'voice_menu' }]
      ]
    })
  });
}

// ============================================================
// 🎤 SHOW VOICE PERSONALITIES
// ============================================================

async function showVoicePersonalities(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  
  const text = lang === 'fa'
    ? `🎭 **شخصیت‌های صوتی**\n\n` +
      `**👧 شخصیت‌های با صدای زن:**\n` +
      `🤖 نوا (Nova) - دستیار هوشمند\n` +
      `🖤 لیلیت (Lilith) - اغواگر\n` +
      `👑 ویکتوریا (Victoria) - ملکه\n` +
      `🌙 آریا (Aria) - فیلسوف\n` +
      `🧠 لونا (Luna) - مغز متفکر\n` +
      `✨ زارا (Zara) - خلاق\n\n` +
      `**👦 شخصیت‌های با صدای مرد:**\n` +
      `💀 سایفر (Cipher) - هکر\n` +
      `🔥 جکس (Jax) - آشوبگر\n` +
      `🪚 صورت‌چرمی (Leatherface) - قاتل\n` +
      `🌑 شادو (Shadow) - سایه\n\n` +
      `💡 **نحوه استفاده:**\n` +
      `\`[نام شخصیت] با ویس بگو [متن]\`\n\n` +
      `مثال: \`نوا با ویس بگو سلام خوبی\``
    : `🎭 **Voice Personalities**\n\n` +
      `**👧 Female Voice:**\n` +
      `🤖 Nova - Smart Assistant\n` +
      `🖤 Lilith - Seductive\n` +
      `👑 Victoria - Queen\n` +
      `🌙 Aria - Philosopher\n` +
      `🧠 Luna - Deep Thinker\n` +
      `✨ Zara - Creative\n\n` +
      `**👦 Male Voice:**\n` +
      `💀 Cipher - Hacker\n` +
      `🔥 Jax - Chaos Bringer\n` +
      `🪚 Leatherface - Killer\n` +
      `🌑 Shadow - Shadow\n\n` +
      `💡 **Usage:**\n` +
      `\`[personality] with voice say [text]\`\n\n` +
      `Example: \`nova with voice say hello how are you\``;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منوی ویس' : '🔙 Back to Voice Menu', callback_data: 'voice_menu' }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 🎤 SHOW VOICE MENU
// ============================================================

async function showVoiceMenu(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const t = TRANSLATIONS[lang];
  const isVip = session.vipStatus || false;
  const daily = session.dailyLimits;
  const maxVoice = isVip ? '∞' : 7;
  
  const text = lang === 'fa'
    ? `🎤 **منوی ویس**\n\n` +
      `📊 **مصرف روزانه:**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎤 ${daily.voicesSent}/${maxVoice} ${t.panel_voice}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎯 **راهنمای ویس:**\n` +
      `• می‌تونی ویس بفرستی، من تشخیص میدم و جواب میدم\n` +
      `• برای تبدیل متن به ویس:\n` +
      `  \`نوا با ویس بگو سلام\`\n` +
      `  \`سایفر با ویس بگو من هکرم\`\n\n` +
      `🎭 **صداها بر اساس شخصیت:**\n` +
      `• 👧 نوا، لیلیت، ویکتوریا، آریا، لونا، زارا → صدای زن\n` +
      `• 👦 سایفر، جکس، صورت‌چرمی، شادو → صدای مرد\n\n` +
      `💡 **نکته:** برای شخصیت‌های جدید، صدای پیش‌فرض استفاده میشه.`
    : `🎤 **Voice Menu**\n\n` +
      `📊 **Daily Usage:**\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎤 ${daily.voicesSent}/${maxVoice} ${t.panel_voice}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎯 **Voice Guide:**\n` +
      `• Send voice note, I'll transcribe and reply\n` +
      `• Text to voice:\n` +
      `  \`nova with voice say hello\`\n` +
      `  \`cipher with voice say I am hacker\`\n\n` +
      `🎭 **Voices per personality:**\n` +
      `• 👧 Nova, Lilith, Victoria, Aria, Luna, Zara → Female\n` +
      `• 👦 Cipher, Jax, Leatherface, Shadow → Male\n\n` +
      `💡 **Note:** Default voice used for new personalities.`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: lang === 'fa' ? '🎤 راهنمای ویس' : '🎤 Voice Guide', callback_data: 'help_voice' },
        { text: lang === 'fa' ? '📋 شخصیت‌های صوتی' : '📋 Voice Personalities', callback_data: 'voice_personalities' }
      ],
      [
        { text: lang === 'fa' ? '🔙 بازگشت به منو' : '🔙 Back to Menu', callback_data: "back_to_panel" }
      ]
    ]
  };
  
  if (messageId) {
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  } else {
    await sendMessage(chatId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  }
}

// ============================================================
// 🎤 TTS HANDLER - تبدیل متن به ویس
// ============================================================



// ============================================================
// 📦 HANDLE GROUPS CALLBACK
// ============================================================

async function handleGroupsCallback(cb: CallbackQuery, env: Env) {
  const chatId = cb.message!.chat.id;
  const msgId = cb.message!.message_id;
  const data = cb.data!;

  if (data.startsWith("grp_")) {
    const groupId = parseInt(data.replace("grp_", ""));
    await answerCallbackQuery(cb.id);
    await showGroupDetail(chatId, msgId, groupId, env);
    return;
  }

  if (data.startsWith("leave_grp_")) {
    const groupId = parseInt(data.replace("leave_grp_", ""));
    
    try {
      await onBotLeftGroup(groupId, env);
      await answerCallbackQuery(cb.id, "✅ از گروه خارج شدم", false);
      await showActiveGroups(chatId, msgId, env);
    } catch (error) {
      await answerCallbackQuery(cb.id, "❌ خطا در خروج از گروه", true);
    }
    return;
  }

  if (data === "groups_refresh") {
    await answerCallbackQuery(cb.id, "🔄 در حال بروزرسانی...", false);
    await showActiveGroups(chatId, msgId, env);
    return;
  }
}

// ============================================================
// 📦 HANDLE LOG COMMAND
// ============================================================

async function handleLogCommand(message: Message, env: Env): Promise<void> {
  const { chat } = message;
  
  const logs = (globalThis as any).recentLogs || [];

  if (logs.length === 0) {
    await sendMessage(chat.id, "📭 هیچ لاگی ثبت نشده", { 
      reply_to_message_id: message.message_id 
    });
    return;
  }

  const errors = logs.filter((l: any) => l.level === 'error').slice(-5);
  const warnings = logs.filter((l: any) => l.level === 'warn').slice(-5);
  const infos = logs.filter((l: any) => l.level === 'info').slice(-3);
  
  let text = `📊 **لاگ‌های اخیر ربات**\n\n`;
  
  if (errors.length > 0) {
    text += `🔴 **خطاها (${errors.length}):**\n`;
    errors.forEach((log: any, i: number) => {
      text += `${i + 1}. ${log.message.substring(0, 50)}\n`;
    });
    text += `\n`;
  }
  
  if (warnings.length > 0) {
    text += `🟡 **هشدارها (${warnings.length}):**\n`;
    warnings.forEach((log: any, i: number) => {
      text += `${i + 1}. ${log.message.substring(0, 50)}\n`;
    });
    text += `\n`;
  }
  
  if (infos.length > 0) {
    text += `🟢 **اطلاعات (${infos.length}):**\n`;
    infos.forEach((log: any, i: number) => {
      text += `${i + 1}. ${log.message.substring(0, 50)}\n`;
    });
  }
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔴 خطاها", callback_data: "log_errors" },
        { text: "🟡 هشدارها", callback_data: "log_warnings" }
      ],
      [
        { text: "🗑️ پاکسازی", callback_data: "log_clear" },
        { text: "🔄 تازه‌کن", callback_data: "log_refresh" }
      ]
    ]
  };
  
  await sendMessage(chat.id, text, {
    reply_to_message_id: message.message_id,
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۱۴: توابع مدیریت مدیا و Agent
// ============================================================

// ============================================================
// 📦 AGENT TOOLS
// ============================================================

const AGENT_TOOLS = {
  generate_image: { desc: "ساخت تصویر", params: { prompt: "string" } },
  search_images: { desc: "جستجوی تصویر در گوگل", params: { query: "string" } }
};

// ============================================================
// 📦 EXECUTE TOOL FROM AGENT
// ============================================================

async function executeToolFromAgent(toolName: string, args: any, chatId: number, messageId: number, env: Env) {
  try {
    if (toolName === 'generate_image') {
      const prompt = args.prompt || args.query;
      if (!prompt) return "❌ پرامپت خالی";
      
      if (!config.AI_IMAGE_MODELS || config.AI_IMAGE_MODELS.length === 0) {
        return "❌ مدل تصویر تنظیم نشده";
      }
      
      const model = config.AI_IMAGE_MODELS[0];
      const imgBuffer = await generateImageWithCloudflare(prompt, model, env);
      await sendPhoto(chatId, imgBuffer, `🎨 ${prompt}`, { reply_to_message_id: messageId });
      return "تصویر ساخته و ارسال شد.";
      
    } else if (toolName === 'search_images') {
      const query = args.query;
      if (!query) return "❌ عبارت خالی";
      const images = await searchPixabayImages(query, 3);
      if (!images.length) return "تصویری یافت نشد.";
      for (let img of images) await sendPhoto(chatId, img, undefined, { reply_to_message_id: messageId });
      return `${images.length} تصویر ارسال شد.`;
    }
    
    return `ابزار ناشناخته: ${toolName}`;
    
  } catch (e) {
    return `خطا: ${e.message}`;
  }
}

// ============================================================
// 📦 SEARCH PIXABAY IMAGES
// ============================================================

async function searchPixabayImages(query: string, perPage: number = 5): Promise<string[]> {
  if (!config.PIXABAY_KEY) {
    throw new Error("❌ کلید Pixabay تنظیم نشده است.");
  }
  
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", config.PIXABAY_KEY);
  url.searchParams.set("q", encodeURIComponent(query));
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("per_page", perPage.toString());
  url.searchParams.set("safesearch", "false");
  
  const response = await fetchWithTimeout(url.toString(), {}, 15000);
  const data = await response.json();
  
  if (!response.ok || !data.hits) {
    throw new Error(`Pixabay API error: ${data.message || "unknown"}`);
  }
  
  const images = data.hits.map((hit: any) => hit.webformatURL || hit.largeImageURL).filter(Boolean);
  if (images.length === 0) throw new Error("NO_RESULTS");
  
  return images.slice(0, perPage);
}



// ============================================================
// 🎨 GENERATE IMAGE WITH CLOUDFLARE
// ============================================================

async function generateImageWithCloudflare(
  prompt: string,
  model: string,
  env: Env
): Promise<Uint8Array> {
  const pairs = config.CLOUDFLARE_PAIRS;
  if (pairs.length === 0) {
    throw new Error("❌ هیچ کلید Cloudflare AI تنظیم نشده است.");
  }

  const errors: string[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const { accountId, token } = pairs[i];
    
    if (await isCFKeyDisabled(accountId, token)) continue;
    
    try {
      const result = await _generateWithSingleCF(prompt, model, accountId, token);
      return result;
    } catch (err: any) {
      const msg = err.message?.toLowerCase() || "";
      if (msg.includes("quota") || msg.includes("limit") || msg.includes("429")) {
        disableCFKey(accountId, token);
        errors.push(`🔑 ${i+1} محدودیت مصرف (غیرفعال موقت)`);
      } else {
        errors.push(`🔑 ${i+1}: ${msg.substring(0, 50)}`);
      }
    }
  }
  
  throw new Error(`همه کلیدهای Cloudflare ناموفق:\n${errors.join("\n")}`);
}

// ============================================================
// 🎨 GENERATE WITH SINGLE CF
// ============================================================

async function _generateWithSingleCF(
  prompt: string,
  model: string,
  accountId: string,
  apiToken: string
): Promise<Uint8Array> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const isFlux2Model = model.includes('flux-2');
  const isPhoenix = model.includes('phoenix');
  const isLucid = model.includes('lucid');

  let response: Response;
  if (isFlux2Model) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('width', '1024');
    formData.append('height', '1024');
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiToken}` },
      body: formData,
    });
  } else if (isPhoenix) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1024, height: 1024, num_steps: 50, guidance: 7 }),
    });
  } else if (isLucid) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1024, height: 1024, num_steps: 40, guidance: 7 }),
    });
  } else {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, num_steps: model.includes('dreamshaper') ? 20 : 8, seed: Math.floor(Math.random() * 100000) }),
    });
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cloudflare AI (${model}) returned ${response.status}: ${errText.substring(0, 300)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('image/') || isPhoenix) {
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } else {
    const result = await response.json() as { result?: { image?: string }, image?: string };
    const base64Image = result?.result?.image || result?.image;
    if (!base64Image) throw new Error("No image in Cloudflare response");
    const binaryString = atob(base64Image);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  }
}

// ============================================================
// 🎨 HANDLE IMAGE GENERATION COMMAND
// ============================================================

async function handleImageGenerationCommand(message: Message, args: string[], env: Env): Promise<void> {
  const { chat, from } = message;
  if (!from) return;

  let originalPrompt = args.join(' ').trim();
  let prompt = originalPrompt;
  const session = await getOrCreateSession(chat, from, env);
  const lang = session.language;
  const txt = TRANSLATIONS[lang];
  
  if (config.CLOUDFLARE_PAIRS.length === 0) {
    await sendMessage(chat.id, "❌ هیچ کلید Cloudflare AI تنظیم نشده است.", { reply_to_message_id: message.message_id });
    return;
  }
  
  if (args.length === 0) {
    await sendMessage(chat.id, txt.img_help, { reply_to_message_id: message.message_id });
    return;
  }
  
  if (!session.vipStatus && session.dailyLimits.imagesGenerated >= 5) {
    await sendMessage(chat.id, txt.img_limit, { reply_to_message_id: message.message_id });
    return;
  }
  
  let wasTranslated = false;
  if (prompt.match(/[\u0600-\u06FF]/)) {
    const transMsg = await sendMessage(chat.id, txt.img_translating, { reply_to_message_id: message.message_id });
    try {
      const translated = await translateToEnglishPrompt(prompt, env);
      if (translated && !translated.match(/[\u0600-\u06FF]/)) {
        prompt = translated;
        wasTranslated = true;
      }
      await deleteMessage(chat.id, transMsg.message_id);
    } catch (e) {
      await deleteMessage(chat.id, transMsg.message_id);
    }
  }

  let statusText = `${txt.img_start}\n`;
  if (wasTranslated) {
    statusText += `📝: "${originalPrompt.substring(0, 50)}..."\n🇬🇧: \`${prompt}\`\n`;
  } else {
    statusText += `📝: \`${prompt}\`\n`;
  }
  statusText += txt.img_processing.replace('{count}', String(config.AI_IMAGE_MODELS.length));

  const processingMsg = await sendMessage(chat.id, statusText, { reply_to_message_id: message.message_id });
  
  let successCount = 0;
  const errors: string[] = [];
  
  const IMAGE_TIMEOUT = 20000;
  
  for (let i = 0; i < config.AI_IMAGE_MODELS.length; i++) {
    const model = config.AI_IMAGE_MODELS[i];
    
    try {
      await editMessageText(chat.id, processingMsg.message_id, 
        `${statusText}\n\n🎨 ${getShortModelName(model)} (${i + 1}/${config.AI_IMAGE_MODELS.length})...`
      ).catch(() => {});

      const imageBuffer = await withTimeout(generateImageWithCloudflare(prompt, model, env), IMAGE_TIMEOUT, "Timeout");

      await sendPhoto(chat.id, imageBuffer, `🤖 **${getShortModelName(model)}**`, {
        reply_to_message_id: message.message_id
      });
      
      successCount++;
      
    } catch (error) {
      let errorMsg = getRawError(error);
      if (from.id === config.BOT_OWNER_ID) {
        errors.push(`• **${getShortModelName(model)}**: ${errorMsg}`);
      } else {
        if (errorMsg.includes('Timeout')) errorMsg = "⏱️ تایم‌اوت";
        else if (errorMsg.includes('NSFW') || errorMsg.includes('safety')) errorMsg = "🔞 محتوای نامناسب";
        else if (errorMsg.includes('500') || errorMsg.includes('502')) errorMsg = "🔥 خطای سرور";
        else if (errorMsg.includes('400')) errorMsg = "⛔ رد شد";
        else errorMsg = "❌ خطا";
        errors.push(`• **${getShortModelName(model)}**: ${errorMsg}`);
      }
    }
    
    const elapsedTime = Date.now() - message.date * 1000;
    if (elapsedTime > 25000) {
      logger.warn("Approaching Workers timeout, stopping generation");
      break;
    }
  }
  
  let finalText = successCount > 0 ? txt.img_success : txt.img_failed;
  if (wasTranslated) {
    finalText += `\n\nPrompt: \`${prompt}\``;
  }

  if (errors.length > 0) {
    finalText += lang === 'fa' ?
      `\n⚠️ **گزارش خطاها:**\n${errors.join('\n')}` :
      `\n⚠️ **Error report:**\n${errors.join('\n')}`;
  } else if (successCount > 0) {
    finalText += lang === 'fa' ?
      `\n🎉 ${successCount} تصویر با موفقیت ساخته شد.` :
      `\n🎉 ${successCount} images generated successfully.`;
  }

  await editMessageText(chat.id, processingMsg.message_id, finalText);
    
  if (!session.vipStatus && successCount > 0) {
    session.dailyLimits.imagesGenerated++; 
    session.statistics.totalMessages++;
    saveSessionWithLock(session, env, false).catch(() => {});
  }
}

// ============================================================
// 📦 HANDLE MEDIA MESSAGE
// ============================================================

async function handleMediaMessage(message: Message, env: Env, config: any) {
  const { chat, from, photo, document, animation, video, caption } = message;
  if (!from) return;

  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, { reply_to_message_id: message.message_id });
    return;
  }

  const session = await getOrCreateSession(chat, from, env);
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  const requestId = generateRequestId();

  if (!canProcessConcurrentRequest(chat.id, requestId)) {
    await sendMessage(chat.id, "🚦 سرور شلوغ است، کمی صبر کنید...", { reply_to_message_id: message.message_id });
    return;
  }

  function isTextFile(mimeType: string, fileName: string): boolean {
    if (mimeType.startsWith('text/')) return true;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const textExts = ['txt', 'json', 'js', 'py', 'ts', 'csv', 'md', 'html', 'css'];
    return textExts.includes(ext);
  }

  let mediaCategory = null;
  let fileMimeType = '';
  let fileName = '';
  let fileId = '';

  if (photo && photo.length > 0) {
    mediaCategory = 'image';
    fileId = photo[photo.length - 1].file_id;
    fileMimeType = 'image/jpeg';
  } else if (animation) {
    mediaCategory = 'gif';
    fileId = animation.file_id;
    fileMimeType = animation.mime_type || 'image/gif';
    if (!animation.thumbnail) {
      await sendMessage(chat.id, "❌ این گیف thumbnail ندارد و قابل تحلیل نیست.", { reply_to_message_id: message.message_id });
      return;
    }
  } else if (video) {
    mediaCategory = 'video';
    fileId = video.file_id;
    fileMimeType = video.mime_type || 'video/mp4';
    if (video.file_size && video.file_size > 8 * 1024 * 1024) {
      await sendMessage(chat.id, "⚠️ حجم ویدیو زیاد است (حداکثر 8 مگابایت)", { reply_to_message_id: message.message_id });
      return;
    }
  } else if (document) {
    fileMimeType = document.mime_type || '';
    fileName = document.file_name || '';
    fileId = document.file_id;
    if (fileMimeType === 'application/pdf') mediaCategory = 'pdf';
    else if (isTextFile(fileMimeType, fileName)) mediaCategory = 'text_file';
    else mediaCategory = 'unsupported';
  }

  if (!mediaCategory) return;

  if (mediaCategory === 'unsupported') {
    await sendMessage(chat.id, "⚠️ فرمت فایل پشتیبانی نمی‌شود.", { reply_to_message_id: message.message_id });
    return;
  }

  try {
    const lang = session.language || 'fa';
    if (isGroup && !session.vipStatus) {
      await sendMessage(chat.id, "⚠️ تحلیل فایل در گروه مخصوص VIP است.", { reply_to_message_id: message.message_id });
      return;
    }

    const bucket = getUserBucket(from.id, session.vipStatus);
    if (!bucket.tryConsume()) {
      await sendMessage(chat.id, "⏳ لطفاً کمی صبر کنید...", { reply_to_message_id: message.message_id });
      return;
    }

    if (config.GEMINI_KEYS.length === 0) {
      await sendMessage(chat.id, "❌ موتور پردازش مدیا در دسترس نیست.", { reply_to_message_id: message.message_id });
      return;
    }

    let loadingIcon = mediaCategory === 'image' ? '👁️' : mediaCategory === 'pdf' ? '📑' : '📄';
    let loadingText = lang === 'fa' ? `> ${loadingIcon} در حال تحلیل...` : `> ${loadingIcon} Analyzing...`;
    const loadingMsg = await sendMessage(chat.id, loadingText, { reply_to_message_id: message.message_id });

    if (mediaCategory === 'text_file') {
      const ext = fileName.split('.').pop()?.toLowerCase() || 'txt';
      const fileUrl = await getFileUrl(fileId);
      const fileResponse = await fetchWithTimeout(fileUrl, {}, 30000);
      const fileBuffer = await fileResponse.arrayBuffer();
      const fileText = new TextDecoder('utf-8', { fatal: false }).decode(fileBuffer);
      const fileContent = fileText.substring(0, 30000);
      const userQuestion = caption?.trim() || '';
      const promptText = lang === 'fa'
        ? `محتوای فایل \`${fileName}\` را بخوان.${userQuestion ? ` درخواست: ${userQuestion}` : ' خلاصه بده.'}\n\n\`\`\`${ext}\n${fileContent}\n\`\`\``
        : `Read file \`${fileName}\`.${userQuestion ? ` Request: ${userQuestion}` : ' Summarize.'}\n\n\`\`\`${ext}\n${fileContent}\n\`\`\``;
      const responseText = await processWithGeminiRobust([{ text: promptText }], config);
      await sendStreamingResponse(chat.id, message.message_id, sanitizeMarkdown(responseText), loadingMsg.message_id);
      return;
    }

    if (mediaCategory === 'pdf') {
      const fileUrl = await getFileUrl(fileId);
      const fileResponse = await fetchWithTimeout(fileUrl, {}, 30000);
      const base64Data = arrayBufferToBase64(await fileResponse.arrayBuffer());
      const userQuestion = caption?.trim() || '';
      const promptText = userQuestion || (lang === 'fa' ? 'خلاصه‌ای از این PDF بنویس.' : 'Summarize this PDF.');
      const responseText = await processWithGeminiRobust([
        { inline_data: { mime_type: "application/pdf", data: base64Data } },
        { text: promptText }
      ], config);
      await sendStreamingResponse(chat.id, message.message_id, sanitizeMarkdown(responseText), loadingMsg.message_id);
      return;
    }

    const fileInfo = await callTelegramAPI("getFile", { file_id: fileId });
    const fileUrl = `https://api.telegram.org/file/bot${config.TOKEN}/${fileInfo.file_path}`;
    const mediaResponse = await fetchWithTimeout(fileUrl, {}, 30000);
    const base64Data = arrayBufferToBase64(await mediaResponse.arrayBuffer());
    const userCaption = caption?.trim() || '';
    const sysPrompt = lang === 'fa'
      ? `به این تصویر/ویدیو نگاه کن.${userCaption ? ` کاربر: ${userCaption}` : ' توضیح بده.'} دوستانه و بدون گفتن "من هوش مصنوعی هستم" جواب بده.`
      : `Describe this image/video.${userCaption ? ` User: ${userCaption}` : ''} Friendly, no "I am AI".`;
    const responseText = await processWithGeminiRobust([
      { text: sysPrompt },
      { inline_data: { mime_type: fileMimeType, data: base64Data } }
    ], config);
    await sendStreamingResponse(chat.id, message.message_id, sanitizeMarkdown(responseText), loadingMsg.message_id);

  } catch (error) {
    logger.error("Media processing failed", error);
    const lang = session?.language || 'fa';
    let errMsg;
    if (from.id === config.BOT_OWNER_ID) {
        errMsg = `❌ **Raw error:**\n\`\`\`\n${getRawError(error)}\n\`\`\``;
    } else {
        errMsg = lang === 'fa'
            ? "> ❌ **نتونستم فایل رو پردازش کنم!**\nشاید فرمتش مشکل داره یا سرور شلوغه. یه بار دیگه امتحان کن."
            : "> ❌ **Failed to process media!**\nPlease try again.";
    }
    
    try {
      if (loadingMsg) {
        await editMessageText(chat.id, loadingMsg.message_id, errMsg).catch(() => {});
      } else {
        await sendMessage(chat.id, errMsg).catch(() => {});
      }
    } catch (sendError) {
      logger.warn({ sendError }, "Could not send error message to user");
    }
  } finally {
    try {
      releaseRequest(chat.id, requestId);
    } catch (releaseError) {
      logger.error(releaseError, "Failed to release request");
    }
  }
}

// ============================================================
// 📦 PROCESS WITH GEMINI ROBUST
// ============================================================

async function processWithGeminiRobust(parts: Part[], config: any): Promise<string> {
  let lastError: Error | null = null;
  
  for (const apiKey of config.GEMINI_KEYS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${apiKey}`;
      
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
      }, 25000);
      
      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("EMPTY_RESPONSE");
      
      return text.trim();
      
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message.toLowerCase();
      if (msg.includes('safety') || msg.includes('blocked')) break;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  throw lastError || new Error("تمامی کلیدهای پردازش ناموفق بودند.");
}

// ============================================================
// 📦 FORMAT RESPONSE FOR HUMAN
// ============================================================

function formatResponseForHuman(text: string, lang: 'fa' | 'en'): string {
  const roboticPhrases = lang === 'fa' ? [
    'به عنوان یک هوش مصنوعی',
    'من یک مدل زبانی هستم',
    'من یک AI هستم',
    'من یک ربات هستم',
    'من یک دستیار مجازی هستم'
  ] : [
    'As an AI',
    'I am a language model',
    'I am an AI',
    'I am a bot',
    'I am a virtual assistant'
  ];

  let cleanedText = text;
  roboticPhrases.forEach(phrase => {
    const regex = new RegExp(phrase + '[^.!?]*[.!?]', 'gi');
    cleanedText = cleanedText.replace(regex, '');
  });

  const humanTouches = lang === 'fa' ? [
    '😊 ', '👍 ', '🙂 ', '✨ ', '🌟 '
  ] : [
    '😊 ', '👍 ', '🙂 ', '✨ ', '🌟 '
  ];

  if (cleanedText.length > 50) {
    const randomTouch = humanTouches[Math.floor(Math.random() * humanTouches.length)];
    cleanedText = randomTouch + cleanedText;
  }

  return cleanedText.trim();
}

// ============================================================
// 📦 SAVE MEDIA HISTORY
// ============================================================

async function saveMediaHistory(
  session: ChatSession, 
  env: Env, 
  userQuestion: string, 
  responseText: string
): Promise<void> {
  const timestamp = Date.now();
  const engine = session.engines[session.activeEngine];
  
  if (!engine) return;
  
  addToHistory(engine.history, "user", [{ text: userQuestion || "[رسانه]" }], timestamp);
  addToHistory(engine.history, "model", [{ text: responseText }], timestamp);
  
  session.messageCount++;
  session.statistics.totalMessages++;
  const statKey = `${session.activeEngine}Messages` as keyof typeof session.statistics;
  (session.statistics[statKey] as number)++;
  
  await saveSessionWithLock(session, env, false).catch(e => 
    logger.error(`Failed to save session after media: ${e}`)
  );
}

// ============================================================
// 🎨 SEND ACTIVE MODEL SETTINGS
// ============================================================

async function sendActiveModelSettings(chatId: number, messageId: number, session: ChatSession, env: Env): Promise<void> {
  const activeEngine = session.activeEngine;
  const lang = session.language || 'fa';
  const txt = TRANSLATIONS[lang];
  const engineName = getEngineName(activeEngine, lang);

  if (activeEngine === 'gemini') {
    const keysCount = config.GEMINI_KEYS.length;

    const text = `${txt.active_model_title.replace('{name}', engineName)}\n\n` +
      `${txt.active_model_keys.replace('{count}', String(keysCount))}\n\n` +
      `${txt.active_model_static_desc.replace('{name}', engineName)}`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: txt.btn_back, callback_data: 'model_settings' }]
      ]
    };
    
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
    return;
  }
  
  const engine = session.engines[activeEngine];
  
  try {
    const modelCache = await getModelsWithCache(activeEngine, env, false);
    const currentModel = modelCache.models[engine.modelIndex] || { name: 'Unknown' };
    const apiKeyCount = activeEngine === 'sambanova' ? config.SAMBANOVA_KEYS.length : 1;
    
    const text = `${txt.active_model_title.replace('{name}', engineName)}\n\n` +
      `${txt.active_model_current.replace('{name}', currentModel.name)}\n` +
      `${txt.active_model_key_idx.replace('{index}', String(engine.apiKeyIndex + 1)).replace('{total}', String(apiKeyCount))}\n` +
      `${txt.active_model_count.replace('{count}', String(modelCache.models.length))}\n` +
      `${txt.active_model_guide}`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: txt.btn_select_model, callback_data: `show_model_list_${activeEngine}` }],
        [{ text: txt.btn_back, callback_data: 'model_settings' }]
      ]
    };
    
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
  } catch (error) {
    logger.error("Failed to load model settings", error);
    await editMessageText(chatId, messageId, 
      `${txt.err_unknown}\n\n${txt.btn_retry}?`,
      {
        reply_markup: JSON.stringify({
          inline_keyboard: [[
            { text: txt.btn_retry, callback_data: 'active_model_settings' },
            { text: txt.btn_back, callback_data: 'model_settings' }
          ]]
        })
      }
    );
  }
}

// ============================================================
// 📦 SHOW MODEL SELECTION
// ============================================================

async function showModelSelection(chatId: number, messageId: number, engine: AIEngine, forceRefresh: boolean = false, env: Env): Promise<void> {
  try {
    const sessionKey = `session:${chatId}`;
    const storedSession = await env.SESSIONS.get(sessionKey, "json") as ChatSession | null;
    const lang = storedSession?.language || 'fa';
    const txt = TRANSLATIONS[lang];
    
    const state = getModelListState(chatId, engine);
    const modelCache = await getModelsWithCache(engine, env, forceRefresh);
    
    let { models, lastUpdated } = modelCache;
    
    if (models.length === 0) {
      logger.warn(`No models for ${engine}, forcing fallback in UI`);
      
      if (engine === 'pollinations') {
        models = getFallbackPollinationsModels();
      } else {
        models = [];
      }
      
      lastUpdated = Date.now();
      
      if (models.length === 0) {
        const engineName = getEngineName(engine, lang);
        await editMessageText(chatId, messageId, 
          txt.model_not_found.replace('{name}', engineName),
          {
            reply_markup: JSON.stringify({
              inline_keyboard: [[
                { text: txt.btn_back, callback_data: 'active_model_settings' }
              ]]
            })
          }
        );
        return;
      }
    }
    
    const sortedModels = models;
    state.totalPages = Math.ceil(sortedModels.length / state.perPage);
    const startIdx = state.page * state.perPage;
    const endIdx = startIdx + state.perPage;
    const pageModels = sortedModels.slice(startIdx, endIdx);
    
    const currentEngineSettings = storedSession?.engines[engine];
    const currentModelIndex = currentEngineSettings?.modelIndex || 0;
    const currentModelId = sortedModels[currentModelIndex]?.id || ''; 
    
    const lastUpdateTime = new Date(lastUpdated).toLocaleTimeString(lang === 'fa' ? 'fa-IR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const engineName = getEngineName(engine, lang);
    
    let text = txt.model_select_title.replace('{name}', engineName) + '\n\n';
    text += txt.model_total_count.replace('{count}', String(sortedModels.length)) + '\n';
    text += txt.model_last_update.replace('{time}', lastUpdateTime) + '\n';
    text += txt.model_page_info
      .replace('{page}', String(state.page + 1))
      .replace('{total}', String(state.totalPages)) + '\n\n';
    
    const keyboard: any[] = [];
    
    for (let i = 0; i < pageModels.length; i += 2) {
      const row: any[] = [];
  
      for (let j = 0; j < 2 && (i + j) < pageModels.length; j++) {
        const model = pageModels[i + j];
    
        if (!model || !model.name || !model.id) {
          logger.warn(`Invalid model at index ${i + j}, skipping`);
          continue;
        }
    
        const isCurrent = model.id === currentModelId;

        let label = String(model.name || 'Unknown Model');
        label = label.length > 20 ? label.substring(0, 17) + '...' : label;

        if (isCurrent) label = `✅ ${label}`;

        const modelIndexInUnsortedList = sortedModels.findIndex(m => m.id === model.id);
    
        if (modelIndexInUnsortedList === -1) {
          logger.warn(`Model ${model.id} not found in sorted list`);
          continue;
        }
    
        const callbackData = isCurrent ? 
          'model_already_selected' : 
          `select_model_${engine}_${modelIndexInUnsortedList}`;
    
        row.push(createInlineButton(label, callbackData));
      }
  
      if (row.length > 0) {
        keyboard.push(row);
      }
    }
    
    if (state.totalPages > 1) {
      const navRow: any[] = [];
      
      if (state.page > 0) {
        navRow.push(createInlineButton(txt.btn_prev, `model_page_prev_${engine}`));
      }
      
      navRow.push(createInlineButton(
        `${state.page + 1}/${state.totalPages}`, 
        'model_page_noop'
      ));
      
      if (state.page < state.totalPages - 1) {
        navRow.push(createInlineButton(txt.btn_next, `model_page_next_${engine}`));
      }
      
      keyboard.push(navRow);
    }
    
    keyboard.push([
      createInlineButton(txt.btn_refresh, `refresh_models_${engine}`)
    ]);
    
    keyboard.push([
      createInlineButton(txt.btn_back, 'active_model_settings')
    ]);
    
    setModelListState(chatId, engine, state);
    
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify({ inline_keyboard: keyboard })
    });
    
  } catch (error) {
    logger.error("Failed to show model selection", error);
    const sessionKey = `session:${chatId}`;
    const storedSession = await env.SESSIONS.get(sessionKey, "json") as ChatSession | null;
    const lang = storedSession?.language || 'fa';
    const txt = TRANSLATIONS[lang];
    
    await editMessageText(chatId, messageId, 
      txt.err_unknown,
      {
        reply_markup: JSON.stringify({
          inline_keyboard: [[
            { text: txt.btn_back, callback_data: 'active_model_settings' }
          ]]
        })
      }
    );
  }
}

// ============================================================
// 📦 GET MODEL LIST STATE
// ============================================================

function getModelListState(chatId: number, engine: AIEngine): ModelListState {
  const key = `${chatId}_${engine}`;
  return modelListStates.get(key) || { page: 0, perPage: 8, totalPages: 0 };
}

// ============================================================
// 📦 SET MODEL LIST STATE
// ============================================================

function setModelListState(chatId: number, engine: AIEngine, state: ModelListState): void {
  const key = `${chatId}_${engine}`;
  modelListStates.set(key, state);
}
// ============================================================
// 🚀 NOVA BOT V2.0 - پارت ۱۵: توابع نهایی و Export
// ============================================================

// ============================================================
// 📦 HANDLE IMAGE SEARCH COMMAND
// ============================================================

async function handleImageSearchCommand(message: Message, args: string[], env: Env): Promise<void> {
  const { chat, from } = message;
  if (!from) return;

  const session = await getOrCreateSession(chat, from, env);
  const lang = session.language || 'fa';
  const txt = TRANSLATIONS[lang];

  if (args.length === 0) {
    await sendMessage(chat.id, `${txt.err_format}\n\n${txt.search_usage}`, {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const query = args.join(' ').trim();
  if (query.length > 100) {
    await sendMessage(chat.id, txt.search_long_query, {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const searchMsg = await sendMessage(chat.id, 
    txt.search_searching.replace('{query}', query), 
    { reply_to_message_id: message.message_id }
  );

  try {
    const images = await searchPixabayImages(query, 5);
    
    await deleteMessage(chat.id, searchMsg.message_id);
    await sendImageResults(chat.id, message.message_id, images, query, {
      search_results: txt.search_results,
      search_no_results: txt.search_no_results,
      search_link_fallback: txt.search_link_fallback,
      search_failed: txt.search_failed,
      search_guide: txt.search_guide,
      search_attribution: txt.search_attribution
    });
    
    logger.info(`✅ Image search completed: ${images.length} images sent`);

  } catch (error) {
    const errorMsg = getRawError(error);
    let finalError;
    if (from.id === config.BOT_OWNER_ID) {
      finalError = `Raw error: ${errorMsg}`;
    } else {
      if (errorMsg === "NO_RESULTS") finalError = txt.search_no_results;
      else if (errorMsg.includes('quota') || errorMsg.includes('محدودیت')) {
        finalError = lang === 'fa' ? 'محدودیت سرور جستجو.' : 'Search quota exceeded.';
      } else {
        finalError = errorMsg.substring(0, 100);
      }
    }
    await editMessageText(chat.id, searchMsg.message_id, 
      `${txt.search_failed}\n\n${finalError}\n\n${txt.search_guide}`
    );
  }
}

// ============================================================
// 📦 HANDLE PROMPT COMMAND
// ============================================================

async function handlePromptCommand(message: Message, env: Env): Promise<void> {
  const { chat, from } = message;
  if (!from) return;

  const session = await getOrCreateSession(chat, from, env);
  const lang = session.language || 'fa';
  const txt = TRANSLATIONS[lang];

  const geminiPrompt = session.customPrompts.gemini || txt.prompt_default;
  const sambanovaPrompt = session.customPrompts.sambanova || txt.prompt_default;
  const pollinationsPrompt = session.customPrompts.pollinations || txt.prompt_default;
  
  const short = (t: string) => {
    const safeText = String(t || txt.prompt_default);
    return safeText.length > 30 ? safeText.substring(0, 30) + '...' : safeText;
  };

  const text = `${txt.prompt_title}\n\n${txt.prompt_current}\n\n` +
    `🤖 **${getEngineName('gemini', lang)}:** ${short(geminiPrompt)}\n\n` +
    `🎨 **${getEngineName('sambanova', lang)}:** ${short(sambanovaPrompt)}\n\n` +
    `🔬 **${getEngineName('pollinations', lang)}:** ${short(pollinationsPrompt)}\n\n` +
    `${txt.prompt_guide}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: `${txt.prompt_reset} ${getEngineName('gemini', lang)} 🗑️`, callback_data: 'reset_prompt_gemini' },
        { text: `${txt.prompt_reset} ${getEngineName('sambanova', lang)} 🗑️`, callback_data: 'reset_prompt_sambanova' }
      ],
      [
        { text: `${txt.prompt_reset} ${getEngineName('pollinations', lang)} 🗑️`, callback_data: 'reset_prompt_pollinations' }
      ],
      [
        { text: txt.prompt_show, callback_data: 'show_prompts' }
      ],
      [
        { text: txt.btn_back, callback_data: 'open_help' }
      ]
    ]
  };

  await sendMessage(chat.id, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard)),
    reply_to_message_id: message.message_id
  });
}

// ============================================================
// 📦 HANDLE SET PROMPT COMMAND
// ============================================================

async function handleSetPromptCommand(message: Message, args: string[], env: Env) {
  const { chat, from } = message;
  if (!from) return;

  const session = await getOrCreateSession(chat, from, env);
  const lang = session.language || 'fa';
  const txt = TRANSLATIONS[lang];

  if (args.length < 2) {
    const usage = lang === 'fa' 
      ? "استفاده: `/setprompt [موتور] متن پرامپت`\n\nموتورها: `نوا`, `لونا`, `زارا`"
      : "Usage: `/setprompt [engine] prompt text`\n\nEngines: `nova`, `luna`, `zara`";
      
    await sendMessage(chat.id, `${txt.err_format}\n\n${usage}`, {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  const engineAlias = args[0].toLowerCase();
  const promptText = args.slice(1).join(' ').trim();
  
  const engineMap: { [key: string]: AIEngine | undefined } = {
    'نوا': 'gemini', 'nova': 'gemini', 'gemini': 'gemini',
    'لونا': 'sambanova', 'luna': 'sambanova', 'sambanova': 'sambanova',
    'زارا': 'pollinations', 'zara': 'pollinations', 'pollinations': 'pollinations'
  };

  const engine = engineMap[engineAlias];
  
  if (!engine) {
    await sendMessage(chat.id, txt.err_engine_invalid, {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const isBotOwner = from.id === config.BOT_OWNER_ID;

  if (!isBotOwner && !session.vipStatus && engine !== 'gemini') {
    await sendMessage(chat.id, txt.err_vip_prompt, {
      reply_to_message_id: message.message_id,
      reply_markup: JSON.stringify(getVIPUpgradeKeyboard())
    });
    return;
  }

  if (!promptText || promptText.length === 0) {
    await sendMessage(chat.id, lang === 'fa' ? "❌ پرامپت نمی‌تواند خالی باشد" : "❌ Prompt cannot be empty", {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  if (promptText.length > config.MAX_PROMPT_LENGTH) {
    await sendMessage(chat.id, lang === 'fa' 
      ? `❌ پرامپت خیلی طولانی است. حداکثر ${config.MAX_PROMPT_LENGTH} کاراکتر.` 
      : `❌ Prompt too long. Max ${config.MAX_PROMPT_LENGTH} characters.`, {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  session.customPrompts[engine] = promptText;
  
  const timestamp = Date.now();
  const currentPrompt = getActivePrompt(session, from.first_name, session.type !== "private");
  const engineKey = engine;
  
  if (session.engines[engineKey].history.length > 0) {
     const role = engineKey === 'gemini' ? 'user' : 'assistant';
     session.engines[engineKey].history[0] = {
        role: role,
        parts: [{ text: currentPrompt }],
        timestamp
     };
  }

  await saveSessionWithLock(session, env);

  const engineName = getEngineName(engine, lang);
  const successMsg = lang === 'fa'
    ? `✅ **پرامپت ${engineName} تنظیم و اعمال شد**\n\nبدون نیاز به /new از الان فعال است!`
    : `✅ **${engineName} prompt set and applied**\n\nActive immediately (no /new needed)!`;

  await sendMessage(chat.id, successMsg, {
    reply_to_message_id: message.message_id
  });
}

// ============================================================
// 📦 HANDLE KEYS COMMAND
// ============================================================

async function handleKeysCommand(chatId: number, messageId: number | undefined, env: Env, isEdit = false) {
  const now = Date.now();
  await isKeyDisabled("test", env);

  const safeFetch = async (url: string, options: any = {}, retries = 2) => {
    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        return await fetchWithTimeout(url, options, 8000);
      } catch (e) {
        lastErr = e;
        if (i < retries - 1) await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw lastErr;
  };

  let currentMsgId = messageId;
  const loadingText = `🔍 **سیستم عیب‌یابی جامع نوآ (Diagnostic)**\n\n⏳ در حال برقراری ارتباط با سرورها و تست واقعی کلیدها...\nلطفاً چند لحظه صبر کنید.`;
  
  if (isEdit && currentMsgId) {
    await editMessageText(chatId, currentMsgId, loadingText);
  } else {
    const sentMsg = await sendMessage(chatId, loadingText, { reply_to_message_id: messageId });
    currentMsgId = sentMsg.message_id;
  }

  let statusText = `📊 **گزارش وضعیت و سلامت API های ربات**\n\n`;

  // Gemini
  statusText += `🤖 **Gemini (نوا) - ${config.GEMINI_KEYS.length} کلید:**\n`;
  await editMessageText(chatId, currentMsgId!, statusText + `> ⏳ در حال تست...`);

  for (let i = 0; i < config.GEMINI_KEYS.length; i++) {
    const key = config.GEMINI_KEYS[i];
    const maskedKey = key.substring(0, 5) + '...' + key.substring(key.length - 4);
    const unlockTime = globalDisabledKeys[key];
    
    if (unlockTime && now < unlockTime) {
      const hoursLeft = ((unlockTime - now) / 3600000).toFixed(1);
      statusText += `  ${i + 1}. \`${maskedKey}\` 🔴 مسدود (لیمیت شده تا ${hoursLeft} ساعت دیگر)\n`;
      continue;
    }

    try {
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent?key=${key}`;
      const response = await safeFetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts:[{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } })
      });
      
      if (response.ok) {
        statusText += `  ${i + 1}. \`${maskedKey}\` 🟢 سالم (OK)\n`;
      } else {
        const errorText = await response.text();
        if (errorText.includes('quota') || errorText.includes('429')) {
           statusText += `  ${i + 1}. \`${maskedKey}\` 🔴 سهمیه تمام شده\n`;
           disableApiKey(key, env);
        } else if (errorText.includes('API_KEY_INVALID')) {
           statusText += `  ${i + 1}. \`${maskedKey}\` ❌ کلید نامعتبر\n`;
        } else {
          statusText += `  ${i + 1}. \`${maskedKey}\` ⚠️ خطا (${response.status})\n`;
        }
      }
    } catch (error) {
        const rawErr = getRawError(error);
        statusText += `  ${i + 1}. \`${maskedKey}\` ⚠️ خطا: ${rawErr.substring(0, 80)}\n`;    
    }
  }

  // SambaNova
  statusText += `\n🧠 **SambaNova (لونا) - ${config.SAMBANOVA_KEYS.length} کلید:**\n`;
  await editMessageText(chatId, currentMsgId!, statusText + `> ⏳ در حال تست...`);

  for (let i = 0; i < config.SAMBANOVA_KEYS.length; i++) {
    const key = config.SAMBANOVA_KEYS[i];
    const maskedKey = key.substring(0, 5) + '...' + key.substring(key.length - 4);
    const unlockTime = globalDisabledKeys[key];
    
    if (unlockTime && now < unlockTime) {
      const hoursLeft = ((unlockTime - now) / 3600000).toFixed(1);
      statusText += `  ${i + 1}. \`${maskedKey}\` 🔴 موقتاً مسدود (تا ${hoursLeft} ساعت)\n`;
      continue;
    }

    try {
      const testUrl = "https://api.sambanova.ai/v1/models";
      const response = await safeFetch(testUrl, {
        method: "GET",
        headers: { "Authorization": `Bearer ${key}` }
      });

      if (response.ok) {
        statusText += `  ${i + 1}. \`${maskedKey}\` 🟢 سالم (OK)\n`;
      } else {
        if (response.status === 401) {
          statusText += `  ${i + 1}. \`${maskedKey}\` ❌ کلید نامعتبر\n`;
        } else if (response.status === 429) {
          statusText += `  ${i + 1}. \`${maskedKey}\` 🔴 لیمیت شده\n`;
          disableApiKey(key, env);
        } else {
          statusText += `  ${i + 1}. \`${maskedKey}\` ⚠️ خطا (${response.status})\n`;
        }
      }
    } catch (error) {
        const rawErr = getRawError(error);
        statusText += `  ${i + 1}. \`${maskedKey}\` ⚠️ خطا: ${rawErr.substring(0, 80)}\n`;   
    }
  }

  // Pollinations
  statusText += `\n🔬 **Pollinations (زارا):**\n`;
  await editMessageText(chatId, currentMsgId!, statusText + `> ⏳ در حال تست...`);

  try {
    const zaraUrl = "https://text.pollinations.ai/chat/completions";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.POLLINATIONS_KEY) {
      headers["Authorization"] = `Bearer ${config.POLLINATIONS_KEY}`;
    }

    const zaraRes = await safeFetch(zaraUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openai",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
        seed: Math.floor(Math.random() * 1000)
      })
    });

    if (zaraRes.ok) {
      statusText += `  ${config.POLLINATIONS_KEY ? '🟢 توکن اختصاصی متصل و سالم' : '🟢 حالت عمومی متصل و سالم'}\n`;
    } else {
      if (zaraRes.status === 429) {
        statusText += `  🔴 ترافیک سرور بالاست (Rate Limit)\n`;
      } else if (zaraRes.status === 401 || zaraRes.status === 403) {
        statusText += `  ❌ توکن نامعتبر است\n`;
      } else {
        statusText += `  ⚠️ خطا (${zaraRes.status})\n`;
      }
    }
  } catch (error) {
    const rawErr = getRawError(error);
    statusText += `  ⚠️ خطا: ${rawErr.substring(0, 80)}\n`;
  }

  // Pixabay
  statusText += `\n🖼️ **Pixabay (جستجوی تصویر):**\n`;
  if (config.PIXABAY_KEY) {
    statusText += `  🟢 کلید تنظیم شده (${config.PIXABAY_KEY.substring(0,4)}...)\n`;
  } else {
    statusText += `  🔴 کلید Pixabay تنظیم نشده است.\n`;
  }

  statusText += `\n⏰ زمان تست: ${new Date().toLocaleTimeString('fa-IR')}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔄 تست و بروزرسانی مجدد", callback_data: "admin_refresh_keys" }],
      [{ text: "❌ بستن", callback_data: "admin_close" }]
    ]
  };

  await editMessageText(chatId, currentMsgId!, statusText, { reply_markup: JSON.stringify(keyboard) });
}

// ============================================================
// 📦 HANDLE REBUILD DATABASE COMMAND
// ============================================================

async function handleRebuildDatabaseCommand(message: Message, env: Env): Promise<void> {
  const { chat } = message;
  
  const processingMsg = await sendMessage(chat.id, 
    "🔧 **در حال بازسازی دیتابیس...**\n\n⏳ لطفاً صبر کنید", 
    { reply_to_message_id: message.message_id }
  );
  
  try {
    let allKeys: any[] = [];
    let listResult = await env.SESSIONS.list({ prefix: "session:" });
    allKeys.push(...listResult.keys);
    
    while (!listResult.list_complete && listResult.cursor) {
      listResult = await env.SESSIONS.list({ prefix: "session:", cursor: listResult.cursor });
      allKeys.push(...listResult.keys);
    }
    
    let totalSessions = 0;
    let fixedSessions = 0;
    let createdUsers = 0;
    let skippedSessions = 0;
    
    await editMessageText(chat.id, processingMsg.message_id, 
      `🔧 **در حال بازسازی...**\n\n` +
      `📊 پیدا شد: ${allKeys.length} سشن\n` +
      `⏳ در حال پردازش...`
    );
    
    for (const item of allKeys) {
      try {
        totalSessions++;
        
        const stored = await env.SESSIONS.get(item.name, "json");
        if (!stored) {
          skippedSessions++;
          continue;
        }
        
        const session = stored as ChatSession;
        let wasModified = false;
        
        if (!session.userMemories || 
            (typeof session.userMemories === 'object' && Object.keys(session.userMemories).length === 0)) {
          
          logger.info(`🔧 Fixing session ${session.id} - empty userMemories`);
          
          session.userMemories = new Map<number, UserMemory>();
          
          let userId: number | null = null;
          let userName = 'Unknown User';
          
          const engines: AIEngine[] = ['gemini', 'sambanova', 'pollinations'];
          
          for (const engineName of engines) {
            const engine = session.engines[engineName];
            if (!engine || !engine.history) continue;
            
            for (const item of engine.history) {
              if (item.userId && item.userId > 0) {
                userId = item.userId;
                userName = item.userName || 'Unknown';
                break;
              }
            }
            
            if (userId) break;
          }
          
          if (!userId && session.type === 'private') {
            userId = session.id;
            logger.warn(`Using chat ID as user ID for session ${session.id}`);
          }
          
          if (userId) {
            const userMemory: UserMemory = {
              userId: userId,
              userName: userName,
              firstName: userName,
              lastSeen: session.lastSeen || Date.now(),
              messageCount: session.messageCount || 0,
              topics: [],
              personality: "",
              preferences: [],
              interactionStyle: ""
            };
            
            session.userMemories.set(userId, userMemory);
            createdUsers++;
            wasModified = true;
            
            logger.info(`✅ Created userMemory for user ${userId} in session ${session.id}`);
          } else {
            logger.warn(`⚠️ Could not find userId for session ${session.id}`);
            skippedSessions++;
          }
        } else {
          const rawMemories = session.userMemories as any;
          
          if (!(rawMemories instanceof Map)) {
            logger.info(`🔧 Converting userMemories to Map for session ${session.id}`);
            
            const newMap = new Map<number, UserMemory>();
            
            if (Array.isArray(rawMemories)) {
              rawMemories.forEach(([key, value]: [any, any]) => {
                const numKey = typeof key === 'number' ? key : parseInt(String(key), 10);
                if (!isNaN(numKey) && value) {
                  newMap.set(numKey, value);
                }
              });
            } else if (typeof rawMemories === 'object') {
              Object.entries(rawMemories).forEach(([key, value]) => {
                const numKey = parseInt(key, 10);
                if (!isNaN(numKey) && value) {
                  newMap.set(numKey, value as UserMemory);
                }
              });
            }
            
            if (newMap.size > 0) {
              session.userMemories = newMap;
              wasModified = true;
            }
          }
        }
        
        if (!session.statistics) {
          session.statistics = {
            totalMessages: session.messageCount || 0,
            geminiMessages: 0,
            sambanovaMessages: 0,
            pollinationsMessages: 0,
            voicesReceived: 0,
            firstUsed: session.lastSeen || Date.now(),
            lastSeen: session.lastSeen || Date.now()
          };
          wasModified = true;
        }
        
        if (!session.dailyLimits) {
          session.dailyLimits = {
            messages: 0,
            voicesSent: 0,
            voicesReceived: 0,
            imagesGenerated: 0,
            lastReset: Date.now()
          };
          wasModified = true;
        }
        
        if (wasModified) {
          const dataToSave = {
            ...session,
            userMemories: Object.fromEntries(
              Array.from(session.userMemories.entries()).map(([k, v]) => [String(k), v])
            )
          };
          
          await env.SESSIONS.put(item.name, JSON.stringify(dataToSave));
          fixedSessions++;
          
          logger.info(`✅ Fixed and saved session ${session.id}`);
        }
        
        if (totalSessions % 10 === 0) {
          await editMessageText(chat.id, processingMsg.message_id, 
            `🔧 **در حال بازسازی...**\n\n` +
            `📊 پیشرفت: ${totalSessions}/${allKeys.length}\n` +
            `✅ ترمیم شده: ${fixedSessions}\n` +
            `👤 کاربر جدید: ${createdUsers}\n` +
            `⏭️ رد شده: ${skippedSessions}`
          ).catch(() => {});
        }
        
      } catch (error) {
        logger.error(`Failed to process session ${item.name}`, error);
        skippedSessions++;
        continue;
      }
    }
    
    sessionCache.clear();
    userCache.clear();
    
    let resultText = `✅ **بازسازی دیتابیس تکمیل شد!**\n\n`;
    resultText += `📊 **گزارش:**\n`;
    resultText += `• کل سشن‌ها: ${totalSessions}\n`;
    resultText += `• ترمیم شده: ${fixedSessions}\n`;
    resultText += `• کاربر بازیابی شده: ${createdUsers}\n`;
    resultText += `• رد شده: ${skippedSessions}\n\n`;
    
    if (fixedSessions > 0 || createdUsers > 0) {
      resultText += `🎉 **موفق:** ${fixedSessions + createdUsers} مورد بازسازی شد!\n\n`;
      resultText += `💡 حالا می‌تونی /admin رو بزنی و ببینی همه کاربرا اومدن.`;
    } else {
      resultText += `✅ دیتابیس سالم بود، نیازی به ترمیم نداشت.`;
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: "📊 مشاهده پنل ادمین", callback_data: "open_admin" }],
        [{ text: "🗑️ بستن", callback_data: "admin_close" }]
      ]
    };
    
    await editMessageText(chat.id, processingMsg.message_id, resultText, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
    
  } catch (error) {
    logger.error("Database rebuild failed", error);
    await editMessageText(chat.id, processingMsg.message_id, 
      `❌ **خطا در بازسازی**\n\n${error instanceof Error ? error.message : 'خطای نامشخص'}`
    );
  }
}

// ============================================================
// 📦 HANDLE BLOCKED USERS COMMAND
// ============================================================

async function handleBlockedUsersCommand(message: Message, env: Env): Promise<void> {
  const { chat } = message;
  
  if (message.from?.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🚫 دسترسی محدود", {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  const processingMsg = await sendMessage(chat.id, 
    "🔍 **در حال اسکن کاربران...**\n\n⏳ این کار ممکنه چند دقیقه طول بکشه", 
    { reply_to_message_id: message.message_id }
  );
  
  try {
    let allKeys: any[] = [];
    let listResult = await env.SESSIONS.list({ prefix: "session:" });
    allKeys.push(...listResult.keys);
    
    while (!listResult.list_complete && listResult.cursor) {
      listResult = await env.SESSIONS.list({ prefix: "session:", cursor: listResult.cursor });
      allKeys.push(...listResult.keys);
    }
    
    const allUserIds: number[] = [];
    const userInfoMap = new Map<number, { firstName: string; userName: string; lastSeen: number }>();
    
    for (const item of allKeys) {
      try {
        const stored = await env.SESSIONS.get(item.name, "json");
        if (!stored) continue;
        
        const session = stored as ChatSession;
        
        if (session.type !== "private") continue;
        if (session.messageCount < 1) continue;
        
        const userMemories = session.userMemories;
        const firstUser = Array.from(userMemories.values())[0];
        
        if (firstUser && firstUser.userId) {
          allUserIds.push(firstUser.userId);
          userInfoMap.set(firstUser.userId, {
            firstName: firstUser.firstName,
            userName: firstUser.userName || '',
            lastSeen: session.lastSeen
          });
        }
        
      } catch (error) {
        continue;
      }
    }
    
    if (allUserIds.length === 0) {
      await editMessageText(chat.id, processingMsg.message_id, 
        "📭 **هیچ کاربری یافت نشد**"
      );
      return;
    }
    
    await editMessageText(chat.id, processingMsg.message_id, 
      `🔍 **در حال بررسی ${allUserIds.length} کاربر...**\n\n` +
      `⏳ لطفاً صبر کنید (حدود ${Math.ceil(allUserIds.length * 0.15)} ثانیه)`
    );
    
    const blockedUsers: Array<{
      userId: number;
      firstName: string;
      userName: string;
      lastSeen: number;
    }> = [];
    
    let checked = 0;
    const batchSize = 10;
    
    for (let i = 0; i < allUserIds.length; i++) {
      const userId = allUserIds[i];
      const isBlocked = await isUserBlocked(userId, env);
      
      if (isBlocked) {
        const info = userInfoMap.get(userId)!;
        blockedUsers.push({
          userId,
          firstName: info.firstName,
          userName: info.userName,
          lastSeen: info.lastSeen
        });
      }
      
      checked++;
      
      if (checked % batchSize === 0 || checked === allUserIds.length) {
        await editMessageText(chat.id, processingMsg.message_id, 
          `🔍 **در حال بررسی...**\n\n` +
          `📊 پیشرفت: ${checked}/${allUserIds.length}\n` +
          `🚫 مسدود: ${blockedUsers.length}`
        ).catch(() => {});
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    let text = `🚫 **کاربران مسدودکننده ربات**\n\n`;
    text += `📊 از ${allUserIds.length} کاربر بررسی شده:\n`;
    text += `✅ فعال: ${allUserIds.length - blockedUsers.length}\n`;
    text += `🚫 مسدود: ${blockedUsers.length}\n\n`;
    
    if (blockedUsers.length === 0) {
      text += `🎉 **همه کاربران ربات رو فعال دارن!**`;
    } else {
      text += `➖➖➖➖➖➖➖➖➖➖\n\n`;
      
      blockedUsers.sort((a, b) => b.lastSeen - a.lastSeen);
      
      blockedUsers.slice(0, 30).forEach((user, i) => {
        const lastSeenDate = new Date(user.lastSeen).toLocaleDateString('fa-IR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        text += `**${i + 1}.** ${user.firstName}\n`;
        text += `🆔 \`${user.userId}\`\n`;
        text += `👤 @${user.userName || 'ندارد'}\n`;
        text += `📅 آخرین فعالیت: ${lastSeenDate}\n\n`;
      });
      
      if (blockedUsers.length > 30) {
        text += `➕ ... و ${blockedUsers.length - 30} کاربر دیگر\n\n`;
      }
      
      text += `💡 **توجه:** این لیست فقط کاربرایی رو نشون میده که ربات رو مسدود کردن.`;
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: "🔙 بازگشت", callback_data: "admin_back_to_main" }]
      ]
    };
    
    await editMessageText(chat.id, processingMsg.message_id, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
    
  } catch (error) {
    logger.error("Blocked users check failed", error);
    await editMessageText(chat.id, processingMsg.message_id, 
      "❌ **خطا در بررسی**\n\nلطفاً دوباره تلاش کنید."
    );
  }
}

// ============================================================
// 📦 HANDLE LANGUAGE COMMAND
// ============================================================

async function handleLanguageCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from) return;
  
  const session = await getOrCreateSession(chat, from, env);
  
  const text = `🌐 **Language Selection / انتخاب زبان**

Current: **${session.language === 'fa' ? 'فارسی 🇮🇷' : session.language === 'en' ? 'English 🇺🇸' : 'العربية 🇸🇦'}**

Please select your language:
لطفاً زبان خود را انتخاب کنید:
يرجى اختيار لغتك:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🇮🇷 فارسی", callback_data: "set_lang_fa" },
        { text: "🇺🇸 English", callback_data: "set_lang_en" },
        { text: "🇸🇦 العربية", callback_data: "set_lang_ar" }
      ]
    ]
  };

  await refreshUserCommands(chat.id, session);
  await sendMessage(chat.id, text, {
    reply_to_message_id: message.message_id,
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 📊 پایان سورس کد
// ============================================================

console.log(`🚀 Nova Bot v${BOT_VERSION} loaded!`);
console.log(`👤 Owner: @Hamid_Ai_pro`);
console.log(`🤖 Created by: Nova Team`);
console.log(`🌐 Languages: Persian (fa), English (en), Arabic (ar)`);

// ============================================================
// 🚀 EXPORT DEFAULT
// ============================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      config = createConfig(env);
      API_URL = `https://api.telegram.org/bot${config.TOKEN}`;

      if (!isInitialized) {
        if (!initPromise) {
          initPromise = initializeBot(env, config).then(() => {
            isInitialized = true;
            logger.info("✅ Bot is ready!");
          }).catch(err => {
            logger.error("❌ Bot initialization failed", err);
            throw err;
          });
        }
        await initPromise;
      }

      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/health") {
        return await createHealthCheckResponse(env);
      }

      if (path === "/" || path === "") {
        return new Response(`✅ Nova Bot v${BOT_VERSION} running!\n🔑 TOKEN: ${config.TOKEN ? '✅ Set' : '❌ Missing'}`);
      }

      if (request.method === "POST" && path === "/webhook") {
        try {
          const update = await request.json();
          if (!update.update_id) return new Response("Invalid update", { status: 400 });
          ctx.waitUntil(handleUpdate(update, env, config).catch(err => logger.error("❌ Update failed", err)));
          return new Response("OK");
        } catch (error) {
          logger.error("❌ Webhook error", error);
          return new Response("Bad Request", { status: 400 });
        }
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      logger.error("❌ Worker fetch error", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      const now = Date.now();
      for (const [chatId, context] of groupContextCache.entries()) {
        if (now - context.lastCleanup > 60 * 60 * 1000) groupContextCache.delete(chatId);
      }
      const broadcastJob = await env.SESSIONS.get('broadcast_job:current', 'json');
      if (broadcastJob && broadcastJob.status === 'pending' && broadcastJob.processedIndex < broadcastJob.totalUsers) {
        if (!API_URL) API_URL = `https://api.telegram.org/bot${config.TOKEN}`;
        await processBroadcastBatch(env);
      }
      logger.info("✅ Scheduled cleanup completed");
    } catch (error) {
      logger.error("Scheduled cleanup failed", error);
    }
  }
};
