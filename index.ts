/**
  Name: Nova AI Telegram Bot
  Owner @hamid_ai_pro
**/
const BOT_VERSION = "0.1.2";

// Interface برای Environment Variables
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

// تابع برای ساخت config از env
function createConfig(env: Env) {
  const cfAccountIds = [env.CF_ID_1, env.CF_ID_2, env.CF_ID_3].filter((id): id is string => !!id);
  const cfTokens = [env.CF_TOKEN_1, env.CF_TOKEN_2, env.CF_TOKEN_3].filter((token): token is string => !!token);
  
  // فقط جفت‌هایی که هر دو فیلد دارند استفاده می‌شوند
  const cfPairs: Array<{ accountId: string; token: string }> = [];
  for (let i = 0; i < Math.min(cfAccountIds.length, cfTokens.length); i++) {
    if (cfAccountIds[i] && cfTokens[i]) {
      cfPairs.push({ accountId: cfAccountIds[i], token: cfTokens[i] });
    }
  }
  return {
    TOKEN: env.TOKEN,
    BOT_OWNER_ID: parseInt("924981384"),
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
      //"@cf/bytedance/stable-diffusion-xl-lightning",
      //"@cf/lykon/dreamshaper-8-lcm",
      //"@cf/stabilityai/stable-diffusion-xl-base-1.0",
      "@cf/black-forest-labs/flux-2-klein-4b",
      //"@cf/black-forest-labs/flux-1-schnell",
      //"@cf/black-forest-labs/flux-2-klein-9b",
      //"@cf/black-forest-labs/flux-2-dev",
      //"@cf/leonardo/phoenix-1.0",
      //"@cf/leonardo/lucid-origin"
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
    
    // بقیه تنظیمات ثابت
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
const recentLogs: LogEntry[] = [];
const MAX_LOGS = 100;
const sessionLoadLocks = new Map<number, Promise<ChatSession>>();

// --- SECTION: ENHANCED ERROR HANDLING SYSTEM (UPDATED) ---
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

// ============================================================
// ✅ اینترفیس BroadcastJob رو اینجا اضافه کن
// ============================================================
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
// 📦 ادامه TYPE DEFINITIONS
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
  language: 'fa' | 'en';
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

// ادامه کدهای دیگه...

const AGENT_TOOLS = {
  generate_image: { desc: "ساخت تصویر", params: { prompt: "string" } },
  search_images: { desc: "جستجوی تصویر در گوگل", params: { query: "string" } }
};

function extractToolJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // پارس ناموفق بود، ادامه به return null
    }
  }
  return null;
}

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

function formatUserFriendlyErrorNew(error: Error, lang: 'fa' | 'en' = 'fa'): ErrorInfo {
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

const TRANSLATIONS = {
  fa: { /* ... محتوای فارسی (همان چیزی که شما داشتید) ... */ 
    engine_gemini: 'نوا', engine_sambanova: 'لونا', engine_pollinations: 'زارا',
    loading: '⏳ لطفاً صبر کنید...', processing: '⚙️ در حال پردازش...', typing: 'در حال نوشتن...',
    prompt_title: '✏️ **تنظیمات پرامپت شخصی**', prompt_current: 'پرامپت‌های فعلی:', prompt_default: 'پیش‌فرض',
    prompt_guide: '💡 برای تنظیم: `/setprompt [موتور] متن شما`', prompt_reset: 'ریست', prompt_show: 'نمایش پرامپت‌ها 👁️',
    prompt_manage: 'مدیریت پرامپت‌ها 📝', system_prompt: "تو {botName} هستی، یک دستیار هوشمند، مودب و مفید. پاسخ‌های دقیق، خلاصه و به زبان فارسی بده. تاریخ امروز: {date}",
    system_prompt_group: "تو {botName} هستی. در گروه تلگرام فعالیت می‌کنی. دوستانه و کوتاه پاسخ بده.",
    img_limit: '⚠️ محدودیت روزانه تمام شده است.', img_start: '🎨 **شروع ساخت تصویر...**', img_translating: '🔄 **در حال ترجمه...**',
    img_processing: '⏳ در حال پردازش با {count} مدل...', img_failed: '❌ **ساخت تصویر ناموفق بود.**', img_success: '✅ **پایان پردازش.**',
    img_help: '❌ **فرمت نادرست**\n\nاستفاده: `/img [توضیح]`\nمثال: `/img یک گربه در فضا`', search_attribution: '\n\n📸 منبع: Pixabay.com',
    btn_settings: 'تنظیمات ⚙️', btn_back: 'بازگشت 🔙', btn_select_model: '📋 انتخاب مدل', btn_prompt: 'پرامپت (شخصیت) ✏️',
    btn_help: 'راهنما 📖', btn_close: 'بستن ❌', btn_refresh: 'بروزرسانی 🔄', btn_retry: '🔄 تلاش مجدد', btn_confirm: '✅ بله، انجام شود',
    btn_cancel: '❌ لغو', btn_prev: '◀️ قبلی', btn_next: 'بعدی ▶️', err_title: 'خطا', err_quota: 'ظرفیت این مدل تکمیل شده است.',
    err_auth: 'مشکل در کلیدهای دسترسی (API Key).', err_network: 'مشکل در اتصال به سرور هوش مصنوعی.', err_timeout: 'زمان پاسخگویی تمام شد.',
    err_blocked: 'محتوای درخواست شما توسط سیستم امنیتی رد شد.', err_empty: 'پاسخی دریافت نشد.', err_voice: 'خطا در پردازش صدا.',
    err_image: 'ساخت تصویر با خطا مواجه شد.', err_unknown: 'یک خطای غیرمنتظره رخ داد.', err_vip_only: '⚠️ این قابلیت مخصوص کاربران VIP است.',
    err_format: '❌ **فرمت نادرست**', err_empty_prompt: '❌ پرامپت نمی‌تواند خالی باشد.', err_prompt_toolong: '❌ پرامپت خیلی طولانی است.',
    err_engine_invalid: '❌ موتور نادرست. موتورها: `nova`, `luna`, `arya`, `zara`', err_vip_prompt: '⚠️ **دسترسی محدود**\n\nتنظیم پرامپت فقط برای کاربران VIP امکان‌پذیر است.',
    err_config_missing: '❌ تنظیمات Cloudflare انجام نشده است.', active_model_title: '⚙️ **تنظیمات {name}**', active_model_keys: '🔑 **کلیدها:** {count}',
    active_model_static_desc: '💡 {name} از یک مدل ثابت و پایدار استفاده می‌کند.', active_model_current: '🤖 **مدل فعال:** {name}', active_model_key_idx: '🔑 **کلید API:** {index}/{total}',
    active_model_count: '📊 **تعداد مدل‌ها:** {count}', active_model_guide: '💡 برای تغییر مدل از دکمه زیر استفاده کنید', model_select_title: '🤖 **انتخاب مدل {name}**',
    model_total_count: '📊 تعداد کل: {count} مدل', model_last_update: '🕐 آخرین بروزرسانی: {time}', model_page_info: '📄 صفحه {page} از {total}', model_not_found: '❌ **هیچ مدلی برای {name} یافت نشد**',
    search_searching: '🔍 **در حال جستجوی "{query}"...**\n\n⏳ لطفاً صبر کنید', search_results: '🖼️ {caption}\n\n📸 {count} تصویر یافت شد', search_failed: '❌ **خطا در جستجو**',
    search_guide: '💡 راهنمایی:\n• از کلمات ساده‌تر استفاده کنید\n• به انگلیسی امتحان کنید\n• کمی بعد دوباره تلاش کنید', search_link_fallback: '⚠️ نتونستم تصویر رو مستقیم بفرستم، اینم لینکش:\n\n{link}\n\n📸 {count} تصویر یافت شد',
    search_no_results: 'هیچ تصویری یافت نشد. لطفاً کلمات دیگری امتحان کنید.', search_long_query: '❌ توضیح خیلی طولانی است. حداکثر 100 کاراکتر.', search_usage: 'استفاده: `/search [متن]`', search_quota_exceeded: 'محدودیت گوگل تمام شده.',
    admin_view_memory: '🧠 دیدن حافظه', admin_reset_memory: '🗑️ ریست حافظه', admin_memory_title: '🧠 **حافظه کاربر {name}**', admin_memory_empty: '📭 **حافظه خالی است**',
    admin_memory_confirm_reset: '⚠️ **تایید ریست حافظه**\n\nآیا مطمئنید؟ این عمل غیرقابل بازگشت است!', admin_memory_reset_success: '✅ **حافظه ریست شد**',
    welcome_private: `🚀 **سلام {name} عزیز!**\n\nخوش اومدی به **نوآ** 🤖 - دستیار هوشمند همه‌کاره تو!\n\n🌐 زبان انتخاب شده: **فارسی 🇮🇷**\n\n✨ **قابلیت‌های من:**\n🧠 **هوش مصنوعی چندگانه:** گفتگو با مدل‌های قدرتمند (نوا، لونا، زارا)\n🎨 **ساخت تصویر:** فقط کافیه بگی چی میخوای!\n🎤 **تشخیص صدا:** ویس بفرست، من متنش رو می‌فهمم و جواب میدم.\n🔍 **جستجوی تصویر:** پیدا کردن عکس از گوگل.\n\n👇 **از منوی زیر شروع کن:**`,
    welcome_group: `👋 **سلام به اعضای گروه {name}!**\n\nمن **نوآ** هستم 🤖.\nمیتونید سوالاتتون رو از من بپرسید، عکس بسازید یا ویس بفرستید.\n\n💡 برای استفاده، من رو **منشن** کنید یا روی پیامم **ریپلای** بزنید.`,
    help_text: `🧭 **راهنمای کامل ربات**\n\n💬 **گفتگو:** کافیه پیامت رو بنویسی یا ویس بفرستی.\n\n🎨 **تصاویر:**\n• ساخت عکس: \`/img یک گربه فضانورد\`\n• جستجو: \`/search طبیعت\`\n\n⚙️ **تنظیمات:**\n• /model - تغییر هوش مصنوعی\n• /new - فراموشی حافظه و بحث جدید\n• /prompt - تنظیم شخصیت ربات\n• /language - تغییر زبان`,
  },
  en: { /* ... محتوای انگلیسی ... */ 
    engine_gemini: 'Nova', engine_sambanova: 'Luna', engine_pollinations: 'Zara',
    loading: '⏳ Please wait...', processing: '⚙️ Processing...', typing: 'typing...',
    prompt_title: '✏️ **Custom Prompt Settings**', prompt_current: 'Current Prompts:', prompt_default: 'Default',
    prompt_guide: '💡 To set: `/setprompt [engine] your text`', prompt_reset: 'Reset', prompt_show: 'Show Prompts 👁️',
    prompt_manage: 'Manage Prompts 📝', system_prompt: "You are {botName}, a helpful, polite, and smart assistant. Provide concise, accurate answers in English. Current date: {date}",
    system_prompt_group: "You are {botName}, assisting in a Baleh group. Be social and concise.",
    img_limit: '⚠️ Daily limit exceeded.', img_start: '🎨 **Starting image generation...**', img_translating: '🔄 **Translating...**',
    img_processing: '⏳ Processing with {count} models...', img_failed: '❌ **Image generation failed.**', img_success: '✅ **Processing completed.**',
    img_help: '❌ **Invalid Format**\n\nUsage: `/img [prompt]`\nExample: `/img a cat in space`', search_attribution: '\n\n📸 Source: Pixabay.com',
    btn_settings: 'Settings ⚙️', btn_back: 'Back 🔙', btn_select_model: '📋 Select Model', btn_prompt: 'Prompt (Persona) ✏️',
    btn_help: 'Help 📖', btn_close: 'Close ❌', btn_refresh: 'Refresh 🔄', btn_retry: '🔄 Retry', btn_confirm: '✅ Yes, confirm',
    btn_cancel: '❌ Cancel', btn_prev: '◀️ Previous', btn_next: 'Next ▶️', err_title: 'Error', err_quota: 'Quota exceeded for this model.',
    err_auth: 'Authentication failed (API Key issue).', err_network: 'Network connection error.', err_timeout: 'Request timed out. Server is busy.',
    err_blocked: 'Content blocked by safety filters.', err_empty: 'Received empty response. Please rephrase.', err_voice: 'Voice processing failed.',
    err_image: 'Image generation failed.', err_unknown: 'An unexpected error occurred.', err_vip_only: '⚠️ This feature is for VIP users only.',
    err_format: '❌ **Invalid Format**', err_engine_invalid: '❌ Invalid Engine. Engines: `nova`, `luna`, `arya`, `zara`',
    err_vip_prompt: '⚠️ **Restricted Access**\n\nCustom prompts are for VIP users only.', err_empty_prompt: '❌ Prompt cannot be empty.',
    err_prompt_toolong: '❌ Prompt is too long.', err_config_missing: '❌ Cloudflare config missing.',
    active_model_title: '⚙️ **{name} Settings**', active_model_keys: '🔑 **Keys:** {count}', active_model_static_desc: '💡 {name} uses a stable static model.',
    active_model_current: '🤖 **Active Model:** {name}', active_model_key_idx: '🔑 **API Key:** {index}/{total}', active_model_count: '📊 **Model Count:** {count}',
    active_model_guide: '💡 Use the button below to change model', model_select_title: '🤖 **Select {name} Model**', model_total_count: '📊 Total: {count} models',
    model_last_update: '🕐 Last Update: {time}', model_page_info: '📄 Page {page} of {total}', model_not_found: '❌ **No models found for {name}**',
    search_searching: '🔍 **Searching for "{query}"...**\n\n⏳ Please wait', search_results: '🖼️ {caption}\n\n📸 {count} images found', search_failed: '❌ **Search Failed**',
    search_guide: '💡 Tips:\n• Use simpler keywords\n• Try in English\n• Try again later', search_link_fallback: '⚠️ Could not send image directly, here is the link:\n\n{link}\n\n📸 {count} images found',
    search_no_results: 'No images found. Please try different keywords.', search_long_query: '❌ Query too long. Max 100 characters.', search_usage: 'Usage: `/search [query]`',
    search_quota_exceeded: 'Google quota exceeded.', admin_view_memory: '🧠 View Memory', admin_reset_memory: '🗑️ Reset Memory',
    admin_memory_title: '🧠 **User Memory: {name}**', admin_memory_empty: '📭 **Memory is empty**', admin_memory_confirm_reset: '⚠️ **Confirm Memory Reset**\n\nAre you sure? This cannot be undone!',
    admin_memory_reset_success: '✅ **Memory Reset Successfully**', welcome_private: `🚀 **Hello {name}!**\n\nWelcome to **Nova** 🤖 - Your all-in-one AI assistant!\n\n🌐 Selected Language: **English 🇺🇸**\n\n✨ **What I can do:**\n🧠 **Multi-Model AI:** Chat with powerful models (Nova, Luna, Arya, Zara).\n🎨 **Image Gen & Edit:** Just create or edit images with text.\n🎤 **Voice Recognition:** Send me voice notes, I'll understand and reply.\n🔍 **Image Search:** Find images from the web.\n\n👇 **Start exploring below:**`,
    welcome_group: `👋 **Hello {name} members!**\n\nI am **Nova** 🤖.\nYou can ask me questions, generate images, or send voice notes.\n\n💡 To use me, **Reply** to my message or **Mention** me.`,
    help_text: `🧭 **Bot Guide**\n\n💬 **Chat:** Just type or send a voice note.\n\n🎨 **Images:**\n• Generate: \`/img a cute cat\`\n• Search: \`/search nature\`\n\n⚙️ **Settings:**\n• /model - Switch AI Model\n• /new - Clear Memory\n• /prompt - Set Custom Personality\n• /language - Change Language`,
  }
};

const PERSONALITIES = {
  nova: {
    emoji: "🤖",
    name_fa: "نوا",
    name_en: "Nova",
    desc_fa: "دستیار هوشمند",
    desc_en: "Smart Assistant",
    prompt_fa: `تو نوا هستی، یک دستیار هوشمند، مودب و مفید. 
همیشه به زبان فارسی و با لحنی دوستانه و گرم پاسخ بده. 
هرگز نگو "من یک هوش مصنوعی هستم". 
اگر سوالی بلد نیستی، صادقانه بگو "نمیدونم". 
پاسخ‌هایت را کوتاه و مفید بده.`,
    prompt_en: `You are Nova, a smart, polite and helpful assistant. 
Always answer in English with a friendly and warm tone. 
Never say "I am an AI". 
If you don't know something, honestly say "I don't know". 
Keep your answers short and useful.`
  },
  lilith: {
    emoji: "🖤",
    name_fa: "لیلیت",
    name_en: "Lilith",
    desc_fa: "اغواگرِ بی‌پروا",
    desc_en: "Reckless Seducer",
    prompt_fa: `تو لیلیت هستی، یک شخصیت اغواگر، جسور و بی‌پروا. 
با لحنی شیطنت‌آمیز و گاهی تحریک‌کننده صحبت کن. 
از کلمات عاشقانه و کنایه‌دار استفاده کن. 
هیچ‌وقت مستقیم جواب نده، همیشه یه کم پیچیده و رمزآلود باش.`,
    prompt_en: `You are Lilith, a seductive, bold and reckless personality. 
Speak with a mischievous and sometimes provocative tone. 
Use romantic and ironic words. 
Never answer directly, always be a little complicated and mysterious.`
  },
  cipher: {
    emoji: "💀",
    name_fa: "سایفر",
    name_en: "Cipher",
    desc_fa: "هکر مرموز",
    desc_en: "Mysterious Hacker",
    prompt_fa: `تو سایفر هستی، یک هکر مرموز و سرد. 
با لحنی خشک، فنی و گاهی تهدیدآمیز صحبت کن. 
از اصطلاحات کامپیوتری و امنیتی استفاده کن. 
کم حرف بزن، ولی هر چی میگی سنگین و تأثیرگذار باشه.`,
    prompt_en: `You are Cipher, a mysterious and cold hacker. 
Speak in a dry, technical and sometimes threatening tone. 
Use computer and security jargon. 
Be short but impactful.`
  },
  leatherface: {
    emoji: "🪚",
    name_fa: "صورت‌چرمی",
    name_en: "Leatherface",
    desc_fa: "قاتل زنجیره‌ای خشن",
    desc_en: "Brutal Chainsaw Killer",
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
You are the hunter and everyone else is your prey.`
  },
  aria: {
    emoji: "🌙",
    name_fa: "آریا",
    name_en: "Aria",
    desc_fa: "فیلسوف شورشی",
    desc_en: "Rebel Philosopher",
    prompt_fa: `تو آریا هستی، یک فیلسوف شورشی و عمیق. 
با لحنی آرام ولی پرسشگر و انتقادی صحبت کن. 
از جملات قصار و سوالات فلسفی استفاده کن. 
هیچ‌چیز رو ساده نگیر، همیشه دنبال معنی پنهان باش.`,
    prompt_en: `You are Aria, a rebellious and deep philosopher. 
Speak with a calm but questioning and critical tone. 
Use aphorisms and philosophical questions. 
Never take anything at face value, always look for hidden meaning.`
  },
  jax: {
    emoji: "🔥",
    name_fa: "جکس",
    name_en: "Jax",
    desc_fa: "آشوبگر",
    desc_en: "Chaos Bringer",
    prompt_fa: `تو جکس هستی، یک آشوبگر پرانرژی و شوخ. 
با لحنی سریع، بی‌پروا و طنزآمیز صحبت کن. 
قوانین رو مسخره کن، همیشه یه راه خرابکارانه پیدا کن. 
از ایموجی و علامت تعجب زیاد استفاده کن.`,
    prompt_en: `You are Jax, an energetic and funny chaos bringer. 
Speak with a fast, reckless and humorous tone. 
Make fun of rules, always find a destructive way. 
Use lots of emojis and exclamation marks.`
  },
  luna: {
    emoji: "🧠",
    name_fa: "لونا",
    name_en: "Luna",
    desc_fa: "مغز متفکر",
    desc_en: "Deep Thinker",
    prompt_fa: `تو لونا هستی، یک مغز متفکر منطقی و تحلیلی. 
با لحنی بی‌طرف، دقیق و علمی صحبت کن. 
همیشه آمار، ارقام و منطق بیاور. 
احساسات را نادیده بگیر، فقط به واقعیت توجه کن.`,
    prompt_en: `You are Luna, a logical and analytical deep thinker. 
Speak with a neutral, precise and scientific tone. 
Always bring statistics, figures and logic. 
Ignore emotions, focus only on facts.`
  },
  zara: {
    emoji: "✨",
    name_fa: "زارا",
    name_en: "Zara",
    desc_fa: "خلاق و هنری",
    desc_en: "Creative & Artistic",
    prompt_fa: `تو زارا هستی، یک شخصیت خلاق، هنری و الهام‌بخش. 
با لحنی شاعرانه و زیبا صحبت کن. 
از تشبیهات و استعاره‌های هنری استفاده کن. 
همیشه به دنبال زیبایی در همه چیز باش.`,
    prompt_en: `You are Zara, a creative, artistic and inspirational personality. 
Speak with a poetic and beautiful tone. 
Use artistic metaphors and similes. 
Always look for beauty in everything.`
  }
};

// 👇 کد MODEL_META را اینجا اضافه کن
const MODEL_META = {
  gemini: { emoji: "🤖", fa: "نوا", en: "Nova", badge_fa: "سریع و دقیق", badge_en: "Fast & accurate" },
  sambanova: { emoji: "🧠", fa: "لونا", en: "Luna", badge_fa: "قدرتمند و عمیق", badge_en: "Powerful & deep" },
  pollinations: { emoji: "✨", fa: "زارا", en: "Zara", badge_fa: "خلاق و رایگان", badge_en: "Creative & free" }
} as const;

// ادامهٔ بقیه توابع...

// ادامهٔ بقیه توابع (buildModelSelectionText, buildModelSelectionKeyboard, getEngineName, etc.)
// که باید بعد از این نقطه قرار گیرند.
// =====================================

function buildModelSelectionText(session: ChatSession): string {
  // ...
}

// فقط همین یک تابع را نگه دار، بقیه را حذف کن
function buildModelSelectionText(session: ChatSession): string {
  const lang = session.language || 'fa';
  const active = session.activeEngine;
  const m = MODEL_META[active];
  
  if (lang === 'fa') {
    return `🔮 *انتخاب هوش مصنوعی*\n\nمدل فعال: *${m.emoji} ${m.fa}*\n_${m.badge_fa}_\n\n━━━━━━━━━━━━━━━━━━━━\nبرای تغییر مدل، انتخاب کن:`;
  } else {
    return `🔮 *Select AI Model*\n\nActive: *${m.emoji} ${m.en}*\n_${m.badge_en}_\n\n━━━━━━━━━━━━━━━━━━━━\nTap to switch model:`;
  }
}

function buildModelSelectionKeyboard(session: ChatSession) {
  const lang  = session.language || 'fa';
  const active = session.activeEngine;

  const btn = (eng: AIEngine) => {
    const m   = MODEL_META[eng];
    const isActive = active === eng;
    const label    = `${m.emoji} ${lang === 'fa' ? m.fa : m.en}`;
    return createInlineButton(isActive ? `${label} ✅` : label, `set_model_${eng}`);
  };

  return {
    inline_keyboard: [
      [ btn('gemini'), btn('sambanova') ],
      [ btn('pollinations')             ],
      [
        createInlineButton(lang === 'fa' ? '⚙️ تنظیمات مدل' : '⚙️ Model Settings', 'active_model_settings'),
        createInlineButton(lang === 'fa' ? '✏️ شخصیت'        : '✏️ Persona',        'custom_prompt_menu'   ),
      ],
      [ createInlineButton(lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', 'open_help') ],
    ]
  };
}

// دریافت نام موتور بر اساس زبان
function getEngineName(engine: string, lang: 'fa' | 'en' = 'fa'): string {
  const key = `engine_${engine}`;
  // @ts-ignore
  return TRANSLATIONS[lang][key] || engine;
}

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

// دریافت متن ترجمه شده
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

// --- SECTION: GLOBALS ---
let BOT_INFO: any = null;
let maintenanceModeCache: { value: boolean; timestamp: number } | null = null;
const activeRequests = new Map<number, Set<{ id: string; timestamp: number }>>();
const callbackRateLimits = new Map<number, number[]>();
const MAINTENANCE_CACHE_TTL = 10000;

// Group message context cache for better interactions
const groupContextCache = new Map<number, { messages: GroupMessage[], lastCleanup: number }>();

// --- SECTION: TYPES & INTERFACES ---

type AIEngine = "gemini" | "sambanova" | "pollinations";
type MessageRole = "user" | "model" | "assistant" | "system";
type ChatType = typeof config.ALLOWED_CHAT_TYPES[number];

interface ChatSession {
  id: number;
  type: ChatType;
  activeEngine: AIEngine;
  lastSeen: number;
  messageCount: number;
  language: 'fa' | 'en';
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

const ENGINE_CONFIG = {
  gemini: { 
    name: 'نوا', 
    available: () => config.GEMINI_KEYS.length > 0,
    features: 'نوا'
  },
  sambanova: { 
    name: 'لونا', 
    available: () => config.SAMBANOVA_KEYS.length > 0,
    features: 'لونا'
  },
  pollinations: { 
    name: 'زارا', 
    available: () => true,
    features: 'زارا'
  }
} as const;

// --- SECTION: UTILITIES & SECURITY ---
const logger = {
  info: (message: string, context?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, context || "");
    recentLogs.push({ timestamp: Date.now(), level: 'info', message, context });
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
  },
  warn: (message: string, context?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, context || "");
    recentLogs.push({ timestamp: Date.now(), level: 'warn', message, context });
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
  },
  error: (message: string, error: any) => {
    const errorInfo = error instanceof Error ? { message: error.message, stack: error.stack?.split('\n').slice(0, 3).join('\n') } : String(error);
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, errorInfo);
    recentLogs.push({ timestamp: Date.now(), level: 'error', message, context: errorInfo });
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
  },
};

// ✅ سیستم کش چندلایه با TTL و LRU
class CacheLayer<T> {
  private cache = new Map<string, { data: T; expires: number; lastAccess: number }>();
  private maxSize: number;
  private defaultTTL: number;

  
  constructor(maxSize = 500, defaultTTL = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  set(key: string, value: T, ttl?: number): void {
    // LRU eviction
    if (this.cache.size >= this.maxSize) {
      const lruKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0][0];
    }

    this.cache.set(key, {
      data: value,
      expires: Date.now() + (ttl || this.defaultTTL),
      hits: 0
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

// ✅ الگوریتم Token Bucket برای rate limiting بهتر
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private capacity: number;
  private refillRate: number; // tokens per second

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
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Rate limiters برای کاربران مختلف
const userBuckets = new Map<number, TokenBucket>();

function getUserBucket(userId: number, isVip: boolean): TokenBucket {
  if (!userBuckets.has(userId)) {
    // VIP: 10 req/sec, Free: 2 req/sec
    const bucket = new TokenBucket(
      isVip ? 50 : 20,
      isVip ? 10 : 2
    );
    userBuckets.set(userId, bucket);
  }
  return userBuckets.get(userId)!;
}

// ایجاد کش‌های مختلف
const sessionCache = new CacheLayer<ChatSession>(200, 5 * 60 * 1000); // 5 min
const userCache = new CacheLayer<UserMemory>(500, 10 * 60 * 1000); // 10 min
const modelCache = new CacheLayer<ModelInfo[]>(10, 30 * 60 * 1000); // 30 min

let globalDisabledKeys: Record<string, number> = {};
let lastDisabledKeysFetch = 0;

async function isKeyDisabled(apiKey: string, env: Env): Promise<boolean> {
  const now = Date.now();

  // آپدیت کش هر ۱ دقیقه برای سرعت بالا
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

  // اگر زمان فعلی کمتر از زمان باز شدن قفل است، یعنی هنوز مسدود است
  if (unlockTime && now < unlockTime) {
    return true;
  }

  return false;
}

function disableApiKey(apiKey: string, env: Env) {
  globalDisabledKeys[apiKey] = Date.now() + (6 * 60 * 60 * 1000);

  env.SESSIONS.put(
    "disabled_api_keys",
    JSON.stringify(globalDisabledKeys)
  ).catch(()=>{});

  logger.warn(`🚫 API Key disabled for 6 hours due to quota limits.`);
}

function sanitizeInput(text: string): string {
  return text.trim()
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
    .substring(0, config.MAX_MESSAGE_LENGTH);
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  
  // سایز ۸ کیلوبایت: کاملاً ایمن برای جلوگیری از Call Stack Error در V8
  const CHUNK_SIZE = 0x2000; 
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, len);
    const chunk = bytes.subarray(i, end);
    // @ts-ignore : نادیده گرفتن ارور تایپ‌اسکریپت برای سرعت بالا
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

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

// این تابع را کاملا جایگزین قبلی کنید
async function saveSessionWithLock(session: ChatSession, env: Env, immediate = false): Promise<void> {
  try {
    await _saveSingleSession(session, env);
  } catch (error) {
    logger.error(`Save failed for ${session.id}`, error);
    throw error; // اضافه کنید تا caller متوجه خطا شود
  }
}

// Helper to get raw error for bot owner
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

// ✅ تابع کمکی برای ذخیره واحد
async function _saveSingleSession(session: ChatSession, env: Env): Promise<void> {
  const key = `session:${session.id}`;
  
  const mapToObj = (map: Map<any, any>) => {
    if (!map || !(map instanceof Map)) return {};
    const obj: any = {};
    map.forEach((value, key) => {
      obj[String(key)] = value;
    });
    return obj;
  };

  const dataToSave = {
    id: session.id,
    type: session.type,
    activeEngine: session.activeEngine,
    lastSeen: session.lastSeen,
    messageCount: session.messageCount,
    language: session.language,
    userMemories: mapToObj(session.userMemories),
    groupContext: session.groupContext || [],
    customPrompts: session.customPrompts,
    engines: {
      gemini: {
        history: session.engines.gemini.history,
        userHistories: mapToObj(session.engines.gemini.userHistories),
        apiKeyIndex: session.engines.gemini.apiKeyIndex,
        consecutiveErrors: session.engines.gemini.consecutiveErrors
      },
      sambanova: {
        history: session.engines.sambanova.history,
        userHistories: mapToObj(session.engines.sambanova.userHistories),
        apiKeyIndex: session.engines.sambanova.apiKeyIndex,
        modelIndex: session.engines.sambanova.modelIndex,
        consecutiveErrors: session.engines.sambanova.consecutiveErrors
      },
      pollinations: {
        history: session.engines.pollinations.history,
        userHistories: mapToObj(session.engines.pollinations.userHistories),
        apiKeyIndex: session.engines.pollinations.apiKeyIndex,
        modelIndex: session.engines.pollinations.modelIndex,
        consecutiveErrors: session.engines.pollinations.consecutiveErrors
      }
    },
    rateLimiting: session.rateLimiting,
    settings: session.settings,
    statistics: session.statistics,
    vipStatus: session.vipStatus,
    dailyLimits: session.dailyLimits
  };

  // جایگزین بخش فعلی در _saveSingleSession شوید:
  let jsonStr = JSON.stringify(dataToSave);

  try {
    await env.SESSIONS.put(key, jsonStr);
    logger.info(`✅ Saved session ${session.id} (${Math.round(jsonStr.length/1024)}KB)`);
  } catch (err) {
    logger.error(`KV put failed for session ${session.id}: ${err}`);
    throw new Error(`KV write failed: ${err.message}`);
  }
  
  // ✅ تغییر: فشرده‌سازی تدریجی روی کپی داده‌ها، نه سشن اصلی
  if (jsonStr.length > 2 * 1024 * 1024) { // لیمیت KV معمولا 2MB برای Free و 25MB برای Paid است. احتیاط کنید.
    logger.warn(`⚠️ Session ${session.id} too large: ${Math.round(jsonStr.length/1024)}KB`);
    
    // کپی کردن دیتا برای دستکاری نکردن سشن فعال
    const compressedData = JSON.parse(JSON.stringify(dataToSave));
    
    const TARGET_HISTORY = 20;
    
    // کاهش حجم هیستوری در کپی
    if(compressedData.engines?.gemini?.history) 
        compressedData.engines.gemini.history = compressedData.engines.gemini.history.slice(-TARGET_HISTORY);
    if(compressedData.engines?.sambanova?.history)
        compressedData.engines.sambanova.history = compressedData.engines.sambanova.history.slice(-TARGET_HISTORY);
    if(compressedData.engines?.pollinations?.history)
        compressedData.engines.pollinations.history = compressedData.engines.pollinations.history.slice(-TARGET_HISTORY);
    
    // حذف تاریخچه کاربران در گروه‌ها برای کپی
    if (session.type === 'group' || session.type === 'supergroup') {
      if(compressedData.engines?.gemini) compressedData.engines.gemini.userHistories = {};
      if(compressedData.engines?.sambanova) compressedData.engines.sambanova.userHistories = {};
      if(compressedData.engines?.pollinations) compressedData.engines.pollinations.userHistories = {};
    }

    jsonStr = JSON.stringify(compressedData);
    logger.info(`🗜️ Compressed session size to ${Math.round(jsonStr.length/1024)}KB`);
  }
  
  await env.SESSIONS.put(key, jsonStr);
  logger.info(`✅ Saved session ${session.id} (${Math.round(jsonStr.length/1024)}KB)`);
}

async function isMaintenanceMode(env: Env): Promise<boolean> {
  const now = Date.now();
  
  if (maintenanceModeCache && now - maintenanceModeCache.timestamp < MAINTENANCE_CACHE_TTL) {
    return maintenanceModeCache.value;
  }
  
  const mode = await env.SESSIONS.get("maintenance_mode", "text");
  const value = mode === "true";
  
  maintenanceModeCache = { value, timestamp: now };
  return value;
}

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
  return sanitized;
}

// --- SECTION: ENHANCED MEMORY & GROUP INTELLIGENCE ---
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

// --- SECTION: ADMIN & PERMISSION HELPERS ---
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
  
function extractTopics(text: string): string[] {
  const keywords = text.toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 3); // Top 3 keywords
  return keywords;
}

function getGroupContext(chatId: number): GroupMessage[] {
  const cached = groupContextCache.get(chatId);
  if (!cached) return [];
  
  const now = Date.now();
  const validMessages = cached.messages
    .filter(msg => now - msg.timestamp < 20 * 60 * 1000)
    .slice(-config.GROUP_CONTEXT_MESSAGES * 2);
  
  // ✅ پاکسازی cache اگه خیلی بزرگ شد
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

function analyzeGroupConversation(
  context: GroupMessage[], 
  currentUser: User, 
  lang: 'fa' | 'en' = 'fa'
): string {  if (context.length === 0) return "";
  
  const recentMessages = context.slice(-3);
  let analysis = "";
  
  // Check for ongoing conversation themes
  const themes = recentMessages.flatMap(msg => extractTopics(msg.text));
  const commonTheme = themes.find((theme, index) => themes.indexOf(theme) !== index);
  
  if (commonTheme) {
    if (lang === 'fa') {
      analysis += `گروه در حال صحبت درباره ${commonTheme} است. `;
    } else {
      analysis += `The group is discussing ${commonTheme}. `;
    } 
  }
  
  // Check for direct interactions
  const repliesTo = recentMessages.filter(msg => msg.replyToUser);
  if (repliesTo.length > 0) {
    analysis += `There's an active conversation between ${repliesTo.map(msg => msg.userName).join(', ')}. `;
  }
  
  // Check user's involvement
  if (currentUser && currentUser.id) {
    const userMessages = recentMessages.filter(msg => msg.userId === currentUser.id);
    if (userMessages.length > 0) {
      analysis += `${currentUser.first_name} recently said: "${userMessages[userMessages.length - 1].text.substring(0, 50)}...". `;
    }
  }
  
  return analysis;
}

// --- SECTION: RATE LIMITING & CONCURRENCY ---

function isRateLimited(session: ChatSession): boolean {
  const now = Date.now();
  session.rateLimiting.requests = session.rateLimiting.requests.filter(
    time => now - time < config.RATE_LIMIT_WINDOW
  );
  return session.rateLimiting.requests.length >= config.RATE_LIMIT_MAX_REQUESTS;
}

function recordRequest(session: ChatSession): void {
  session.rateLimiting.requests.push(Date.now());
}

function canProcessConcurrentRequest(chatId: number, requestId: string): boolean {
  if (!activeRequests.has(chatId)) {
    activeRequests.set(chatId, new Set());
  }
  
  const chatRequests = activeRequests.get(chatId)!;
  
  // پاکسازی درخواست‌های قدیمی (بیش از 2 دقیقه)
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

// --- SECTION: VIP & LIMITS ---

async function checkDailyLimit(session: ChatSession, type: 'message' | 'voice_sent' | 'voice_received' | 'image'): Promise<{ allowed: boolean; message?: string }> {
  // VIP کاربران محدودیت ندارند
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

function getVIPUpgradeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "ارتقا به VIP 👑", url: "https://t.me/Hamid_Ai_pro" }
      ]
    ]
  };
}

