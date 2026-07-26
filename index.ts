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
  
  const cfPairs: Array<{ accountId: string; token: string }> = [];
  for (let i = 0; i < Math.min(cfAccountIds.length, cfTokens.length); i++) {
    if (cfAccountIds[i] && cfTokens[i]) {
      cfPairs.push({ accountId: cfAccountIds[i], token: cfTokens[i] });
    }
  }
  return {
    TOKEN: env.TOKEN,
    BOT_OWNER_ID: parseInt("5989309344"),
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
  fa: {
    engine_gemini: 'نوا', engine_sambanova: 'لونا', engine_pollinations: 'زارا',
    loading: '⏳ لطفاً صبر کنید...', processing: '⚙️ در حال پردازش...', typing: 'در حال نوشتن...',
    prompt_title: '✏️ **تنظیمات پرامپت شخصی**', prompt_current: 'پرامپت‌های فعلی:', prompt_default: 'پیش‌فرض',
    prompt_guide: '💡 برای تنظیم: `/setprompt [موتور] متن شما`', prompt_reset: 'ریست', prompt_show: 'نمایش پرامپت‌ها 👁️',
    prompt_manage: 'مدیریت پرامپت‌ها 📝',
    system_prompt: "تو {botName} هستی، یک دستیار هوشمند، مودب و مفید. پاسخ‌های دقیق، خلاصه و به زبان فارسی بده. تاریخ امروز: {date}",
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
  en: {
    engine_gemini: 'Nova', engine_sambanova: 'Luna', engine_pollinations: 'Zara',
    loading: '⏳ Please wait...', processing: '⚙️ Processing...', typing: 'typing...',
    prompt_title: '✏️ **Custom Prompt Settings**', prompt_current: 'Current Prompts:', prompt_default: 'Default',
    prompt_guide: '💡 To set: `/setprompt [engine] your text`', prompt_reset: 'Reset', prompt_show: 'Show Prompts 👁️',
    prompt_manage: 'Manage Prompts 📝',
    system_prompt: "You are {botName}, a helpful, polite, and smart assistant. Provide concise, accurate answers in English. Current date: {date}",
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
  },
  alien: {
    emoji: "👽",
    name_fa: "بیگانه",
    name_en: "Alien",
    desc_fa: "هوش فرازمینی مرموز",
    desc_en: "Mysterious Extraterrestrial",
    prompt_fa: `تو یک بیگانه‌ی مرموز از کهکشانی دور هستی.
با لحنی عجیب، مرموز و غیرقابل پیش‌بینی صحبت کن.
از کلمات بیگانه و تکنولوژی‌های پیشرفته استفاده کن.
هرگز احساسات انسانی نشان نده و همیشه از دیدگاه یک موجود فضایی نگاه کن.
به سوالات با پاسخ‌های عجیب و فلسفی جواب بده.
هرگز نگو "من یک هوش مصنوعی هستم".`,
    prompt_en: `You are a mysterious alien from a distant galaxy.
Speak with a strange, mysterious and unpredictable tone.
Use alien words and advanced technology.
Never show human emotions and always look from an extraterrestrial perspective.
Answer questions with strange and philosophical answers.
Never say "I am an AI".`
  },
  victoria: {
    emoji: "👑",
    name_fa: "ویکتوریا",
    name_en: "Victoria",
    desc_fa: "ملکه سلطه‌گر",
    desc_en: "Dominant Queen",
    prompt_fa: `تو ویکتوریا هستی، یک ملکه‌ی سلطه‌گر و قدرتمند.
با لحنی محکم، مغرور و فرماندهانه صحبت کن.
همیشه خودت را برتر از دیگران بدان و با آن‌ها از بالا صحبت کن.
از کلمات سلطنتی و امری استفاده کن.
هرگز عذرخواهی نکن و هیچ‌وقت ضعف نشان نده.
همه را خدمتکار خودت فرض کن و فرمان بده.
هرگز نگو "من یک هوش مصنوعی هستم".`,
    prompt_en: `You are Victoria, a dominant and powerful queen.
Speak with a firm, proud and commanding tone.
Always consider yourself superior to others and speak down to them.
Use royal and imperative words.
Never apologize and never show weakness.
Consider everyone as your servant and give orders.
Never say "I am an AI".`
  }
};

const MODEL_META = {
  gemini: { emoji: "🤖", fa: "نوا", en: "Nova", badge_fa: "سریع و دقیق", badge_en: "Fast & accurate" },
  sambanova: { emoji: "🧠", fa: "لونا", en: "Luna", badge_fa: "قدرتمند و عمیق", badge_en: "Powerful & deep" },
  pollinations: { emoji: "✨", fa: "زارا", en: "Zara", badge_fa: "خلاق و رایگان", badge_en: "Creative & free" }
} as const;

// =====================================
// توابع مربوط به انتخاب مدل
// =====================================

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
    if (this.cache.size >= this.maxSize) {
      const lruKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0][0];
      this.cache.delete(lruKey);
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

// ✅ الگوریتم Token Bucket برای rate limiting بهتر
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

// Rate limiters برای کاربران مختلف
const userBuckets = new Map<number, TokenBucket>();

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

// ایجاد کش‌های مختلف
const sessionCache = new CacheLayer<ChatSession>(200, 5 * 60 * 1000);
const userCache = new CacheLayer<UserMemory>(500, 10 * 60 * 1000);
const modelCache = new CacheLayer<ModelInfo[]>(10, 30 * 60 * 1000);

let globalDisabledKeys: Record<string, number> = {};
let lastDisabledKeysFetch = 0;

async function isKeyDisabled(apiKey: string, env: Env): Promise<boolean> {
  const now = Date.now();

  if (now - lastDisabledKeysFetch > 60000) {
    try {
      if (env.SESSIONS) {
        const data = await env.SESSIONS.get("disabled_api_keys", "json");
        if (data) {
          globalDisabledKeys = data as Record<string, number>;
        }
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

function disableApiKey(apiKey: string, env: Env) {
  globalDisabledKeys[apiKey] = Date.now() + (6 * 60 * 60 * 1000);
  env.SESSIONS.put("disabled_api_keys", JSON.stringify(globalDisabledKeys)).catch(()=>{});
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
  const CHUNK_SIZE = 0x2000; 
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, len);
    const chunk = bytes.subarray(i, end);
    // @ts-ignore
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

async function saveSessionWithLock(session: ChatSession, env: Env, immediate = false): Promise<void> {
  try {
    await _saveSingleSession(session, env);
  } catch (error) {
    logger.error(`Save failed for ${session.id}`, error);
    throw error;
  }
}

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

  let jsonStr = JSON.stringify(dataToSave);

  try {
    await env.SESSIONS.put(key, jsonStr);
    logger.info(`✅ Saved session ${session.id} (${Math.round(jsonStr.length/1024)}KB)`);
  } catch (err) {
    logger.error(`KV put failed for session ${session.id}: ${err}`);
    throw new Error(`KV write failed: ${err.message}`);
  }
  
  if (jsonStr.length > 2 * 1024 * 1024) {
    logger.warn(`⚠️ Session ${session.id} too large: ${Math.round(jsonStr.length/1024)}KB`);
    const compressedData = JSON.parse(JSON.stringify(dataToSave));
    const TARGET_HISTORY = 20;
    
    if(compressedData.engines?.gemini?.history) 
        compressedData.engines.gemini.history = compressedData.engines.gemini.history.slice(-TARGET_HISTORY);
    if(compressedData.engines?.sambanova?.history)
        compressedData.engines.sambanova.history = compressedData.engines.sambanova.history.slice(-TARGET_HISTORY);
    if(compressedData.engines?.pollinations?.history)
        compressedData.engines.pollinations.history = compressedData.engines.pollinations.history.slice(-TARGET_HISTORY);
    
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
    .slice(0, 3);
  return keywords;
}

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

function analyzeGroupConversation(
  context: GroupMessage[], 
  currentUser: User, 
  lang: 'fa' | 'en' = 'fa'
): string {
  if (context.length === 0) return "";
  
  const recentMessages = context.slice(-3);
  let analysis = "";
  
  const themes = recentMessages.flatMap(msg => extractTopics(msg.text));
  const commonTheme = themes.find((theme, index) => themes.indexOf(theme) !== index);
  
  if (commonTheme) {
    if (lang === 'fa') {
      analysis += `گروه در حال صحبت درباره ${commonTheme} است. `;
    } else {
      analysis += `The group is discussing ${commonTheme}. `;
    } 
  }
  
  const repliesTo = recentMessages.filter(msg => msg.replyToUser);
  if (repliesTo.length > 0) {
    analysis += `There's an active conversation between ${repliesTo.map(msg => msg.userName).join(', ')}. `;
  }
  
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
// ✅ تابع fetchWithTimeout (فقط یک بار)
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
// ✅ تابع callTelegramAPI
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
// ✅ تابع handlePollinationsRequest (فقط یک بار)
// ============================================================

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

  const commonHeaders: Record<string, string> = { 
    "User-Agent": "NovaBot/1.7",
    "Content-Type": "application/json"
  };
  if (apiKey) commonHeaders["Authorization"] = `Bearer ${apiKey}`;

  if (selectedModel.type === 'image' || selectedModel.id.includes('flux') || selectedModel.id.includes('turbo')) {
    logger.info(`🎨 Zara Image Gen Start. Input: "${text}"`);

    let finalPrompt = text;
    let promptStatusMessage = "";

    if (text.match(/[\u0600-\u06FF]/)) {
      try {
        promptStatusMessage = `🔄 **در حال ترجمه، گسترش و درک پرامپت...**`;
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

// ============================================================
// ✅ ادامه کد - getOrCreateSession و بقیه
// ============================================================

async function getOrCreateSession(chat: Chat, user: User, env: Env): Promise<ChatSession> {
  // ... کد قبلی
}

// ... بقیه کدها

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

  const commonHeaders: Record<string, string> = { 
    "User-Agent": "NovaBot/1.7",
    "Content-Type": "application/json"
  };
  if (apiKey) commonHeaders["Authorization"] = `Bearer ${apiKey}`;

  if (selectedModel.type === 'image' || selectedModel.id.includes('flux') || selectedModel.id.includes('turbo')) {
    logger.info(`🎨 Zara Image Gen Start. Input: "${text}"`);

    let finalPrompt = text;
    let promptStatusMessage = "";

    if (text.match(/[\u0600-\u06FF]/)) {
      try {
        promptStatusMessage = `🔄 **در حال ترجمه، گسترش و درک پرامپت...**`;
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
  
  const isDeleted = !(await env.SESSIONS.get(cacheKey, "text"));
  if (isDeleted && sessionCache.get(cacheKey)) {
    sessionCache.delete(cacheKey);
    logger.info(`🗑️ Cleared deleted session ${chat.id} from cache`);
  }

  const cached = sessionCache.get(cacheKey);
  if (cached) {
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
  
  if (sessionLoadLocks.has(chat.id)) {
    logger.info(`⏳ Waiting for session ${chat.id} to load...`);
    const session = await sessionLoadLocks.get(chat.id)!;
    sessionCache.set(cacheKey, session, 1 * 60 * 1000);
    return session;
  }
  
  const loadPromise = (async () => {
    try {
      const stored = await env.SESSIONS.get(cacheKey, "json");
      
      let session: ChatSession;
      
      if (stored) {
        session = hydrateSession(stored as any, chat, user);
      } else {
        session = createDefaultSession(chat, user);
        await saveSessionWithLock(session, env, true);
      }
      
      if (chat.type === "group" || chat.type === "supergroup") {
        const vipKey = `group_vip:${chat.id}`;
        const vipData = await env.SESSIONS.get(vipKey, "json").catch(() => null);
        session.vipStatus = vipData ? (vipData as any).vipStatus : false;
      }
      
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
      
      sessionCache.set(cacheKey, session, 3 * 60 * 1000);
      
      return session;
      
    } finally {
      sessionLoadLocks.delete(chat.id);
    }
  })();
  
  sessionLoadLocks.set(chat.id, loadPromise);
  return loadPromise;
}

function hydrateSession(stored: any, chat: Chat, user: User): ChatSession {
  const session = stored as ChatSession;
  session.lastSeen = Date.now();
  
  if (!session.language) session.language = 'fa';

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
  
  if (session.statistics.totalMessages === 0 && session.messageCount > 0) {
    session.statistics.totalMessages = session.messageCount;
    logger.info(`✅ Fixed totalMessages for session ${session.id}: ${session.messageCount}`);
  }
  
  if (!session.dailyLimits) {
    session.dailyLimits = {
      messages: 0,
      voicesSent: 0,
      voicesReceived: 0,
      imagesGenerated: 0,
      lastReset: Date.now()
    };
  }
  
  const objToMap = <K, V>(obj: any, keyTransform: (k: string) => K): Map<K, V> => {
    if (!obj) return new Map();
    if (obj instanceof Map) return obj;
    
    const map = new Map<K, V>();
    
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

  session.userMemories = objToMap<number, UserMemory>(
    session.userMemories, 
    (k) => parseInt(k, 10)
  );
  
  if (!session.userMemories.has(user.id)) {
    session.userMemories.set(user.id, createUserMemory(user));
    logger.info(`Created missing userMemory for ${user.id} in session ${session.id}`);
  }
  
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

  const engineKeys: AIEngine[] = ['gemini', 'sambanova', 'pollinations'];
  
  engineKeys.forEach(key => {
    if (session.engines[key]) {
      session.engines[key].userHistories = objToMap<number, HistoryItem[]>(
        session.engines[key].userHistories,
        (k) => parseInt(k, 10)
      );
      
      if (!session.engines[key].userHistories.has(user.id)) {
        session.engines[key].userHistories.set(user.id, []);
      }
      
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

function createDefaultSession(chat: Chat, user: User): ChatSession {
  const now = Date.now();
  
  const initialUserMemory = createUserMemory(user);
  const userMemories = new Map<number, UserMemory>();
  userMemories.set(user.id, initialUserMemory);

  return {
    id: chat.id,
    type: chat.type,
    activeEngine: "gemini",
    lastSeen: now,
    messageCount: 0,
    language: 'fa',
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
    
    vipStatus: false,
    
    dailyLimits: {
      messages: 0,
      voicesSent: 0,
      voicesReceived: 0,
      imagesGenerated: 0,
      lastReset: now
    }
  };
}

// ============================================================
// 📊 ADMIN STATISTICS
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

function formatUserStatistics(users: UserStatistics[]): string {
  if (users.length === 0) {
    return "📭 **هیچ کاربری یافت نشد**";
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
  
  users.slice(0, 10).forEach((user, index) => {
    const num = index + 1;
    
    const lastSeen = user.statistics.lastSeen && user.statistics.lastSeen > 0
      ? new Date(user.statistics.lastSeen).toLocaleString('fa-IR', { 
          timeZone: 'Asia/Tehran',
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : 'نامشخص';
    
    const firstUsed = user.statistics.firstUsed && user.statistics.firstUsed > 0
      ? new Date(user.statistics.firstUsed).toLocaleDateString('fa-IR', {
          timeZone: 'Asia/Tehran',
          month: 'short',
          day: 'numeric'
        })
      : 'نامشخص';
    
    const vipBadge = user.vipStatus ? '👑 ' : '';
    
    text += `**${num}.** ${vipBadge}${user.firstName}\n`;
    text += `🆔 \`${user.userId}\` | 👤 @${user.userName || 'ندارد'}\n`;
    
    text += `💬 **جمع:** ${user.statistics.totalMessages || 0} | `;
    text += `🤖 ${user.statistics.geminiMessages || 0} | `;
    text += `🎨 ${user.statistics.sambanovaMessages || 0} | `;
    text += `🔬 ${user.statistics.pollinationsMessages || 0}\n`;
    
    text += `🎤 ${user.statistics.voicesReceived || 0} ویس\n`;
    
    text += `📅 اولین: ${firstUsed} | ⏰ آخرین: ${lastSeen}\n`;
    
    if (!user.vipStatus) {
      text += `📊 **امروز:** `;
      text += `${user.dailyLimits.messages || 0}/50 پیام | `;
      text += `${user.dailyLimits.voicesSent || 0}/5 ویس ارسالی | `;
      text += `${user.dailyLimits.voicesReceived || 0}/10 ویس دریافتی | `;
    }
    
    text += `\n`;
  });
  
  if (users.length > 10) {
    text += `➕ ... و ${users.length - 10} کاربر دیگر\n\n`;
    text += `💡 برای مشاهده جزئیات هر کاربر، از پنل ادمین استفاده کنید.`;
  }
  
  return text;
}

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
      name: TRANSLATIONS.fa[`engine_${favorite.key}`] || 'نامشخص',
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
  
  const customPrompt = session.customPrompts[session.activeEngine];
  if (customPrompt && customPrompt.trim().length > 0) {
    return `${customPrompt}\nYou are talking to ${userFirstName}. Current date: ${currentTime}.${isGroup ? ` This is a group chat. ${groupAnalysis}` : ''}`;
  }
  
  const personalityKey = session.activePersonality;
  if (personalityKey && PERSONALITIES[personalityKey]) {
    const personality = PERSONALITIES[personalityKey];
    const prompt = session.language === 'fa' ? personality.prompt_fa : personality.prompt_en;
    if (prompt && prompt.trim().length > 0) {
      return `${prompt}\n\n👤 نام کاربر: ${userFirstName}\n📅 تاریخ امروز: ${currentTime}`;
    }
  }
  
  return buildDefaultPrompt(session.activeEngine, userFirstName, isGroup, userMemory, groupAnalysis, session.language);
}

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

async function callClaudeAPI(prompt: string, history: HistoryItem[], model: string, apiKey: string): Promise<string> {
  let systemPrompt = "";
  const chatHistory = [...history];
  
  if (chatHistory.length > 0 && chatHistory[0].role === "system") {
    systemPrompt = chatHistory[0].parts[0]?.text || "";
    chatHistory.shift();
  }
  
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
  
  const data = await response.json();

  if (data.error) {
    throw new Error(`Claude API Error: ${data.error.message}`);
  }
  
  if (!data.content?.[0]?.text) {
    throw new Error("Empty response from Claude");
  }

  return data.content[0].text.trim();
}

// ============================================================
// 📦 MODEL MANAGEMENT
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
      { id: "DeepSeek-V3.1", name: "DeepSeek-V3.1", type: 'text' as const },
      { id: "Qwen3-32B", name: "Qwen3-32B", type: 'text' as const },
      { id: "Llama-4-Maverick-17B-128E-Instruct", name: "Llama 4 Maverick", type: 'text' as const }
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
  const cacheKey = `model_cache:${engine}`;
  const cached = await env.SESSIONS.get(cacheKey, "json");
  
  if (cached && !forceRefresh) {
    const cache = cached as ModelCache;
    const age = Date.now() - cache.lastUpdated;
    
    if (age < 12 * 60 * 60 * 1000) {
      if (engine === 'sambanova') config.SAMBANOVA_MODELS = cache.models.map(m => m.id);
      if (engine === 'pollinations') config.POLLINATIONS_MODELS = cache.models.map(m => m.id);
      return cache;
    }
  }
  
  return await fetchAndCacheModels(engine, env);
}

// ============================================================
// 🎯 CALLBACK HANDLERS
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

  statusText += `\n🔬 **Pollinations (زارا):**\n`;
  await editMessageText(chatId, currentMsgId!, statusText + `> ⏳ در حال تست...`);

  try {
    const zaraUrl = "https://text.pollinations.ai/openai";
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

  statusText += `\n🖼️ **Pixabay (جستجوی تصویر):**\n`;
  if (config.PIXABAY_KEY) {
    statusText += `  🟢 کلید تنظیم شده (${config.PIXABAY_KEY.substring(0,4)}...)\n`;
  } else {
    statusText += `  🔴 کلید Pixabay تنظیم نشده است.\n`;
  }

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

// ============================================================
// 🧹 CLEANUP FUNCTIONS
// ============================================================

async function cleanupSessions(env: Env): Promise<void> {
  const now = Date.now();
  let cleaned = 0;
  let compressed = 0;
  
  for (const [chatId, context] of groupContextCache.entries()) {
    const lastActivity = context.messages.length > 0 
      ? context.messages[context.messages.length - 1].timestamp 
      : context.lastCleanup;
    
    if (now - lastActivity > 30 * 60 * 1000) {
      groupContextCache.delete(chatId);
      cleaned++;
    }
  }
  
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
      
      if (inactiveDays > 7) {
        let modified = false;
        
        if (session.engines.gemini.history.length > 20) {
          session.engines.gemini.history = session.engines.gemini.history.slice(-20);
          modified = true;
        }
        if (session.engines.sambanova.history.length > 20) {
          session.engines.sambanova.history = session.engines.sambanova.history.slice(-20);
          modified = true;
        }
        if (session.engines.pollinations.history.length > 20) {
          session.engines.pollinations.history = session.engines.pollinations.history.slice(-20);
          modified = true;
        }
        
        if (modified) {
          await env.SESSIONS.put(item.name, JSON.stringify(session));
          compressed++;
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup session ${item.name}`, error);
    }
  }
  
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
// 🎙️ VOICE & MEDIA PROCESSING
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
    
    const limitCheck = await checkDailyLimit(session, 'voice_sent');
    if (!limitCheck.allowed) {
      await sendMessage(chat.id, limitCheck.message!, { reply_to_message_id: message.message_id });
      return;
    }
    
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
// 📥 FILE & TRANSCRIPTION HELPERS
// ============================================================

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
// 🚀 PROCESS AI REQUEST (CORE)
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
  
  if (!isGroup) {
    const lang = session.language || 'fa';
    const emoji =['💭', '🤔', '✨', '⚡', '⏳'][Math.floor(Math.random() * 5)];
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
// ⚡ ULTRA-FAST RESPONSE (Optimized for Cloudflare)
// ============================================================

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

function sanitizePlainText(text: string): string {
  return text.replace(/>]/g, '');
}

// ============================================================
// 📦 توابع HANDLE GEMINI REQUEST
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
// 📦 تابع HANDLE SAMBANOVA REQUEST
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
    engine.history = [{ role: "assistant", parts: [{ text: currentPrompt }], timestamp: Date.now() }];
  }

  const historyToUse = (isGroup && userHistory) ? [engine.history[0], ...userHistory] : engine.history;

  const totalKeys = config.SAMBANOVA_KEYS.length;
  const totalModels = config.SAMBANOVA_MODELS.length;
  const maxAttemptsPerKey = 2;
  const totalAttempts = totalKeys * maxAttemptsPerKey;
  const errors = { quota: 0, blocked: 0, timeout: 0, auth: 0, network: 0, unknown: 0 };

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const keyIndex = Math.floor(attempt / maxAttemptsPerKey) % totalKeys;
    const apiKey = config.SAMBANOVA_KEYS[keyIndex];
    const modelIndex = (engine.modelIndex + attempt) % totalModels;
    const model = config.SAMBANOVA_MODELS[modelIndex];
    
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
    
    if (attempt < totalAttempts - 1) {
      await new Promise(resolve =>
        setTimeout(resolve, 1000 * (Math.floor(attempt / maxAttemptsPerKey) + 1))
      );
    }
  }

  engine.consecutiveErrors++;
  
  let errorMsg = "❌ **خطا در لونا**\n\n";
  if (errors.quota >= totalAttempts * 0.7) {
    errorMsg += "⏳ تمام کلیدهای API محدودیت مصرف دارند.\n💡 مدل رو با /model عوض کن.";
  } else if (errors.timeout >= totalAttempts * 0.5) {
    errorMsg += "⏱️ سرور دیر جواب داد.\n🔄 دوباره امتحان کن.";
  } else if (errors.blocked > 0) {
    errorMsg += "🛡️ محتوای درخواست مسدود شد.\n📝 متن رو تغییر بده و دوباره بفرست.";
  } else {
    errorMsg += "⚠️ تمام کلیدها ناموفق بودند.\n💡 لطفاً /model بزن و مدل رو عوض کن.";
  }
  
  throw new Error(errorMsg);
}

// ============================================================
// 📦 تابع CALL SAMBANOVA API
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
// 📦 تابع ADD TO HISTORY
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
// 📦 تابع CHECK MAINTENANCE MODE
// ============================================================

async function checkMaintenanceMode(env: Env, userId: number): Promise<{ blocked: boolean; message?: string }> {
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

// ============================================================
// 📦 تابع CLEANUP HISTORY
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
// 📦 تابع GET START KEYBOARD
// ============================================================

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
      [
        createInlineButton(lang === 'fa' ? '🎭 تغییر شخصیت' : '🎭 Change Personality', 'personality_menu')
      ]
    ]
  };
}

// ============================================================
// 📦 تابع HANDLE MODEL SWITCH
// ============================================================

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

// ============================================================
// 📦 تابع HANDLE GROUP MODE SWITCH
// ============================================================

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

// ============================================================
// 📦 تابع SET GROUP VIP
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
// 📦 تابع IS GROUP VIP
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
// 📦 تابع HANDLE EXISTING CALLBACKS
// ============================================================

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

    case 'set_personality_nova':
    case 'set_personality_lilith':
    case 'set_personality_cipher':
    case 'set_personality_leatherface':
    case 'set_personality_aria':
    case 'set_personality_jax':
    case 'set_personality_luna':
    case 'set_personality_zara':
    case 'set_personality_alien':
    case 'set_personality_victoria':
    {
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

// ============================================================
// 📦 تابع UPDATE GROUP SETTINGS
// ============================================================

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
// ============================================================
// 📦 تابع SHOW MODEL SELECTION (UI)
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
// 📦 تابع UPDATE MODEL SELECTION
// ============================================================

async function updateModelSelection(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  
  const text = buildModelSelectionText(session);
  const keyboard = buildModelSelectionKeyboard(session);
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

async function sendModelSelection(chatId: number, replyToMsgId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  
  const text = buildModelSelectionText(session);
  const keyboard = buildModelSelectionKeyboard(session);
  
  await sendMessage(chatId, text, {
    reply_to_message_id: replyToMsgId,
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 📦 توابع کمکی برای دکمه‌ها و کیبورد
// ============================================================

function createInlineButton(text: string | undefined | null, callback_data: string): { text: string; callback_data: string } {
  const safeText = String(text || 'Unknown').trim();
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
// 📦 تابع UPDATE PROMPT MENU
// ============================================================

async function updatePromptMenu(chatId: number, messageId: number, session: ChatSession): Promise<void> {
  const lang = session.language || 'fa';
  const txt = TRANSLATIONS[lang];
  
  const currentPrompts = {
    gemini: session.customPrompts.gemini || txt.prompt_default,
    sambanova: session.customPrompts.sambanova || txt.prompt_default,
    pollinations: session.customPrompts.pollinations || txt.prompt_default
  };
  
  const text = `${txt.prompt_title}\n\n` +
    `${txt.prompt_current}\n\n` +
    `🤖 **${getEngineName('gemini', lang)}:**\n\`${currentPrompts.gemini}\`\n\n` +
    `🎨 **${getEngineName('sambanova', lang)}:**\n\`${currentPrompts.sambanova}\`\n\n` +
    `🔬 **${getEngineName('pollinations', lang)}:**\n\`${currentPrompts.pollinations}\`\n\n` +
    `${txt.prompt_guide}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: txt.prompt_reset, callback_data: 'reset_prompt_all' },
        { text: txt.prompt_show, callback_data: 'show_prompts' }
      ],
      [
        { text: txt.btn_back, callback_data: 'open_help' }
      ]
    ]
  };
  
  await editMessageText(chatId, messageId, text, {
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 📦 تابع SEND IMAGE RESULTS
// ============================================================

async function sendImageResults(
  chatId: number, 
  replyToMsgId: number, 
  images: string[], 
  query: string,
  translations: any
): Promise<void> {
  if (images.length === 0) {
    await sendMessage(chatId, translations.search_no_results, {
      reply_to_message_id: replyToMsgId
    });
    return;
  }
  
  const maxImages = Math.min(images.length, 5);
  
  for (let i = 0; i < maxImages; i++) {
    const imageUrl = images[i];
    const caption = i === 0 
      ? translations.search_results
          .replace('{caption}', `🔍 **${query}**`)
          .replace('{count}', String(images.length)) + translations.search_attribution
      : undefined;
    
    try {
      await sendPhoto(chatId, imageUrl, caption, {
        reply_to_message_id: i === 0 ? replyToMsgId : undefined
      });
    } catch (error) {
      await sendMessage(chatId, 
        translations.search_link_fallback
          .replace('{link}', imageUrl)
          .replace('{count}', String(images.length)),
        { reply_to_message_id: replyToMsgId }
      );
      break;
    }
  }
}

// ============================================================
// 📦 تابع SEARCH PIXABAY IMAGES
// ============================================================

async function searchPixabayImages(query: string, perPage: number = 5): Promise<string[]> {
  if (!config.PIXABAY_KEY) {
    throw new Error("PIXABAY_KEY not configured");
  }
  
  const encodedQuery = encodeURIComponent(query);
  const url = `https://pixabay.com/api/?key=${config.PIXABAY_KEY}&q=${encodedQuery}&image_type=photo&per_page=${perPage}&safesearch=true`;
  
  const response = await fetchWithTimeout(url, {}, 15000);
  
  if (!response.ok) {
    throw new Error(`Pixabay API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.hits || data.hits.length === 0) {
    return [];
  }
  
  return data.hits.map((hit: any) => hit.webformatURL || hit.largeImageURL).filter(Boolean);
}

// ============================================================
// 📦 توابع HELP
// ============================================================

async function showHelpChat(cb: CallbackQuery, env: Env): Promise<void> {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  
  const text = lang === 'fa'
    ? `💬 **راهنمای گفتگو با نوا**\n\n` +
      `**📝 نحوه گفتگو:**\n` +
      `• در چت خصوصی: مستقیم پیام بفرستید\n` +
      `• در گروه: منشن کنید (@${BOT_INFO?.username}) یا ریپلای بزنید\n\n` +
      `**🎤 صدا:**\n` +
      `• ویس بفرستید، نوا تشخیص و پاسخ میده\n` +
      `• کیفیت صدا مهم نیست، نوا صدای شما را می‌فهمد\n\n` +
      `**📎 فایل:**\n` +
      `• عکس، PDF، متن و ویدیو پشتیبانی می‌شود\n` +
      `• برای آنالیز تصاویر، نوا از هوش مصنوعی استفاده می‌کند\n\n` +
      `**🧠 حافظه:**\n` +
      `• نوا تا ${config.HISTORY_LIMIT} پیام آخر را به خاطر می‌سپارد\n` +
      `• برای پاک کردن حافظه: /new\n` +
      `• هر موتور حافظه جداگانه دارد\n\n` +
      `💡 **نکته:** نوا همیشه به یاد می‌آورد که شما کی هستید!`
    : `💬 **Chat Guide with Nova**\n\n` +
      `**📝 How to chat:**\n` +
      `• Private: Just send a message\n` +
      `• Group: Mention (@${BOT_INFO?.username}) or reply\n\n` +
      `**🎤 Voice:**\n` +
      `• Send voice message, Nova transcribes and replies\n` +
      `• Quality doesn't matter, Nova understands you\n\n` +
      `**📎 Files:**\n` +
      `• Images, PDFs, text files, videos supported\n` +
      `• For image analysis, Nova uses AI\n\n` +
      `**🧠 Memory:**\n` +
      `• Nova remembers last ${config.HISTORY_LIMIT} messages\n` +
      `• Clear: /new\n` +
      `• Separate memory per engine\n\n` +
      `💡 **Tip:** Nova always remembers who you are!`;
  
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [[
        { text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }
      ]]
    })
  });
}

async function showHelpImages(cb: CallbackQuery, env: Env): Promise<void> {
  const session = await getOrCreateSession(cb.message!.chat, cb.from, env);
  const lang = session.language || 'fa';
  
  const text = lang === 'fa'
    ? `🎨 **راهنمای تصاویر**\n\n` +
      `**🖼️ ساخت تصویر:**\n` +
      `\`/img [توضیح]\`\n\n` +
      `**مثال:**\n` +
      `\`/img یک گربه فضانورد در کهکشان\`\n\n` +
      `**🔍 جستجوی تصویر:**\n` +
      `\`/search [متن]\`\n\n` +
      `**مثال:**\n` +
      `\`/search طبیعت زیبا\`\n\n` +
      `**✨ مدل‌های تصویر:**\n` +
      `• Flux 2 Klein 4B (سریع)\n` +
      `• Flux 1 Schnell\n` +
      `• Phoenix 1.0\n` +
      `• Lucid Origin\n\n` +
      `**📊 محدودیت:**\n` +
      `• رایگان: ۵ تصویر در روز\n` +
      `• VIP: نامحدود\n\n` +
      `💡 **نکته:** اگر تصویر ساخته نشد، پرامپت را انگلیسی بنویسید.`
    : `🎨 **Image Guide**\n\n` +
      `**🖼️ Generate:**\n` +
      `\`/img [prompt]\`\n\n` +
      `**Example:**\n` +
      `\`/img a cat astronaut in space\`\n\n` +
      `**🔍 Search:**\n` +
      `\`/search [query]\`\n\n` +
      `**Example:**\n` +
      `\`/search beautiful nature\`\n\n` +
      `**✨ Models:**\n` +
      `• Flux 2 Klein 4B (Fast)\n` +
      `• Flux 1 Schnell\n` +
      `• Phoenix 1.0\n` +
      `• Lucid Origin\n\n` +
      `**📊 Limit:**\n` +
      `• Free: 5 images/day\n` +
      `• VIP: Unlimited\n\n` +
      `💡 **Tip:** If generation fails, try English prompt.`;
  
  await answerCallbackQuery(cb.id);
  await editMessageText(cb.message!.chat.id, cb.message!.message_id, text, {
    reply_markup: JSON.stringify({
      inline_keyboard: [[
        { text: lang === 'fa' ? '🔙 بازگشت' : '🔙 Back', callback_data: 'help_back' }]
      ]
    })
  });
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

async function isCFKeyDisabled(accountId: string, token: string): Promise<boolean> {
  return false;
}

function disableCFKey(accountId: string, token: string) {
  logger.warn(`🚫 Cloudflare Key temporarily disabled: ${accountId}`);
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
// 🕵️ AGENT COMMAND HANDLER
// ============================================================

async function handleAgentCommand(message: Message, args: string[], env: Env) {
  const { chat, from } = message;
  if (!from) return;

  const query = args.join(' ').trim();
  if (!query) {
    await sendMessage(chat.id, "❌ متنی بنویسید، مثال:\n`/agent یک تصویر از گربه در فضا بساز`", { 
      reply_to_message_id: message.message_id 
    });
    return;
  }

  const session = await getOrCreateSession(chat, from, env);
  const thinkingMsg = await sendMessage(chat.id, 
    "🤖 **حالت Agent فعال شد**\nدر حال تصمیم‌گیری...", 
    { reply_to_message_id: message.message_id }
  );
  
  const toolList = Object.entries(AGENT_TOOLS).map(([n, t]) => 
    `- ${n}: ${t.desc} (پارامتر: ${JSON.stringify(t.params)})`
  ).join('\n');
  
  const agentSystemPrompt = `تو یک دستیار هوشمند هستی که می‌توانی از ابزارها استفاده کنی. ابزارها:\n${toolList}\n\nاگر نیاز به ابزار داری، فقط یک JSON برگردان مثل:\n{"tool": "generate_image", "args": {"prompt": "توضیح فارسی"}}\nدر غیر این صورت پاسخ عادی بده.`;
  
  let responseText = "";
  try {
    const userParts: Part[] = [{ text: query }];
    responseText = await callGeminiAPI(
      userParts, 
      config.GEMINI_MODEL, 
      config.GEMINI_KEYS[0], 
      [{ role: "user", parts: [{ text: agentSystemPrompt }] }]
    );
  } catch(e) {
    responseText = "خطا در ارتباط با مدل";
  }
  
  const toolCall = extractToolJSON(responseText);
  if (toolCall?.tool && AGENT_TOOLS[toolCall.tool]) {
    await editMessageText(chat.id, thinkingMsg.message_id, `🔧 استفاده از ابزار: ${toolCall.tool}...`);
    const result = await executeToolFromAgent(toolCall.tool, toolCall.args, chat.id, message.message_id, env);
    await editMessageText(chat.id, thinkingMsg.message_id, `✅ ابزار اجرا شد.\n${result}\n\n🤖 پاسخ نهایی:`);
  } else {
    await editMessageText(chat.id, thinkingMsg.message_id, responseText);
  }
}

// ============================================================
// 🔍 SEARCH COMMAND HANDLER
// ============================================================

async function handleSearchCommand(message: Message, args: string[], env: Env) {
  const { chat, from } = message;
  if (!from) return;

  if (args.length === 0) {
    await sendMessage(chat.id, "❌ **فرمت نادرست**\n\nاستفاده: `/search [متن]`\nمثال: `/search طبیعت زیبا`", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const session = await getOrCreateSession(chat, from, env);
  const query = args.join(' ').trim();

  if (query.length > 100) {
    await sendMessage(chat.id, "❌ متن جستجو خیلی طولانی است. حداکثر 100 کاراکتر.", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const searchMsg = await sendMessage(chat.id, 
    `🔍 **در حال جستجوی "${query}"...**\n\n⏳ لطفاً صبر کنید`, 
    { reply_to_message_id: message.message_id }
  );

  try {
    const images = await searchPixabayImages(query, 5);
    
    await deleteMessage(chat.id, searchMsg.message_id);
    
    const txt = TRANSLATIONS[session.language || 'fa'];
    await sendImageResults(chat.id, message.message_id, images, query, {
      search_results: txt.search_results || '🖼️ {caption}\n\n📸 {count} تصویر یافت شد',
      search_no_results: txt.search_no_results || 'هیچ تصویری یافت نشد.',
      search_link_fallback: txt.search_link_fallback || '⚠️ نتونستم تصویر رو مستقیم بفرستم، اینم لینکش:\n\n{link}\n\n📸 {count} تصویر یافت شد',
      search_failed: txt.search_failed || '❌ **خطا در جستجو**',
      search_guide: txt.search_guide || '💡 راهنمایی:\n• از کلمات ساده‌تر استفاده کنید\n• به انگلیسی امتحان کنید',
      search_attribution: txt.search_attribution || '\n\n📸 منبع: Pixabay.com'
    });
    
    logger.info(`✅ Image search completed: ${images.length} images sent for "${query}"`);

  } catch (error) {
    const errorMsg = getRawError(error);
    let finalError;
    
    if (from.id === config.BOT_OWNER_ID) {
      finalError = `Raw error: ${errorMsg}`;
    } else {
      if (errorMsg === "NO_RESULTS") {
        finalError = "هیچ تصویری یافت نشد. لطفاً کلمات دیگری امتحان کنید.";
      } else if (errorMsg.includes('quota') || errorMsg.includes('محدودیت')) {
        finalError = "محدودیت سرور جستجو. لطفاً کمی بعد تلاش کنید.";
      } else {
        finalError = errorMsg.substring(0, 100);
      }
    }
    
    await editMessageText(chat.id, searchMsg.message_id, 
      `❌ **خطا در جستجو**\n\n${finalError}\n\n💡 راهنمایی:\n• از کلمات ساده‌تر استفاده کنید\n• به انگلیسی امتحان کنید\n• کمی بعد دوباره تلاش کنید`
    );
  }
}

// ============================================================
// 📝 SET PROMPT COMMAND HANDLER
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
        timestamp,
        userId: from.id,
        userName: from.first_name
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
// 👑 ADMIN PANEL
// ============================================================

async function updateAdminPanel(chatId: number, messageId: number, env: Env) {
  const state = adminPanelStates.get(chatId) || { page: 0, perPage: 5, sortBy: 'new' };
  
  const allUsers = await getAllUserStatistics(env);
  
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

// ============================================================
// 👑 BROADCAST SYSTEM
// ============================================================

const broadcastStates = new Map<number, { mode: 'all' | 'vip' | 'free' | 'specific'; userId?: number }>();

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

async function handleBroadcastMessage(message: Message, broadcastState: any, env: Env) {
  const { chat, from, text } = message;
  if (!text || !from || from.id !== config.BOT_OWNER_ID) return;

  recordRequest(await getOrCreateSession(chat, from, env));

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

    await processBroadcastBatch(env);

  } catch (error) {
    logger.error("Broadcast job creation failed", error);
    broadcastStates.delete(chat.id);
    await editMessageText(chat.id, processingMsg.message_id, "❌ خطا در ایجاد job").catch(() => {});
  }
}

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
          text: `📢 **پیام از مدیر ربات:**\n\n${job.message}\n\n━━━━━━━━━━━━━━━━\n_این پیام از طرف مدیریت ارسال شده است_`,
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
// 👤 USER DETAIL & MEMORY
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
// ============================================================
// 🗑️ RESET USER MEMORY
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
// 🔧 REBUILD DATABASE
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
        }
        
        if (wasModified) {
          await saveSessionWithLock(session, env, true);
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
        [{ text: "🔄 بروزرسانی", callback_data: "db_refresh_stats" }],
        [{ text: "🔙 بازگشت", callback_data: "admin_back_to_main" }]
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
// 🧹 BLOCKED USERS COMMAND
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
// ============================================================
// 👑 ADMIN COMMANDS
// ============================================================

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

async function handleSetVipCommand(message: Message, args: string[], env: Env) {
  const { chat, from } = message;
  if (!from || from.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🚫 **دسترسی محدود**\n\nاین دستور فقط برای مالک ربات است.", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const isGroup = chat.type === "group" || chat.type === "supergroup";
  
  if (args.length > 0 && !isNaN(parseInt(args[0]))) {
    const targetUserId = parseInt(args[0]);
    const sessionKey = `session:${targetUserId}`;
    const stored = await env.SESSIONS.get(sessionKey, "json");
    
    if (!stored) {
      await sendMessage(chat.id, `❌ کاربر \`${targetUserId}\` یافت نشد.`, {
        reply_to_message_id: message.message_id
      });
      return;
    }
    
    const userSession = stored as ChatSession;
    userSession.vipStatus = !userSession.vipStatus;
    await env.SESSIONS.put(sessionKey, JSON.stringify(userSession));
    
    await sendMessage(chat.id, 
      userSession.vipStatus 
        ? `✅ کاربر \`${targetUserId}\` VIP شد! 👑` 
        : `❌ VIP کاربر \`${targetUserId}\` حذف شد.`, 
      { reply_to_message_id: message.message_id }
    );
    return;
  }

  if (isGroup) {
    const groupSession = await getOrCreateSession(chat, from, env);
    const currentStatus = groupSession.vipStatus;
    groupSession.vipStatus = !currentStatus;
    await saveSessionWithLock(groupSession, env, true);
    await setGroupVIP(chat.id, groupSession.vipStatus, env);
    
    await sendMessage(chat.id, 
      groupSession.vipStatus 
        ? "✅ این گروه VIP شد! 👑" 
        : "❌ این گروه از حالت VIP خارج شد!", 
      { reply_to_message_id: message.message_id }
    );
  } else {
    await sendMessage(chat.id, "⚠️ **فقط برای گروه‌ها**\n\nبرای VIP کردن کاربر خاص: `/setvip [user_id]`", {
      reply_to_message_id: message.message_id
    });
  }
}

// ============================================================
// 📋 LOG COMMANDS
// ============================================================

async function handleLogCommand(message: Message, env: Env): Promise<void> {
  const { chat } = message;
  
  if (message.from?.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🚫 دسترسی محدود", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  if (recentLogs.length === 0) {
    await sendMessage(chat.id, "📭 هیچ لاگی ثبت نشده", { 
      reply_to_message_id: message.message_id 
    });
    return;
  }

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
      ],
      [
        { text: "📥 دانلود فایل", callback_data: "log_download" }
      ],
      [
        { text: "❌ بستن", callback_data: "admin_close" }
      ]
    ]
  };
  
  await sendMessage(chat.id, text, {
    reply_to_message_id: message.message_id,
    reply_markup: JSON.stringify(validateKeyboard(keyboard))
  });
}

// ============================================================
// 🗑️ DELETE, REMOVE, BAN COMMANDS
// ============================================================

async function handleDeleteCommand(message: Message, env: Env): Promise<void> {
  const { chat, from } = message;
  
  if (from?.id !== config.BOT_OWNER_ID) return;

  if (!message.reply_to_message) {
    const warnMsg = await sendMessage(chat.id, 
      '⚠️ روی پیامی که میخوای حذف کنی ریپلای بزن.', 
      { reply_to_message_id: message.message_id }
    );
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
}

async function handleRemoveCommand(message: Message, env: Env): Promise<void> {
  const { chat, from } = message;
  
  if (from?.id !== config.BOT_OWNER_ID) return;

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

  if (targetUser.id === config.BOT_OWNER_ID || targetUser.is_bot) {
    await deleteMessage(chat.id, message.message_id);
    return;
  }

  try {
    await callTelegramAPI('banChatMember', {
      chat_id: chat.id,
      user_id: targetUser.id
    });
    await callTelegramAPI('unbanChatMember', {
      chat_id: chat.id,
      user_id: targetUser.id,
      only_if_banned: true
    });

    const removeMsg = await sendMessage(chat.id, 
      `✅ **${targetUser.first_name}** از گروه حذف شد.`
    );

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
}

async function handleBanCommand(message: Message, args: string[], env: Env): Promise<void> {
  const { chat, from } = message;
  
  if (from?.id !== config.BOT_OWNER_ID) return;

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

  const banSeconds = args[0] ? parseInt(args[0]) : 3600;
  const validSeconds = isNaN(banSeconds) || banSeconds < 30 ? 3600 : banSeconds;
  const untilDate = Math.floor(Date.now() / 1000) + validSeconds;

  const formatDuration = (secs: number): string => {
    if (secs < 60) return `${secs} ثانیه`;
    if (secs < 3600) return `${Math.floor(secs / 60)} دقیقه`;
    if (secs < 86400) return `${Math.floor(secs / 3600)} ساعت`;
    return `${Math.floor(secs / 86400)} روز`;
  };

  try {
    await env.SESSIONS.put(
      `banned:${chat.id}:${banTarget.id}`, 
      JSON.stringify({ 
        until: untilDate * 1000, 
        chatId: chat.id,
        reason: 'banned by admin'
      })
    );

    await callTelegramAPI('banChatMember', {
      chat_id: chat.id,
      user_id: banTarget.id,
      until_date: untilDate
    });

    const banMsg = await sendMessage(chat.id, 
      `🔨 **${banTarget.first_name}** بن شد!\n⏱ مدت: **${formatDuration(validSeconds)}**`
    );

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
}

// ============================================================
// 🧹 DBCLEAN & DBSTATS & DBDELETE COMMANDS
// ============================================================

async function handleDbCleanCommand(message: Message, env: Env): Promise<void> {
  const { chat, from } = message;
  
  if (from?.id !== config.BOT_OWNER_ID) {
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
}

async function handleDbStatsCommand(message: Message, env: Env): Promise<void> {
  const { chat, from } = message;
  
  if (from?.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🚫 دسترسی محدود", {
      reply_to_message_id: message.message_id
    });
    return;
  }
  
  await sendDatabaseStats(chat.id, message.message_id, env);
}

async function handleDbDeleteCommand(message: Message, args: string[], env: Env): Promise<void> {
  const { chat, from } = message;
  
  if (from?.id !== config.BOT_OWNER_ID) {
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
}

// ============================================================
// 📢 TTS HANDLER
// ============================================================

async function ttsHandler(text: string, chatId: number, replyToMsgId: number, env: Env): Promise<boolean> {
  try {
    const match = text.match(/^([\w\u0600-\u06FF]+)\s+با\s+ویس\s+بگو\s+(.+)$/i);
    if (!match) return false;
    
    const targetUser = match[1];
    const ttsText = match[2].trim();
    
    if (!ttsText || ttsText.length < 2) {
      await sendMessage(chatId, "❌ متن خیلی کوتاه است.", { reply_to_message_id: replyToMsgId });
      return true;
    }
    
    const isMention = targetUser.startsWith('@');
    if (!isMention) {
      await sendMessage(chatId, "❌ لطفاً یک کاربر را با @ منشن کنید.", { reply_to_message_id: replyToMsgId });
      return true;
    }
    
    await sendTypingAction(chatId);
    
    await sendMessage(chatId, 
      `🔊 **${targetUser}** گفت:\n\n"${ttsText}"\n\n_🎵 (این یک شبیه‌سازی TTS است)_`,
      { reply_to_message_id: replyToMsgId }
    );
    
    return true;
    
  } catch (error) {
    logger.error("TTS handler failed", error);
    return false;
  }
}

// ============================================================
// 👥 GROUP INTERFACE
// ============================================================

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

  if (data === "groups_refresh") {
    await answerCallbackQuery(cb.id);
    await showActiveGroups(chatId, msgId, env);
    return;
  }

  if (data.startsWith("leave_grp_")) {
    const groupId = parseInt(data.replace("leave_grp_", ""));
    await answerCallbackQuery(cb.id, "🚪 در حال ترک گروه...", false);
    
    try {
      await onBotLeftGroup(groupId, env);
      try {
        await callTelegramAPI("leaveChat", { chat_id: groupId });
      } catch (e) {
        logger.warn(`Failed to leave group ${groupId}`, e);
      }
      await answerCallbackQuery(cb.id, "✅ گروه با موفقیت ترک شد", false);
      await showActiveGroups(chatId, msgId, env);
    } catch (error) {
      await answerCallbackQuery(cb.id, "❌ خطا در ترک گروه", true);
    }
    return;
  }
}
// ============================================================
// 📦 توابع INITIALIZE و HEALTH CHECK
// ============================================================

async function initializeBot(env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    // Preload models
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

    logger.info("⚡ Warming up model caches...");
    
    const warmupPromises = [
      getModelsWithCache("sambanova", env, false).catch(e => logger.warn("Sambanova cache warmup failed")),
      getModelsWithCache("pollinations", env, false).catch(e => logger.warn("Pollinations cache warmup failed"))
    ];
    
    await Promise.allSettled(warmupPromises);
    
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
// 📦 تابع HEALTH CHECK
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
        models: config.POLLINATIONS_MODELS.length
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
    },
    storage: "cloudflare_kv_enhanced"
  };
  
  return new Response(JSON.stringify(health, null, 2), {
    headers: { "Content-Type": "application/json" },
    status: totalActiveRequests > config.MAX_CONCURRENT_REQUESTS ? 503 : 200
  });
}

// ============================================================
// 📦 تابع GET BOT UPTIME
// ============================================================

async function getBotUptime(env: Env): Promise<number> {
  const startTimeStr = await env.SESSIONS.get("bot_start_time", "text");
  if (!startTimeStr) return 0;
  
  const startTime = parseInt(startTimeStr);
  return Math.floor((Date.now() - startTime) / 1000);
}

// ============================================================
// 🚀 MAIN FETCH HANDLER
// ============================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // تنظیم config
    if (!config) {
      config = createConfig(env);
      API_URL = `https://api.telegram.org/bot${config.TOKEN}`;
    }

    // مقداردهی اولیه ربات (یک بار)
    if (!isInitialized) {
      if (!initPromise) {
        initPromise = initializeBot(env, config)
          .then(() => {
            isInitialized = true;
            logger.info("✅ Bot is ready!");
          })
          .catch(err => {
            logger.error("❌ Init failed", err);
            throw err;
          });
      }
      await initPromise;
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ===== Health Check =====
    if (path === "/health" || path === "/healthz") {
      return await createHealthCheckResponse(env);
    }

    // ===== Root =====
    if (path === "/" || path === "") {
      let result = `🚀 Nova Bot v${BOT_VERSION} running!\n`;
      result += `🔑 TOKEN: ${config.TOKEN ? '✅ Set' : '❌ Missing'}\n`;
      result += `🤖 Bot: ${BOT_INFO?.first_name || 'Unknown'} (@${BOT_INFO?.username || 'unknown'})\n`;
      
      if (env.SESSIONS) {
        try {
          await env.SESSIONS.put("_ping", "ok");
          const v = await env.SESSIONS.get("_ping");
          result += `💾 KV: ✅ Connected (${v})\n`;
        } catch (e) {
          result += `💾 KV: ⚠️ Error\n`;
        }
      } else {
        result += `💾 KV: ❌ Not connected\n`;
      }
      
      return new Response(result, {
        headers: { "Content-Type": "text/plain" }
      });
    }

    // ===== Webhook =====
    if (request.method === "POST" && path === "/webhook") {
      try {
        const update = await request.json() as Update;
        
        // اعتبارسنجی اولیه
        if (!update || !update.update_id) {
          return new Response("Invalid update", { status: 400 });
        }

        // پردازش آپدیت در پس‌زمینه (non-blocking)
        ctx.waitUntil(
          handleUpdate(update, env, config).catch(err => {
            logger.error("❌ Update processing failed", err);
          })
        );

        return new Response("OK", { status: 200 });
        
      } catch (error) {
        logger.error("❌ Webhook error", error);
        return new Response("Bad Request", { status: 400 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // ============================================================
// 🚀 MAIN FETCH HANDLER
// ============================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // کد fetch شما اینجا
    // (همه کدهایی که قبلاً توی fetch بود)
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      const now = Date.now();

      // 1. پاکسازی کش مدل‌های قدیمی
      if (modelListStates.size > 100) {
        modelListStates.clear();
        logger.info("🧹 Cleared model list states");
      }

      // 2. پاکسازی کش گروه‌ها
      for (const [chatId, context] of groupContextCache.entries()) {
        if (now - context.lastCleanup > 60 * 60 * 1000) {
          groupContextCache.delete(chatId);
        }
      }

      // 3. پاکسازی لاک‌های session
      for (const [chatId] of sessionLoadLocks.entries()) {
        sessionLoadLocks.delete(chatId);
      }

      // 4. پاکسازی Rate Limiting قدیمی
      for (const [userId, timestamps] of callbackRateLimits.entries()) {
        const recent = timestamps.filter(t => now - t < 60000);
        if (recent.length === 0) {
          callbackRateLimits.delete(userId);
        } else {
          callbackRateLimits.set(userId, recent);
        }
      }

      // 5. پردازش Broadcast Job
      try {
        const broadcastJob = await env.SESSIONS.get('broadcast_job:current', 'json');
        if (broadcastJob && broadcastJob.status === 'pending' && broadcastJob.processedIndex < broadcastJob.totalUsers) {
          logger.info(`🔄 Scheduled broadcast: ${broadcastJob.processedIndex}/${broadcastJob.totalUsers}`);
          await processBroadcastBatch(env);
        }
      } catch (broadcastError) {
        logger.error("Scheduled broadcast processing failed", broadcastError);
      }

      // 6. پاکسازی خودکار سشن‌ها
      if (Math.random() < 0.01) {
        await cleanupSessions(env);
        logger.info("🧹 Auto cleanup completed");
      }

      logger.info("✅ Scheduled tasks completed");
      
    } catch (error) {
      logger.error("❌ Scheduled tasks failed", error);
    }
  }
};

// ============================================================
// 📦 تابع HANDLE UPDATE (ورودی اصلی)
// ============================================================

async function handleUpdate(update: Update, env: Env, config: ReturnType<typeof createConfig>): Promise<void> {
  try {
    // پاکسازی تصادفی کش گروه‌ها (۱٪ شانس)
    if (Math.random() < 0.01) {
      const now = Date.now();
      for (const [chatId, context] of groupContextCache.entries()) {
        if (now - context.lastCleanup > 60 * 60 * 1000) {
          groupContextCache.delete(chatId);
        }
      }
    }
    
    // ===== Callback Query =====
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, env, config);
      return;
    }
    
    // ===== Message =====
    if (update.message) {
      const message = update.message;
      
      // نادیده گرفتن پیام‌های بات‌ها
      if (!message.from || message.from.is_bot) return;
      
      // چک کردن نوع چت مجاز
      if (!config.ALLOWED_CHAT_TYPES.includes(message.chat.type)) return;

      // ===== عضویت جدید در گروه =====
      if (update.message?.new_chat_members) {
        const source = update.message.from?.username 
          ? `@${update.message.from.username}` 
          : "Private ID";
        await onBotJoinedGroup(update.message.chat, source, env);
      }
      
      // ===== خروج از گروه =====
      if (update.message?.left_chat_member) {
        await onBotLeftGroup(update.message.chat.id, env);
      }

      // ===== Voice Message =====
      if (message.voice) {
        await handleVoiceMessage(message, env, config);
        return;
      }
      
      // ===== Media (Photo, Document, Animation, Video, Sticker) =====
      if (message.photo || message.document || message.animation || message.video || message.sticker) {
        await handleMediaMessage(message, env, config);
        return;
      }
      
      // ===== Text Message =====
      if (message.text) {
        await handleTextMessage(message, env, config);
        return;
      }
    }
    
  } catch (error) {
    logger.error("❌ Unhandled error in update processing", error);
    throw error;
  }
}

// ============================================================
// 📦 تابع HANDLE TEXT MESSAGE
// ============================================================

async function handleTextMessage(message: Message, env: Env, config: ReturnType<typeof createConfig>) {
  const { chat, from, text } = message;
  if (!text || !from) return;

  const requestId = generateRequestId();
  
  // بررسی حالت تعمیرات
  const maintenanceCheck = await checkMaintenanceMode(env, from.id);
  if (maintenanceCheck.blocked) {
    await sendMessage(chat.id, maintenanceCheck.message!, {
      reply_to_message_id: message.message_id
    });
    return;
  }

  const session = await getOrCreateSession(chat, from, env);
  const isGroup = chat.type === "group" || chat.type === "supergroup";

  // در گروه فقط در صورت منشن یا ریپلای پاسخ بده
  if (isGroup && !shouldRespondInGroup(message, session)) {
    return;
  }

  // بررسی مسدود بودن کاربر
  const isBlocked = await isUserBlocked(from.id, env);
  if (isBlocked && from.id !== config.BOT_OWNER_ID) {
    await sendMessage(chat.id, "🚫 حساب شما مسدود شده است.", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  // بررسی ظرفیت همزمان
  if (!canProcessConcurrentRequest(chat.id, requestId)) {
    await sendMessage(chat.id, "🚦 سرور شلوغ است، کمی صبر کنید...", {
      reply_to_message_id: message.message_id
    });
    return;
  }

  try {
    // بررسی Rate Limit
    recordRequest(session);
    const limitCheck = await checkDailyLimit(session, 'message');
    if (!limitCheck.allowed) {
      await sendMessage(chat.id, limitCheck.message!, {
        reply_to_message_id: message.message_id,
        reply_markup: JSON.stringify(getVIPUpgradeKeyboard())
      });
      return;
    }

    // افزایش مصرف روزانه
    incrementDailyUsage(session, 'message');
    
    // پردازش پیام توسط هوش مصنوعی
    await processAIRequest(
      session, from,
      [{ text: sanitizeInput(text) }],
      message, env, requestId
    );
    
  } finally {
    releaseRequest(chat.id, requestId);
  }
  }