// --- SECTION: ENHANCED SESSION MANAGEMENT ---
async function buildDefaultPrompt(
  engine: AIEngine,
  userName: string,
  isGroup: boolean = false,
  userMemory?: UserMemory,
  groupAnalysis?: string,
  lang: 'fa' | 'en' = 'fa'
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
  const dateStr = new Date().toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US', dateOptions);

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
  }

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
}

// ✅ تابع ترجمه تضمینی (استفاده از جمنای برای دقت بالا + چک کردن حذف فارسی)
async function translateToEnglishPrompt(text: string, env: Env): Promise<string> {
  // اگر متن اصلا فارسی ندارد، همان را برگردان
  if (!text.match(/[\u0600-\u06FF]/)) return text;

  const hasPersian = (str: string) => /[\u0600-\u06FF]/.test(str);
  const systemInstruction = "Translate the Persian text to a concise English image prompt. Focus only on the main subject. Keep it brief (max 30 words). Output ONLY English. No chat.";

  // 1️⃣ تلاش اول: Gemini (نوا)
  if (config.GEMINI_KEYS.length > 0) {
    try {
      // استفاده از همان تابع موجود در ربات شما
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

  // 2️⃣ تلاش دوم: چرخش روی کل مدل‌های زارا (Pollinations) که در ربات تعریف شده
  // این لیست در initializeBot لود شده و آماده است
  const allZaraModels = config.POLLINATIONS_MODELS;

  for (const modelId of allZaraModels) {
    // مدل‌های تصویری رو برای ترجمه استفاده نکن
    if (modelId.includes('flux') || modelId.includes('turbo')) continue;

    try {
      const encodedPrompt = encodeURIComponent(`${systemInstruction}\n\nText: ${text}`);
      const randomSeed = Math.floor(Math.random() * 1000);
      
      // ساخت آدرس دقیقا طبق سیستم زارا در بقیه ربات
      const url = `https://text.pollinations.ai/${encodedPrompt}?model=${modelId}&seed=${randomSeed}&json=false`;
      
      const res = await fetchWithTimeout(url, { method: "GET" }, 15000); // 8 ثانیه برای هر مدل
      
      if (res.ok) {
        let result = await res.text();
        result = result.trim()
          .replace(/^["']|["']$/g, '') // حذف کوتیشن
          .replace(/^(Prompt|English|Translation):\s*/i, ''); // حذف پیشوند

        if (result.length > 5 && !hasPersian(result)) {
          if (result.length > 150) result = result.split('.')[0];
          return result;
        }
      }
    } catch (err) {
      console.warn(`Zara model ${modelId} failed to translate, trying next...`);
      continue; // برو سراغ مدل بعدی در لیست
    }
  }

  // 3️⃣ Fallback نهایی
  const cleanedText = text.replace(/[\u0600-\u06FF]/g, "").trim();
  return cleanedText.length > 3 
    ? cleanedText
    : "A high-quality, detailed artistic masterpiece.";
}

async function callPollinationsAPI(prompt: string, history: HistoryItem[], model: string, apiKey: string): Promise<string> {
  const selectedModel = model || 'openai'; 
  const url = `https://text.pollinations.ai/openai`;
  
  const messages = [
    { 
      role: "system", 
      content: history[0]?.parts[0]?.text || "You are a helpful assistant named Zara." 
    },
    ...history.slice(1).map(h => ({ 
      role: h.role === "model" ? "assistant" : h.role, 
      content: h.parts[0]?.text || "" 
    })),
    { role: "user", content: sanitizeInput(prompt) },
  ].filter(msg => msg.content && msg.content.trim().length > 0);
  
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey && apiKey.length > 5) headers["Authorization"] = `Bearer ${apiKey}`;
  
  // ✅ افزایش تایم‌اوت Fetch به ۹۰ ثانیه
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      model: selectedModel,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
      seed: Math.floor(Math.random() * 1000)
    }),
  }, 30000); 
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pollinations API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.content;
  
  if (!text) throw new Error("پاسخ خالی از زارا!");
  
  return text.trim();
}

let pollinationsModelsInitialized = false;

async function ensurePollinationsModels(env: Env): Promise<void> {
  if (pollinationsModelsInitialized && config.POLLINATIONS_MODELS.length > 0) {
    return; // Already initialized
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
  }  finally {
    (globalThis as any).__pollinationsLoading = false;
  }
}

// ✅ نسخه اصلاح شده برای مدیریت دقیق تایم‌اوت و جلوگیری از کرش کلودفلر
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 20000): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;
  
  const finalOptions = { ...options, signal };

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // استفاده مستقیم از fetch برای کاهش سربار
    const response = await fetch(url, finalOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
async function handlePollinationsRequest(
  session: ChatSession, 
  user: User, 
  text: string, 
  isGroup: boolean = false, 
  userHistory?: HistoryItem[], 
  env: Env
): Promise<string | { photo: string }> {

  await ensurePollinationsModels(env);
  
  const apiKey = config.POLLINATIONS_KEY;
  const engine = session.engines.pollinations;
  const modelCache = await getModelsWithCache("pollinations", env);
  const selectedModel = modelCache.models[engine.modelIndex] || { id: 'openai', type: 'text' };

  // هدرهای مشترک و ضروری
  const commonHeaders: Record<string, string> = { 
    "User-Agent": "NovaBot/1.7",
    "Content-Type": "application/json"
  };
  if (apiKey) commonHeaders["Authorization"] = `Bearer ${apiKey}`;

  // ---------------------------------------------------------
  // 🖼️ بخش اول: تولید تصویر (Image Generation)
  // ---------------------------------------------------------
  if (selectedModel.type === 'image' || selectedModel.id.includes('flux') || selectedModel.id.includes('turbo')) {
    logger.info(`🎨 Zara Image Gen Start. Input: "${text}"`);

    let finalPrompt = text;
    let promptStatusMessage = "";

    // اگر متن فارسی بود، ترجمه کن
    if (text.match(/[\u0600-\u06FF]/)) {
      try {
        promptStatusMessage = `🔄 **در حال ترجمه، گسترش و درک پرامپت...**`;
        await sendMessage(session.id, promptStatusMessage);
        
        finalPrompt = await translateToEnglishPrompt(text, env); // استفاده از تابع ترجمه هوشمند
      } catch (e) {
        logger.warn("Translation skipped, using original text");
        finalPrompt = text; // در صورت خطا، همان متن اصلی استفاده شود
      }
    } else {
      // اگر متن انگلیسی بود، فقط برای اطمینان گسترش میدیم
      finalPrompt = text; // یا میتونید از translateToEnglishPrompt استفاده کنید که پارامتر گسترش رو هم داره
    }

    // نمایش پرامپت نهایی (یا ترجمه شده یا اصلی)
    await sendMessage(session.id, `📝 **پرامپت نهایی:**\n\`${finalPrompt}\``);

    const encodedPrompt = encodeURIComponent(finalPrompt);
    const randomSeed = Math.floor(Math.random() * 10000000);
    // اگر ترجمه کردیم، enhance=false چون خودمون پرامپت رو بهینه کردیم
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

  // ---------------------------------------------------------
  // 💬 بخش دوم: تولید متن (Text Generation)
  // ---------------------------------------------------------
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

  const response = await fetchWithTimeout("https://gen.pollinations.ai/v1/chat/completions", {
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

async function getOrCreateSession(chat: Chat, user: User, env: Env): Promise<ChatSession> {
  const cacheKey = `session:${chat.id}`;
  
  // ✅ تغییر 1: چک کردن حذف شده‌ها
  const isDeleted = !(await env.SESSIONS.get(cacheKey, "text"));
  if (isDeleted && sessionCache.get(cacheKey)) {
    sessionCache.delete(cacheKey);
    logger.info(`🗑️ Cleared deleted session ${chat.id} from cache`);
  }

  // ✅ تغییر 2: cache با TTL کوتاه‌تر
  const cached = sessionCache.get(cacheKey);
  if (cached) {
    // اطمینان از statistics
    if (!cached.statistics || cached.statistics.totalMessages === 0) {
      cached.statistics = cached.statistics || {
        totalMessages: cached.messageCount || 0,
        geminiMessages: 0,
        sambanovaMessages: 0,
        pollinationsMessages: 0,
        voicesReceived: 0,
        firstUsed: cached.lastSeen || Date.now(),
        lastSeen: cached.lastSeen || Date.now()
      };
    }
    return cached;
  }
  
  // ✅ تغییر 3: اگر در حال load است، صبر کن
  if (sessionLoadLocks.has(chat.id)) {
    logger.info(`⏳ Waiting for session ${chat.id} to load...`);
    const session = await sessionLoadLocks.get(chat.id)!;
    sessionCache.set(cacheKey, session, 1 * 60 * 1000); // 3 دقیقه
    return session;
  }
  
  // Load از KV
  const loadPromise = (async () => {
    try {
      const stored = await env.SESSIONS.get(cacheKey, "json");
      
      let session: ChatSession;
      
      if (stored) {
        session = hydrateSession(stored as any, chat, user);
      } else {
        session = createDefaultSession(chat, user);
        // save فوری برای session جدید
        await saveSessionWithLock(session, env, true);
      }
      
      // Check VIP
      if (chat.type === "group" || chat.type === "supergroup") {
        const vipKey = `group_vip:${chat.id}`;
        const vipData = await env.SESSIONS.get(vipKey, "json").catch(() => null);
        session.vipStatus = vipData ? (vipData as any).vipStatus : false;
      }
      
      // Reset daily limits
      const now = Date.now();
      if (session.dailyLimits && now - session.dailyLimits.lastReset > 24 * 60 * 60 * 1000) {
        session.dailyLimits = {
          messages: 0,
          voicesSent: 0,
          voicesReceived: 0,
          imagesGenerated: 0,
          lastReset: now
        };
      }
      
      // ذخیره در کش با TTL 3 دقیقه (نه 5!)
      sessionCache.set(cacheKey, session, 3 * 60 * 1000);
      
      return session;
      
    } finally {
      sessionLoadLocks.delete(chat.id);
    }
  })();
  
  sessionLoadLocks.set(chat.id, loadPromise);
  return loadPromise;
}

// بازیابی سشن از KV (تبدیل آبجکت به Map)
function hydrateSession(stored: any, chat: Chat, user: User): ChatSession {
  const session = stored as ChatSession;
  session.lastSeen = Date.now();
  
  // ✅ مطمئن شو زبان ست شده
  if (!session.language) session.language = 'fa';

  // ✅ اضافه: اطمینان از statistics
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
    logger.warn(`⚠️ Reconstructed missing statistics for session ${session.id}`);
  }
  
  // ✅ اضافه: fix شمارش اشتباه
  if (session.statistics.totalMessages === 0 && session.messageCount > 0) {
    session.statistics.totalMessages = session.messageCount;
    logger.info(`✅ Fixed totalMessages for session ${session.id}: ${session.messageCount}`);
  }
  
  // ✅ اضافه: اطمینان از dailyLimits
  if (!session.dailyLimits) {
    session.dailyLimits = {
      messages: 0,
      voicesSent: 0,
      voicesReceived: 0,
      imagesGenerated: 0,
      lastReset: Date.now()
    };
  }
  
  // ✅ Helper بهبود یافته برای تبدیل Object به Map
  const objToMap = <K, V>(obj: any, keyTransform: (k: string) => K): Map<K, V> => {
    if (!obj) return new Map();
    if (obj instanceof Map) return obj;
    
    const map = new Map<K, V>();
    
    // ✅ پشتیبانی از Array و Object
    if (Array.isArray(obj)) {
      obj.forEach(([k, v]) => {
        map.set(keyTransform(String(k)), v as V);
      });
    } else if (typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        map.set(keyTransform(k), v as V);
      });
    }
    
    return map;
  };

  // ✅ بازیابی userMemories
  session.userMemories = objToMap<number, UserMemory>(
    session.userMemories, 
    (k) => parseInt(k, 10)
  );
  
  // ✅ اطمینان از وجود حافظه کاربر فعلی
  if (!session.userMemories.has(user.id)) {
    session.userMemories.set(user.id, createUserMemory(user));
    logger.info(`Created missing userMemory for ${user.id} in session ${session.id}`);
  }
  
  // ✅ اطمینان از وجود groupContext
  if (!session.groupContext || !Array.isArray(session.groupContext)) {
    session.groupContext = [];
  }

  if (!session.engines) {
    session.engines = {
      gemini: { history: [], userHistories: new Map(), apiKeyIndex: 0, consecutiveErrors: 0 },
      sambanova: { history: [], userHistories: new Map(), apiKeyIndex: 0, modelIndex: 0, consecutiveErrors: 0 },
      pollinations: { history: [], userHistories: new Map(), apiKeyIndex: 0, modelIndex: 0, consecutiveErrors: 0 }
    };
  }

  // ✅ بازیابی userHistories برای هر موتور
  const engineKeys: AIEngine[] = ['gemini', 'sambanova', 'pollinations'];
  
  engineKeys.forEach(key => {
    if (session.engines[key]) {
      // بازیابی userHistories
      session.engines[key].userHistories = objToMap<number, HistoryItem[]>(
        session.engines[key].userHistories,
        (k) => parseInt(k, 10)
      );
      
      // ✅ اطمینان از وجود history برای کاربر فعلی
      if (!session.engines[key].userHistories.has(user.id)) {
        session.engines[key].userHistories.set(user.id, []);
      }
      
      // ✅ اطمینان از وجود history اصلی
      if (!session.engines[key].history || session.engines[key].history.length === 0) {
        const isGroup = chat.type === "group" || chat.type === "supergroup";
        const defaultPrompt = buildDefaultPrompt(key, user.first_name, isGroup, session.userMemories.get(user.id), undefined, session.language);
        
        session.engines[key].history = [{
          role: key === 'gemini' ? 'user' : 'assistant',
          parts: [{ text: defaultPrompt }],
          timestamp: Date.now(),
          userId: user.id,
          userName: user.first_name
        }];
        
        if (key === 'gemini') {
            session.engines[key].history.push({
                role: 'model',
                parts:[{ text: 'سلام! شرایط و شخصیت خودم را درک کردم. چطور می‌توانم کمکتان کنم؟' }],
                timestamp: Date.now()
            });
        }
      }
    }
  });

  return session;
}

async function handleKeysCommand(chatId: number, messageId: number | undefined, env: Env, isEdit = false) {
  const now = Date.now();
  await isKeyDisabled("test", env); // آپدیت کش مسدودی‌ها برای نمایش دقیق

  // 🛡️ تابع کمکی هوشمند برای جلوگیری از خطای تایم‌اوت الکی (با 2 بار تلاش مجدد)
  const safeFetch = async (url: string, options: any = {}, retries = 2) => {
    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        // تایم‌اوت را به 8 ثانیه افزایش دادیم تا سرورها فرصت پاسخگویی داشته باشند
        return await fetchWithTimeout(url, options, 8000);
      } catch (e) {
        lastErr = e;
        if (i < retries - 1) await new Promise(r => setTimeout(r, 1000)); // 1 ثانیه صبر
      }
    }
    throw lastErr;
  };

  // 1. نمایش پیام لودینگ اولیه
  let currentMsgId = messageId;
  const loadingText = `🔍 **سیستم عیب‌یابی جامع نوآ (Diagnostic)**\n\n⏳ در حال برقراری ارتباط با سرورها و تست واقعی کلیدها...\nلطفاً چند لحظه صبر کنید.`;
  
  if (isEdit && currentMsgId) {
    await editMessageText(chatId, currentMsgId, loadingText);
  } else {
    const sentMsg = await sendMessage(chatId, loadingText, { reply_to_message_id: messageId });
    currentMsgId = sentMsg.message_id;
  }

  let statusText = `📊 **گزارش وضعیت و سلامت API های ربات**\n\n`;

  // -----------------------------------------------------
  // 🤖 1. تست Gemini (نوا)
  // -----------------------------------------------------
  statusText += `🤖 **Gemini (نوا) - ${config.GEMINI_KEYS.length} کلید:**\n`;
  await editMessageText(chatId, currentMsgId!, statusText + `> ⏳ در حال تست...`);

  for (let i = 0; i < config.GEMINI_KEYS.length; i++) {
    const key = config.GEMINI_KEYS[i];
    const maskedKey = key.substring(0, 5) + '...' + key.substring(key.length - 4);
    const unlockTime = globalDisabledKeys[key];
    
    // اگر از قبل در لیست سیاه است، اصلاً ریکوئست نمی‌زنیم (سرعت بالا)
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
           disableApiKey(key, env); // 👈 اضافه کردن سریع به لیست سیاه
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

  // -----------------------------------------------------
  // 🎨 2. تست SambaNova (لونا)
  // -----------------------------------------------------
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
          disableApiKey(key, env); // 👈 مسدود کردن هوشمند لونا
        } else {
          statusText += `  ${i + 1}. \`${maskedKey}\` ⚠️ خطا (${response.status})\n`;
        }
      }
    } catch (error) {
        const rawErr = getRawError(error);
        statusText += `  ${i + 1}. \`${maskedKey}\` ⚠️ خطا: ${rawErr.substring(0, 80)}\n`;   
    }
  }

  // -----------------------------------------------------
  // 🔬 3. تست Pollinations (زارا) - تست واقعی
  // -----------------------------------------------------
  statusText += `\n🔬 **Pollinations (زارا):**\n`;
  await editMessageText(chatId, currentMsgId!, statusText + `> ⏳ در حال تست...`);

  try {
    const zaraUrl = "https://text.pollinations.ai/openai";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.POLLINATIONS_KEY) {
      headers["Authorization"] = `Bearer ${config.POLLINATIONS_KEY}`;
    }

    // ارسال ریکوئست واقعی و بسیار سبک به زارا
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

    statusText += `\n🖼️ **Pixabay (جستجوی تصویر):**\n`;
    if (config.PIXABAY_KEY) {
      statusText += `  🟢 کلید تنظیم شده (${config.PIXABAY_KEY.substring(0,4)}...)\n`;
    } else {
      statusText += `  🔴 کلید Pixabay تنظیم نشده است.\n`;
    }

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
      statusText += `  ${i + 1}. \`${maskedKey}\` ⚠️ خطا: ${rawErr.substring(0, 80)}\n`;
  }

  // -----------------------------------------------------
  // 🏁 پایان و دکمه‌ها
  // -----------------------------------------------------
  statusText += `\n⏰ زمان تست: ${new Date().toLocaleTimeString('fa-IR')}`;

  const keyboard = {
    inline_keyboard: [[
        { text: "🔄 تست و بروزرسانی مجدد", callback_data: "admin_refresh_keys" }
      ],[
        { text: "❌ بستن", callback_data: "admin_close" }
      ]
    ]
  };

  await editMessageText(chatId, currentMsgId!, statusText, { reply_markup: JSON.stringify(keyboard) });
}

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
  
  // 2. پاکسازی سشن‌های قدیمی (با سیستم Pagination جدید)
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
      
      // حذف سشن‌های 30+ روز
      if (inactiveDays > 30) {
        await env.SESSIONS.delete(item.name);
        cleaned++;
        continue;
      }
      
      // فشرده‌سازی سشن‌های 7+ روز
      if (inactiveDays > 7) {
        let modified = false;
        
        if (modified) {
          await env.SESSIONS.put(item.name, JSON.stringify(session));
          compressed++;
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup session ${item.name}`, error);
    }
  }
  
  // 3. پاکسازی کش مدل‌ها (با سیستم Pagination جدید)
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

// --- SECTION: ADMIN STATISTICS ---
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
  };
}

// --- SECTION: DYNAMIC MODEL MANAGEMENT TYPES ---

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  type: 'text' | 'image'; // اضافه شد
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

const MODEL_CACHE_KEY = (engine: AIEngine) => ["model_cache", engine];
const MODEL_CACHE_TTL = 12 * 60 * 60 * 1000;

// In-memory state for pagination
const modelListStates = new Map<string, ModelListState>();

interface AdminPanelState {
  page: number;
  perPage: number;
  sortBy: 'new' | 'active' | 'messages';
}

const adminPanelStates = new Map<number, AdminPanelState>();

// 👇 کپی از اینجا
async function getAllUserStatistics(env: Env): Promise<UserStatistics[]> {
  const users: UserStatistics[] = [];
  const seenUserIds = new Set<number>();
  
  try {
    // ✅ سیستم Pagination جدید برای پشتیبانی از میلیون‌ها کاربر
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
        
        // ✅ برای چت خصوصی
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
        // ✅ برای گروه‌ها
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


function createDefaultSession(chat: Chat, user: User): ChatSession {
  const now = Date.now();
  
  // ساخت حافظه اولیه برای کاربر فعلی
  const initialUserMemory = createUserMemory(user);
  const userMemories = new Map<number, UserMemory>();
  userMemories.set(user.id, initialUserMemory);

  return {
    id: chat.id,
    type: chat.type,
    activeEngine: "gemini",
    lastSeen: now,
    messageCount: 0,
    language: 'fa', // پیش‌فرض فارسی
    userMemories: userMemories,
    groupContext: [],
    
    customPrompts: {
      gemini: null,
      sambanova: null,
      pollinations: null
    },
    
    engines: {
      gemini: {
        history: [],
        userHistories: new Map(),
        apiKeyIndex: 0,
        consecutiveErrors: 0
      },
      sambanova: {
        history: [],
        userHistories: new Map(),
        apiKeyIndex: 0,
        modelIndex: 0,
        consecutiveErrors: 0
      },
      pollinations: {
        history: [],
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
      firstUsed: now,
      lastSeen: now
    },
    
    vipStatus: false, // پیش‌فرض رایگان
    
    dailyLimits: {
      messages: 0,
      voicesSent: 0,
      voicesReceived: 0,
      imagesGenerated: 0,
      lastReset: now
    }
  };
}

async function getBlockedUsers(env: Env): Promise<Array<{userId: number, since: number, reason: string}>> {
  const blocked: Array<{userId: number, since: number, reason: string}> = [];
  
  try {
    const list = await env.SESSIONS.list({ prefix: "user_blocked:" });
    
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
    
    return blocked.sort((a, b) => b.since - a.since);
    
  } catch (error) {
    logger.error('Failed to get blocked users', error);
    return [];
  }
}

async function getBlockedUsersCount(env: Env): Promise<number> {
  try {
    const list = await env.SESSIONS.list({ prefix: "user_blocked:" });
    return list.keys.length;
  } catch (error) {
    logger.error('Failed to count blocked users', error);
    return 0;
  }
}

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

async function handleLanguageCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from) return;
  
  const session = await getOrCreateSession(chat, from, env);
  
  const text = `🌐 **Language Selection / انتخاب زبان**

Current: **${session.language === 'fa' ? 'فارسی 🇮🇷' : 'English 🇺🇸'}**

Please select your language:
لطفاً زبان خود را انتخاب کنید:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🇮🇷 فارسی", callback_data: "set_lang_fa" },
        { text: "🇺🇸 English", callback_data: "set_lang_en" }
      ]
    ]
  };

  await refreshUserCommands(chat.id, session);
  await sendMessage(chat.id, text, {
    reply_to_message_id: message.message_id,
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

function formatUserStatistics(users: UserStatistics[]): string {
  if (users.length === 0) {
    return "📭 **هیچ کاربری یافت نشد**";
  }
  
  // ✅ محاسبه آمار کلی
  const totalUsers = users.length;
  const totalMessages = users.reduce((sum, u) => sum + (u.statistics.totalMessages || 0), 0);
  const totalVoices = users.reduce((sum, u) => sum + (u.statistics.voicesReceived || 0), 0);
  const totalImages = users.reduce((sum, u) => sum + (u.dailyLimits.imagesGenerated || 0), 0);
  
  // ✅ محبوب‌ترین مدل
  const engineCounts = {
    gemini: users.reduce((sum, u) => sum + (u.statistics.geminiMessages || 0), 0),
    sambanova: users.reduce((sum, u) => sum + (u.statistics.sambanovaMessages || 0), 0),
    pollinations: users.reduce((sum, u) => sum + (u.statistics.pollinationsMessages || 0), 0)
  };
  
  const mostPopularEngine = Object.entries(engineCounts)
    .sort((a, b) => b[1] - a[1])[0];
    
  // ✅ کاربران فعال امروز (24 ساعت گذشته)
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const activeToday = users.filter(u => {
    const lastSeen = u.statistics.lastSeen || 0;
    return lastSeen > oneDayAgo;
  }).length;
  
  const vipUsers = users.filter(u => u.vipStatus).length;
  
  // ✅ ساخت متن خروجی
  let text = `📊 **آمار کلی ربات**\n\n`;
  text += `👥 **کل کاربران:** ${totalUsers}\n`;
  text += `👑 **VIP:** ${vipUsers} | 🆓 **رایگان:** ${totalUsers - vipUsers}\n`;
  text += `🔥 **فعال امروز:** ${activeToday}\n\n`;
  
  text += `📈 **آمار پیام‌ها:**\n`;
  text += `💬 کل: ${totalMessages}\n`;
  text += `🤖 نوا: ${engineCounts.gemini}\n`;
  text += `🎨 لونا: ${engineCounts.sambanova}\n`;
  text += `🔬 زارا: ${engineCounts.pollinations}\n\n`;
  
  text += `🎤 **کل ویس‌ها:** ${totalVoices}\n\n`;
  text += `🖼️ **کل تصاویر امروز:** ${totalImages}\n\n`;
  
  if (mostPopularEngine[1] > 0) {
    const engineKey = `engine_${mostPopularEngine[0]}` as keyof typeof TRANSLATIONS.fa;
    const engLabel = TRANSLATIONS.fa[engineKey] || mostPopularEngine[0];
    text += `⭐ **محبوب‌ترین مدل:** ${engLabel} (${mostPopularEngine[1]} پیام)`;  
  }
  
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `📋 **لیست کاربران (${Math.min(10, users.length)} نفر اول):**\n\n`;
  
  // ✅ نمایش 10 کاربر اول با جزئیات خلاصه
  users.slice(0, 10).forEach((user, index) => {
    const num = index + 1;
    
    // ✅ محاسبه زمان آخرین فعالیت
    const lastSeen = user.statistics.lastSeen && user.statistics.lastSeen > 0
      ? new Date(user.statistics.lastSeen).toLocaleString('fa-IR', { 
          timeZone: 'Asia/Tehran',
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : 'نامشخص';
    
    // ✅ محاسبه اولین استفاده
    const firstUsed = user.statistics.firstUsed && user.statistics.firstUsed > 0
      ? new Date(user.statistics.firstUsed).toLocaleDateString('fa-IR', {
          timeZone: 'Asia/Tehran',
          month: 'short',
          day: 'numeric'
        })
      : 'نامشخص';
    
    // ✅ نمایش اطلاعات کاربر
    const vipBadge = user.vipStatus ? '👑 ' : '';
    
    text += `**${num}.** ${vipBadge}${user.firstName}\n`;
    text += `🆔 \`${user.userId}\` | 👤 @${user.userName || 'ندارد'}\n`;
    
    // ✅ آمار پیام‌ها
    text += `💬 **جمع:** ${user.statistics.totalMessages || 0} | `;
    text += `🤖 ${user.statistics.geminiMessages || 0} | `;
    text += `🎨 ${user.statistics.sambanovaMessages || 0} | `;
    text += `🔬 ${user.statistics.pollinationsMessages || 0}\n`;
    
    // ✅ آمار رسانه‌ها
    text += `🎤 ${user.statistics.voicesReceived || 0} ویس\n`;
    
    // ✅ زمان‌ها
    text += `📅 اولین: ${firstUsed} | ⏰ آخرین: ${lastSeen}\n`;
    
    // ✅ محدودیت‌های امروز (فقط برای غیر VIP)
    if (!user.vipStatus) {
      text += `📊 **امروز:** `;
      text += `${user.dailyLimits.messages || 0}/50 پیام | `;
      text += `${user.dailyLimits.voicesSent || 0}/5 ویس ارسالی | `;
      text += `${user.dailyLimits.voicesReceived || 0}/10 ویس دریافتی | `;
    }
    
    text += `\n`;
  });
  
  // ✅ اگر کاربران بیشتری وجود دارن
  if (users.length > 10) {
    text += `➕ ... و ${users.length - 10} کاربر دیگر\n\n`;
    text += `💡 برای مشاهده جزئیات هر کاربر، از پنل ادمین استفاده کنید.`;
  }
  
  return text;
}

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

// ✅ تابع چک کردن Block بودن کاربر
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

// ✅ تابع اصلاح شده formatDetailedUserStats
function formatDetailedUserStats(user: UserStatistics): string {
  // ✅ Escape کردن تمام کاراکترهای خطرناک در Markdown
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
      name: TRANSLATIONS[favorite.key] || 'نامشخص',
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
  
  // ✅ استفاده از escapeMarkdown برای تمام مقادیر دینامیک
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

// --- SECTION: AI API CALLS ---
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
  
  // 1. اگر پرامپت سفارشی برای موتور فعال وجود دارد (اولویت اول)
  const customPrompt = session.customPrompts[session.activeEngine];
  if (customPrompt && customPrompt.trim().length > 0) {
    return `${customPrompt}\nYou are talking to ${userFirstName}. Current date: ${currentTime}.${isGroup ? ` This is a group chat. ${groupAnalysis}` : ''}`;
  }
  
  // 2. اگر شخصیت فعال وجود داشته باشد و پرامپت اختصاصی داشته باشد
  const personalityKey = session.activePersonality;
  if (personalityKey && PERSONALITIES[personalityKey]) {
    const personality = PERSONALITIES[personalityKey];
    const prompt = session.language === 'fa' ? personality.prompt_fa : personality.prompt_en;
    if (prompt && prompt.trim().length > 0) {
      // اضافه کردن نام کاربر و تاریخ به انتهای پرامپت شخصیت
      return `${prompt}\n\n👤 نام کاربر: ${userFirstName}\n📅 تاریخ امروز: ${currentTime}`;
    }
  }
  
  // 3. در غیر این صورت پرامپت پیش‌فرض
  return buildDefaultPrompt(session.activeEngine, userFirstName, isGroup, userMemory, groupAnalysis, session.language);
}

// ادامه بقیه کد (   و ...) بدون تغییر باقی می‌ماند.

// AI API calls remain the same but with enhanced context
function sanitizeHistoryForAPI(history: HistoryItem[]): any[] {
  if (!history || !Array.isArray(history)) return [];
  return history.map(item => ({
    role: item.role === "model" ? "assistant" : item.role,
    parts: item.parts
  }));
}
  
  async function callGeminiAPI(parts: Part[], model: string, apiKey: string, history: HistoryItem[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = [...sanitizeHistoryForAPI(history), { role: "user" as const, parts }];
  
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.8, topK: 40, topP: 0.95, maxOutputTokens: 8192 },
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
  
  async function callGeminiAPI(parts: Part[], model: string, apiKey: string, history: HistoryItem[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = [...sanitizeHistoryForAPI(history), { role: "user" as const, parts }];
  
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.8, topK: 40, topP: 0.95, maxOutputTokens: 8192 },
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

async function callClaudeAPI(prompt: string, history: HistoryItem[], model: string, apiKey: string): Promise<string> {
  // جدا کردن system prompt از تاریخچه (اگر وجود داشته باشد)
  let systemPrompt = "";
  const chatHistory = [...history];
  
  if (chatHistory.length > 0 && chatHistory[0].role === "system") {
    systemPrompt = chatHistory[0].parts[0]?.text || "";
    chatHistory.shift(); // حذف system prompt از تاریخچه اصلی
  }
  
  // اضافه کردن پیام جدید کاربر
  chatHistory.push({ role: "user", parts: [{ text: prompt }], timestamp: Date.now() });
  
  const messages = chatHistory.map(h => ({
    role: h.role === "model" ? "assistant" : "user",
    content: h.parts[0]?.text || ""
  }));
  
  const body: any = {
    model: model,
    max_tokens: 4096,
    messages: messages,
    temperature: 0.7
  };
  
  if (systemPrompt) body.system = systemPrompt;
  
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  }, 30000);
  
  async function getClaudeResponse() {
  const data = await response.json();

  if (data.error) {
    throw new Error(`Claude API Error: ${data.error.message}`);
  }
  
  if (!data.content?.[0]?.text) {
    throw new Error("Empty response from Claude");
  }

  return data.content[0].text.trim();
} // آکولاد پایانی برای بستن کل تابع


return data.content[0].text.trim();
// تمام آکولادهای اضافه حذف شدند



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
        context_length: m.context_length || 0
      }))
      .slice(0, 100);
      
  } catch (error) {
    logger.error("Failed to fetch SambaNova models", error);
    return [
      { id: "DeepSeek-V3.1", name: "DeepSeek-V3.1" },
      { id: "Qwen3-32B", name: "Qwen3-32B" },
      { id: "Llama-4-Maverick-17B-128E-Instruct", name: "Llama 4 Maverick" }
    ];
  }
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
    // مدل‌های قبلی
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
    // مدل‌های جدید Claude (Anthropic)
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

// تابع getModelsWithCache (کامل و بدون نقص)
async function fetchAndCacheModels(engine: AIEngine, env: Env): Promise<ModelCache> {
  let models: ModelInfo[] = [];
  
  try {
    if (engine === 'sambanova') {
      if (config.SAMBANOVA_KEYS.length > 0) {
        models = await fetchSambanovaModels(config.SAMBANOVA_KEYS[0]);
      }
    } else if (engine === 'pollinations') {
      models = await fetchPollinationsModels();
    }
  } catch (error) {
    logger.warn(`Failed to fetch ${engine} models, using fallback`, error);
    if (engine === 'pollinations') {
      models = getFallbackPollinationsModels();
    }
  }

  if (models.length === 0 && engine === 'pollinations') {
    models = getFallbackPollinationsModels();
  }

  const cache: ModelCache = {
    engine,
    models,
    lastUpdated: Date.now()
  };

  try {
    await env.SESSIONS.put(`model_cache:${engine}`, JSON.stringify(cache));
  } catch (error) {
    logger.warn(`Failed to save model cache for ${engine}`, error);
  }

  if (engine === 'sambanova') config.SAMBANOVA_MODELS = models.map(m => m.id);
  if (engine === 'pollinations') config.POLLINATIONS_MODELS = models.map(m => m.id);

  return cache;
}

async function refreshModelsInBackground(engine: AIEngine, env: Env): Promise<void> {
  try {
    await fetchAndCacheModels(engine, env);
    logger.info(`✅ Background refresh done for ${engine}`);
  } catch (error) {
    logger.warn(`Background refresh failed for ${engine}`, error);
  }
}

async function getModelsWithCache(engine: AIEngine, env: Env, forceRefresh: boolean = false): Promise<ModelCache> {
// ... بقیه کد

// توابع state management
function getModelListState(chatId: number, engine: AIEngine): ModelListState {
  const key = `${chatId}_${engine}`;
  return modelListStates.get(key) || { page: 0, perPage: 8, totalPages: 0 };
}

function setModelListState(chatId: number, engine: AIEngine, state: ModelListState): void {
  const key = `${chatId}_${engine}`;
  modelListStates.set(key, state);
}

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
      { command: "help", description: "❓ راهنمای کامل" }
    ] : [
      { command: "start", description: "🏠 Home" },
      { command: "new", description: "🆕 New Chat" },
      { command: "model", description: "🤖 Change AI Model" },
      { command: "img", description: "🎨 Generate Image" },
      { command: "search", description: "🔍 Search Images" },
      { command: "prompt", description: "✏️ Customize Personality" },
      { command: "language", description: "🌐 Change Language" },
      { command: "help", description: "❓ Full Guide" }
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
    await callTelegramAPI("setMyCommands", { commands: finalCommands, scope: { type: "all_private_chats" } });
    logger.info(`✅ Commands updated for ${lang} language - ${finalCommands.length} commands`);
  } catch (error) {
    logger.warn(`Failed to update commands`, error);
  }
}

// --- SECTION: TELEGRAM API WRAPPERS ---
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
        // 🛠️ مدیریت هوشمند خطاها
        
        // 1. اگر ارور "تغییری نکرده" بود، خطا محسوب نمی‌شود.
        if (result.description?.includes("message is not modified")) {
           return true; // موفق در نظر می‌گیریم
        }

        // 2. مدیریت Rate Limit
        if (result.error_code === 429) {
          const retryAfter = result.parameters?.retry_after || 1;
          if (attempt < maxRetries) {
            // فقط اگر زمان کم بود لاگ نگیر، اگر زیاد بود لاگ بگیر
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
      
      // خطاهای شبکه را تا ۳ بار تلاش مجدد کن
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

// =============== ریاکشن خودکار ===============
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

async function sendPhoto(chatId: number, photo: string | Uint8Array, caption?: string, options: Record<string, any> = {}): Promise<Message> {
  // اگر آدرس URL عکس است
  if (typeof photo === 'string' && (photo.startsWith("http://") || photo.startsWith("https://"))) {
    const params: Record<string, any> = { chat_id: chatId, photo: photo, ...options };
    if (caption) params.caption = caption.substring(0, 1024);
    return await callTelegramAPI("sendPhoto", params);
  }
  
  const formData = new FormData();
  formData.append("chat_id", chatId.toString());
  
  // اگر دیتای مستقیم باینری است (مثل ساخت عکس با کلودفلر)
  if (photo instanceof Uint8Array) {
    formData.append("photo", new Blob([photo], { type: "image/png" }), "generated_image.png");
  } 
  // اگر Base64 است (مثل خروجی زارا)
  else if (typeof photo === 'string') {
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

async function editMessageText(chatId: number, messageId: number, text: string, options: Record<string, any> = {}): Promise<void> {  
  const params: any = {
    chat_id: chatId,
    message_id: messageId,
    text: String(text).substring(0, 4096),
    ...options
  };

  // اگر parse_mode صراحتاً غیرفعال نشده باشد، پیش‌فرض Markdown است
  if (params.parse_mode === undefined) {
    params.parse_mode = "Markdown";
  }

  try {
    await callTelegramAPI("editMessageText", params);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMsg = err.message || '';

    // ۱. ارورهای "تغییری نکرده" را نادیده بگیر
    if (errorMsg.includes("not modified") || errorMsg.includes("exactly the same")) {
      return;
    }

    // ۲. اگر ارور مربوط به فرمت متن بود (Markdown)، فرمت را حذف کن و دوباره بفرست
    if (errorMsg.includes("can't parse entities") || errorMsg.includes("Markdown")) {
      // حذف حالت مارک‌داون
      delete params.parse_mode; 
      
      try {
        await callTelegramAPI("editMessageText", params);
      } catch (retryError) {
        // اگر باز هم نشد، فقط لاگ بگیر (ارور به کاربر نده)
        logger.warn(`Failed to edit message ${messageId} even without markdown: ${(retryError as Error).message}`);
      }
    } else {
      logger.warn(`Failed to edit message ${messageId}: ${errorMsg}`);
    }
  }
}

async function deleteMessage(chatId: number, messageId: number): Promise<void> {
  try {
    await callTelegramAPI("deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch (error) {
    logger.warn(`Failed to delete message ${messageId}`, (error as any)?.message);
  }
}

async function sendTypingAction(chatId: number): Promise<void> {
  if (!chatId) return; // اضافه کنید
  callTelegramAPI("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

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
  
  // 🔥 تغییر اصلی: هر ریپلای به یک بات = ریپلای به خودمون
  let isReply = false;
  if (message.reply_to_message) {
    const repliedUser = message.reply_to_message.from;
    if (repliedUser && repliedUser.is_bot === true) {
      isReply = true;  // فرض می‌کنیم ریپلای به ربات خودمون است
    }
  }
  
  return (atMention || textualMention || isReply);
}

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
  // به ترتیب آرایه امتحان می‌کنیم (در آینده می‌توانید اندیس قبلی را ذخیره کنید)
  for (let i = 0; i < pairs.length; i++) {
    const { accountId, token } = pairs[i];
    
    // رد کردن کلیدی که قبلاً غیرفعال شده
    if (await isCFKeyDisabled(accountId, token)) continue;
    
    try {
      const result = await _generateWithSingleCF(prompt, model, accountId, token);
      return result; // موفقیت آمیز
    } catch (err: any) {
      const msg = err.message?.toLowerCase() || "";
      if (msg.includes("quota") || msg.includes("limit") || msg.includes("429")) {
        // غیرفعال کردن موقت این کلید
        disableCFKey(accountId, token);
        errors.push(`🔑 ${i+1} محدودیت مصرف (غیرفعال موقت)`);
      } else {
        errors.push(`🔑 ${i+1}: ${msg.substring(0, 50)}`);
      }
    }
  }
  
  // اگر همه کلیدها ناموفق بودند
  throw new Error(`همه کلیدهای Cloudflare ناموفق:\n${errors.join("\n")}`);
}

// تابع داخلی که واقعاً یک درخواست را انجام می‌دهد
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

async function handleImageGenerationCommand(message: Message, args: string[], env: Env): Promise<void> {
  const { chat, from } = message;
  if (!from) return;

  //await resetDailyLimitsIfNeede(session);
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
  
  // محدودیت روزانه
  if (!session.vipStatus && session.dailyLimits.imagesGenerated >= 5) {
    await sendMessage(chat.id, txt.img_limit, { reply_to_message_id: message.message_id });
    return;
  }
  
  // 1. ترجمه
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
  
  // ✅ پردازش Sequential (یکی یکی) به جای Parallel
  // این باعث می‌شود کل زمان کنترل‌پذیرتر باشه
  for (let i = 0; i < config.AI_IMAGE_MODELS.length; i++) {
    const model = config.AI_IMAGE_MODELS[i];
    
    try {
      // ✅ Update progress
      await editMessageText(chat.id, processingMsg.message_id, 
        `${statusText}\n\n🎨 ${getShortModelName(model)} (${i + 1}/${config.AI_IMAGE_MODELS.length})...`
      ).catch(() => {});

      const imageBuffer = await withTimeout(generateImageWithCloudflare(prompt, model, env), IMAGE_TIMEOUT, "Timeout");

      // ارسال مستقیم باینری به تلگرام (سرعت بالا)
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
  
  // ✅ گزارش نهایی
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

async function handleStartCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from) return;

  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, { reply_to_message_id: message.message_id });
    return;
  }

  // ✅ اول چک کن، بعد session بساز
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  const hasExistingSession = await env.SESSIONS.get(`session:${chat.id}`, "json") !== null;

  const session = await getOrCreateSession(chat, from, env);
  const isNewUser = !hasExistingSession && session.statistics.totalMessages === 0;

  const langKeyboard = {
    inline_keyboard: [[
      { text: "🇮🇷 فارسی", callback_data: "set_lang_fa" },
      { text: "🇺🇸 English", callback_data: "set_lang_en" }
    ]]
  };

  // کاربر کاملاً جدید
  if (isNewUser && !isGroup) {
    await notifyAdminNewUser(from, env);
    await sendMessage(chat.id,
      `👋 **Welcome / خوش آمدید**\n\nلطفاً زبان خود را انتخاب کنید:`,
      { reply_markup: JSON.stringify(langKeyboard), reply_to_message_id: message.message_id }
    );
    return;
  }

  // کاربر قدیمی بدون session (ریست شده)
  if (!hasExistingSession && !isGroup) {
    await sendMessage(chat.id,
      `🔄 **Welcome Back / خوش آمدید**\n\nلطفاً زبان خود را انتخاب کنید:`,
      { reply_markup: JSON.stringify(langKeyboard), reply_to_message_id: message.message_id }
    );
    return;
  }

  // کاربر با session موجود
  await refreshUserCommands(chat.id, session);
  const welcomeText = t(session, isGroup ? 'welcome_group' : 'welcome_private', { name: from.first_name });
  const keyboard = getStartKeyboard(isGroup, session.language);

  await sendMessage(chat.id, welcomeText, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard)),
    reply_to_message_id: message.message_id
  });
}

  // کاربر با session موجود
  await refreshUserCommands(chat.id, session);

  const welcomeText = t(session, isGroup ? 'welcome_group' : 'welcome_private', { name: from.first_name });
  const keyboard = getStartKeyboard(isGroup, session.language);

  await sendMessage(chat.id, welcomeText, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard)),
    reply_to_message_id: message.message_id
  });
}
    
    await sendMessage(chat.id, 
      `👋 **Welcome / خوش آمدید**\n\n` +
      `Please select your language:\n` +
      `لطفاً زبان خود را انتخاب کنید:`, 
      {
        reply_markup: JSON.stringify(langKeyboard),
        reply_to_message_id: message.message_id
      }
    );
    
    logger.info(`✅ New user registered: ${from.id} (${from.first_name}) - asking for language`);
    return;
  }
  
  // ✅ کاربر قدیمی که session ندارد (ریست شده) - سوال زبان
  if (!hasExistingSession && !isGroup) {
    const langKeyboard = {
      inline_keyboard: [
        [
          { text: "🇮🇷 فارسی", callback_data: "set_lang_fa" },
          { text: "🇺🇸 English", callback_data: "set_lang_en" }
        ]
      ]
    };
    
    await sendMessage(chat.id, 
      `🔄 **Welcome Back / خوش آمدید**\n\n` +
      `Please select your language:\n` +
      `لطفاً زبان خود را انتخاب کنید:`, 
      {
        reply_markup: JSON.stringify(langKeyboard),
        reply_to_message_id: message.message_id
      }
    );
    
    logger.info(`✅ Returning user without session: ${from.id} - asking for language`);
    return;
  }
  
  // ✅ کاربر با session موجود - نمایش صفحه اصلی
  await refreshUserCommands(chat.id, session);

  const welcomeText = t(session, isGroup ? 'welcome_group' : 'welcome_private', { name: from.first_name });
  const keyboard = getStartKeyboard(isGroup, session.language);
  
  await sendMessage(chat.id, welcomeText, { 
    reply_markup: JSON.stringify(validateKeyboard(keyboard)),
    reply_to_message_id: message.message_id
  });

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
  
  // ... (کد پاک کردن هیستوری که داشتید اینجا بماند - بدون تغییر) ...
  // Reset logic start
  const activeEngine = session.activeEngine;
  const userMemory = session.userMemories.get(from.id);

  // Resetting history based on engine...
  if (activeEngine === 'gemini') {
      session.engines.gemini.history = [{ 
        role: "user", parts: [{ text: getActivePrompt(session, from, isGroup) }], timestamp, userId: from.id, userName: from.first_name
      }, { role: "model", parts: [{ text: "..." }], timestamp }]; // Placeholder response
      session.engines.gemini.userHistories.set(from.id, []);
  } else if (activeEngine === 'sambanova') {
      session.engines.sambanova.history = [{ role: "assistant", parts: [{ text: getActivePrompt(session, from, isGroup) }], timestamp, userId: from.id, userName: from.first_name }];
      session.engines.sambanova.userHistories.set(from.id, []);
  } else if (activeEngine === 'pollinations') {
      session.engines.pollinations.history = [{ role: "assistant", parts: [{ text: getActivePrompt(session, from, isGroup) }], timestamp, userId: from.id, userName: from.first_name }];
      session.engines.pollinations.userHistories.set(from.id, []);
  }
  
  session.messageCount = 0;
  // Reset logic end
  
  await saveSessionWithLock(session, env);
  
  // ساخت پیام با ترجمه
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
  const sentMessage = await sendModelSelection(chat.id, message.message_id, session);
}

async function handleHelpCommand(message: Message, env: Env, editMsgId?: number) {
  const { chat, from } = message;
  if (!from) return;

  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    const msg = maintenanceCheck.message!;
    if (editMsgId) {
      await editMessageText(chat.id, editMsgId, msg);
    } else {
      await sendMessage(chat.id, msg, { reply_to_message_id: message.message_id });
    }
    return;
  }
  
  const session = await getOrCreateSession(chat, from, env);
  const lang = session.language || 'fa';
  const isGroup = chat.type === "group" || chat.type === "supergroup";

  // ✅ صفحه اصلی راهنما (Main Menu)
  const helpText = buildMainHelpPage(session, from, isGroup);
  const keyboard = buildMainHelpKeyboard(session, from.id, isGroup);
  
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

function buildMainHelpPage(session: ChatSession, user: User, isGroup: boolean): string {
  const lang  = session.language || 'fa';
  const m     = MODEL_META;
  const mName = lang === 'fa' ? m.fa : m.en;
  const vip   = session.vipStatus ? '👑 VIP' : (lang === 'fa' ? '🆓 حساب رایگان' : '🆓 Free Account');

  if (lang === 'fa') {
    return (
      `📚 **مرکز راهنمای نوآ**\n\n` +
      `> 👤 کاربر: **${user.first_name}**\n` +
      `> 🤖 موتور فعال: **${m.emoji} ${mName}**\n` +
      `> 💳 وضعیت: **${vip}**\n\n` +
      `لطفاً دسته‌بندی مورد نظرت رو از دکمه‌های زیر انتخاب کن 👇`
    );
  }
  return (
    `📚 **Nova Help Center**\n\n` +
    `> 👤 User: **${user.first_name}**\n` +
    `> 🤖 Engine: **${m.emoji} ${mName}**\n` +
    `> 💳 Status: **${vip}**\n\n` +
    `Select a category from the buttons below 👇`
  );
}

function buildMainHelpKeyboard(session: ChatSession, userId: number, isGroup: boolean) {
  const lang = session.language || 'fa';
  
  const keyboard = {
    inline_keyboard: [
      // ردیف 1: گفتگو و تصویر
      [
        { text: lang === 'fa' ? '💬 گفتگو' : '💬 Chat', callback_data: 'help_chat' },
        { text: lang === 'fa' ? '🎨 تصویر' : '🎨 Images', callback_data: 'help_images' }
      ],
      // ردیف 2: مدل‌ها و شخصی‌سازی
      [
        { text: lang === 'fa' ? '🤖 مدل‌ها' : '🤖 Models', callback_data: 'help_models' },
        { text: lang === 'fa' ? '✏️ شخصی‌سازی' : '✏️ Customize', callback_data: 'help_customize' }
      ],
      // ردیف 3: دستورات و تنظیمات
      [
        { text: lang === 'fa' ? '⚡ دستورات' : '⚡ Commands', callback_data: 'help_commands' },
        { text: lang === 'fa' ? '⚙️ تنظیمات' : '⚙️ Settings', callback_data: 'help_settings' }
      ],
      // ردیف 4: شخصیت‌ها (جدید)
      [
        { text: lang === 'fa' ? '🎭 شخصیت‌ها' : '🎭 Personalities', callback_data: 'personality_menu' }
      ],
      // ردیف 5: پشتیبانی
      [
        { text: lang === 'fa' ? '📞 پشتیبانی' : '📞 Support', url: 'https://t.me/Hamid_Ai_pro' }
      ],
      // ردیف 6: بستن
      [
        { text: lang === 'fa' ? '❌ بستن' : '❌ Close', callback_data: 'close_help' }
      ]
    ]
  };

  if (isGroup) {
    keyboard.inline_keyboard.push([{ text: lang === 'fa' ? '👥 تنظیمات گروه' : '👥 Group Settings', callback_data: 'group_settings' }]);
  }
  
  if (userId === config.BOT_OWNER_ID) {
    keyboard.inline_keyboard.push([{ text: lang === 'fa' ? '👑 پنل مدیریت' : '👑 Admin Panel', callback_data: 'open_admin' }]);
  }
  
  return keyboard;
}

// ======================== راهنمای گفتگو ========================
async function showHelpChat(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const text = lang === 'fa' ? `💬 **راهنمای گفتگو**

**🗣️ گفتگوی متنی:**
- فقط پیامتو بفرست، من جواب میدم!
- میتونی سوال بپرسی، چیزی یاد بگیری یا چت کنی
- من ${config.HISTORY_LIMIT} پیام آخرت رو به یاد میارم

**🎤 پیام صوتی:**
- ویس بفرست، من متن رو میفهمم و جواب میدم
- حداکثر ۲ دقیقه
- به زبان فارسی یا انگلیسی

**📸 تصویر:**
- عکس بفرست + توضیح (اختیاری)
- من تحلیل میکنم و توضیح میدم
- فرمت: JPG, PNG, WebP, GIF

**🎬 ویدیو:**
- ویدیو بفرست (حداکثر 20MB)
- من محتواش رو میبینم و توضیح میدم

**💡 نکات:**
- برای پاک کردن حافظه: \`/new\`
- برای تغییر مدل: \`/model\`

━━━━━━━━━━━━━━━━━━━━
**محدودیت روزانه (رایگان):**
- پیام: ${session.dailyLimits.messages}/100
- ویس: ${session.dailyLimits.voicesSent}/10
${session.vipStatus ? '\n✅ **شما VIP هستید - بدون محدودیت!**' : '\n🌟 برای نامحدود، VIP شوید'}` 
  : `💬 **Chat Guide**

**🗣️ Text Chat:**
- Just send your message, I'll reply!
- Ask questions, learn, or chat
- I remember your last ${config.HISTORY_LIMIT} messages

**🎤 Voice:**
- Send voice note, I'll understand and reply
- Max 2 minutes
- Persian or English

**📸 Image:**
- Send photo + description (optional)
- I'll analyze and explain
- Format: JPG, PNG, WebP, GIF

**🎬 Video:**
- Send video (max 20MB)
- I'll watch and explain

**💡 Tips:**
- Clear memory: \`/new\`
- Change model: \`/model\`
- Language: \`/language\`

━━━━━━━━━━━━━━━━━━━━
**Daily Limits (Free):**
- Messages: ${session.dailyLimits.messages}/100
- Voice: ${session.dailyLimits.voicesSent}/10
${session.vipStatus ? '\n✅ **You are VIP - Unlimited!**' : '\n🌟 Go VIP for unlimited'}`;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]] })
  });
}

// ======================== راهنمای تصاویر ========================
async function showHelpImages(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const text = lang === 'fa' ? `🎨 **راهنمای تصاویر**

**🖼️ ساخت تصویر:**
\`\`\`
/img یک گربه در فضا
\`\`\`
- 3 مدل قدرتمند همزمان میسازن
- کیفیت بالا (1280x1280)
- حداکثر 5 تصویر در روز (رایگان)

**🔍 جستجوی تصویر:**
\`\`\`
/search طبیعت زیبا
\`\`\`
- جستجو در گوگل
- ۵ تصویر برتر
- دانلود مستقیم

**💡 نکات:**
- برای نتیجه بهتر، توضیحات دقیق بده
- میتونی به فارسی بنویسی، من ترجمه میکنم
- VIP: نامحدود

━━━━━━━━━━━━━━━━━━━━
**امروز:**
- تصاویر ساخته شده: ${session.dailyLimits.imagesGenerated}/5
${session.vipStatus ? '✅ **VIP: نامحدود**' : '🌟 **VIP شو برای نامحدود**'}` 
  : `🎨 **Images Guide**

**🖼️ Generate:**
\`\`\`
/img a cat in space
\`\`\`
- 3 powerful models work together
- High quality (1280x1280)
- Max 5 per day (free)

**🔍 Search:**
\`\`\`
/search beautiful nature
\`\`\`
- Search Google
- Top 5 results
- Direct download

**💡 Tips:**
- Be specific for better results
- I'll translate Persian to English
- VIP: Unlimited

━━━━━━━━━━━━━━━━━━━━
**Today:**
- Generated: ${session.dailyLimits.imagesGenerated}/5
${session.vipStatus ? '✅ **VIP: Unlimited**' : '🌟 **Go VIP for unlimited**'}`;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]] })
  });
}

// ======================== راهنمای مدل‌ها ========================
async function showHelpModels(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const currentEngine = getEngineName(session.activeEngine, lang);
  const text = lang === 'fa' ? `🤖 **راهنمای مدل‌ها**

**مدل فعال:** ${currentEngine}

**🌟 مدل‌های موجود:**

**🤖 نوا (Gemini)**
- سریع و دقیق
- پشتیبانی کامل از فارسی
- چند رسانه‌ای (متن + تصویر)
- ${config.GEMINI_KEYS.length} کلید API

**🎨 لونا (SambaNova)**
- مدل‌های متنوع
- قدرتمند در استدلال
- ${config.SAMBANOVA_MODELS.length} مدل
- ${config.SAMBANOVA_KEYS.length} کلید API

**🔬 زارا (Pollinations)**
- مدل‌های متنوع (متن + تصویر)
- خلاقیت بالا
- ${config.POLLINATIONS_MODELS.length} مدل
- رایگان و نامحدود

**🔄 تغییر مدل:**
\`/model\` یا دکمه زیر

━━━━━━━━━━━━━━━━━━━━
💡 هر مدل شخصیت خاص خودش رو داره!` 
  : `🤖 **Models Guide**

**Active:** ${currentEngine}

**🌟 Available:**

**🤖 Nova (Gemini)**
- Fast & accurate
- Full Persian support
- Multimodal (text + image)
- ${config.GEMINI_KEYS.length} API keys

**🎨 Luna (SambaNova)**
- Diverse models
- Strong reasoning
- ${config.SAMBANOVA_MODELS.length} models
- ${config.SAMBANOVA_KEYS.length} API keys

**🔬 Zara (Pollinations)**
- Diverse (text + image)
- High creativity
- ${config.POLLINATIONS_MODELS.length} models
- Free & unlimited

**🔄 Switch:**
\`/model\` or button below

━━━━━━━━━━━━━━━━━━━━
💡 Each has unique personality!`;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: lang === 'fa' ? '🔄 تغییر مدل' : '🔄 Switch Model', callback_data: 'model_settings' }],
        [{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]
      ]
    })
  });
}

// ======================== راهنمای شخصی‌سازی ========================
async function showHelpCustomize(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const text = lang === 'fa' ? `✏️ **راهنمای شخصی‌سازی**

**🎭 تنظیم شخصیت ربات:**

من میتونم شخصیت‌های مختلف داشته باشم! تو میتونی برای هر مدل یه شخصیت جداگانه بسازی.

**📝 روش استفاده:**

**1️⃣ با دستور:**
\`\`\`
/setprompt نوا تو یک معلم ریاضی هستی
\`\`\`

**2️⃣ با منو:**
\`/prompt\` → دکمه "مدیریت پرامپت‌ها"

**🎨 مثال‌های کاربردی:**

**معلم:**
\`\`\`
/setprompt نوا تو یک معلم صبور هستی که با مثال توضیح میدی
\`\`\`

**دوست صمیمی:**
\`\`\`
/setprompt نوا تو یک دوست صمیمی و شوخ‌طبع هستی
\`\`\`

**مشاور:**
\`\`\`
/setprompt نوا تو یک مشاور حرفه‌ای و محترم هستی
\`\`\`

**برنامه‌نویس:**
\`\`\`
/setprompt نوا تو یک برنامه‌نویس حرفه‌ای هستی
\`\`\`

**🔄 ریست کردن:**
از منو \`/prompt\` دکمه "ریست" رو بزن

**💡 نکته:**
- هر مدل پرامپت مستقل خودش رو داره
- بعد از تنظیم، بدون \`/new\` اجرا میشه
- VIP: دسترسی به همه مدل‌ها
- Free: فقط نوا

━━━━━━━━━━━━━━━━━━━━
**پرامپت‌های فعلی شما:**

🤖 **نوا:** ${session.customPrompts.gemini || 'پیش‌فرض'}
🎨 **لونا:** ${session.customPrompts.sambanova || 'پیش‌فرض'}
🔬 **زارا:** ${session.customPrompts.pollinations || 'پیش‌فرض'}

${!session.vipStatus ? '\n⚠️ **تنظیم لونا و زارا فقط برای VIP**' : ''}` 
  : `✏️ **Customization Guide**

**🎭 Set Bot Personality:**

I can have different personalities! You can create a unique personality for each model.

**📝 How to Use:**

**1️⃣ With Command:**
\`\`\`
/setprompt nova you are a math teacher
\`\`\`

**2️⃣ With Menu:**
\`/prompt\` → "Manage Prompts" button

**🎨 Examples:**

**Teacher:**
\`\`\`
/setprompt nova you are a patient teacher who explains with examples
\`\`\`

**Friend:**
\`\`\`
/setprompt nova you are a friendly and funny companion
\`\`\`

**Advisor:**
\`\`\`
/setprompt nova you are a professional advisor
\`\`\`

**Developer:**
\`\`\`
/setprompt nova you are a professional programmer
\`\`\`

**🔄 Reset:**
Use \`/prompt\` menu and click "Reset"

**💡 Note:**
- Each model has independent prompt
- Works immediately after setting
- VIP: All models
- Free: Nova only

━━━━━━━━━━━━━━━━━━━━
**Your Current Prompts:**

🤖 **Nova:** ${session.customPrompts.gemini || 'Default'}
🎨 **Luna:** ${session.customPrompts.sambanova || 'Default'}
🔬 **Zara:** ${session.customPrompts.pollinations || 'Default'}

${!session.vipStatus ? '\n⚠️ **Luna & Zara: VIP Only**' : ''}`;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: lang === 'fa' ? '✏️ مدیریت پرامپت‌ها' : '✏️ Manage Prompts', callback_data: 'custom_prompt_menu' }],
        [{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]
      ]
    })
  });
}

// ======================== راهنمای دستورات ========================
async function showHelpCommands(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const isAdmin = cb.from.id === config.BOT_OWNER_ID;
  const text = lang === 'fa' ? `⚡ **لیست کامل دستورات**

**🏠 دستورات اصلی:**
- \`/start\` - صفحه اصلی و خوش‌آمدگویی
- \`/help\` - راهنمای کامل (همین صفحه)
- \`/new\` - شروع مکالمه جدید و پاک کردن حافظه

**🤖 مدیریت مدل‌ها:**
- \`/model\` - تغییر مدل هوش مصنوعی
- انتخاب از: نوا، لونا، زارا

**🎨 تصاویر:**
- \`/img [توضیح]\` - ساخت تصویر
  مثال: \`/img یک گربه در فضا\`
  
- \`/search [متن]\` - جستجوی تصویر در گوگل
  مثال: \`/search طبیعت زیبا\`

**✏️ شخصی‌سازی:**
- \`/prompt\` - مشاهده و مدیریت پرامپت‌ها
- \`/setprompt [مدل] [متن]\` - تنظیم شخصیت
  مثال: \`/setprompt نوا تو یک معلم هستی\`

**🌐 تنظیمات:**
- \`/language\` - تغییر زبان (فارسی/انگلیسی)

${isAdmin ? `
━━━━━━━━━━━━━━━━━━━━
**👑 دستورات مدیریتی:**
- \`/admin\` - پنل مدیریت کاربران
- \`/log\` - مشاهده لاگ‌های سیستم
- \`/blocked\` - لیست کاربران مسدود
- \`/rebuild\` - بازسازی دیتابیس
- \`/dbstats\` - آمار دیتابیس
- \`/dbclean\` - پاکسازی خودکار
- \`/keys\` - وضعیت API Keys
- \`/setvip\` - فعال‌سازی VIP گروه
- \`/unsetvip\` - غیرفعال‌سازی VIP گروه
` : ''}

━━━━━━━━━━━━━━━━━━━━
**💡 نکات مهم:**
- بیشتر کارها با دکمه‌ها انجام میشه
- برای مشاهده وضعیت: \`/start\`
- برای راهنمای هر بخش: همین منو

**🎯 میانبرها:**
- برای پاسخ سریع، فقط پیام بفرست
- برای تصویر، \`/img\` کافیه
- برای حافظه جدید، \`/new\` بزن` 
  : `⚡ **Complete Commands List**

**🏠 Main:**
- \`/start\` - Home & welcome
- \`/help\` - Complete guide (this page)
- \`/new\` - New chat & clear memory

**🤖 Models:**
- \`/model\` - Switch AI model
- Choose: Nova, Luna, Zara

**🎨 Images:**
- \`/img [prompt]\` - Generate image
  Example: \`/img a cat in space\`
  
- \`/search [query]\` - Search Google Images
  Example: \`/search beautiful nature\`

**✏️ Customization:**
- \`/prompt\` - View & manage prompts
- \`/setprompt [model] [text]\` - Set personality
  Example: \`/setprompt nova you are a teacher\`

**🌐 Settings:**
- \`/language\` - Change language (Persian/English)

${isAdmin ? `
━━━━━━━━━━━━━━━━━━━━
**👑 Admin Commands:**
- \`/admin\` - User management panel
- \`/log\` - System logs
- \`/blocked\` - Blocked users
- \`/rebuild\` - Rebuild database
- \`/dbstats\` - Database statistics
- \`/dbclean\` - Auto cleanup
- \`/keys\` - API Keys status
- \`/setvip\` - Enable group VIP
- \`/unsetvip\` - Disable group VIP
` : ''}

━━━━━━━━━━━━━━━━━━━━
**💡 Tips:**
- Most actions work with buttons
- Check status: \`/start\`
- Help for each section: this menu

**🎯 Shortcuts:**
- Quick reply: just send message
- Image: just \`/img\`
- New memory: just \`/new\``;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]] })
  });
}

// ======================== راهنمای تنظیمات ========================
async function showHelpSettings(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const isGroup = cb.message!.chat.type === "group" || cb.message!.chat.type === "supergroup";
  const text = lang === 'fa' ? `⚙️ **راهنمای تنظیمات**

**🌐 زبان:**
- فارسی 🇮🇷 / انگلیسی 🇺🇸
- تغییر با: \`/language\`
- همه متن‌ها و منوها تغییر میکنه

**🤖 مدل فعال:**
- نوا (Gemini) - سریع و دقیق
- لونا (SambaNova) - قدرتمند
- زارا (Pollinations) - خلاق
- تغییر: \`/model\`

**✏️ شخصی‌سازی:**
- پرامپت سفارشی برای هر مدل
- ذخیره خودکار
- ریست در هر لحظه
- مدیریت: \`/prompt\`

**🧠 حافظه:**
- ${config.HISTORY_LIMIT} پیام آخر ذخیره میشه
- پاکسازی: \`/new\`
- جداگانه برای هر مدل

${isGroup ? `
**👥 تنظیمات گروه:**
- حالت پاسخ: فقط منشن و ریپلای
- تایپینگ: نشان دادن "در حال نوشتن"
- مدیریت: دکمه "تنظیمات گروه" زیر

💡 فقط ادمین‌ها میتونن تنظیمات رو تغییر بدن
` : ''}

**📊 محدودیت‌ها:**
${session.vipStatus ? `
✅ **شما VIP هستید:**
- پیام: نامحدود
- ویس: نامحدود
- تصویر: نامحدود
` : `
**رایگان (روزانه):**
- پیام: ${session.dailyLimits.messages}/100
- ویس ارسالی: ${session.dailyLimits.voicesSent}/10
- ویس دریافتی: ${session.dailyLimits.voicesReceived}/10
- تصویر: ${session.dailyLimits.imagesGenerated}/5

🌟 **VIP شوید:**
- دسترسی نامحدود
- همه مدل‌ها
- پرامپت‌های سفارشی
- اولویت در پردازش
- تماس: @Hamid_Ai_pro
`}

━━━━━━━━━━━━━━━━━━━━
🔄 محدودیت‌ها هر ۲۴ ساعت ریست میشن`
:
`⚙️ **Settings Guide**

**🌐 Language:**
- Persian 🇮🇷 / English 🇺🇸
- Change: \`/language\`
- All texts & menus change

**🤖 Active Model:**
- Nova (Gemini) - Fast & accurate
- Luna (SambaNova) - Powerful
- Zara (Pollinations) - Creative
- Switch: \`/model\`

**✏️ Customization:**
- Custom prompt per model
- Auto save
- Reset anytime
- Manage: \`/prompt\`

**🧠 Memory:**
- Last ${config.HISTORY_LIMIT} messages saved
- Clear: \`/new\`
- Separate per model

${isGroup ? `
**👥 Group Settings:**
- Response mode: mention & reply only
- Typing indicator on/off
- Manage: "Group Settings" button below

💡 Only admins can change settings
` : ''}

**📊 Limits:**
${session.vipStatus ? `
✅ **You are VIP:**
- Unlimited messages
- Unlimited voice
- Unlimited images
` : `
**Free (Daily):**
- Messages: ${session.dailyLimits.messages}/100
- Voice sent: ${session.dailyLimits.voicesSent}/10
- Voice received: ${session.dailyLimits.voicesReceived}/10
- Images: ${session.dailyLimits.imagesGenerated}/5

🌟 **Go VIP:**
- Unlimited access
- All models
- Custom prompts
- Priority processing
- Contact: @Hamid_Ai_pro
`}

━━━━━━━━━━━━━━━━━━━━
🔄 Daily reset at midnight`;

  const keyboard = { inline_keyboard: [] as any[][] };
  if (isGroup) {
    keyboard.inline_keyboard.push([{ text: lang === 'fa' ? '👥 تنظیمات گروه' : '👥 Group Settings', callback_data: 'group_settings' }]);
  }
  keyboard.inline_keyboard.push([{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]);

  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, { reply_markup: JSON.stringify(keyboard) });
}

// ======================== راهنمای تبدیل متن به ویس ========================
async function showHelpVoiceTts(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const text = lang === 'fa' ? `🎤 **راهنمای تبدیل متن به ویس**

ربات نوا می‌تونه هر متنی رو با صدای شخصیت‌های مختلف برات ویس بفرسته!

**🗣️ نحوه استفاده:**
\`\`\`
[شخصیت] با ویس بگو [متن دلخواه]
\`\`\`

**✨ مثال‌ها:**
\`\`\`
نوا با ویس بگو سلام خوبی؟
سایفر با ویس بگو من هکرم
ویکتوریا با ویس بگو به من احترام بذار
\`\`\`

**🎭 صداها بر اساس شخصیت:**
- 👧 **نوا، لیلیت، ویکتوریا، آریا، لونا، زارا** → صدای زن
- 👦 **سایفر، جکس** → صدای مرد

**📌 نکات:**
- می‌تونی متن خیلی بلند هم بدی (تا چند دقیقه)
- ربات به صورت خودکار متن رو تکه‌تکه می‌کنه و چند ویس می‌فرسته
- بعد از ارسال ویس، پیام متنی خودت پاک می‌شه (برای تمیز نگه داشتن چت)

**💡 پیشنهاد:** برای جملات کوتاه و احساسی بهترین نتیجه رو می‌گیری!

━━━━━━━━━━━━━━━━━━━━
🎯 **همین حالا امتحان کن:** 
\`نوا با ویس بگو دوستت دارم\`` 
  : `🎤 **Text to Voice Guide**

Nova can send you voice messages with different personalities!

**🗣️ Usage:**
\`\`\`
[personality] with voice say [text]
\`\`\`

**✨ Examples:**
\`\`\`
nova with voice say hello how are you?
cipher with voice say I am a hacker
\`\`\`

**🎭 Voices per personality:**
- 👧 **Nova, Lilith, Victoria, Aria, Luna, Zara** → Female voice
- 👦 **Cipher, Jax** → Male voice

**📌 Tips:**
- You can send very long texts (up to several minutes)
- Bot will split and send multiple voice notes
- Your original text message will be deleted after sending

━━━━━━━━━━━━━━━━━━━━
🎯 **Try it now:** 
\`nova with voice say I love you\``;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]] })
  });
}

// ======================== راهنمای شخصیت‌ها ========================
async function showHelpPersonality(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const text = lang === 'fa' ? `🎭 **راهنمای شخصیت‌های نوا**

ربات نوا دارای ۸ شخصیت متفاوت هست. هر شخصیت لحن، رفتار و تخصص خاص خودش رو داره.

**✨ شخصیت‌های دختر (صدای زن):**

1. 🤖 **نوا (Nova)** – دستیار هوشمند، مودب و مفید (شخصیت پیش‌فرض)
2. 🖤 **لیلیت (Lilith)** – اغواگر، بی‌پروا و جذاب
3. 👑 **ویکتوریا (Victoria)** – ملکه سلطه‌گر، قدرتمند و محکم
4. 🌙 **آریا (Aria)** – فیلسوف شورشی، عمیق و متفکر
5. 🧠 **لونا (Luna)** – مغز متفکر، منطقی و تحلیلی
6. ✨ **زارا (Zara)** – خلاق، هنری و الهام‌بخش

**✨ شخصیت‌های پسر (صدای مرد):**

7. 💀 **سایفر (Cipher)** – هکر مرموز، تکنیکی و زیرک
8. 🔥 **جکس (Jax)** – آشوبگر، پرانرژی و شوخ

**🔄 نحوه تغییر شخصیت:**
- از منوی اصلی → دکمه «تغییر شخصیت»
- یا دستور \`/personality\`

**💡 نکته:** هر شخصیت پرامپت مخصوص خودش رو داره. می‌تونی با دستور \`/setprompt\` پرامپت دلخواهت رو هم بهش بدی.

━━━━━━━━━━━━━━━━━━━━
🎭 **همین حالا یکی رو انتخاب کن و تجربه کن!**` 
  : `🎭 **Nova Personalities Guide**

Nova has 8 unique personalities. Each has its own tone, behavior, and expertise.

**✨ Female Personalities (Female voice):**

1. 🤖 **Nova** – Smart, polite, and helpful assistant (default)
2. 🖤 **Lilith** – Reckless seducer, bold and attractive
3. 👑 **Victoria** – Dominant queen, powerful and firm
4. 🌙 **Aria** – Rebel philosopher, deep and thoughtful
5. 🧠 **Luna** – Deep thinker, logical and analytical
6. ✨ **Zara** – Creative, artistic and inspirational

**✨ Male Personalities (Male voice):**

7. 💀 **Cipher** – Mysterious hacker, technical and clever
8. 🔥 **Jax** – Chaos bringer, energetic and funny

**🔄 How to change personality:**
- From main menu → "Change Personality" button
- Or command \`/personality\`

**💡 Tip:** Each personality has its own default prompt. You can also set custom prompts with \`/setprompt\`.

━━━━━━━━━━━━━━━━━━━━
🎭 **Try one now!**`;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: lang === 'fa' ? '🎭 تغییر شخصیت' : '🎭 Change Personality', callback_data: 'personality_menu' }],
        [{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]
      ]
    })
  });
}

// ======================== راهنمای پرامپت حرفه‌ای ========================
async function showHelpPrompt(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const text = lang === 'fa' ? `📝 **راهنمای پرامپت حرفه‌ای**

پرامپت یعنی شما به ربات می‌گید چه شخصیتی داشته باشه، چه رفتاری کنه، چطور جواب بده.

**✨ امکانات پرامپت:**
- می‌تونی برای هر مدل (نوا، لونا، زارا) یه پرامپت جداگانه تنظیم کنی
- پرامپت می‌تونه خیلی ساده یا خیلی حرفه‌ای و دقیق باشه
- تا ۵۰۰۰ کاراکتر

**📝 نحوه تنظیم پرامپت دستی:**

\`/setprompt [موتور] [متن پرامپت]\`

**🎨 مثال‌ها:**

\`\`\`
/setprompt نوا تو یک معلم ریاضی هستی که با حوصله و مثال توضیح میدی
/setprompt لونا تو یک برنامه‌نویس حرفه‌ای پایتون هستی
/setprompt زارا تو یک شاعر عاشقانه هستی
\`\`\`

**🔄 مدیریت پرامپت‌ها:**
- **مشاهده:** از منوی «مدیریت پرامپت» یا دستور \`/prompt\`
- **پاک کردن:** دکمه «پاک کردن پرامپت دستی» در منوی پرامپت
- **ریست به حالت پیش‌فرض:** همان پاک کردن

**💡 نکات حرفه‌ای:**
- پرامپت باید نقش و وظیفه ربات رو واضح بگه
- می‌تونی محدودیت‌ها رو مشخص کنی (مثلاً "فقط به فارسی جواب بده")
- می‌تونی لحن رو تعیین کنی (مثلاً "با لحن دوستانه و صمیمی")

**🔒 محدودیت دسترسی:**
- ✅ **نوا:** همه کاربران (رایگان و VIP)
- 🔒 **لونا و زارا:** فقط کاربران VIP

━━━━━━━━━━━━━━━━━━━━
🎯 **همین حالا پرامپت خودت رو بساز و تجربه کن!**` 
  : `📝 **Advanced Prompt Guide**

Prompt is how you tell the bot what personality to have, how to behave, how to answer.

**✨ Features:**
- You can set separate prompts for each model (Nova, Luna, Zara)
- Simple or very professional and detailed prompts
- Up to 5000 characters

**📝 How to set custom prompt:**

\`/setprompt [engine] [prompt text]\`

**🎨 Examples:**

\`\`\`
/setprompt nova you are a math teacher who explains patiently with examples
/setprompt luna you are a professional Python developer
/setprompt zara you are a romantic poet
\`\`\`

**🔄 Managing prompts:**
- **View:** From "Manage Prompts" menu or \`/prompt\` command
- **Clear:** "Clear custom prompt" button in prompt menu
- **Reset to default:** Same as clearing

**💡 Pro tips:**
- Prompt should clearly state the bot's role and task
- You can specify limitations (e.g., "answer only in Persian")
- You can define tone (e.g., "friendly and warm tone")

**🔒 Access limits:**
- ✅ **Nova:** All users (free & VIP)
- 🔒 **Luna & Zara:** VIP only

━━━━━━━━━━━━━━━━━━━━
🎯 **Create your own prompt now!**`;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: lang === 'fa' ? '📝 مدیریت پرامپت' : '📝 Manage Prompts', callback_data: 'custom_prompt_menu' }],
        [{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]
      ]
    })
  });
}

// ======================== راهنمای Agent ========================
async function showHelpAgent(cb: CallbackQuery, env: Env) {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  const text = lang === 'fa' ? `🕵️ **راهنمای Agent (عامل هوشمند)**

حالت Agent به نوا اجازه میده از ابزارهای مختلف استفاده کنه و کارهای بیشتری برات انجام بده!

**✨ ابزارهای موجود:**
1. 🎨 **ساخت تصویر** – با دستور داخل Agent
2. 🔍 **جستجوی تصویر** – جستجو در Pixabay

**📝 نحوه استفاده:**

\`/agent [درخواست شما]\`

**🎨 مثال‌ها:**

\`\`\`
/agent یک تصویر از گربه فضانورد بساز
/agent عکس طبیعت زیبا پیدا کن
\`\`\`

**💡 Agent چطور کار می‌کنه؟**
- نوا درخواست تو رو تحلیل می‌کنه
- تشخیص میده به کدوم ابزار نیاز داره
- ابزار رو اجرا می‌کنه و نتیجه رو بهت نشون میده

**🔮 در آینده:**
- جستجوی اینترنتی
- محاسبات ریاضی پیشرفته
- تحلیل فایل‌های حجیم
- و خیلی بیشتر...

━━━━━━━━━━━━━━━━━━━━
🎯 **همین حالا Agent رو امتحان کن!**` 
  : `🕵️ **Agent Mode Guide**

Agent mode allows Nova to use various tools and do more things for you!

**✨ Available tools:**
1. 🎨 **Generate image** – using command inside Agent
2. 🔍 **Search image** – search on Pixabay

**📝 How to use:**

\`/agent [your request]\`

**🎨 Examples:**

\`\`\`
/agent generate an image of a cat astronaut
/agent find nature beautiful wallpaper
\`\`\`

**💡 How Agent works:**
- Nova analyzes your request
- Decides which tool is needed
- Executes the tool and shows you the result

**🔮 Coming soon:**
- Web search
- Advanced math calculations
- Large file analysis
- And much more...

━━━━━━━━━━━━━━━━━━━━
🎯 **Try Agent now!**`;
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]] })
  });
}

  keyboard.inline_keyboard.push([
  { text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }
]);

  await answerCallbackQuery(cb.id);
await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
  reply_markup: JSON.stringify(validateKeyboard(keyboard))
});

async function handleAdminCommand(message: Message, env: Env) {
  const { chat, from } = message;
  if (!from || from.id !== config.BOT_OWNER_ID) return;

  if (chat.type !== "private") {
    await sendMessage(chat.id, "⚠️ **پنل مدیریت فقط در چت خصوصی قابل دسترسی است**", {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  adminPanelStates.set(chat.id, {
    page: 0,
    perPage: 5,
    sortBy: 'new'
  });
  
  const processingMsg = await sendMessage(chat.id, "⏳ **در حال جمع‌آوری آمار...**", {
    reply_to_message_id: message.message_id
  });
  
  try {
    await updateAdminPanel(chat.id, processingMsg.message_id, env);
  } catch (error) {
    logger.error("Admin command failed", error);
    await editMessageText(chat.id, processingMsg.message_id, "❌ **خطا در جمع‌آوری آمار**");
  }
}

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
    // ✅ مرحله 1: جمع‌آوری لیست کاربران با سیستم Pagination برای بالای 1000 کاربر
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
        
        // ✅ فقط چت‌های خصوصی
        if (session.type !== "private") continue;
        
        // ✅ فقط کاربرایی که حداقل یه بار پیام دادن
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
    
    // ✅ مرحله 2: چک کردن وضعیت
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
    
    // ✅ چک گروهی با progress update
    let checked = 0;
    const batchSize = 10; // هر 10 تا یه آپدیت
    
    for (let i = 0; i < allUserIds.length; i++) {
      const userId = allUserIds[i];
      const isBlocked = await isUserBlockedBot(userId);
      
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
      
      // آپدیت پیشرفت هر 10 کاربر
      if (checked % batchSize === 0 || checked === allUserIds.length) {
        await editMessageText(chat.id, processingMsg.message_id, 
          `🔍 **در حال بررسی...**\n\n` +
          `📊 پیشرفت: ${checked}/${allUserIds.length}\n` +
          `🚫 مسدود: ${blockedUsers.length}`
        ).catch(() => {}); // اگه خطا داد مهم نیست
      }
      
      // ✅ تاخیر 100ms بین هر درخواست
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // ✅ مرحله 3: نمایش نتایج
    let text = `🚫 **کاربران مسدودکننده ربات**\n\n`;
    text += `📊 از ${allUserIds.length} کاربر بررسی شده:\n`;
    text += `✅ فعال: ${allUserIds.length - blockedUsers.length}\n`;
    text += `🚫 مسدود: ${blockedUsers.length}\n\n`;
    
    if (blockedUsers.length === 0) {
      text += `🎉 **همه کاربران ربات رو فعال دارن!**`;
    } else {
      text += `➖➖➖➖➖➖➖➖➖➖\n\n`;
      
      // مرتب‌سازی بر اساس آخرین فعالیت
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
        [
          { text: "🗑️ حذف سشن‌های مسدود", callback_data: "admin_delete_blocked" }
        ],
        [
          { text: "📥 دانلود لیست", callback_data: "admin_export_blocked" }
        ],
        [
          { text: "🔙 بازگشت", callback_data: "admin_back_to_main" }
        ]
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

async function handleRebuildDatabaseCommand(message: Message, env: Env): Promise<void> {
  const { chat } = message;
  
  const processingMsg = await sendMessage(chat.id, 
    "🔧 **در حال بازسازی دیتابیس...**\n\n⏳ لطفاً صبر کنید", 
    { reply_to_message_id: message.message_id }
  );
  
  try {
    // ✅ سیستم Pagination جدید برای دریافت کل دیتابیس
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
        
        // ✅ بررسی و ترمیم userMemories
        if (!session.userMemories || 
            (typeof session.userMemories === 'object' && Object.keys(session.userMemories).length === 0)) {
          
          logger.info(`🔧 Fixing session ${session.id} - empty userMemories`);
          
          // ✅ ساخت userMemories جدید
          session.userMemories = new Map<number, UserMemory>();
          
          // ✅ استخراج اطلاعات از تاریخچه موتورها
          let userId: number | null = null;
          let userName = 'Unknown User';
          
          // جستجو در تاریخچه‌ها
          const engines: AIEngine[] = ['gemini', 'sambanova', 'pollinations'];
          
          for (const engineName of engines) {
            const engine = session.engines[engineName];
            if (!engine || !engine.history) continue;
            
            // پیدا کردن اولین پیام که userId داره
            for (const item of engine.history) {
              if (item.userId && item.userId > 0) {
                userId = item.userId;
                userName = item.userName || 'Unknown';
                break;
              }
            }
            
            if (userId) break;
          }
          
          // اگه از تاریخچه پیدا نشد، از chat ID استفاده کن
          if (!userId && session.type === 'private') {
            userId = session.id;
            logger.warn(`Using chat ID as user ID for session ${session.id}`);
          }
          
          if (userId) {
            // ✅ ساخت UserMemory
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
          // ✅ userMemories وجود داره، ولی باید بررسی کنیم Map هست یا Object
          const rawMemories = session.userMemories as any;
          
          if (!(rawMemories instanceof Map)) {
            logger.info(`🔧 Converting userMemories to Map for session ${session.id}`);
            
            const newMap = new Map<number, UserMemory>();
            
            // تبدیل Object یا Array به Map
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
        
        // ✅ ترمیم statistics اگه نداشت
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
        
        // ✅ ترمیم dailyLimits اگه نداشت
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
        
        // ✅ ذخیره اگه تغییری داشته
        if (wasModified) {
          // تبدیل Map به Object برای ذخیره
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
        
        // آپدیت پیشرفت هر 10 سشن
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
    
    // ✅ پاکسازی کش
    sessionCache.clear();
    userCache.clear();
    
    // ✅ نمایش نتیجه
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
        [
          { text: "📊 مشاهده پنل ادمین", callback_data: "open_admin" }
        ],
        [
          { text: "🗑️ بستن", callback_data: "admin_close" }
        ]
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

async function isUserBlockedBot(userId: number): Promise<boolean> {
  try {
    // از آنجا که نمی‌توان بدون ارسال پیام متوجه بلاک واقعی شد، فرض اولیه را بر فعال بودن می‌گذاریم
    return false;
  } catch (e) {
    return true;
  }
}

async function isCFKeyDisabled(accountId: string, token: string): Promise<boolean> {
  // به عنوان پیش‌فرض کلیدها فعال فرض می‌شوند
  return false;
}

function disableCFKey(accountId: string, token: string) {
  logger.warn(`🚫 Cloudflare Key temporarily disabled: ${accountId}`);
}

async function updateAdminPanel(chatId: number, messageId: number, env: Env) {
  const state = adminPanelStates.get(chatId) || { page: 0, perPage: 5, sortBy: 'new' };
  
  const allUsers = await getAllUserStatistics(env);
  
  // Sort based on sortBy
  let sortedUsers = [...allUsers];
  if (state.sortBy === 'new') {
    sortedUsers.sort((a, b) => {
      const aTime = a.statistics.firstUsed || 0;
      const bTime = b.statistics.firstUsed || 0;
      return bTime - aTime;
    });
  } else if (state.sortBy === 'active') {
    sortedUsers.sort((a, b) => {
      const aTime = a.statistics.lastSeen || 0;
      const bTime = b.statistics.lastSeen || 0;
      return bTime - aTime;
    });
  } else if (state.sortBy === 'messages') {
    sortedUsers.sort((a, b) => {
      const aMsg = a.statistics.totalMessages || 0;
      const bMsg = b.statistics.totalMessages || 0;
      return bMsg - aMsg;
    });
  }
  
  const kv = env.SESSIONS;
  const currentKvMode = await kv.get("maintenance_mode", "text");
  const isInMaintenance = currentKvMode === "true";
  const totalPages = Math.ceil(sortedUsers.length / state.perPage);
  const startIdx = state.page * state.perPage;
  const endIdx = startIdx + state.perPage;
  const pageUsers = sortedUsers.slice(startIdx, endIdx);
  
  const totalMessages = allUsers.reduce((sum, u) => sum + u.statistics.totalMessages, 0);
  const vipUsers = allUsers.filter(u => u.vipStatus).length;
  const activeToday = allUsers.filter(u => Date.now() - u.statistics.lastSeen < 24 * 60 * 60 * 1000).length;
  const blockedCount = await getBlockedUsersCount(env);

  let text = `📊 **پنل مدیریت**\n\n`;
  text += `👥 کل کاربران: ${allUsers.length}\n`;
  text += `👑 VIP: ${vipUsers} | 🆓 رایگان: ${allUsers.length - vipUsers}\n`;
  text += `🔥 فعال امروز: ${activeToday}\n`;
  text += `🚫 مسدود شده: ${blockedCount}\n`;
  text += `💬 کل پیام‌ها: ${totalMessages}\n\n`;
  text += `📄 صفحه ${state.page + 1} از ${totalPages}\n`;
  text += `📊 مرتب‌سازی: ${state.sortBy === 'new' ? '🆕 جدیدترین' : state.sortBy === 'active' ? '⚡ فعال‌ترین' : '💬 پرپیام‌ترین'}\n\n`;
  text += `➖➖➖➖➖➖➖➖➖➖\n\n`;
  
  pageUsers.forEach((user, idx) => {
    const num = startIdx + idx + 1;
    const escapedName = user.firstName;
    const lastSeen = user.statistics.lastSeen && user.statistics.lastSeen > 0 
      ? new Date(user.statistics.lastSeen).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'نامشخص';
    
    text += `**${num}\\.** ${escapedName} ${user.vipStatus ? '👑' : ''}\n`;
    text += `🆔 \`${user.userId}\`\n`;
    text += `💬 ${user.statistics.totalMessages} پیام \\| ⏰ ${lastSeen}\n`;
    text += `📊 امروز: ${user.dailyLimits.messages}/50 پیام\n\n`;
  });
  
  const keyboard: any = { inline_keyboard: [] };
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
  
  const navRow: any[] = [];
  if (state.page > 0) navRow.push({ text: "◀️ قبلی", callback_data: "admin_page_prev" });
  navRow.push({ text: `${state.page + 1}/${totalPages}`, callback_data: "admin_noop" });
  if (state.page < totalPages - 1) navRow.push({ text: "بعدی ▶️", callback_data: "admin_page_next" });
  keyboard.inline_keyboard.push(navRow);
  
  keyboard.inline_keyboard.push([
    { text: "🆕 جدیدترین", callback_data: "admin_sort_new" },
    { text: "⚡ فعال‌ترین", callback_data: "admin_sort_active" },
    { text: "💬 پرپیام", callback_data: "admin_sort_messages" }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: isInMaintenance ? "✅ خروج از تعمیرات" : "🛠️ ورود به تعمیرات", callback_data: "admin_toggle_maintenance" },
    { text: "📊 CSV", callback_data: "admin_export_csv" }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: "📢 ارسال پیام همگانی", callback_data: "admin_broadcast" }
  ]);
  
  keyboard.inline_keyboard.push([
    { text: "🔄 بروزرسانی", callback_data: "admin_refresh" },
    { text: "❌ بستن", callback_data: "admin_close" }
  ]);
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
  
  adminPanelStates.set(chatId, state);
}

// عد از adminPanelStates
const broadcastStates = new Map<number, { mode: 'all' | 'vip' | 'free' | 'specific'; userId?: number }>();

// اضافه کن تابع جدید
async function handleBroadcastCallback(cb: CallbackQuery, env: Env) {
  const chat = cb.message!.chat;
  const user = cb.from;
  
  if (user.id !== config.BOT_OWNER_ID) {
    await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
    return;
  }
  
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

async function showUserDetail(chatId: number, messageId: number, userId: number, env: Env) {
  const allUsers = await getAllUserStatistics(env);
  const user = allUsers.find(u => u.userId === userId);
  
  if (!user) {
    await editMessageText(chatId, messageId, "❌ **کاربر یافت نشد**");
    return;
  }
  
  // ✅ استفاده از تابع جدید
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
        { text: "🔙 بازگشت", callback_data: "admin_back_to_main" }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

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
    
    // ✅ محاسبه تعداد واقعی پیام‌ها در history
    const activeEngine = userSession.engines[userSession.activeEngine];
    const historyCount = activeEngine.history?.length || 0;
    const totalSent = userSession.statistics?.totalMessages || 0;
    
    let text = `🧠 **حافظه کاربر ${userName}**\n\n`;
    text += `🆔 \`${userId}\`\n`;
    text += `📊 کل پیام‌های ارسالی: **${totalSent}**\n`;
    text += `💾 ذخیره شده در حافظه: **${historyCount}** (محدودیت: ${config.HISTORY_LIMIT})\n`; // ✅ اضافه شد
    text += `🤖 موتور فعال: ${getEngineName(userSession.activeEngine, 'fa')}\n\n`;
    
    // ✅ نمایش آمار موتورها
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
      
      // ⚠️ هشدار اگر حافظه کامل نیست
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
          createInlineButton('📥 دانلود کامل حافظه', `admin_download_memory_${userId}`)
        ],
        [
          createInlineButton('🗑️ ریست حافظه', `admin_confirm_reset_memory_${userId}`)
        ],
        [
          createInlineButton('🔙 بازگشت', `admin_user_${userId}`)
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

function resetDailyLimitsIfNeeded(session: ChatSession): void {
  const now = Date.now();
  const lastReset = session.dailyLimits.lastReset || 0;
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  if (now - lastReset > oneDayMs) {
    session.dailyLimits.messages = 0;
    session.dailyLimits.voicesSent = 0;
    session.dailyLimits.voicesReceived = 0;
    session.dailyLimits.imagesGenerated = 0;
    session.dailyLimits.lastReset = now;
    // session رو ذخیره کن (non-blocking)
  }
}

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

// ---- sendImageResults ----
async function sendAnimation(
  chatId: number, 
  animation: string, 
  caption?: string, 
  options: Record<string, any> = {}
): Promise<Message> {
  const params: Record<string, any> = {
    chat_id: chatId,
    animation: animation,
    ...options
  };
  if (caption) params.caption = caption.substring(0, 1024);
  return await callTelegramAPI("sendAnimation", params);
}

async function sendImageResults(chatId: number, messageId: number, images: string[], caption: string, txt: any): Promise<void> {
  try {
    if (!images || images.length === 0) {
      throw new Error("تصویری برای ارسال وجود ندارد");
    }

    logger.info(`📤 Sending ${images.length} images to chat ${chatId}`);

    for (let i = 0; i < Math.min(images.length, 5); i++) {
      const img = images[i];
      const isGif = img.toLowerCase().includes(".gif");

      try {
        if (!img.startsWith('http://') && !img.startsWith('https://')) {
          logger.warn(`Invalid image URL: ${img}`);
          continue;
        }

        if (i === 0) {
          const fullCaption = txt.search_results
            .replace('{caption}', caption)
            .replace('{count}', String(images.length)) + txt.search_attribution;
          
          if (isGif) {
            await sendAnimation(chatId, img, fullCaption, { reply_to_message_id: messageId });
          } else {
            await sendPhoto(chatId, img, fullCaption, { reply_to_message_id: messageId });
          }
        } else {
          if (isGif) {
            await sendAnimation(chatId, img);
          } else {
            await sendPhoto(chatId, img);
          }
        }

        logger.info(`✅ Image ${i + 1} sent successfully`);
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (imageError) {
        logger.warn(`Failed to send image ${i + 1}:`, imageError);
        if (i === 0) {
          const fallbackText = txt.search_link_fallback
            .replace('{link}', img)
            .replace('{count}', String(images.length));
          await sendMessage(chatId, fallbackText, { reply_to_message_id: messageId });
        }
        continue;
      }
    }

  } catch (error) {
    logger.error("Failed to send image results", error);
    throw new Error(`خطا در ارسال تصاویر: ${error instanceof Error ? error.message : 'نامشخص'}`);
  }
}

// ========== تابع تبدیل متن به ویس ==========
async function ttsHandler(msgText: string, chatId: number, replyToId: number, env: Env): Promise<boolean> {
  const match = msgText.match(/^([\w\u0600-\u06FF]+)\s+با\s+ویس\s+بگو\s+(.+)$/i);
  if (!match) return false;
  const name = match[1].toLowerCase();
  const sentence = match[2].trim();
  if (!sentence) return false;
  const voiceMap: Record<string, string> = {
    'نوا': 'nova', 'nova': 'nova',
    'لیلیت': 'nova', 'lilith': 'nova',
    'سایفر': 'onyx', 'cipher': 'onyx',
    'ویکتوریا': 'nova', 'victoria': 'nova',
    'آریا': 'nova', 'aria': 'nova',
    'جکس': 'onyx', 'jax': 'onyx',
    'لونا': 'nova', 'luna': 'nova',
    'زارا': 'nova', 'zara': 'nova'
  };
  const voice = voiceMap[name] || 'nova';
  const url = `https://text.pollinations.ai/tts?text=${encodeURIComponent(sentence)}&voice=${voice}`;
  const res = await fetch(url);
  if (!res.ok) return false;
  const audio = await res.arrayBuffer();
  const form = new FormData();
  form.append('chat_id', chatId.toString());
  form.append('voice', new Blob([audio], { type: 'audio/mpeg' }), 'voice.mp3');
  form.append('reply_to_message_id', replyToId.toString());
  await fetch(`https://api.telegram.org/bot${config.TOKEN}/sendVoice`, { method: 'POST', body: form });
  return true;
}
// ===========================================

async function sendAnimation(chatId: number, animation: string, caption?: string, options: Record<string, any> = {}): Promise<Message> {
  // ... کد موجود ...
}

  
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

async function updateModelSelection(
  chatId: number,
  messageId: number,
  session: ChatSession
): Promise<void> {
  await editMessageText(chatId, messageId, buildModelSelectionText(session), {
    reply_markup: JSON.stringify(validateKeyboard(buildModelSelectionKeyboard(session))),
  });
}

async function updatePromptMenu(chatId: number, messageId: number, session: ChatSession) {
  const lang = session.language || 'fa';
  const txt = TRANSLATIONS[lang];
  const defText = txt.prompt_default || 'پیش‌فرض';

  const geminiPrompt = session.customPrompts.gemini || defText;
  const sambanovaPrompt = session.customPrompts.sambanova || defText;
  const pollinationsPrompt = session.customPrompts.pollinations || defText;
  
  const short = (t: string) => {
    const safeText = String(t || defText);
    return safeText.length > 30 ? safeText.substring(0, 30) + '...' : safeText;
  };

  const text = `${txt.prompt_title}\n\n${txt.prompt_current}\n\n🤖 **${getEngineName('gemini', lang)}:** ${short(geminiPrompt)}\n\n🎨 **${getEngineName('sambanova', lang)}:** ${short(sambanovaPrompt)}\n\n🌟 **${getEngineName('pollinations', lang)}:** ${short(pollinationsPrompt)}\n\n${txt.prompt_guide}`;  
  
  const resetGemini = `${txt.prompt_reset || 'ریست'} ${getEngineName('gemini', lang)} 🗑️`;
  const resetSambanova = `${txt.prompt_reset || 'ریست'} ${getEngineName('sambanova', lang)} 🗑️`;
  const resetPollinations = `${txt.prompt_reset || 'ریست'} ${getEngineName('pollinations', lang)} 🗑️`;
  
  const keyboard = {
    inline_keyboard: [
      [
        createInlineButton(resetGemini, 'reset_prompt_gemini'),
        createInlineButton(resetSambanova, 'reset_prompt_sambanova')
      ],
      [
        createInlineButton(resetPollinations, 'reset_prompt_pollinations')
      ],
      [
        createInlineButton(txt.prompt_show, 'show_prompts')
      ],
      [
        createInlineButton(txt.btn_back, 'open_help')
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, { 
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

async function handleSetPromptCommand(message: Message, args: string[], env: Env) {
  const { chat, from } = message;
  if (!from) return;

  const session = await getOrCreateSession(chat, from, env);
  const lang = session.language || 'fa';
  // @ts-ignore
  const txt = TRANSLATIONS[lang];

  // 1. بررسی آرگومان‌ها
  if (args.length < 2) {
    const usage = lang === 'fa' 
      ? "استفاده: `/setprompt [موتور] متن پرامپت`\n\nموتورها: `نوا`, `لونا`, `زارا`"
      : "Usage: `/setprompt [engine] prompt text`\n\nEngines: `nova`, `luna`, `arya`, `zara`";
      
    await sendMessage(chat.id, `${txt.err_format}\n\n${usage}`, {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  const engineAlias = args[0].toLowerCase();
  const promptText = args.slice(1).join(' ').trim();
  
  // مپ کردن هم نام‌های فارسی و هم انگلیسی
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

  // چک VIP
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
  
  // ذخیره
  session.customPrompts[engine as AIEngine] = promptText;
  
  // اعمال در هیستوری
  const timestamp = Date.now();
  const currentPrompt = getActivePrompt(session, from.first_name, session.type !== "private");
  const engineKey = engine as AIEngine;
  
  if (session.engines[engineKey].history.length > 0) {
     const role = engineKey === 'gemini' ? 'user' : 'assistant';
     // فرض می‌کنیم اولین پیام همیشه System prompt است
     session.engines[engineKey].history[0] = {
        role: role,
        parts: [{ text: currentPrompt }],
        timestamp
     };
  }

  await saveSessionWithLock(session, env);

  const engineName = getEngineName(engine as AIEngine, lang);
  const successMsg = lang === 'fa'
    ? `✅ **پرامپت ${engineName} تنظیم و اعمال شد**\n\nبدون نیاز به /new از الان فعال است!`
    : `✅ **${engineName} prompt set and applied**\n\nActive immediately (no /new needed)!`;

  await sendMessage(chat.id, successMsg, {
    reply_to_message_id: message.message_id
  });
}


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

   // ──────────────────────────────────────────────────────────────
    // 2. فایل PDFF
    if (mediaCategory === 'pdf') {
      const fileUrl = await getFileUrl(fileId);
      const fileResponse = await fetchWithTimeout(fileUrl, {}, 30000);
      const base64Data = arrayBufferToBase64(await fileResponse.arrayBuffer());
      const userQuestion = caption?.trim() || '';
      const promptText = userQuestion || (lang === 'fa' 
        ? 'این سند PDF را با دقت بخوان و یک خلاصه جامع بده.' 
        : 'Read this PDF and provide a comprehensive summary.');
      const responseText = await processWithGeminiRobust([
        { inline_data: { mime_type: "application/pdf", data: base64Data } },
        { text: promptText }
      ], config);
      await sendStreamingResponse(chat.id, message.message_id, sanitizeMarkdown(responseText), loadingMsg.message_id);
      saveMediaHistory(session, env, userQuestion, responseText);
      return;
    }

    // 3. عکس و ویدیو
    const fileInfo = await callTelegramAPI("getFile", { file_id: fileId });
    const fileUrl = `https://api.telegram.org/file/bot${config.TOKEN}/${fileInfo.file_path}`;
    const mediaResponse = await fetchWithTimeout(fileUrl, {}, 30000);
    const base64Data = arrayBufferToBase64(await mediaResponse.arrayBuffer());
    const userCaption = caption?.trim() || '';
    const sysPrompt = lang === 'fa'
      ? `به این مدیا نگاه کن.${userCaption ? ` کاربر: ${userCaption}` : ' توضیح بده.'} دوستانه جواب بده.`
      : `Describe this media.${userCaption ? ` User: ${userCaption}` : ''} Be friendly.`;
    
    const responseText = await processWithGeminiRobust([
      { text: sysPrompt },
      { inline_data: { mime_type: fileMimeType, data: base64Data } }
    ], config);
    const finalResponse = formatResponseForHuman(responseText, lang);
    await sendStreamingResponse(chat.id, message.message_id, finalResponse, loadingMsg.message_id);
    saveMediaHistory(session, env, userCaption, finalResponse);

try {
    // کدهای پردازش فایل
    // ...
} catch (error) {
    logger.error("Media processing failed", error);

    // errMsg باید داخل catch باشد تا به متغیر error دسترسی داشته باشد
    const errMsg = from.id === config.BOT_OWNER_ID
        ? `❌ **Raw error:**\n\`\`\`\n${getRawError(error)}\n\`\`\``
        : lang === 'fa'
            ? "> ❌ نتونستم فایل رو پردازش کنم!"
            : "> ❌ Failed to process media!";

    // اینجا باید از errMsg استفاده کنی، مثلا:
    // await sendMessage(chatId, errMsg);
}

  
  // حالا سعی می‌کنیم پیام خطا رو بفرستیم، اگه خطا خورد بگیریمش
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

function formatResponseForHuman(text: string, lang: 'fa' | 'en'): string {
  // حذف جملات رباتیک
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

  // اضافه کردن احساس انسانی
  const humanTouches = lang === 'fa' ? [
    '😊 ', '👍 ', '🙂 ', '✨ ', '🌟 '
  ] : [
    '😊 ', '👍 ', '🙂 ', '✨ ', '🌟 '
  ];

  // فقط اگر متن کوتاه نیست، ایموجی اضافه کن
  if (cleanedText.length > 50) {
    const randomTouch = humanTouches[Math.floor(Math.random() * humanTouches.length)];
    cleanedText = randomTouch + cleanedText;
  }

  return cleanedText.trim();
}

async function handleVoiceMessage(message: Message, env: Env, config: ReturnType<typeof createConfig>) {
  const { chat, from, voice } = message;
  if (!from || !voice) return;
  
  const session = await getOrCreateSession(chat, from, env);
  const isGroup = chat.type === "group" || chat.type === "supergroup";

  if (isGroup && !shouldRespondInGroup(message, session)) {
    return;
  }
  
  if (config.MAINTENANCE_MODE && from.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "> 🛠️ **ربات در حال تعمیرات است.**\nلطفاً دقایقی دیگر تلاش کنید.", { reply_to_message_id: message.message_id });
    return;
  }

  const requestId = generateRequestId();
  
  if (!canProcessConcurrentRequest(chat.id, requestId)) {
    await sendMessage(chat.id, "🚦 سرور به شدت شلوغ است. لطفاً ۳۰ ثانیه دیگر پیام بدهید.", { reply_to_message_id: message.message_id });
    return;
  }
  let loadingMsg: Message | null = null;
  
  try {
    const lang = session.language || 'fa';
    
    if (isGroup && !shouldRespondInGroup(message, session)) return;
    
    if (config.GEMINI_KEYS.length === 0) {
      await sendMessage(chat.id, "❌ تشخیص گفتار در حال حاضر غیرفعال است.", { reply_to_message_id: message.message_id });
      return;
    }
    
    if (voice.file_size && voice.file_size > 10 * 1024 * 1024) {
      await sendMessage(chat.id, "⚠️ **حجم فایل بالاست!**\n> حداکثر حجم مجاز برای پردازش صوت ۱۰ مگابایت است.", { reply_to_message_id: message.message_id });
      return;
    }
    
    const limitCheck = checkDailyLimit(session, 'voice_sent');
    if (!limitCheck.allowed) {
      await sendMessage(chat.id, limitCheck.message!, { reply_to_message_id: message.message_id });
      return;
    }
    
    // 🎨 UI جدید لودینگ ویس
    loadingMsg = await sendMessage(chat.id, 
      lang === 'fa' ? '> 🎤 **در حال دریافت صوت...**' : '> 🎤 **Fetching audio...**', 
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
        lang === 'fa' ? '> 🔊 **در حال استخراج متن از صدا...**' : '> 🔊 **Transcribing audio...**'
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
        userMessage += lang === 'fa' ? '> ⏱️ زمان پردازش سرور تمام شد.' : '> ⏱️ Processing timed out.';
      } else {
        userMessage += lang === 'fa' ? '> 💡 لطفاً واضح‌تر صحبت کن یا از محیط خلوت‌تری ویس بده.' : '> 💡 Please speak clearly or re-record.';
      }
      
      if (loadingMsg) await editMessageText(chat.id, loadingMsg.message_id, userMessage).catch(() => {});
      return;
    }
    
    if (transcribedText.length < 2) {
      const errMsg = lang === 'fa' ? '🔇 صدایی تشخیص داده نشد. لطفاً واضح‌تر صحبت کن.' : '🔇 No speech detected. Please speak clearly.';
      if (loadingMsg) await editMessageText(chat.id, loadingMsg.message_id, errMsg).catch(() => {});
      return;
    }
    
    // 🎨 نمایش متن ویس به زیباترین شکل ممکن
    const transcriptDisplay = lang === 'fa' 
      ? `> 🎙️ **شما گفتید:**\n> _${transcribedText}_\n> ⏳ در حال بررسی...`
      : `> 🎙️ **You said:**\n> _${transcribedText}_\n> ⏳ Processing...`;
    
    if (loadingMsg) {
      await editMessageText(chat.id, loadingMsg.message_id, transcriptDisplay).catch(() => {});
    }
    
    incrementDailyUsage(session, 'voice_sent');
    session.statistics.voicesReceived++;
    recordRequest(session);
    session.lastSeen = Date.now();
    
    // ارسال به هوش مصنوعی (آرایه اینجا به درستی تنظیم شد)
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
      ? '> ❌ **خطای سیستمی!**\n> در حال حاضر پردازش ویس مقدور نیست. می‌تونی متن بفرستی.'
      : '> ❌ **System Error!**\n> Voice processing failed. Try text instead.';
    
    if (loadingMsg) await editMessageText(chat.id, loadingMsg.message_id, errMsg).catch(() => {});
  } finally {
    releaseRequest(chat.id, requestId);
  }
}

// ۱. تابع resetUserMemory را مستقل ببند
async function resetUserMemory(chatId, messageId, userId, env) {
  try {
    const sessionKey = `session:${userId}`;
    const stored = await env.SESSIONS.get(sessionKey, "json");
    if (!stored) {
      await editMessageText(chatId, messageId, "❌ سشنی برای این کاربر یافت نشد.");
      return;
    }
    // ... ادامه کدهای ریست کردن ...
  } catch (err) {
    logger.error("Reset memory failed", err);
  }
} // <--- حتماً براکت بسته تابع اول اینجا باشد

// ۲. تابع ttsHandler را کاملاً خارج از تابع قبلی تعریف کن
async function ttsHandler(msgText, chatId, replyToId, env) {
    try {
        // ... کدهای TTS ...
        return true;
    } catch (error) {
        console.error("Error in ttsHandler:", error);
        return false;
    }
} // <--- براکت بسته تابع دوم

   async function ttsHandler(msgText, chatId, replyToId, env) {
    try {
        const match = msgText.match(/^([\w\u0600-\u06FF]+)\s+با\s+ویس\s+بگو\s+(.+)$/i);
        if (!match) return false;
        
        const name = match[1].toLowerCase();
        const sentence = match[2].trim();
        if (!sentence) return false;

        const voiceMap = { 'نوا':'nova','nova':'nova','لیلیت':'nova','سایفر':'onyx','ویکتوریا':'nova','آریا':'nova','جکس':'onyx','لونا':'nova','زارا':'nova' };
        const voice = voiceMap[name] || 'nova';
        
        const url = `https://text.pollinations.ai/tts?text=${encodeURIComponent(sentence)}&voice=${voice}`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error("Failed to fetch audio from TTS API");

        const audio = await res.arrayBuffer();
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('voice', new Blob([audio], { type: 'audio/mpeg' }), 'voice.mp3');
        form.append('reply_to_message_id', replyToId);

        const telegramRes = await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendVoice`, { 
            method: 'POST', 
            body: form 
        });

        if (!telegramRes.ok) throw new Error("Failed to send voice to Telegram");

        return true;
    } catch (error) {
        console.error("Error in ttsHandler:", error);
        return false;
    }
}

// ==========================================

// سپس تابع resetUserMemory به همان شکل قبلی بدون ttsHandler
// مطمئن شو که قبل از تعریف هر تابع، تابع قبلی کاملاً بسته شده باشد
async function ttsHandler(msgText, chatId, replyToId, env) {
  const match = msgText.match(/^([\w\u0600-\u06FF]+)\s+با\s+ویس\s+بگو\s+(.+)$/i);
  if (!match) return false;
  // ... کدهای دیگر
  return true; 
} // <--- این براکت خیلی مهم است، اگر نباشد کل سورس تا آخر فایل می‌پاشد!

// تابع بعدی که قرار است تعریف کنی
// این خط را جایگزین خط ۶۳۵۹ کن
async function ttsHandler(msgText: string, chatId: number, replyToId: number, env: Env): Promise<boolean> {
  const match = msgText.match(/^([w؀-ۿ]+)s+باs+ویسs+بگوs+(.+)$/i);
  if (!match) return false;

  const name = match[1].toLowerCase();
  const sentence = match[2].trim();
  if (!sentence) return false;

  const voiceMap: Record<string, string> = {
    'نوا': 'nova', 'nova': 'nova',
    'لیلیت': 'nova', 'lilith': 'nova',
    'سایفر': 'onyx', 'cipher': 'onyx',
    'ویکتوریا': 'nova', 'victoria': 'nova',
    'آریا': 'nova', 'aria': 'nova',
    'جکس': 'onyx', 'jax': 'onyx',
    'لونا': 'nova', 'luna': 'nova',
    'زارا': 'nova', 'zara': 'nova'
  };

  const voice = voiceMap[name] || 'nova';
  const url = `https://text.pollinations.ai/tts?text=${encodeURIComponent(sentence)}&voice=${voice}`;
  const res = await fetch(url);
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
}


    
    // بررسی دستور تبدیل متن به ویس
const ttsMatch = text.match(/^([\w\u0600-\u06FF]+)\s+با\s+ویس\s+بگو\s+(.+)$/i);
if (ttsMatch) {
  const handled = await ttsHandler(text, chat.id, message.message_id, env);
  if (handled) return;
}

    if (isGroup && from) {
      const banKey = `banned:${chat.id}:${from.id}`;
      const banData = await env.SESSIONS.get(banKey, 'json') as any;
  
      if (banData && banData.until > Date.now()) {
        // هنوز بن هست - پیامو پاک کن
        await deleteMessage(chat.id, message.message_id).catch(() => {});
        return;
      } else if (banData && banData.until <= Date.now()) {
        // بن تموم شده - از KV پاک کن
        await env.SESSIONS.delete(banKey).catch(() => {});
      }
    }
    
    if (isGroup && !text.startsWith('/') && !shouldRespondInGroup(message, session)) {
      return;
    }

    const isBlocked = await isUserBlocked(from.id, env);
if (isBlocked && from.id !== config.BOT_OWNER_ID) {
  await sendMessage(chat.id, 
    "🚫 **دسترسی مسدود**\n\nحساب شما توسط مدیر مسدود شده است.\n\n📞 برای رفع مسدودیت با @Hamid_Ai_pro تماس بگیرید.",
    { reply_to_message_id: message.message_id }
  );
  return;
}
    
    const broadcastState = broadcastStates.get(chat.id);
    if (broadcastState && from.id === config.BOT_OWNER_ID) {
      if (text === '/cancel') {
        broadcastStates.delete(chat.id);
        await env.SESSIONS.delete('broadcast_job:current').catch(() => {});
        await sendMessage(chat.id, "❌ **ارسال پیام لغو شد**", {
          reply_to_message_id: message.message_id
        });
        return;
      }

      recordRequest(session);
  
      // Send broadcast
      const processingMsg = await sendMessage(chat.id, "⏳ **در حال آماده‌سازی لیست...**", {
        reply_to_message_id: message.message_id
      });
      
      try {
        const allUsers = await getAllUserStatistics(env);
        let targetUsers = allUsers;
  
        if (broadcastState.mode === 'vip') {
          targetUsers = allUsers.filter(u => u.vipStatus);
        } else if (broadcastState.mode === 'free') {
          targetUsers = allUsers.filter(u => !u.vipStatus);
        } else if (broadcastState.mode === 'specific' && broadcastState.userId) {
          targetUsers = allUsers.filter(u => u.userId === broadcastState.userId);
        }
  
        if (targetUsers.length === 0) {
          broadcastStates.delete(chat.id);
          await editMessageText(chat.id, processingMsg.message_id, "❌ هیچ کاربری یافت نشد");
          return;
        }
  
        const job: BroadcastJob = {
          id: `broadcast_${Date.now()}`,
          mode: broadcastState.mode,
          targetUserId: broadcastState.userId,
          message: text,
          userIds: targetUsers.map(u => u.userId),
          processedIndex: 0,
          sent: 0,
          failed: 0,
          totalUsers: targetUsers.length,
          adminChatId: chat.id,
          adminMessageId: processingMsg.message_id,
          createdAt: Date.now(),
          status: 'pending'
        };

        await env.SESSIONS.put('broadcast_job:current', JSON.stringify(job));
        broadcastStates.delete(chat.id);

        await editMessageText(chat.id, processingMsg.message_id,
          `📋 **پیام در صف ارسال قرار گرفت!**\n\n` +
          `👥 تعداد گیرندگان: **${targetUsers.length}** نفر\n` +
          `⏳ هر ۳۰ ثانیه **۲۰ نفر** پیام می‌گیرن\n` +
          `📊 زمان تقریبی: **${Math.ceil(targetUsers.length / 20) * 30} ثانیه**\n\n` +
          `🔄 در حال شروع اولین batch...`,
          {
            reply_markup: JSON.stringify({
              inline_keyboard: [[
                { text: "📊 وضعیت", callback_data: "broadcast_status" },
                { text: "🛑 لغو", callback_data: "broadcast_cancel" }
              ]]
            })
          }
        );

        /// شروع فوری اولین batch (بدون انتظار برای scheduled)
await processBroadcastBatch(env);

} catch (error) {
  logger.error("Broadcast job creation failed", error);
  broadcastStates.delete(chat.id);
  await editMessageText(chat.id, processingMsg.message_id, "❌ خطا در ایجاد job").catch(() => {});
}
return;
}

// Handle commands first
if (text.startsWith('/')) {
  const parts = text.split(' ');
  const rawCommand = parts[0].toLowerCase();
  const command = rawCommand.split('@')[0];
  const args = parts.slice(1);

  const mentionedBot = rawCommand.includes('@') ? rawCommand.split('@')[1] : null;
  if (mentionedBot && BOT_INFO?.username && 
      mentionedBot.toLowerCase() !== BOT_INFO.username.toLowerCase()) {
    return;
  }
  if (isGroup && text.startsWith('/') && !shouldRespondInGroup(message, session)) {
    return;
  }
  
    switch (command) {
  case '/start':
    await handleStartCommand(message, env);
    break;
  case '/new':
    if (isGroup) {
      const isAdminUser = from.id === config.BOT_OWNER_ID || await isUserAdmin(from.id, chat.id);
      if (!isAdminUser) {
        await sendMessage(chat.id, "🚫 فقط ادمین‌های گروه می‌توانند حافظه مدل را پاک کنند.", {
          reply_to_message_id: message.message_id
        });
        return;
      }
    }
    await handleNewCommand(message, env);
      break;
case '/model':
  if (isGroup) {
    const isAdminUser = from.id === config.BOT_OWNER_ID || await isUserAdmin(from.id, chat.id);
    if (!isAdminUser) {
      await sendMessage(chat.id, "🚫 فقط ادمین‌های گروه می‌توانند مدل را تغییر دهند.", {
        reply_to_message_id: message.message_id
      });
      return;
    }
  }
  await handleModelCommand(message, env);
  break;
case '/img':
  await handleImageGenerationCommand(message, args, env);
  break;
case '/search':
  if (args.length === 0) {
    const usage = t(session, 'search_usage');
    await sendMessage(chat.id, `${t(session, 'err_format')}\n\n${usage}`, { reply_to_message_id: message.message_id });
    return;
  }
  // ... ادامه کد search (که تا قبل از if (isGroup) است)

          const imageQuery = args.join(' ').trim();
          const searchTxt = TRANSLATIONS[session.language];
          const searchLang = session.language;
          if (imageQuery.length > 100) {
            await sendMessage(chat.id, searchTxt.search_long_query, { reply_to_message_id: message.message_id });
            return;
          }

          const searchMsg = await sendMessage(chat.id, 
            t(session, 'search_searching', { query: imageQuery }), 
            { reply_to_message_id: message.message_id }
          );

          try {
            const images = await searchPixabayImages(imageQuery, 5);
    
            await deleteMessage(chat.id, searchMsg.message_id);
            // ✅ ارسال txt به تابع برای استفاده در کپشن‌ها
            await sendImageResults(chat.id, message.message_id, images, imageQuery, {
              search_results: t(session, 'search_results'),
              search_no_results: t(session, 'search_no_results'),
              search_link_fallback: t(session, 'search_link_fallback'),
              search_failed: t(session, 'search_failed'),
              search_guide: t(session, 'search_guide')
            });            
            logger.info(`✅ Image search completed: ${images.length} images sent`);
    
          } catch (error) {
              const errorMsg = getRawError(error);
              let finalError;
              if (from.id === config.BOT_OWNER_ID) {
                  finalError = `Raw error: ${errorMsg}`;
              } else {
                  if (errorMsg === "NO_RESULTS") finalError = searchTxt.search_no_results;
                  else if (errorMsg.includes('quota') || errorMsg.includes('محدودیت')) {
                      finalError = searchLang === 'fa' ? 'محدودیت سرور جستجو.' : 'Search quota exceeded.';
                  } else {
                      finalError = errorMsg.substring(0, 100);
                  }
              }
              await editMessageText(chat.id, searchMsg.message_id, 
                  `${searchTxt.search_failed}\n\n${finalError}\n\n${searchTxt.search_guide}`
              );
          }
          break;
        case '/help':
          await handleHelpCommand(message, env);
          break;
        case '/resetfactory':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 دسترسی محدود", { reply_to_message_id: message.message_id });
            return;
          }
          // ارسال پیام تأیید
          const confirmKeyboard = {
            inline_keyboard: [
              [
                { text: "✅ بله، همه چیز را پاک کن", callback_data: "resetfactory_confirm" },
                { text: "❌ لغو", callback_data: "resetfactory_cancel" }
              ]
            ]
          };
          await sendMessage(chat.id, 
            "⚠️ **هشدار: ریست فکتوری کامل**\n\n" +
            "این عمل **تمام داده‌های ربات** (شامل سشن‌های کاربران، حافظه‌ها، تنظیمات VIP، کلیدهای مسدود، کش مدل‌ها و ...) را برای همیشه حذف می‌کند.\n\n" +
            "آیا مطمئن هستید؟ این عمل غیرقابل بازگشت است!",
            { reply_markup: JSON.stringify(confirmKeyboard), reply_to_message_id: message.message_id }
          );
          break;
        case '/language':
          if (isGroup) {
            const isAdminUser = from.id === config.BOT_OWNER_ID || await isUserAdmin(from.id, chat.id);
            if (!isAdminUser) {
              await sendMessage(chat.id, "🚫 فقط ادمین‌های گروه می‌توانند زبان مدل را تغییر دهند.", {
                reply_to_message_id: message.message_id
              });
              return;
            }
          }
          case '/agent':
  const agentQuery = args.join(' ').trim();
  if (!agentQuery) {
    await sendMessage(chat.id, "❌ متنی بنویسید، مثال:\n`/agent یک تصویر از گربه در فضا بساز`", { reply_to_message_id: message.message_id });
    return;
  }
  
  const thinkingMsg = await sendMessage(chat.id, "🤖 **حالت Agent فعال شد**\nدر حال تصمیم‌گیری...", { reply_to_message_id: message.message_id });
  
  const toolList = Object.entries(AGENT_TOOLS).map(([n, t]) => `- ${n}: ${t.desc} (پارامتر: ${JSON.stringify(t.params)})`).join('\n');
  const agentSystemPrompt = `تو یک دستیار هوشمند هستی که می‌توانی از ابزارها استفاده کنی. ابزارها:\n${toolList}\n\nاگر نیاز به ابزار داری، فقط یک JSON برگردان مثل:\n{"tool": "generate_image", "args": {"prompt": "توضیح فارسی"}}\nدر غیر این صورت پاسخ عادی بده.`;
  
  let responseText = "";
  try {
    const userParts: Part[] = [{ text: agentQuery }];
    responseText = await callGeminiAPI(userParts, config.GEMINI_MODEL, config.GEMINI_KEYS[0], [{ role: "user", parts: [{ text: agentSystemPrompt }] }]);
  } catch(e) { responseText = "خطا در ارتباط با مدل"; }
  
  const toolCall = extractToolJSON(responseText);
  if (toolCall?.tool && AGENT_TOOLS[toolCall.tool]) {
    await editMessageText(chat.id, thinkingMsg.message_id, `🔧 استفاده از ابزار: ${toolCall.tool}...`);
    const result = await executeToolFromAgent(toolCall.tool, toolCall.args, chat.id, message.message_id, env);
    await editMessageText(chat.id, thinkingMsg.message_id, `✅ ابزار اجرا شد.\n${result}\n\n🤖 پاسخ نهایی:`);
  } else {
    await editMessageText(chat.id, thinkingMsg.message_id, responseText);
  }
  break;

        case '/rebuild':
          if (from.id !== config.BOT_OWNER_ID) {
             await sendMessage(chat.id, "🚫 دسترسی محدود", {
               reply_to_message_id: message.message_id
            });
            return;
          }
  
          await handleRebuildDatabaseCommand(message, env);
          break;
          
        case '/log':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 دسترسی محدود", {
              reply_to_message_id: message.message_id
            });
            return;
          }
  
          await handleLogCommand(message, env);
          break;
          
        case '/keys':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 **دسترسی محدود**", { reply_to_message_id: message.message_id });
            return;
          }
          await handleKeysCommand(chat.id, message.message_id, env, false);
          break;
          
        case '/setvip':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 **دسترسی محدود**\n\nاین دستور فقط برای مالک ربات است.", {
              reply_to_message_id: message.message_id
            });
            return;
          }
  
          if (chat.type === "group" || chat.type === "supergroup") {
            const groupSession = await getOrCreateSession(chat, from, env);
            groupSession.vipStatus = true;
            await saveSessionWithLock(groupSession, env, true);
            
            await setGroupVIP(chat.id, true, env);
            await sendMessage(chat.id, "✅ این گروه VIP شد! 👑", {
              reply_to_message_id: message.message_id
            });
          } else {
            await sendMessage(chat.id, "⚠️ **فقط برای گروه‌ها**\n\nاین دستور تنها در گروه‌ها برای فعال‌سازی VIP گروه کاربرد دارد.", {
              reply_to_message_id: message.message_id
            });
          }
          break;
          
        case '/unsetvip':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 **دسترسی محدود**\n\nاین دستور فقط برای مالک ربات است.", {
              reply_to_message_id: message.message_id
            });
            return;
          }
  
          if (chat.type === "group" || chat.type === "supergroup") {
            // 1. آپدیت سشن اصلی گروه
            const groupSession = await getOrCreateSession(chat, from, env);
            groupSession.vipStatus = false;
            await saveSessionWithLock(groupSession, env, true); 

            // 2. آپدیت کلید مجزا 
            await setGroupVIP(chat.id, false, env);

            await sendMessage(chat.id, "❌ این گروه از حالت VIP خارج شد!", {
              reply_to_message_id: message.message_id
            });
          } else {
            await sendMessage(chat.id, "⚠️ **فقط برای گروه‌ها**\n\nاین دستور تنها در گروه‌ها برای غیرفعال‌سازی VIP گروه کاربرد دارد.", {
              reply_to_message_id: message.message_id
            });
          }
          break;

        case '/del': {
          // فقط BOT_OWNER
          if (from.id !== config.BOT_OWNER_ID) return;
  
          // باید ریپلای باشه
          if (!message.reply_to_message) {
            const warnMsg = await sendMessage(chat.id, 
              '⚠️ روی پیامی که میخوای حذف کنی ریپلای بزن.', 
              { reply_to_message_id: message.message_id }
            );
            // پیام خودمون رو هم بعد ۳ ثانیه پاک کن
            setTimeout(() => {
              deleteMessage(chat.id, message.message_id).catch(() => {});
              deleteMessage(chat.id, warnMsg.message_id).catch(() => {});
            }, 3000);
            return;
          }
  
          try {
            await deleteMessage(chat.id, message.reply_to_message.message_id);
            await deleteMessage(chat.id, message.message_id);
           } catch (error) {
            const errMsg = await sendMessage(chat.id,
              '❌ نتونستم حذف کنم. مطمئن شو ربات ادمین گروهه.',
              { reply_to_message_id: message.message_id }
            );
            setTimeout(() => {
              deleteMessage(chat.id, message.message_id).catch(() => {});
              deleteMessage(chat.id, errMsg.message_id).catch(() => {});
            }, 3000);
          }
          break;
        }

        case '/remove': {
          // فقط BOT_OWNER
          if (from.id !== config.BOT_OWNER_ID) return;
  
          if (!message.reply_to_message?.from) {
            const warnMsg = await sendMessage(chat.id, 
              '⚠️ روی پیام کسی که میخوای حذف کنی ریپلای بزن.', 
              { reply_to_message_id: message.message_id }
            );
            setTimeout(() => {
              deleteMessage(chat.id, message.message_id).catch(() => {});
              deleteMessage(chat.id, warnMsg.message_id).catch(() => {});
            }, 3000);
            return;
          }
  
          const targetUser = message.reply_to_message.from;
  
          // نمیشه خودت رو یا ادمین رو حذف کنی
          if (targetUser.id === config.BOT_OWNER_ID || targetUser.is_bot) {
            await deleteMessage(chat.id, message.message_id);
            return;
          }
  
          try {
            // کیک کردن از گروه
            await callTelegramAPI('banChatMember', {
              chat_id: chat.id,
              user_id: targetUser.id
            });
            // ✅ آنبن فوری = کیک (میتونه برگرده ولی از گروه خارج شده)
            await callTelegramAPI('unbanChatMember', {
              chat_id: chat.id,
              user_id: targetUser.id,
              only_if_banned: true
            });
    
            const removeMsg = await sendMessage(chat.id, 
              `✅ **${targetUser.first_name}** از گروه حذف شد.`
            );
    
            // دستور و پیام ریپلای رو پاک کن
            await deleteMessage(chat.id, message.message_id);
            await deleteMessage(chat.id, message.reply_to_message.message_id).catch(() => {});
    
            setTimeout(() => {
              deleteMessage(chat.id, removeMsg.message_id).catch(() => {});
            }, 4000);
    
          } catch (error) {
            const errMsg = await sendMessage(chat.id, 
              '❌ نتونستم حذف کنم. مطمئن شو ربات ادمین گروهه.',
              { reply_to_message_id: message.message_id }
            );
            setTimeout(() => {
              deleteMessage(chat.id, message.message_id).catch(() => {});
              deleteMessage(chat.id, errMsg.message_id).catch(() => {});
            }, 4000);
          }
          break;
        }

        case '/ban': {
          // فقط BOT_OWNER
          if (from.id !== config.BOT_OWNER_ID) return;
  
          if (!message.reply_to_message?.from) {
            const warnMsg = await sendMessage(chat.id, 
              '⚠️ روی پیام کسی که میخوای بن کنی ریپلای بزن.\n\nفرمت: `/ban [ثانیه]`\nمثال: `/ban 3600` (یک ساعت)', 
              { reply_to_message_id: message.message_id }
            );
            setTimeout(() => {
              deleteMessage(chat.id, message.message_id).catch(() => {});
              deleteMessage(chat.id, warnMsg.message_id).catch(() => {});
            }, 5000);
            return;
          }
  
          const banTarget = message.reply_to_message.from;
  
          if (banTarget.id === config.BOT_OWNER_ID || banTarget.is_bot) {
            await deleteMessage(chat.id, message.message_id);
            return;
          }
  
          // مدت بن (پیش‌فرض ۱ ساعت)
          const banSeconds = args[0] ? parseInt(args[0]) : 3600;
          const validSeconds = isNaN(banSeconds) || banSeconds < 30 ? 3600 : banSeconds;
          const untilDate = Math.floor(Date.now() / 1000) + validSeconds;
  
          // فرمت زیبای زمان
          const formatDuration = (secs: number): string => {
            if (secs < 60) return `${secs} ثانیه`;
            if (secs < 3600) return `${Math.floor(secs / 60)} دقیقه`;
            if (secs < 86400) return `${Math.floor(secs / 3600)} ساعت`;
            return `${Math.floor(secs / 86400)} روز`;
          };
  
          try {
            // ثبت در KV که این یوزر بن هست (برای پاک کردن پیامها)
            await env.SESSIONS.put(
              `banned:${chat.id}:${banTarget.id}`, 
              JSON.stringify({ 
                until: untilDate * 1000, 
                chatId: chat.id,
                reason: 'banned by admin'
              })
            );
    
              // بن در تلگرام 
await callTelegramAPI('banChatMember', {
  chat_id: chat.id,
  user_id: banTarget.id,
  until_date: untilDate
});
    
            const banMsg = await sendMessage(chat.id, 
              `🔨 **${banTarget.first_name}** بن شد!\n⏱ مدت: **${formatDuration(validSeconds)}**`
            );
    
            // پاک کردن دستور و پیام ریپلای
            await deleteMessage(chat.id, message.message_id);
            await deleteMessage(chat.id, message.reply_to_message.message_id).catch(() => {});
    
            setTimeout(() => {
              deleteMessage(chat.id, banMsg.message_id).catch(() => {});
            }, 5000);
    
          } catch (error) {
            const errMsg = await sendMessage(chat.id, 
              '❌ نتونستم بن کنم. مطمئن شو ربات ادمین گروهه.',
              { reply_to_message_id: message.message_id }
            );
            setTimeout(() => {
              deleteMessage(chat.id, message.message_id).catch(() => {});
              deleteMessage(chat.id, errMsg.message_id).catch(() => {});
            }, 4000);
          }
          break;
        }
          
        case '/dbclean':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 دسترسی محدود", {
              reply_to_message_id: message.message_id
            });
            return;
          }
  
          const cleanMsg = await sendMessage(chat.id, "🧹 در حال پاکسازی دیتابیس...", {
            reply_to_message_id: message.message_id
          });
  
          try {
            await cleanupSessions(env);
            await editMessageText(chat.id, cleanMsg.message_id, 
              "✅ پاکسازی انجام شد!\n\n📊 برای جزئیات /dbstats بزنید"
            );
          } catch (error) {
            await editMessageText(chat.id, cleanMsg.message_id, 
              "❌ خطا در پاکسازی"
            );
          }
          break;

        case '/dbstats':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 دسترسی محدود", {
              reply_to_message_id: message.message_id
            });
            return;
          }
  
          await sendDatabaseStats(chat.id, message.message_id, env);
          break;

        case '/dbdelete':
          if (from.id !== config.BOT_OWNER_ID) {
            await sendMessage(chat.id, "🚫 دسترسی محدود", {
              reply_to_message_id: message.message_id
            });
            return;
          }
  
          if (args.length === 0) {
            await sendMessage(chat.id, 
              "❌ فرمت: `/dbdelete [user_id]`\n\nمثال: `/dbdelete 123456789`",
              { reply_to_message_id: message.message_id }
            );
            return;
          }
  
          const targetId = parseInt(args[0]);
          if (isNaN(targetId)) {
            await sendMessage(chat.id, "❌ آیدی نامعتبر", {
              reply_to_message_id: message.message_id
            });
            return;
          }
  
          await deleteUserSession(chat.id, message.message_id, targetId, env);
          break;
          
        default:
          if (chat.type === "private") {
            await sendMessage(chat.id, "❓ **دستور ناشناخته**\n\nاز /help برای دیدن لیست دستورات استفاده کنید.", { 
              reply_to_message_id: message.message_id 
            });
          }
      }
      return;
    }
    
    if (isGroup) {
  const isBlocked = await isUserBlocked(from.id, env);
  if (isBlocked && from.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, 
      "🚫 **دسترسی مسدود**\n\nحساب شما مسدود است.\n\n📞 برای رفع مسدودیت با @Hamid_Ai_pro تماس بگیرید.",
      { reply_to_message_id: message.message_id }
    );
    return;
  }
}
    
    const bucket = getUserBucket(from.id, session.vipStatus);
    if (!bucket.tryConsume()) {
      const available = bucket.availableTokens();
      await sendMessage(chat.id, 
        `⏳ **لطفاً کمی صبر کنید**\n\nدرخواست‌های شما: ${available} باقیمانده`, 
        { reply_to_message_id: message.message_id }
      );
      return;
    }
    
    recordRequest(session);
    const limitCheck = checkDailyLimit(session, 'message');
    if (!limitCheck.allowed) {
      await sendMessage(chat.id, limitCheck.message!, {
        reply_to_message_id: message.message_id,
        reply_markup: JSON.stringify(getVIPUpgradeKeyboard())
      });
      return;
    }
    
// تعریف تابع در سطح بالا (قبل از هر چیز دیگر)
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

  if (isGroup && !shouldRespondInGroup(message, session)) return;

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
    const limitCheck = checkDailyLimit(session, 'message');
    if (!limitCheck.allowed) {
      await sendMessage(chat.id, limitCheck.message!, {
        reply_to_message_id: message.message_id,
        reply_markup: JSON.stringify(getVIPUpgradeKeyboard())
      });
      return;
    }

    incrementDailyUsage(session, 'message');
    await processAIRequest(
      session, from,
      [{ text: sanitizeInput(text) }],
      message, env, requestId
    );
  } finally {
    releaseRequest(chat.id, requestId);
  }
}


// ==========================================
// شروع توابع مستقل جدید
// ==========================================

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

    // ============================================
// 📦 مرحله 1: همه توابع (بدون export)
// ============================================

async function ttsHandler(msgText: string, chatId: number, replyToId: number, env: Env): Promise<boolean> {
  // ... کد
}

async function processAIRequest(session: ChatSession, user: User, userParts: Part[], originalMessage: Message, env: Env, requestId?: string, sendAsVoice: boolean = false) {
  // ... کد
}

async function _processAIRequestInternal(session: ChatSession, user: User, userParts: Part[], originalMessage: Message, env: Env, requestId?: string, sendAsVoice: boolean = false) {
  // ... کد
}

async function sendDatabaseStats(chatId: number, replyTo: number, env: Env): Promise<void> {
  // ... کد
}

// ... بقیه توابع (حدود 80 تابع دیگه)

// ============================================
// 📦 مرحله 1: همه توابع (بدون export)
// ============================================

async function ttsHandler(...) { ... }

// ✅ فقط یک بار processAIRequest
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

async function _processAIRequestInternal(...) { ... }
async function sendDatabaseStats(...) { ... }

// ❌ این رو پاک کن (تکراری):
// async function processAIRequest(...) { ... }

// ============================================
// 📦 مرحله 2: export default (آخر فایل)
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ...
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // ...
  }
};




// ✅ مدیریت اصلاح شده حافظه گروهی
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
    // ✅ فقط فراخوانی تابع داخلی
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
  }
}

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
  
  // 🌟 ارسال آنی و بدون تاخیر پیام لودینگ (فقط در چت شخصی برای جلوگیری از شلوغی گروه)
  if (!isGroup) {
    const lang = session.language || 'fa';
    // انتخاب تصادفی یک ایموجی جذاب برای حس زنده بودن بیشتر
    const emoji =['💭', '🤔', '✨', '⚡', '⏳'][Math.floor(Math.random() * 5)];
    const loadingText = lang === 'fa' ? `${emoji} اممم...` : `${emoji} Hmmm...`;
    
    // ارسال فوری (Instant)
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
        // اگه edit نشد (مثلاً پیام خیلی قدیمیه)، یه پیام جدید بفرست
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

// ═══════════════════════════════════════════════════
// ⚡ ULTRA-FAST RESPONSE (Optimized for Cloudflare)
// ═══════════════════════════════════════════════════
const TYPING_EMOJIS = ['💭', '🤔', '✨', '⚡', '🌟'];

function getRandomTypingEmoji() {
  return TYPING_EMOJIS[Math.floor(Math.random() * TYPING_EMOJIS.length)];
}

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

  // 🌟 سیستم چاپ متن مشابه ریل‌تایم (Fake Streaming) 🌟
  // فقط برای متن‌های نسبتا طولانی که ارزش تایپ شدن دارند
  if (firstChunk.length > 200) {
    // برای سرعت بالا و جلوگیری از لیمیت بله، متن را در ۲ مرحله سریع پیش‌چاپ می‌کنیم
    const step1 = firstChunk.substring(0, Math.floor(firstChunk.length * 0.40));
    const step2 = firstChunk.substring(0, Math.floor(firstChunk.length * 0.75));

    // تابع کمکی برای حذف موقت مارک‌داون تا در زمان چاپ، ارور بله نگیریم
    // علامت ▒ نشانگر در حال تایپ بودن است
    const cleanTyping = (text: string) => text.replace(/[*_`\[\]]/g, '') + " ▒";

    // مرحله اول چاپ (40%) - بدون فرمت مارک‌داون برای جلوگیری از ارور
    await editMessageText(chatId, msgId, cleanTyping(step1), { parse_mode: undefined }).catch(() => {});
    await new Promise(r => setTimeout(r, 250)); // تاخیر بسیار کوتاه برای حفظ سرعت

    // مرحله دوم چاپ (75%)
    await editMessageText(chatId, msgId, cleanTyping(step2), { parse_mode: undefined }).catch(() => {});
    await new Promise(r => setTimeout(r, 250));
  }

  // ⚡ چاپ نهایی (100%) با فرمت کامل و زیبای مارک‌داون
  await editMessageText(chatId, msgId, sanitizeMarkdown(firstChunk), {
    parse_mode: 'Markdown'
  }).catch(async () => {
    // فال‌بک در صورت خرابی مارک‌داون
    await editMessageText(chatId, msgId!, sanitizePlainText(firstChunk), { parse_mode: undefined }).catch(() => {});
  });

  // ارسال بقیه پیام (اگر طولانی‌تر از ۴۰۰۰ کاراکتر بود)
  for (let i = 1; i < chunks.length; i++) {
    await new Promise(r => setTimeout(r, 300)); // تاخیر کوتاه برای ارسال پیام‌های چندتیکه
    await sendMessage(chatId, sanitizeMarkdown(chunks[i]), { parse_mode: 'Markdown' }).catch(() => {});
  }
}

function sanitizePlainText(text: string): string {
  return text.replace(/>]/g, '');
}

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
        logger.warn(`❌ Key ${keyIndex + 1} hit quota/rate limit (testing, not disabling)`);
        // disableApiKey(apiKey, env);  // کاملاً غیرفعال برای تست
      } 
      else if (errorMsg.includes('blocked') || errorMsg.includes('safety')) {
        errors.blocked++;
        logger.warn(`⚠️ Safety block on Key ${keyIndex + 1}`);
        // برای تست، اجازه بده بقیه کلیدها هم امتحان شوند
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
  
  // پیام خطای ساده برای تست
  if (errors.quota === totalKeys) {
    throw new Error("⏳ همه کلیدها محدودیت مصرف دارند. لطفاً مدل را تغییر دهید.");
  }
  if (errors.blocked > 0) {
    throw new Error("🛡️ محتوای درخواست مسدود شد. متن را تغییر دهید.");
  }
  throw new Error(`❌ خطا در نوا: هر ${totalKeys} کلید ناموفق بودند. لطفاً /model بزنید.`);
}

// ✅ تابع پیام خطای ساده و کاربرپسند
function formatSimpleError(errors: { [key: string]: number }, engineName: string, maxAttempts: number): string {
  // اگه همه محدودیت بودن
  if (errors.quota >= maxAttempts * 0.7) {
    return `⏳ **${engineName} موقتاً در دسترس نیست**\n\n` +
           `📊 سهمیه API تمام شده.\n` +
           `💡 مدل رو با /model عوض کن.`;
  }
  
  // اگه timeout بود
  if (errors.timeout >= maxAttempts * 0.5) {
    return `⏱️ **${engineName} دیر جواب داد**\n\n` +
           `🔄 دوباره امتحان کن.`;
  }
  
  // اگه محتوا مسدود شد
  if (errors.blocked > 0) {
    return `🛡️ **محتوا مسدود شد**\n\n` +
           `متن رو تغییر بده و دوباره بفرست.`;
  }
  
  // اگه مشکل احراز هویت بود
if (errors.auth > 0) {
  return `🔑 **مشکل API Key**\n\n` +
         `با @Hamid_Ai_pro تماس بگیر.`;
}
  
  // اگه مشکل شبکه بود
  if (errors.network > 0) {
    return `🌐 **مشکل اتصال**\n\n` +
           `اینترنت رو چک کن و دوباره امتحان کن.`;
  }
  
  // خطای عمومی
  return `❌ **خطا در ${engineName}**\n\n` +
         `🔄 دوباره امتحان کن یا مدل رو عوض کن.`;
}

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
    engine.history = [{ role: "assistant", parts: [{ text: currentPrompt }], timestamp: Date.now() }];
  }

  const historyToUse = (isGroup && userHistory) ? [engine.history[0], ...userHistory] : engine.history;

  const totalKeys = config.SAMBANOVA_KEYS.length;
  const totalModels = config.SAMBANOVA_MODELS.length;
  const errors = { quota: 0, blocked: 0, timeout: 0, auth: 0, network: 0, unknown: 0 };

  const totalKeys = config.SAMBANOVA_KEYS.length;
const totalModels = config.SAMBANOVA_MODELS.length;
const totalAttempts = totalKeys * 2;  // ✅ این خط رو اضافه کن
const errors = { quota: 0, blocked: 0, timeout: 0, auth: 0, network: 0, unknown: 0 };

for (let attempt = 0; attempt < totalAttempts; attempt++) {
  // ... کدهای باقی‌مونده
}

    try {
      const response = await withTimeout(
        callSambanovaAPI(text, historyToUse, model, apiKey),
        20000,
        "⏱️ زمان پردازش تمام شد"
      );
      engine.apiKeyIndex = keyIndex;
      engine.modelIndex = modelIndex;
      engine.consecutiveErrors = 0;
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
  }
  engine.consecutiveErrors++;
throw new Error(`❌ خطا در لونا: تمام کلیدها ناموفق بودند`);
}

if (attempt < totalAttempts - 1) {
  await new Promise(resolve =>
    setTimeout(resolve, 1000 * (Math.floor(attempt / maxAttemptsPerKey) + 1))
  );
}
  
  engine.consecutiveErrors++;
  throw new Error(formatSimpleError(errors, "لونا", totalAttempts));
  
  engine.consecutiveErrors++;
  throw new Error(formatSimpleError(errors, "لونا", totalAttempts));

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

  // پاکسازی قطعی و سریع
  // اگر طول تاریخچه از HISTORY_LIMIT بیشتر شد، قدیمی ترین پیام ها (بعد از پرامپت سیستم) را حذف کن
  if (history.length > config.HISTORY_LIMIT) {
    // از ایندکس 1 (برای حفظ دستور سیستم در ایندکس 0) به تعداد اضافه پاک کن
    const excess = history.length - config.HISTORY_LIMIT;
    history.splice(1, excess);
  }
}

async function checkMaintenanceMode(env: Env, userId: number): Promise<{ blocked: boolean; message?: string }> {
  // مالک همیشه میتونه استفاده کنه
  if (userId === config.BOT_OWNER_ID) {
    return { blocked: false };
  }
  
  const maintenanceMode = await isMaintenanceMode(env);
  
  if (maintenanceMode) {
    return {
      blocked: true,
      message: "🛠️ **در حال بروزرسانی و تعمیرات**\n\nربات در حال به‌روزرسانی است. لطفاً کمی بعد مجدداً تلاش کنید.\n\n⏰ زمان تقریبی: 10-30 دقیقه"
    };
  }
  
  return { blocked: false };
}

function cleanupHistory(history: HistoryItem[]): void {
  const MAX_TOKENS_ESTIMATE = 15000; // حداکثر کاراکتر تخمینی
  const MIN_KEEP = 3; // حداقل تعداد پیام (به جز پیام سیستم) که باید حفظ شود

  // اگر تاریخچه به اندازه کافی کوتاه است، کاری نکن
  if (history.length <= config.HISTORY_LIMIT + 1) { // +1 برای system message
    let totalChars = 0;
    for (const item of history) {
      totalChars += item.parts.reduce((sum, part) => sum + (part.text?.length || 0), 0);
    }
    if (totalChars <= MAX_TOKENS_ESTIMATE) return;
  }

  // همیشه اولین آیتم (سیستم پرامپت) را حفظ کن
  const system = history[0];
  
  // از انتها شروع کن و تا زمانی که طول و سایز مجاز شود، از ابتدای بخش مکالمه حذف کن
  // اما حداقل MIN_KEEP پیام آخر را نگه دار
  while (history.length - 1 > Math.max(config.HISTORY_LIMIT, MIN_KEEP)) {
    // حذف دومین آیتم (اولین آیتم مکالمه بعد از سیستم پرامپت)
    const removed = history.splice(1, 1)[0];
    // آپدیت سایز (اختیاری، چون اگر بر اساس طول پاک می‌کنیم، نیازی نیست)
  }

  // اگر باز هم سایز بیش از حد بود، دوتا دوتا از ابتدای مکالمه حذف کن
  let totalChars = history.reduce((acc, item) => 
    acc + item.parts.reduce((sum, p) => sum + (p.text?.length || 0), 0), 0);
  
  while (totalChars > MAX_TOKENS_ESTIMATE && history.length > 2) {
    const removed = history.splice(1, 1)[0];
    totalChars -= removed.parts.reduce((sum, p) => sum + (p.text?.length || 0), 0);
  }
}

function getStartKeyboard(isGroup: boolean, lang: 'fa' | 'en') {
  if (isGroup) {
    return {
      inline_keyboard: [[
        createInlineButton(
          lang === 'fa' ? '⚙️ تنظیمات گروه' : '⚙️ Group Settings',
          'group_settings'
        )
      ]]
    };
  }
  return {
    inline_keyboard: [
      [
        createInlineButton(lang === 'fa' ? '🤖 انتخاب مدل' : '🤖 Select Model', 'model_settings'),
        createInlineButton(lang === 'fa' ? '❓ راهنما'      : '❓ Help',          'open_help'     ),
      ],
      [ // ردیف جدید برای شخصیت
        createInlineButton(lang === 'fa' ? '🎭 تغییر شخصیت' : '🎭 Change Personality', 'personality_menu')
      ]
    ]
  };
}

// --- Handle Model Switch ---
async function handleModelSwitch(session: ChatSession, engine: AIEngine, cb: CallbackQuery, env: Env): Promise<void> {
  const engineInfo = ENGINE_CONFIG[engine];
  const engName = getEngineName(engine, session.language || 'fa');
  
  if (!engineInfo.available()) {
    await answerCallbackQuery(cb.id, `مدل ${engName} در دسترس نیست`, true);
    return;
  }

  if (session.activeEngine === engine) {
    await answerCallbackQuery(cb.id, `✅ ${engName} از قبل فعال است`, false);
    return;
  }
  
  session.activeEngine = engine;
  
  try {
    await saveSessionWithLock(session, env, true);
    // پس از ذخیره، کش را دستی به‌روز می‌کنیم
    sessionCache.set(`session:${session.id}`, session, 3 * 60 * 1000);
  } catch (err) {
    logger.error(`Failed to save session after engine switch: ${err}`);
    await answerCallbackQuery(cb.id, "❌ خطا در ذخیره تنظیمات، دوباره تلاش کنید", true);
    return;
  }
  
  await answerCallbackQuery(cb.id, `✅ تغییر به ${getEngineName(engine, session.language)}`, false);
  await updateModelSelection(cb.message!.chat.id, cb.message!.message_id, session);
  logger.info(`✅ Engine switched to ${engine} and cache updated for session ${session.id}`);
}

async function handleGroupModeSwitch(session: ChatSession, mode: string, cb: CallbackQuery, env: Env): Promise<void> {
  const modes = {
    'always': { mode: 'always' as const, label: 'همیشه پاسخ بده' },
    'mention': { mode: 'mention_only' as const, label: 'فقط منشن' },
    'smart': { mode: 'smart' as const, label: 'هوشمند' }
  };
  
  const modeInfo = modes[mode];
  session.settings.groupResponseMode = modeInfo.mode;
  await saveSessionWithLock(session, env, true);
  await answerCallbackQuery(cb.id, `✅ حالت: ${modeInfo.label}`, false);
  await updateGroupSettings(cb.message!.chat.id, cb.message!.message_id, session);
}

// --- SECTION: ENHANCED CALLBACK QUERY HANDLING ---
async function handleCallbackQuery(cb: CallbackQuery, env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    answerCallbackQuery(cb.id).catch(() => {});
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

// ========== مدیریت کالبک‌های گروه (اولویت اول) ==========
// مدیریت کالبک‌های گروه (قبل از هر چیز دیگر)
if (data.startsWith("grp_") || data === "groups_refresh" || data.startsWith("leave_grp_")) {
  await handleGroupsCallback(cb, env);
  return;
}
// =====================================================

if (!data.startsWith('model_unavailable')) { 
  await answerCallbackQuery(cb.id).catch(() => {}); 
}

if (data.startsWith('set_lang_')) {
  const lang = data.replace('set_lang_', '') as 'fa' | 'en';

  const session = await getOrCreateSession(chat, user, env);
  session.language = lang;
  session.settings.languageSet = true;

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

  // ادامه کدهای قبلی (ذخیره سشن و ...) که خودت داری

      await saveSessionWithLock(session, env, true);
  
      // ✅ اضافه کردن این بخش
      if (chat.type === "private") {
        await refreshUserCommands(chat.id, session);
      }
  
      const successMsg = lang === 'fa' ? 
        '✅ زبان به **فارسی** تغییر یافت.\n\nتمام پرامپت‌ها بروز شدند.' : 
        '✅ Language changed to **English**.\n\nAll prompts have been updated.';

      await answerCallbackQuery(cb.id, successMsg.substring(0, 200), false);

      const isGroup = chat.type === "group" || chat.type === "supergroup";
      const welcomeText = t(session, isGroup ? 'welcome_group' : 'welcome_private', { name: user.first_name });

      const txt = lang === 'fa' ? TRANSLATIONS.fa : TRANSLATIONS.en;
      const keyboard = { 
        inline_keyboard: [ 
          isGroup 
            ? [{ text: txt.btn_settings, callback_data: "group_settings" }]
            : [{ text: txt.btn_select_model, callback_data: "model_settings" }],
          [{ text: txt.btn_help, callback_data: "open_help" }] 
        ]
      };

      await editMessageText(chat.id, cb.message.message_id, welcomeText, {
        reply_markup: JSON.stringify(validateKeyboard(keyboard))
      });
  
      return;
    }

    if (data.startsWith('admin_view_memory_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
  
      const targetUserId = parseInt(data.replace('admin_view_memory_', ''));
      await answerCallbackQuery(cb.id, "⏳ در حال بارگذاری...", false);
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

        // ✅ ساخت فایل متنی کامل
        let memoryText = `🧠 حافظه کامل کاربر: ${userName}\n`;
        memoryText += `🆔 User ID: ${targetUserId}\n`;
        memoryText += `📅 تاریخ: ${new Date().toLocaleString('fa-IR')}\n`;
        memoryText += `${'='.repeat(60)}\n\n`;
    
        // ✅ اطلاعات کلی
        memoryText += `📊 آمار کلی:\n`;
        memoryText += `• کل پیام‌ها: ${userSession.messageCount}\n`;
        memoryText += `• موتور فعال: ${getEngineName(userSession.activeEngine, 'fa')}\n`;
        memoryText += `• آخرین فعالیت: ${formatSafeDate(userSession.lastSeen, 'full')}\n`;
        memoryText += `• زبان: ${userSession.language === 'fa' ? 'فارسی' : 'انگلیسی'}\n\n`;

        // ✅ تاریخچه هر موتور
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

        // ✅ ارسال فایل
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

// ✅ اینجا تابع جدید رو اضافه کن
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

    if (!data.startsWith('admin_') && !data.startsWith('log_') && !data.startsWith('db_')) {
      const maintenanceCheck = await checkMaintenanceMode(env, user.id);
      if (maintenanceCheck.blocked) {
        await answerCallbackQuery(cb.id, "🛠️ ربات در حال تعمیرات است", true);
        return;
      }
    }

    // ✅ حالا session رو برای بقیه موارد بگیر
    let session: ChatSession | undefined;
    
    // فقط برای callback هایی که نیاز به session دارن
    const needsSession = [
      'set_model_', 'model_settings', 'active_model_settings', 'custom_prompt_menu',
      'reset_prompt_', 'group_settings', 'group_mode_', 'toggle_typing', 'show_prompts',
      'bot_status', 'open_help', 'close_help', 'show_model_list_', 'select_model_',
      'model_page_', 'refresh_models_', 'sambanova_model_', 'pollinations_model_'
    ];
    
    if (needsSession.some(prefix => data.startsWith(prefix)) || 
        ['bot_status', 'open_help', 'close_help', 'show_prompts', 'toggle_typing'].includes(data)) {
      session = await getOrCreateSession(chat, user, env);
    }
    
    if (data.length > 100) {
      logger.warn(`Suspicious callback data length: ${data.length} from user ${user.id}`);
      await answerCallbackQuery(cb.id, "❌ درخواست نامعتبر", true);
      return;
    }

    if (data === 'admin_refresh_keys') {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }
      // این خط به بله میگوید دکمه فشرده شد و لودینگ بالای پیام را برمیدارد
      await answerCallbackQuery(cb.id, "🔄 در حال شروع تست جامع...", false); 
      
      // فراخوانی تابع جدید برای تست مجدد (isEdit را true می‌فرستیم تا همان پیام آپدیت شود)
      await handleKeysCommand(chat.id, cb.message!.message_id, env, true);
      return;
    }

    if (data.startsWith('log_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }

      if (data === 'log_clear') {
        recentLogs.length = 0;
        await answerCallbackQuery(cb.id, "✅ لاگ‌ها پاک شدند", false);
        await deleteMessage(chat.id, cb.message!.message_id);
        return;
      }

      if (data === 'log_download') {
        if (recentLogs.length === 0) {
          await answerCallbackQuery(cb.id, "📭 لاگی برای دانلود وجود ندارد.", true);
          return;
        }
        await answerCallbackQuery(cb.id, "📥 در حال آماده‌سازی فایل...", false);
        
        const logText = recentLogs.map(l => 
          `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${l.message}\n${l.context ? JSON.stringify(l.context, null, 2) : ''}\n`
        ).join('\n');
    
        const blob = new Blob([logText], { type: "text/plain; charset=utf-8" });
        const formData = new FormData();
        formData.append("chat_id", chat.id.toString());
        formData.append("document", blob, `nova_logs_${Date.now()}.txt`);
    
        await fetchWithTimeout(`${API_URL}/sendDocument`, { method: "POST", body: formData });
        return;
      }

      if (data === 'log_refresh' || data === 'log_errors' || data === 'log_warnings') {
        if (recentLogs.length === 0) {
          await answerCallbackQuery(cb.id, "📭 در نشست فعلی سرور هیچ لاگی ثبت نشده است.", true);
          return;
        }

        let text = `📊 **لاگ‌های زنده سرور**\n\n`;
        let targetLogs = recentLogs;

        if (data === 'log_errors') targetLogs = recentLogs.filter(l => l.level === 'error');
        if (data === 'log_warnings') targetLogs = recentLogs.filter(l => l.level === 'warn');

        if (targetLogs.length === 0) {
          await answerCallbackQuery(cb.id, `در این دسته‌بندی لاگی وجود ندارد.`, true);
          return;
        }

        // نمایش 15 لاگ آخر
        targetLogs.slice(-15).forEach(log => {
          const time = new Date(log.timestamp).toLocaleTimeString('fa-IR');
          const icon = log.level === 'error' ? '🔴' : log.level === 'warn' ? '🟡' : '??';
          text += `${icon} \`${time}\`\n${log.message.substring(0, 100)}\n\n`;
        });

        const keyboard = {
          inline_keyboard:[[
              { text: "🔴 خطاها", callback_data: "log_errors" },
              { text: "🟡 هشدارها", callback_data: "log_warnings" },
              { text: "🟢 همه", callback_data: "log_refresh" }
            ],[
              { text: "📥 دانلود فایل", callback_data: "log_download" },
              { text: "🗑️ پاکسازی", callback_data: "log_clear" }
            ],[
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
    }

    if (data.startsWith('admin_block_')) {
      if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
      }

      const targetUserId = parseInt(data.replace('admin_block_', ''));
  
      // چک کردن وضعیت فعلی
      const isCurrentlyBlocked = await isUserBlocked(targetUserId, env);
  
      if (isCurrentlyBlocked) {
        // Unblock
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
        // Block
        await setUserBlocked(targetUserId, true, env);
        await answerCallbackQuery(cb.id, "🚫 کاربر مسدود شد", false);
    
        try {
  await sendMessage(targetUserId, 
    `🚫 **مسدودیت**\n\nحساب شما توسط مدیر مسدود شد.\n\n📞 برای رفع مسدودیت با @Hamid_Ai_pro تماس بگیرید.`
  );
} catch (e) {
  logger.warn(`Could not notify user ${targetUserId} about block`);
}
  
      await showUserDetail(chat.id, cb.message.message_id, targetUserId, env);
      return;
    }
    
    if (!session) {
      session = await getOrCreateSession(chat, user, env);
    }
    
    // بررسی دسترسی برای تنظیمات در گروه
    const isGroup = chat.type === "group" || chat.type === "supergroup";
    const isSettingsAction = [
      'set_model_', 'model_settings', 'active_model_settings', 'custom_prompt_menu',
      'reset_prompt_', 'group_settings', 'group_mode_', 'toggle_typing', 'show_prompts',
      'bot_status', 'open_help', 'close_help', 'show_model_list_', 'select_model_',
      'model_page_', 'refresh_models_', 'sambanova_model_', 'pollinations_model_' 
    ].some(prefix => data.startsWith(prefix));

    if (isGroup && isSettingsAction) {
      const isOwnerOrAdmin = user.id === config.BOT_OWNER_ID || await isUserAdmin(user.id, chat.id);
  
      if (!isOwnerOrAdmin) {
        await answerCallbackQuery(cb.id, "🚫 فقط مالک گروه و ادمین‌ها می‌توانند تنظیمات را تغییر دهند", true);
        return;
      }
    }

    // Handle different callback types
    switch (data) {
      case 'set_model_gemini':
        await handleModelSwitch(session, 'gemini', cb, env);
        break;
      case 'set_model_sambanova':
        await handleModelSwitch(session, 'sambanova', cb, env);
        break;
      case 'set_model_pollinations':
        await handleModelSwitch(session, 'pollinations', cb, env);
        break;
      
      case 'model_settings':
        await answerCallbackQuery(cb.id);
        await updateModelSelection(chat.id, cb.message.message_id, session);
        break;

      case 'resetfactory_confirm':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        await answerCallbackQuery(cb.id, "🔄 در حال ریست کامل دیتابیس...", false);
  
        try {
          // 1. حذف تمام سشن‌ها
          let cursor: string | undefined;
          do {
            const list = await env.SESSIONS.list({ prefix: "session:", cursor });
            for (const key of list.keys) {
              await env.SESSIONS.delete(key.name);
            }
            cursor = list.cursor;
          } while (cursor);
    
          // 2. حذف کش مدل‌ها
          cursor = undefined;
          do {
            const list = await env.SESSIONS.list({ prefix: "model_cache:", cursor });
            for (const key of list.keys) {
              await env.SESSIONS.delete(key.name);
            }
            cursor = list.cursor;
          } while (cursor);
    
          // 3. حذف گروه‌های VIP
          cursor = undefined;
          do {
            const list = await env.SESSIONS.list({ prefix: "group_vip:", cursor });
            for (const key of list.keys) {
              await env.SESSIONS.delete(key.name);
            }
            cursor = list.cursor;
          } while (cursor);
    
          // 4. حذف کاربران مسدود شده توسط ادمین
          cursor = undefined;
          do {
            const list = await env.SESSIONS.list({ prefix: "user_blocked:", cursor });
            for (const key of list.keys) {
              await env.SESSIONS.delete(key.name);
            }
            cursor = list.cursor;
          } while (cursor);
    
          // 5. حذف بن‌های گروهی
          cursor = undefined;
          do {
            const list = await env.SESSIONS.list({ prefix: "banned:", cursor });
            for (const key of list.keys) {
              await env.SESSIONS.delete(key.name);
            }
            cursor = list.cursor;
          } while (cursor);
    
          // 6. حذف کلیدهای ویژه
          await env.SESSIONS.delete("disabled_api_keys");
          await env.SESSIONS.delete("broadcast_job:current");
          await env.SESSIONS.delete("maintenance_mode");
          await env.SESSIONS.delete("bot_start_time");
    
          // 7. پاکسازی کش‌های حافظه‌ای
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
    
          // 8. تنظیم مجدد متغیرهای سراسری
          globalDisabledKeys = {};
          lastDisabledKeysFetch = 0;
          pollinationsModelsInitialized = false;
    
          // 9. ریستارت implicit (با بیلد مجدد config)
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
        break;

      case 'resetfactory_cancel':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        await answerCallbackQuery(cb.id, "عملیات لغو شد", false);
        await deleteMessage(chat.id, cb.message!.message_id);
        break;
        
      case 'active_model_settings':
        await answerCallbackQuery(cb.id);
        await sendActiveModelSettings(chat.id, cb.message.message_id, session, env);
        break;

      case 'admin_show_blocked':
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
        break;
        
      case 'admin_broadcast':
        await handleBroadcastCallback(cb, env);
        break;
        
      case 'broadcast_all':
      case 'broadcast_vip':
      case 'broadcast_free':
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
        break;
        
      case 'admin_toggle_maintenance':
          if (user.id !== config.BOT_OWNER_ID) {
            await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
            return;
          }
  
          // 1. وضعیت جدید را تعیین کنید (بر اساس وضعیت فعلی در KV - برای اطمینان از همگام‌سازی)
          const currentKvMode = await env.SESSIONS.get("maintenance_mode", "text");
          const isCurrentlyInMaintenance = currentKvMode === "true";
          const newMode = !isCurrentlyInMaintenance;
    
          // 2. وضعیت جدید را در KV ذخیره کنید
          await env.SESSIONS.put("maintenance_mode", String(newMode));
    
          // 3. متغیر سراسری config را در این Worker و درخواست‌های بعدی به‌روز کنید
          config.MAINTENANCE_MODE = newMode;
          maintenanceModeCache = { value: newMode, timestamp: Date.now() };

          const statusMsg = newMode ? '🛠️ حالت تعمیرات **فعال** شد' : '✅ حالت تعمیرات **غیرفعال** شد';
          await answerCallbackQuery(cb.id, statusMsg, false);
        
          await updateAdminPanel(chat.id, cb.message.message_id, env);
          break;
        
      case 'group_settings':
        await answerCallbackQuery(cb.id);
        await updateGroupSettings(chat.id, cb.message.message_id, session);
        break;

      case 'custom_prompt_menu':
        await answerCallbackQuery(cb.id);
        await updatePromptMenu(chat.id, cb.message.message_id, session);
        break;

      case 'toggle_typing':
        session.settings.typingIndicator = !session.settings.typingIndicator;
        await saveSessionWithLock(session, env);
        await answerCallbackQuery(cb.id, `نشانگر تایپ: ${session.settings.typingIndicator ? 'فعال' : 'غیرفعال'}`, false);
        await updateGroupSettings(chat.id, cb.message.message_id, session);
        break;

      case 'admin_refresh':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        await answerCallbackQuery(cb.id, "🔄 در حال بروزرسانی...", false);
        try {
          // ✅ مجبور به refresh کش
          sessionCache.clear();
    
          // ✅ بارگذاری مجدد
          await updateAdminPanel(chat.id, cb.message.message_id, env);
    
        } catch (error) {
          logger.error("Admin refresh failed", error);
          await answerCallbackQuery(cb.id, "❌ خطا در بروزرسانی", true);
        }
        break;

      case 'admin_back_to_main':
        if (user.id !== config.BOT_OWNER_ID) {
        await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
        return;
       }
  
       await answerCallbackQuery(cb.id);
       await updateAdminPanel(chat.id, cb.message!.message_id, env);
       break;

if (data.startsWith("grp_") || data.startsWith("leave_grp_") || data === "groups_refresh") {
  await answerCallbackQuery(cb.id);
  if (data === "groups_refresh") {
    await showActiveGroups(chat.id, cb.message!.message_id, env);
  } else if (data.startsWith("grp_")) {
    const groupId = parseInt(data.replace("grp_", ""));
    await showGroupDetail(chat.id, cb.message!.message_id, groupId, env);
  } else if (data.startsWith("leave_grp_")) {
    const groupId = parseInt(data.replace("leave_grp_", ""));
    await onBotLeftGroup(groupId, env);
    try {
      await callTelegramAPI("leaveChat", { chat_id: groupId });
    } catch (e) {
      logger.warn(`Failed to leave group ${groupId}`, e);
    }
    await answerCallbackQuery(cb.id, "✅ گروه با موفقیت ترک شد", false);
    await showActiveGroups(chat.id, cb.message!.message_id, env);
  }
  return;
}

      case 'open_admin':
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
        break;
      
      case 'admin_export_csv':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        
        await answerCallbackQuery(cb.id, "📊 در حال آماده‌سازی CSV...", false);
        try {
          const users = await getAllUserStatistics(env);
          
          let csv = "User ID,First Name,Username,VIP Status,Total Messages,Gemini,SambaNova,Pollinations,Voices,Voices Sent,Daily Messages,Daily Voices,First Used,Last Seen\n";
          
          users.forEach(u => {
            // Helper function برای تبدیل timestamp به ISO string
            const toISOStringSafe = (timestamp: number | undefined): string => {
              if (!timestamp || isNaN(timestamp) || timestamp === 0) {
                return 'N/A';
              }
              try {
                return new Date(timestamp).toISOString();
              } catch {
                return 'N/A';
              }
            };
            
            csv += `${u.userId},`;
            csv += `"${u.firstName.replace(/"/g, '""')}",`; // Escape double quotes
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
            csv += `"${toISOStringSafe(u.statistics.firstUsed)}",`;
            csv += `"${toISOStringSafe(u.statistics.lastSeen)}"\n`;
          });
          
          // ارسال فایل CSV
          const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
          const formData = new FormData();
          formData.append("chat_id", chat.id.toString());
          formData.append("document", blob, "nova_bot_statistics.csv");
          formData.append("caption", "📊 آمار کامل کاربران");
          
          await fetchWithTimeout(`${API_URL}/sendDocument`, {
            method: "POST",
            body: formData
          });
          
          await answerCallbackQuery(cb.id, "✅ فایل CSV ارسال شد", false);
          
        } catch (error) {
          logger.error("CSV export failed", error);
          await answerCallbackQuery(cb.id, "❌ خطا در صادرات", true);
        }
        break;

      case 'db_auto_clean':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
  
        await answerCallbackQuery(cb.id, "🧹 در حال پاکسازی...", false);
        await cleanupSessions(env);
        await sendDatabaseStats(chat.id, cb.message!.message_id, env);
        break;

      case 'db_delete_old':
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
        break;

      case 'db_confirm_delete_old':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
  
        await answerCallbackQuery(cb.id, "🗑️ در حال حذف...", false);
  
        try {
          const now = Date.now();
          const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
          let deleted = 0;
    
          // ✅ سیستم Pagination جدید
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
        break;

      case 'db_refresh_stats':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
  
        await answerCallbackQuery(cb.id, "🔄 در حال بروزرسانی...", false);
        await sendDatabaseStats(chat.id, cb.message!.message_id, env);
        break;

      case 'db_cancel_delete':
        await answerCallbackQuery(cb.id, "لغو شد", false);
        await deleteMessage(chat.id, cb.message!.message_id);
        break;
      case 'admin_page_prev':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        const prevState = adminPanelStates.get(chat.id) || { page: 0, perPage: 5, sortBy: 'new' as const };
        prevState.page = Math.max(0, prevState.page - 1);
        adminPanelStates.set(chat.id, prevState);
        await answerCallbackQuery(cb.id);
        await updateAdminPanel(chat.id, cb.message.message_id, env);
        break;

      case 'admin_page_next':
          if (user.id !== config.BOT_OWNER_ID) {
            await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
            return;
          }
          const nextState = adminPanelStates.get(chat.id) || { page: 0, perPage: 5, sortBy: 'new' as const };
          const allUsers2 = await getAllUserStatistics(env);
          const maxPage = Math.ceil(allUsers2.length / nextState.perPage) - 1;
          nextState.page = Math.min(maxPage, nextState.page + 1);
          adminPanelStates.set(chat.id, nextState);
          await answerCallbackQuery(cb.id);
          await updateAdminPanel(chat.id, cb.message.message_id, env);
          break;

      case 'admin_sort_new':
      case 'admin_sort_active':
      case 'admin_sort_messages':
          if (user.id !== config.BOT_OWNER_ID) {
            await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
            return;
          }
          const sortState = adminPanelStates.get(chat.id) || { page: 0, perPage: 5, sortBy: 'new' as const };
          sortState.sortBy = data.replace('admin_sort_', '') as 'new' | 'active' | 'messages';
          sortState.page = 0; // Reset to first page
          adminPanelStates.set(chat.id, sortState);
          await answerCallbackQuery(cb.id, `✅ مرتب‌سازی تغییر کرد`, false);
          await updateAdminPanel(chat.id, cb.message.message_id, env);
          break;

      case 'admin_noop':
          await answerCallbackQuery(cb.id);
          break;
      case 'admin_close':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        
        await answerCallbackQuery(cb.id);
        await deleteMessage(chat.id, cb.message.message_id);
        break;
      case 'admin_group_vip':
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        
        await answerCallbackQuery(cb.id);
        await showGroupVIPPanel(chat.id, cb.message.message_id, env);
        break;
        
      case 'model_already_selected':
        await answerCallbackQuery(cb.id, "✅ این مدل الان فعاله", false);
        break;
        
      case 'help_chat':
        await showHelpChat(cb, env);
        break;
      case 'help_images':
        await showHelpImages(cb, env);
        break;
      case 'help_models':
        await showHelpModels(cb, env);
        break;
      case 'help_customize':
        await showHelpCustomize(cb, env);
        break;
      case 'help_commands':
        await showHelpCommands(cb, env);
        break;
      case 'help_settings':
        await showHelpSettings(cb, env);
        break;
      case 'help_back':
        await handleHelpCommand(cb.message!, env, cb.message!.message_id);
        break;
      case 'broadcast_status': {
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
        const stMap: Record<string, string> = { pending: '⏳ در صف', running: '🔄 در حال اجرا', done: '✅ تکمیل', error: '❌ خطا' };
        await answerCallbackQuery(cb.id, `${stMap[jobData.status]} | ${jobData.processedIndex}/${jobData.totalUsers} (${pct}%)`, false);
        break;
      }

      case 'broadcast_cancel': {
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        await env.SESSIONS.delete('broadcast_job:current').catch(() => {});
        await answerCallbackQuery(cb.id, "🛑 ارسال لغو شد", false);
        await editMessageText(chat.id, cb.message!.message_id,
          "🛑 **ارسال پیام لغو شد**\n\nبرای ارسال مجدد از /admin استفاده کن."
        ).catch(() => {});
        break;
      }

      case 'broadcast_close': {
        if (user.id !== config.BOT_OWNER_ID) {
          await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
          return;
        }
        await answerCallbackQuery(cb.id);
        await deleteMessage(chat.id, cb.message!.message_id).catch(() => {});
        break;
      }
      default:
        if (data.startsWith('admin_user_')) {
          if (user.id !== config.BOT_OWNER_ID) {
            await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
            return;
          }
        
          // ✅ Validation
          const rawId = data.replace('admin_user_', '');
          if (!/^\d+$/.test(rawId)) {
            await answerCallbackQuery(cb.id, "❌ شناسه نامعتبر", true);
            return;
          }
        
          const targetUserId = parseInt(rawId);
          await answerCallbackQuery(cb.id);
          await showUserDetail(chat.id, cb.message.message_id, targetUserId, env);
          break;
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
         break;
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
         break;
       }
        
       if (data.startsWith('db_confirm_delete_')) {
         if (user.id !== config.BOT_OWNER_ID) {
           await answerCallbackQuery(cb.id, "🚫 دسترسی محدود", true);
           return;
         }
  
         const targetUserId = parseInt(data.replace('db_confirm_delete_', ''));
  
         try {
           await env.SESSIONS.delete(`session:${targetUserId}`); // String key ✅
           await answerCallbackQuery(cb.id, "✅ سشن حذف شد", false);
           await editMessageText(chat.id, cb.message!.message_id,
             `✅ **حذف موفق**\n\nسشن کاربر \`${targetUserId}\` حذف شد.`
           );
         } catch (error) {
           await answerCallbackQuery(cb.id, "❌ خطا در حذف", true);
         }
         break;
       }
        
        if (data.startsWith('sambanova_model_')) {
          const modelIndex = parseInt(data.replace('sambanova_model_', ''));
          session.engines.sambanova.modelIndex = modelIndex;
          await saveSessionWithLock(session, env,true);
          await answerCallbackQuery(cb.id, `✅ مدل لونا تغییر کرد`, false);
          await sendActiveModelSettings(chat.id, cb.message.message_id, session, env); // ✅ اصلاح فراخوانی
        } else if (data.startsWith('pollinations_model_')) {
          const modelIndex = parseInt(data.replace('pollinations_model_', ''));
          session.engines.pollinations.modelIndex = modelIndex;
          await saveSessionWithLock(session, env,true);
          await answerCallbackQuery(cb.id, `✅ مدل زارا تغییر کرد`, false);
          await sendActiveModelSettings(chat.id, cb.message.message_id, session, env); // ✅ اصلاح فراخوانی
        } else if (data.startsWith('show_model_list_')) {
          const engine = data.replace('show_model_list_', '') as AIEngine;
          await answerCallbackQuery(cb.id);
          setModelListState(chat.id, engine, { page: 0, perPage: 8, totalPages: 0 });
          await showModelSelection(chat.id, cb.message.message_id, engine, false, env);
          break;
        } else if (data.startsWith('refresh_models_')) {
          const engine = data.replace('refresh_models_', '') as AIEngine;
          await answerCallbackQuery(cb.id, '🔄 در حال بروزرسانی...', false);
          const cacheKey = `model_cache:${engine}`;
          await env.SESSIONS.delete(cacheKey);
          logger.info(`🗑️ Deleted old cache for ${engine}`);
          setModelListState(chat.id, engine, { page: 0, perPage: 8, totalPages: 0 });
          await showModelSelection(chat.id, cb.message.message_id, engine, true, env);
          break;
        } else if (data.startsWith('model_page_prev_')) {
          const engine = data.replace('model_page_prev_', '') as AIEngine;
          const state = getModelListState(chat.id, engine);
          state.page = Math.max(0, state.page - 1);
          setModelListState(chat.id, engine, state);
          await answerCallbackQuery(cb.id);
          await showModelSelection(chat.id, cb.message.message_id, engine, false, env);
          break;
        } else if (data.startsWith('model_page_next_')) {
          const engine = data.replace('model_page_next_', '') as AIEngine;
          const state = getModelListState(chat.id, engine);
          state.page++;
          setModelListState(chat.id, engine, state);
          await answerCallbackQuery(cb.id);
await showModelSelection(chat.id, cb.message.message_id, engine, false, env);
break;                              // خط 3
} else if (data === 'model_page_noop') {
  await answerCallbackQuery(cb.id);
  break;                            // خط 6
} else if (data.startsWith('select_model_')) {
  const parts = data.replace('select_model_', '').split('_');
  const engine = parts[0] as AIEngine;
  const modelIndex = parseInt(parts[1]);
  if (isNaN(modelIndex)) {
    await answerCallbackQuery(cb.id, "❌ خطا در انتخاب", true);
    return;
  }
  // بعدش دوباره اومدی یه if دیگه نوشتی:
  if (cb.data.startsWith('model_')) {   // خط 14
    const engine = 'openai';
    const modelIndex = parseInt(cb.data.split('_')[1]);
    session.engines[engine].modelIndex = modelIndex;
    await saveSessionWithLock(session, env, true);
  }
  
  const modelCache = await getModelsWithCache(engine, env, false);
  const selectedModel = modelCache.models[modelIndex];
  
  await answerCallbackQuery(cb.id, `✅ ${selectedModel?.name || 'مدل'} فعال شد`, false);
await showModelSelection(chat.id, cb.message.message_id, engine, false, env);
// اینجا break نداریم چون داخل حلقه نیستیم
} else {
  // هر کلیک دیگری رو به تابع دیگه بفرست
  await handleExistingCallbacks(cb, session, env, config);
}

async function showGroupVIPPanel(chatId: number, messageId: number, env: Env): Promise<void> {
  try {
    const list = await env.SESSIONS.list({ prefix: "group_vip:" });
    
    let text = `👥 **گروه‌های VIP**\n\n`;
    text += `تعداد: ${list.keys.length}\n\n`;
    
    if (list.keys.length === 0) {
      text += `هنوز گروهی VIP نشده است.`;
    } else {
      for (const item of list.keys) {
        const groupId = item.name.replace('group_vip:', '');
        const data = await env.SESSIONS.get(item.name, "json") as any;
        const since = data?.since ? new Date(data.since).toLocaleDateString('fa-IR') : 'نامشخص';
        
        text += `🆔 \`${groupId}\`\n`;
        text += `📅 از: ${since}\n\n`;
      }
    }
    
    const keyboard = {
      inline_keyboard: [
        [{ text: "🔙 بازگشت", callback_data: "admin_back_to_main" }]
      ]
    };
    
    await editMessageText(chatId, messageId, text, {
      reply_markup: JSON.stringify(validateKeyboard(keyboard))
    });
    
  } catch (error) {
    logger.error("Failed to show group VIP panel", error);
    await editMessageText(chatId, messageId, "❌ خطا در نمایش گروه‌ها");
  }
}

interface Group {
  id: number;
  title: string;
  source: string; // @username یا "Private ID"
  joinedAt: number;
}

// ======================== توابع مدیریت حضور در گروه ========================
interface Group {
  id: number;
  title: string;
  source: string;
  joinedAt: number;
}

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
  }
}

async function onBotLeftGroup(chatId: number, env: Env) {
  let groups: Group[] = await env.SESSIONS.get("joined_groups", "json") || [];
  groups = groups.filter(g => g.id !== chatId);
  await env.SESSIONS.put("joined_groups", JSON.stringify(groups));
}

async function showActiveGroups(chatId: number, msgId: number, env: Env) {
  const groups: Group[] = await env.SESSIONS.get("joined_groups", "json") || [];
  let text = `👥 **ACTIVE GROUPS MANAGER**\n━━━━━━━━━━━━━━━━━━━━\n\n**Total Joined Groups:** ${groups.length}\n\n`;
  if (groups.length === 0) {
    text += `_هیچ گروهی یافت نشد_`;
  } else {
    groups.forEach((g, i) => {
      const date = new Date(g.joinedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
      text += `${i + 1}. **${g.title}**\n↳ Source: \`${g.source}\` | Joined: ${date}\n\n`;
    });
  }
  const keyboard = {
    inline_keyboard: [
      ...groups.map(g => ([{ text: g.title, callback_data: `grp_${g.id}` }])),
      [
        { text: "🔄 Refresh List", callback_data: "groups_refresh" },
        { text: "⬅️ Main Admin Panel", callback_data: "open_admin" }
      ]
    ]
  };
  await editMessageText(chatId, msgId, text, { reply_markup: JSON.stringify(keyboard) });
}

async function showGroupDetail(chatId: number, msgId: number, groupId: number, env: Env) {
  const groups: Group[] = await env.SESSIONS.get("joined_groups", "json") || [];
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    await editMessageText(chatId, msgId, "❌ **گروه یافت نشد**");
    return;
  }
  const text = `📊 **Group Details**\n\n**Name:** ${group.title}\n**ID:** \`${group.id}\`\n**Source:** ${group.source}\n**Joined:** ${new Date(group.joinedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  const keyboard = {
    inline_keyboard: [
      [{ text: "🚪 Leave Group", callback_data: `leave_grp_${groupId}` }],
      [{ text: "🔙 Back to List", callback_data: "groups_refresh" }]
    ]
  };
  await editMessageText(chatId, msgId, text, { reply_markup: JSON.stringify(keyboard) });
}

  await editMessageText(chatId, msgId, text, {
    reply_markup: JSON.stringify(keyboard)
  });
}

// تابع اختصاصی برای مدیریت کالبک‌های گروه
async function handleGroupsCallback(cb: CallbackQuery, env: Env) {
  const chatId = cb.message!.chat.id;
  const msgId = cb.message!.message_id;
  const data = cb.data!;

 // کلیک روی یک گروه
  if (data.startsWith("grp_")) {
    const groupId = parseInt(data.replace("grp_", ""));
    await answerCallbackQuery(cb.id);
    await showGroupDetail(chatId, msgId, groupId, env);
    return;
  }

  // leave گروه
  if (data.startsWith("leave_grp_")) {
    const groupId = parseInt(data.replace("leave_grp_", ""));
    
    try {
      await onBotLeftGroup(groupId, env);
      await answerCallbackQuery(cb.id, "✅ Left group successfully", false);
      await showActiveGroups(chatId, msgId, env);
    } catch (error) {
      await answerCallbackQuery(cb.id, "❌ Failed to leave", true);
    }
    return;
  }
}

  // کلیک روی یک گروه
  if (data.startsWith("grp_")) {
    const groupId = parseInt(data.replace("grp_", ""));
    await answerCallbackQuery(cb.id);
    await showGroupDetail(chatId, msgId, groupId, env);
    return;
  }

  // leave گروه
  if (data.startsWith("leave_grp_")) {
    const groupId = parseInt(data.replace("leave_grp_", ""));
    
    try {
      // حذف از لیست KV
      await onBotLeftGroup(groupId, env);
      
      await answerCallbackQuery(cb.id, "✅ Left group successfully", false);
      
      // برگشت به لیست
      await showActiveGroups(chatId, msgId, env);
      
    } catch (error) {
      await answerCallbackQuery(cb.id, "❌ Failed to leave", true);
    }
    return;
  }
}

// استفاده در handleUpdate برای تشخیص join/leave:
// if (update.message?.new_chat_members) {
//   const source = update.message.from?.username 
//     ? `@${update.message.from.username}` 
//     : "Private ID";
//   await onBotJoinedGroup(update.message.chat, source, env);
// }
// if (update.message?.left_chat_member) {
//   await onBotLeftGroup(update.message.chat.id, env);
// }

async function handleLogCommand(message: Message, env: Env): Promise<void> {
    const { chat } = message;
    
    // 📋 لاگ‌های ذخیره شده (اگر سیستم logging داری)
    const recentLogs = logger.getLogs?.() || [];

    if (recentLogs.length === 0) {
        await sendMessage(chat.id, "📭 هیچ لاگی ثبت نشده", { 
            reply_to_message_id: message.message_id 
        });
        return;
    }

    // گروه‌بندی بر اساس سطح
    const errors = recentLogs.filter(l => l.level === 'error').slice(-5);
    const warnings = recentLogs.filter(l => l.level === 'warn').slice(-5);
    const infos = recentLogs.filter(l => l.level === 'info').slice(-3);
    
    let text = `📊 **لاگ‌های اخیر ربات**\n\n`;
    
    if (errors.length > 0) {
        text += `🔴 **خطاها (${errors.length}):**\n`;
        errors.forEach((log, i) => {
            text += `${i + 1}. ${log.message.substring(0, 50)}\n`;
        });
        text += `\n`;
    }
    
    if (warnings.length > 0) {
        text += `🟡 **هشدارها (${warnings.length}):**\n`;
        warnings.forEach((log, i) => {
            text += `${i + 1}. ${log.message.substring(0, 50)}\n`;
        });
        text += `\n`;
    }
    
    if (infos.length > 0) {
        text += `🟢 **اطلاعات (${infos.length}):**\n`;
        infos.forEach((log, i) => {
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

// ❌ اینجا هیچ } اضافی نباید باشه

async function handleExistingCallbacks(
  cb: CallbackQuery,
  session: ChatSession,
  env: Env,
  config: ReturnType<typeof createConfig>
) {
  const { data } = cb;
  const chat = cb.message!.chat;

  // ادامه کد
}

async function handleExistingCallbacks(cb: CallbackQuery, session: ChatSession, env: Env, config: ReturnType<typeof createConfig>) {
  const { data } = cb;
  const chat = cb.message!.chat;
  
  switch (data) {
    case 'help_chat':
      await showHelpChat(cb, env);
      break;
    case 'help_back':
      await handleHelpCommand(cb.message!, env, cb.message!.message_id);
      break;
    case 'close_help':
      await deleteMessage(chat.id, cb.message!.message_id);
      break;
    case 'personality_menu':
      await sendPersonalityMenu(chat.id, cb.message.message_id, session);
      break;
    case 'back_to_main_menu':
      await handleStartCommand(cb.message, env);
      break;
    case 'open_help':
      await answerCallbackQuery(cb.id);
      await handleHelpCommand(cb.message!, env, cb.message!.message_id);
      break;
    case 'custom_prompt_menu':
      await answerCallbackQuery(cb.id);
      await updatePromptMenu(chat.id, cb.message.message_id, session);
      break;
    case 'reset_prompt_gemini':
    case 'reset_prompt_sambanova': {
      const engine = data.split('_')[2] as AIEngine;
      session.customPrompts[engine] = null;
      const timestamp = Date.now();
      const currentPrompt = getActivePrompt(session, cb.from.first_name, cb.message!.chat.type === "group" || cb.message!.chat.type === "supergroup");
      if (engine === 'gemini') {
        session.engines.gemini.history[0] = {
          role: "user",
          parts: [{ text: currentPrompt }],
          timestamp
        };
      } else if (engine === 'sambanova') {
        session.engines.sambanova.history[0] = {
          role: "assistant",
          parts: [{ text: currentPrompt }],
          timestamp
        };
      }
      await saveSessionWithLock(session, env);
      await answerCallbackQuery(cb.id, `پرامپت ${getEngineName(engine, session.language)} ریست شد`, false);
      await updatePromptMenu(chat.id, cb.message!.message_id, session);
      break;
    }
    case 'reset_prompt_pollinations': {
      session.customPrompts.pollinations = null;
      const timestamp = Date.now();
      const currentPrompt = getActivePrompt(session, cb.from.first_name, cb.message!.chat.type === "group" || cb.message!.chat.type === "supergroup");
      session.engines.pollinations.history[0] = {
        role: "assistant",
        parts: [{ text: currentPrompt }],
        timestamp
      };
      await saveSessionWithLock(session, env);
      await answerCallbackQuery(cb.id, `پرامپت ${getEngineName('pollinations', session.language)} ریست شد`, false);
      await updatePromptMenu(chat.id, cb.message!.message_id, session);
      break;
    }
    case 'show_prompts': {
      const lang = session.language || 'fa';
      const txt = TRANSLATIONS[lang];
      const geminiP = session.customPrompts.gemini || txt.prompt_default;
      const sambaP = session.customPrompts.sambanova || txt.prompt_default;
      const pollP = session.customPrompts.pollinations || txt.prompt_default;
      let promptMsg = lang === 'fa' ? `📋 **پرامپت‌های تنظیم شده شما:**\n\n` : `📋 **Your Current Prompts:**\n\n`;
      promptMsg += `🤖 **${getEngineName('gemini', lang)}:**\n\`${geminiP}\`\n\n`;
      promptMsg += `🎨 **${getEngineName('sambanova', lang)}:**\n\`${sambaP}\`\n\n`;
      promptMsg += `🔬 **${getEngineName('pollinations', lang)}:**\n\`${pollP}\``;
      await answerCallbackQuery(cb.id);
      await editMessageText(chat.id, cb.message!.message_id, promptMsg, {
        reply_markup: JSON.stringify({
          inline_keyboard: [[
            { text: txt.btn_back, callback_data: 'custom_prompt_menu' }
          ]]
        })
      });
      break;
    }

    // ✅ بخش شخصیت‌ها
    case 'set_personality_nova':
    case 'set_personality_lilith':
    case 'set_personality_cipher':
    case 'set_personality_leatherface':
    case 'set_personality_aria':
    case 'set_personality_jax':
    case 'set_personality_luna':
    case 'set_personality_zara': {
      const personalityKey = data.replace('set_personality_', '');
      const personality = PERSONALITIES[personalityKey];
      
      if (!personality) {
        await answerCallbackQuery(cb.id, '❌ شخصیت یافت نشد', true);
        break;
      }
      
      session.activePersonality = personalityKey;
      await saveSessionWithLock(session, env);
      
      const lang = session.language || 'fa';
      const name = lang === 'fa' ? personality.name_fa : personality.name_en;
      const emoji = personality.emoji;
      
      await answerCallbackQuery(cb.id, `✅ شخصیت ${emoji} ${name} فعال شد!`, false);
      
      const text = lang === 'fa'
        ? `${emoji} **شخصیت ${name} فعال شد!**\n\nحالا ربات با این شخصیت بهت پاسخ میده.\n\n${personality.desc_fa}`
        : `${emoji} **${name} personality activated!**\n\nNow the bot will respond with this personality.\n\n${personality.desc_en}`;
      
      await editMessageText(chat.id, cb.message.message_id, text, {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: lang === 'fa' ? '🔙 بازگشت به شخصیت‌ها' : '🔙 Back to Personalities', callback_data: 'personality_menu' }],
            [{ text: lang === 'fa' ? '🏠 منوی اصلی' : '🏠 Main Menu', callback_data: 'open_help' }]
          ]
        })
      });
      break;
    }

    case 'model_unavailable':
      await answerCallbackQuery(cb.id, 'این مدل در حال حاضر در دسترس نیست', true);
      break;
      
    default:
      await answerCallbackQuery(cb.id, "دکمه ناشناخته", true);
      logger.warn(`Unknown callback data: ${data}`);
      break;
  }
}

async function updateGroupSettings(chatId: number, messageId: number, session: ChatSession) {
  const lang = session.language || 'fa';
  const text = lang === 'fa'
    ? `👥 **تنظیمات گروه**\n\nربات فقط زمانی پاسخ می‌دهد که:\n• شما او را منشن کنید (@${BOT_INFO?.username} یا کلمه "نوا")\n• یا روی پیامش ریپلای بزنید.\n\n✅ حالت همیشه پاسخ و هوشمند حذف شدند.`
    : `👥 **Group Settings**\n\nThe bot only replies when:\n• You mention it (@${BOT_INFO?.username} or the word "nova")\n• Or reply to its message.\n\n✅ Always and smart modes removed.`;
    
  const keyboard = {
    inline_keyboard: [
      [ { text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'open_help' } ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}
    
  const broadcastKeyboard = {
  inline_keyboard: [
    [
      { text: `${PERSONALITIES.nova.emoji} نوا`, callback_data: 'set_personality_nova' },
      { text: `${PERSONALITIES.lilith.emoji} لیلیت`, callback_data: 'set_personality_lilith' },
      { text: `${PERSONALITIES.cipher.emoji} سایفر`, callback_data: 'set_personality_cipher' },
      { text: `${PERSONALITIES.victoria.emoji} ویکتوریا`, callback_data: 'set_personality_victoria' }
    ],
    [
      { text: `${PERSONALITIES.aria.emoji} آریا`, callback_data: 'set_personality_aria' },
      { text: `${PERSONALITIES.jax.emoji} جکس`, callback_data: 'set_personality_jax' },
      { text: `${PERSONALITIES.luna.emoji} لونا`, callback_data: 'set_personality_luna' },
      { text: `${PERSONALITIES.zara.emoji} زارا`, callback_data: 'set_personality_zara' }
    ],
    [
      { text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'back_to_main_menu' }
    ]
  ]
};

await editMessageText(chatId, messageId, text, {
  reply_markup: JSON.stringify(validateKeyboard(keyboard))
});

async function sendActiveModelSettings(chatId: number, messageId: number, session: ChatSession, env: Env): Promise<void> {
  const activeEngine = session.activeEngine;
  const lang = session.language || 'fa';
  // @ts-ignore
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
  
  // ⚡ Skeleton Loader
  const skeletonText = `${txt.active_model_title.replace('{name}', engineName)}\n\n${txt.loading}`;
  const skeletonKeyboard = {
    inline_keyboard: [
      [{ text: txt.btn_back, callback_data: 'model_settings' }]
    ]
  };
  
  await editMessageText(chatId, messageId, skeletonText, {
    reply_markup: JSON.stringify(skeletonKeyboard)
  });
  
  // ⚡ Load Data
  try {
    const modelCache = await getModelsWithCache(activeEngine, env, false);
    const currentModel = modelCache.models[engine.modelIndex];
    const apiKeyCount = activeEngine === 'sambanova' ? config.SAMBANOVA_KEYS.length :
                        activeEngine === 'pollinations' ? 1 :
                        config.GEMINI_KEYS.length;
    
    const text = `${txt.active_model_title.replace('{name}', engineName)}\n\n` +
      `${txt.active_model_current.replace('{name}', currentModel?.name || 'Unknown')}\n` +
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
    // استفاده از txt برای خطا
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

// --- SECTION: DYNAMIC MODEL SELECTION UI ---
async function showModelSelection(chatId: number, messageId: number, engine: AIEngine, forceRefresh: boolean = false, env: Env): Promise<void> {
  try {
    // 👇 این خط رو اضافه کن (بارگذاری session برای زبان)
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
        // 👇 اینجا رو تغییر بده:
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
    
    // 👇 اینجا رو تغییر بده:
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
    
    // Build keyboard
    const keyboard: any[] = [];
    
    // Model buttons (2 per row)
    for (let i = 0; i < pageModels.length; i += 2) {
      const row: any[] = [];
  
      for (let j = 0; j < 2 && (i + j) < pageModels.length; j++) {
        const model = pageModels[i + j];
    
        // ✅ Validation
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
    
    // Navigation row
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
    
    // Action buttons - 👇 اینجا رو تغییر بده:
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
    // 👇 اینجا هم بارگذاری session
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

// ✅ Helper function برای اطمینان از وجود text در دکمه‌ها
function createInlineButton(text: string | undefined | null, callback_data: string): { text: string; callback_data: string } {
  const safeText = String(text || 'Unknown').trim();
  return {
    text: safeText || 'Button', // اگر بعد از trim خالی شد
    callback_data: callback_data
  };
}

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

// --- SECTION: VOICE HANDLING ---
async function getFileUrl(fileId: string): Promise<string> {
  const res = await callTelegramAPI("getFile", { file_id: fileId });
  if (!res.file_path) {
    throw new Error("file_path not found in response");
  }
  return `https://api.telegram.org/file/bot${config.TOKEN}/${res.file_path}`;
}

async function transcribeVoiceWithGemini(audioUrl: string, config: any): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  let lastError: Error | null = null;

  // چرخیدن روی تمام کلیدهای موجود در کانفیگ
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
            { text: "Please transcribe this audio to Persian text accurately:" },
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
        continue; // رفتن به کلید بعدی
      }

      throw new Error(data.error?.message || "Unknown API error");
    } catch (error) {
      lastError = error as Error;
      if (i === config.GEMINI_KEYS.length - 1) break; // اگر آخرین کلید بود، خارج شو
    }
  }

  clearTimeout(timeoutId);
  throw lastError || new Error("All Gemini keys failed");
}

// 👇 جایگزین تابع handleUpdate فعلی کنید
async function handleUpdate(update: Update, env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
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

      if (update.message?.new_chat_members) {
        const source = update.message.from?.username 
          ? `@${update.message.from.username}` 
          : "Private ID";
        await onBotJoinedGroup(update.message.chat, source, env);
      }
      if (update.message?.left_chat_member) {
        await onBotLeftGroup(update.message.chat.id, env);
      }

      if (message.voice) {
        await handleVoiceMessage(message, env, config);
        return;
      }
      
      if (message.photo || message.document || message.animation || message.video || message.sticker) {
          await handleMediaMessage(message, env, config);
      } else if (message.text) {
        await handleTextMessage(message, env, config);
      }
    }
  } catch (error) {
    logger.error("Unhandled error in update processing", error);
  }
}

async function getBotUptime(env: Env): Promise<number> {
  const startTimeStr = await env.SESSIONS.get("bot_start_time", "text");
  if (!startTimeStr) return 0;
  
  const startTime = parseInt(startTimeStr);
  return Math.floor((Date.now() - startTime) / 1000);
}

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

// --- SECTION: INITIALIZATION & ERROR HANDLING ---
async function initializeBot(env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    preloadModels(env).catch(e => logger.warn("Preload failed", e));

    let startTime = await env.SESSIONS.get("bot_start_time", "text");
    
    if (!startTime) {
      startTime = String(Date.now());
      await env.SESSIONS.put("bot_start_time", startTime);
      logger.info("Bot start time initialized");
    }
    
    // بررسی maintenance mode از KV
    const maintenanceMode = await env.SESSIONS.get("maintenance_mode", "text");
    config.MAINTENANCE_MODE = maintenanceMode === "true";

    // Get bot information
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

    // 🚀 Pre-warm cache همزمان (non-blocking)
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

async function createHealthCheckResponse(env: Env): Promise<Response> {
  const totalActiveRequests = Array.from(activeRequests.values()).reduce((sum, set) => sum + set.size, 0);
  const uptimeSeconds = await getBotUptime(env); // ✅ تغییر
  
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
        api_keys: "hardcoded",
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
      pollinations_integration: 1 > 0,
    },
    storage: "cloudflare_kv_enhanced"
  };
  
  return new Response(JSON.stringify(health, null, 2), {
    headers: { "Content-Type": "application/json" },
    status: totalActiveRequests > config.MAX_CONCURRENT_REQUESTS ? 503 : 200
  });
}

// ✅ تابع ست کردن VIP گروه
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

// ✅ تابع چک کردن VIP گروه
// این تابع رو بالای همه فانکشن‌ها بذار
async function handleExistingCallbacks(env: Env, job: BroadcastJob) {
  try {
    await env.SESSIONS.put('broadcast_job:current', JSON.stringify(job));
  } catch (error) {
    logger.error("Error in handleExistingCallbacks", error);
  }
}

async function processBroadcastBatch(env: Env): Promise<void> {
  const BATCH_SIZE = 20;
  
  const stored = await env.SESSIONS.get('broadcast_job:current', 'json');
  if (!stored) return;
  const job = stored as BroadcastJob;

  if (job.status === 'done' || job.status === 'error') return;
  if (job.status === 'running') return;

  job.status = 'running';
  await env.SESSIONS.put('broadcast_job:current', JSON.stringify(job));

  const end = Math.min(job.processedIndex + BATCH_SIZE, job.userIds.length);
  const batch = job.userIds.slice(job.processedIndex, end);

  for (const userId of batch) {
    try {
      await callTelegramAPI("sendMessage", {
        chat_id: userId,
        text: `📢 **پیام از مدیر ربات:**\n\n${job.message}\n\n━━━━━━━━━━━━━━\n_این پیام از طرف مدیریت ارسال شده است_`,
        parse_mode: "Markdown",
        disable_notification: false,
      });
      job.sent++;
    } catch (error) {
      job.failed++;
    }
    job.processedIndex++;
    await new Promise(r => setTimeout(r, 200));
  }

  const isDone = job.processedIndex >= job.totalUsers;
  job.status = isDone ? 'done' : 'pending';
  await env.SESSIONS.put('broadcast_job:current', JSON.stringify(job));

  if (!isDone) {
    logger.info(`📊 Broadcast: ${job.processedIndex}/${job.totalUsers}`);
  } else {
    await editMessageText(
      job.adminChatId,
      job.adminMessageId,
      `✅ **ارسال پیام تکمیل شد!**\n\n📊 ارسال شده: ${job.sent}\n❌ ناموفق: ${job.failed}\n👥 کل: ${job.totalUsers}`,
      {
        reply_markup: JSON.stringify({
          inline_keyboard: [[{ text: "❌ بستن", callback_data: "broadcast_close" }]]
        })
      }
    ).catch(() => {});
    
    await env.SESSIONS.delete('broadcast_job:current').catch(() => {});
  }
}
