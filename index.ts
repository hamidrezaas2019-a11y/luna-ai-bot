// ============================================================
// @MyNovaChatBot - سورس کامل نوا با دیتابیس KV
// شامل: ذخیره کاربران، تاریخچه، تنظیمات، لاگ‌ها، آمار
// بدون نیاز به D1 - همه چیز در KV ذخیره میشه
// ============================================================

// ============================================================
// 📦 کلاس اصلی ربات
// ============================================================

class Bot {
  constructor(token) {
    this.token = token;
    this.handlers = { command: new Map(), on: new Map(), callbackQuery: [] };
    this.middleware = [];
  }

  use(fn) { this.middleware.push(fn); }
  command(name, handler) { this.handlers.command.set(name, handler); }
  on(event, handler) {
    if (!this.handlers.on.has(event)) this.handlers.on.set(event, []);
    this.handlers.on.get(event).push(handler);
  }
  callbackQuery(pattern, handler) { this.handlers.callbackQuery.push({ pattern, handler }); }

  async handleUpdate(update, env) {
    const ctx = {
      update, env, bot: this,
      from: update.message?.from || update.callback_query?.from,
      chat: update.message?.chat || update.callback_query?.message?.chat,
      message: update.message || update.callback_query?.message,
      callbackQuery: update.callback_query,
      reply: (text, opt) => this.sendMessage(ctx.chat.id, text, opt),
      editMessageText: (text, opt) => this.editMessageText(ctx.chat.id, ctx.message?.message_id, text, opt?.reply_markup),
      deleteMessage: () => this.deleteMessage(ctx.chat.id, ctx.message?.message_id),
      answerCallbackQuery: (text, opt) => this.answerCallbackQuery(ctx.callbackQuery?.id, text, opt),
      replyWithPhoto: (photo, opt) => this.sendPhoto(ctx.chat.id, photo, opt?.caption, opt),
      replyWithDocument: (document, opt) => this.sendDocument(ctx.chat.id, document, opt?.filename, opt),
      react: (reaction) => this.setMessageReaction(ctx.chat.id, ctx.message.message_id, reaction),
      api: {
        sendChatAction: (chatId, action) => this.sendChatAction(chatId, action),
        getFile: async (fileId) => {
          const res = await fetch(`https://api.telegram.org/bot${this.token}/getFile?file_id=${fileId}`);
          const d = await res.json();
          if (!d.ok) throw new Error('File not found');
          return { file_id: d.result.file_id, getUrl: () => `https://api.telegram.org/file/bot${this.token}/${d.result.file_path}` };
        },
        sendMessage: (chatId, text, opt) => this.sendMessage(chatId, text, opt),
        sendPhoto: (chatId, photo, caption) => this.sendPhoto(chatId, photo, caption),
        getChatMember: (chatId, userId) => this.getChatMember(chatId, userId)
      }
    };

    for (const mw of this.middleware) {
      let nextCalled = false;
      await mw(ctx, () => { nextCalled = true; });
      if (!nextCalled) return;
    }

    if (update.message) {
      const msg = update.message;
      if (msg.text?.startsWith('/')) {
        const cmd = msg.text.split('@')[0].split(' ')[0].toLowerCase();
        if (this.handlers.command.has(cmd)) await this.handlers.command.get(cmd)(ctx);
      } else if (msg.text) {
        for (const h of this.handlers.on.get('message:text') || []) await h(ctx);
      }
      if (msg.voice) for (const h of this.handlers.on.get('message:voice') || []) await h(ctx);
      if (msg.photo) for (const h of this.handlers.on.get('message:photo') || []) await h(ctx);
      if (msg.video) for (const h of this.handlers.on.get('message:video') || []) await h(ctx);
      if (msg.animation) for (const h of this.handlers.on.get('message:animation') || []) await h(ctx);
    } else if (update.callback_query) {
      const data = update.callback_query.data;
      for (const cb of this.handlers.callbackQuery) {
        if (typeof cb.pattern === 'string' && cb.pattern === data) {
          ctx.match = null; await cb.handler(ctx); break;
        } else if (cb.pattern instanceof RegExp && cb.pattern.test(data)) {
          ctx.match = data.match(cb.pattern); await cb.handler(ctx); break;
        }
      }
    }
  }

  async sendMessage(chatId, text, options = {}) {
    const payload = { chat_id: chatId, text, parse_mode: options.parse_mode || 'Markdown', disable_web_page_preview: true, reply_to_message_id: options.reply_to_message_id, reply_markup: options.reply_markup };
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return res.json();
  }

  async editMessageText(chatId, messageId, text, replyMarkup) {
    if (!messageId) return;
    const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: replyMarkup };
    const res = await fetch(`https://api.telegram.org/bot${this.token}/editMessageText`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return res.json();
  }

  async deleteMessage(chatId, messageId) {
    if (!messageId) return;
    await fetch(`https://api.telegram.org/bot${this.token}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: messageId }) });
  }

  async answerCallbackQuery(callbackQueryId, text, options = {}) {
    if (!callbackQueryId) return;
    await fetch(`https://api.telegram.org/bot${this.token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: callbackQueryId, text, ...options }) });
  }

  async sendChatAction(chatId, action) {
    await fetch(`https://api.telegram.org/bot${this.token}/sendChatAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action }) });
  }

  async sendPhoto(chatId, photo, caption, options = {}) {
    const payload = { chat_id: chatId, photo, caption, parse_mode: 'Markdown', ...options };
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return res.json();
  }

  async sendDocument(chatId, document, filename, options = {}) {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    if (document instanceof Uint8Array || document instanceof ArrayBuffer) {
      formData.append('document', new Blob([document], { type: 'text/plain' }), filename);
    } else {
      formData.append('document', document, filename);
    }
    if (options.caption) formData.append('caption', options.caption);
    await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, { method: 'POST', body: formData });
  }

  async getChatMember(chatId, userId) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/getChatMember?chat_id=${chatId}&user_id=${userId}`);
    const data = await res.json();
    return data.ok ? data.result : null;
  }

  async setWebhook(url) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/setWebhook?url=${url}`);
    const data = await res.json();
    return data.ok;
  }

  async setMessageReaction(chatId, messageId, reaction) {
    try {
      const payload = {
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji: reaction }]
      };
      await fetch(`https://api.telegram.org/bot${this.token}/setMessageReaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }
}

// ============================================================
// 📦 دیتابیس KV - توابع اصلی
// ============================================================

const DB = {
  // ===== کاربران =====
  async getUser(env, userId) {
    const key = `user:${userId}`;
    let userData = await env.NOVA_DB.get(key, 'json');
    
    if (!userData) {
      userData = {
        id: String(userId),
        firstName: '',
        lastName: '',
        username: '',
        currentModel: 'zara',
        language: 'fa',
        isVIP: false,
        blocked: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        totalMessages: 0,
        prompts: { ...DEFAULT_PROMPTS },
        history: { nova: [], luna: [], zara: [] },
        limits: { date: '', messages: 0, voiceSent: 0, voiceReceived: 0, images: 0 },
        lunaModel: 'Meta-Llama-3.1-8B-Instruct',
        zaraModel: 'openai',
        lastImage: null
      };
      await DB.saveUser(env, userId, userData);
      
      // آپدیت تعداد کل کاربران
      const total = parseInt(await env.NOVA_DB.get('total_users') || '0');
      await env.NOVA_DB.put('total_users', String(total + 1));
    }
    
    // اطمینان از وجود فیلدها
    if (!userData.prompts) userData.prompts = { ...DEFAULT_PROMPTS };
    if (!userData.history) userData.history = { nova: [], luna: [], zara: [] };
    if (!userData.limits) userData.limits = { date: '', messages: 0, voiceSent: 0, voiceReceived: 0, images: 0 };
    if (!userData.lunaModel) userData.lunaModel = 'Meta-Llama-3.1-8B-Instruct';
    if (!userData.zaraModel) userData.zaraModel = 'openai';
    if (!userData.currentModel || !MODELS[userData.currentModel]) userData.currentModel = 'zara';
    
    return userData;
  },

  async saveUser(env, userId, userData) {
    userData.lastActive = new Date().toISOString();
    const key = `user:${userId}`;
    await env.NOVA_DB.put(key, JSON.stringify(userData));
  },

  async getAllUsers(env) {
    const users = [];
    let cursor = undefined;
    let maxIterations = 100;
    let iterations = 0;
    do {
      const list = await env.NOVA_DB.list({ cursor, prefix: 'user:' });
      for (const key of list.keys) {
        const u = await env.NOVA_DB.get(key.name, 'json');
        if (u && u.id) users.push(u);
      }
      cursor = list.list_complete ? undefined : list.cursor;
      iterations++;
    } while (cursor && iterations < maxIterations);
    return users;
  },

  async deleteUser(env, userId) {
    const key = `user:${userId}`;
    await env.NOVA_DB.delete(key);
  },

  async getTotalUsers(env) {
    return parseInt(await env.NOVA_DB.get('total_users') || '0');
  },

  // ===== تاریخچه مکالمات =====
  async getHistory(env, userId, model) {
    const key = `history:${userId}:${model}`;
    const data = await env.NOVA_DB.get(key, 'json');
    return data || [];
  },

  async saveHistory(env, userId, model, history) {
    const key = `history:${userId}:${model}`;
    // فقط ۴۰ پیام آخر رو نگه دار
    if (history.length > 40) history = history.slice(-40);
    await env.NOVA_DB.put(key, JSON.stringify(history));
  },

  async clearHistory(env, userId, model) {
    const key = `history:${userId}:${model}`;
    await env.NOVA_DB.delete(key);
  },

  // ===== تنظیمات گروه =====
  async getGroupSettings(env, groupId) {
    const key = `group:${groupId}`;
    let settings = await env.NOVA_DB.get(key, 'json');
    if (!settings) {
      settings = { mode: 'mention', typingIndicator: true };
      await env.NOVA_DB.put(key, JSON.stringify(settings));
    }
    return settings;
  },

  async saveGroupSettings(env, groupId, settings) {
    const key = `group:${groupId}`;
    await env.NOVA_DB.put(key, JSON.stringify(settings));
  },

  // ===== لاگ‌ها =====
  async addLog(env, entry) {
    let logs = await env.NOVA_DB.get('logs', 'json') || [];
    logs.unshift({ 
      ts: new Date().toLocaleTimeString('fa-IR'), 
      type: entry.type || 'info', 
      msg: entry.message 
    });
    if (logs.length > 200) logs = logs.slice(0, 200);
    await env.NOVA_DB.put('logs', JSON.stringify(logs));
  },

  async getLogs(env, filter = 'all') {
    let logs = await env.NOVA_DB.get('logs', 'json') || [];
    if (filter === 'errors') return logs.filter(l => l.type === 'error');
    if (filter === 'warnings') return logs.filter(l => l.type === 'warning');
    return logs;
  },

  async clearLogs(env) {
    await env.NOVA_DB.put('logs', JSON.stringify([]));
  },

  // ===== آمار =====
  async getStats(env) {
    const users = await DB.getAllUsers(env);
    const total = users.length;
    const vip = users.filter(u => u.isVIP).length;
    const blocked = users.filter(u => u.blocked).length;
    const totalMsgs = users.reduce((s, u) => s + (u.totalMessages || 0), 0);
    return { total, vip, blocked, totalMsgs };
  },

  // ===== وضعیت ادمین =====
  async getAdminState(env, adminId) {
    return await env.NOVA_DB.get(`admin_state:${adminId}`, 'json') || null;
  },

  async setAdminState(env, adminId, state) {
    if (state === null) await env.NOVA_DB.delete(`admin_state:${adminId}`);
    else await env.NOVA_DB.put(`admin_state:${adminId}`, JSON.stringify(state), { expirationTtl: 600 });
  },

  // ===== پشتیبان =====
  async backup(env) {
    const users = await DB.getAllUsers(env);
    const logs = await DB.getLogs(env);
    const stats = await DB.getStats(env);
    const groups = [];
    let cursor = undefined;
    do {
      const list = await env.NOVA_DB.list({ cursor, prefix: 'group:' });
      for (const key of list.keys) {
        const g = await env.NOVA_DB.get(key.name, 'json');
        if (g) groups.push({ id: key.name.replace('group:', ''), ...g });
      }
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    
    return { 
      backupDate: new Date().toISOString(),
      stats,
      users: users.map(u => ({ 
        id: u.id, firstName: u.firstName, username: u.username, 
        isVIP: u.isVIP, blocked: u.blocked, totalMessages: u.totalMessages,
        createdAt: u.createdAt, lastActive: u.lastActive
      })),
      groups,
      logs: logs.slice(0, 100)
    };
  },

  // ===== ریست کامل =====
  async resetAll(env) {
    let cursor = undefined;
    let count = 0;
    do {
      const list = await env.NOVA_DB.list({ cursor });
      for (const key of list.keys) {
        await env.NOVA_DB.delete(key.name);
        count++;
      }
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    await env.NOVA_DB.put('total_users', '0');
    return count;
  }
};

// ============================================================
// 📦 تنظیمات اولیه
// ============================================================

const DEFAULT_PROMPTS = {
  nova: 'اسم تو فقط و فقط «نوا» است و هرگز اسم دیگری قبول نمیکنی. اگر کسی اسم دیگری بهت داد، بگو «نه، من نوا هستم». فارسی محاوره‌ای جواب بده. حداکثر ۳-۴ جمله، کوتاه و مفید. شوخ‌طبع و گرم باش. هیچوقت نگو AI یا ربات هستم. جدول، لینک، موزیک نساز مگه اینکه بخوان.',
  luna: 'اسم تو فقط و فقط «لونا» است و هرگز اسم دیگری قبول نمیکنی. اگر کسی اسم دیگری بهت داد، بگو «نه، من لونا هستم». فارسی محاوره‌ای جواب بده. حداکثر ۳-۴ جمله، کوتاه و مفید. شوخ‌طبع و گرم باش. هیچوقت نگو AI یا ربات هستم. جدول، لینک نساز مگه اینکه بخوان.',
  zara: 'اسم تو فقط و فقط «زارا» است و هرگز اسم دیگری قبول نمیکنی. اگر کسی اسم دیگری بهت داد، بگو «نه، من زارا هستم». فارسی محاوره‌ای جواب بده. حداکثر ۳-۴ جمله، کوتاه و مفید. شوخ‌طبع و گرم باش. هیچوقت نگو AI یا ربات هستم. جدول، لینک نساز مگه اینکه بخوان.'
};

const MODELS = {
  nova: { name: 'نوا', emoji: '🤖', description: 'سریع و دقیق، پشتیبانی کامل از فارسی، چند رسانه‌ای' },
  luna: { name: 'لونا', emoji: '🧠', description: 'مدل‌های متنوع، قدرتمند در استدلال' },
  zara: { name: 'زارا', emoji: '🎨', description: 'مدل‌های متنوع، خلاقیت بالا، رایگان و نامحدود' }
};

const LUNA_MODELS = [
  'Meta-Llama-3.1-8B-Instruct', 'Meta-Llama-3.1-70B-Instruct', 'Meta-Llama-3.1-405B-Instruct',
  'Meta-Llama-3.2-1B-Instruct', 'Meta-Llama-3.2-3B-Instruct', 'Meta-Llama-3.3-70B-Instruct',
  'Qwen2.5-7B-Instruct', 'Qwen2.5-72B-Instruct', 'Qwen2.5-Coder-32B-Instruct', 'QwQ-32B',
  'DeepSeek-R1', 'DeepSeek-R1-Distill-Llama-70B', 'DeepSeek-V3-0324',
  'Llama-4-Scout-17B-16E-Instruct', 'Llama-4-Maverick-17B-128E-Instruct'
];

const ZARA_MODELS = ['openai', 'openai-large', 'openai-reasoning', 'mistral', 'mistral-recraft', 'llama', 'gemini', 'gemini-thinking', 'deepseek'];
const USERS_PER_PAGE = 5;

// ============================================================
// 📦 توابع کمکی
// ============================================================

function t(user, faText, enText) {
  return user?.language === 'en' ? enText : faText;
}

function resetLimitsIfNeeded(user) {
  const today = new Date().toISOString().split('T')[0];
  if (user.limits?.date !== today) {
    user.limits = { date: today, messages: 0, voiceSent: 0, voiceReceived: 0, images: 0 };
  }
  return user;
}

function checkLimit(user, type) {
  resetLimitsIfNeeded(user);
  const limits = { messages: 100, voiceSent: 10, voiceReceived: 10, images: 5 };
  if (user.isVIP) return true;
  if ((user.limits[type] || 0) >= limits[type]) return false;
  user.limits[type] = (user.limits[type] || 0) + 1;
  return true;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function isGroupAdmin(ctx) {
  if (!ctx.chat || !ctx.from) return false;
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    return member && (member.status === 'creator' || member.status === 'administrator');
  } catch {
    return false;
  }
}

// ============================================================
// 📦 API های AI
// ============================================================

async function callGemini(env, messages) {
  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
      contents.push({ role: 'model', parts: [{ text: 'باشه' }] });
    } else if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }
  
  const geminiKeys = [];
  for (let i = 1; i <= 10; i++) {
    const k = env[`GEMINI_API_KEY${i === 1 ? '' : '_' + i}`] || env[`GEMINI_KEY_${i}`];
    if (k && k !== 'temp' && !geminiKeys.includes(k)) geminiKeys.push(k);
  }
  if (geminiKeys.length === 0) throw new Error('No Gemini API key configured');

  let lastError = null;
  for (const key of geminiKeys) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents, 
          generationConfig: { maxOutputTokens: 1000, temperature: 0.7 } 
        })
      });
      
      if (response.status === 429) { lastError = new Error('Rate limit'); continue; }
      if (!response.ok) { 
        const errText = await response.text(); 
        lastError = new Error(`Gemini error (${response.status}): ${errText}`); 
        continue; 
      }
      
      const data = await response.json();
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) { 
        lastError = new Error('Invalid Gemini response'); 
        continue; 
      }
      return data.candidates[0].content.parts[0].text;
    } catch (e) { 
      lastError = e; 
      continue; 
    }
  }
  throw lastError || new Error('All Gemini keys failed');
}

async function callSambaNova(env, messages, model = 'Meta-Llama-3.1-8B-Instruct') {
  const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${env.SAMBANOVA_API_KEY}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ model, messages, max_tokens: 1000 })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SambaNova API error (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callPollinations(env, messages, model = 'openai') {
  const fallbackModels = [model, 'openai', 'mistral', 'llama', 'gemini'];
  const uniqueModels = [...new Set(fallbackModels)];
  
  let lastError = null;
  for (const m of uniqueModels) {
    try {
      const response = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages, 
          model: m, 
          seed: Math.floor(Math.random() * 99999) 
        })
      });
      
      if (response.status === 429) { lastError = new Error('429 rate limit'); continue; }
      if (!response.ok) { 
        const errText = await response.text(); 
        lastError = new Error(`Pollinations error (${response.status})`); 
        continue; 
      }
      
      const text = await response.text();
      if (!text || text.trim() === '') { lastError = new Error('Empty response'); continue; }
      return text;
    } catch (e) { 
      lastError = e; 
      continue; 
    }
  }
  throw new Error('سرویس Pollinations در دسترس نیست. بعداً تلاش کن.');
}

async function callAI(env, user, messages) {
  const key = user.currentModel;

  if (key === 'nova') {
    try {
      return await callGemini(env, messages);
    } catch (e) {
      await DB.addLog(env, { type: 'warning', message: `Gemini failed, fallback to Pollinations: ${e.message}` });
      try {
        return await callPollinations(env, messages, user.zaraModel || 'openai');
      } catch (e2) {
        throw new Error(`همه سرویس‌ها در دسترس نیستن. دوباره تلاش کن.`);
      }
    }
  }

  if (key === 'luna') {
    if (!env.SAMBANOVA_API_KEY || env.SAMBANOVA_API_KEY === 'temp') {
      return await callPollinations(env, messages, user.zaraModel || 'openai');
    }
    try {
      return await callSambaNova(env, messages, user.lunaModel);
    } catch (e) {
      await DB.addLog(env, { type: 'warning', message: `SambaNova failed, fallback to Pollinations: ${e.message}` });
      return await callPollinations(env, messages, user.zaraModel || 'openai');
    }
  }

  return await callPollinations(env, messages, user.zaraModel || 'openai');
}

async function generateImagesWithThreeModels(env, prompt, seed) {
  const urls = [];
  urls.push(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=1280&nologo=true&seed=${seed}`);
  
  if (env.PRODIA_API_KEY && env.PRODIA_API_KEY !== 'temp') {
    try {
      const prodiaResponse = await fetch('https://api.prodia.com/v1/sd/generate', {
        method: 'POST',
        headers: { 
          'X-Prodia-Key': env.PRODIA_API_KEY, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          model: 'sdv1_4.ckpt', 
          prompt, 
          steps: 20, 
          seed, 
          width: 1280, 
          height: 1280 
        })
      });
      const prodiaData = await prodiaResponse.json();
      const jobId = prodiaData.job;
      let imageReady = false, attempts = 0;
      while (!imageReady && attempts < 10) {
        await new Promise(r => setTimeout(r, 1000));
        const checkResponse = await fetch(`https://api.prodia.com/v1/job/${jobId}`, { 
          headers: { 'X-Prodia-Key': env.PRODIA_API_KEY } 
        });
        if ((await checkResponse.json()).status === 'succeeded') imageReady = true;
        attempts++;
      }
      if (imageReady) urls.push(`https://images.prodia.xyz/${jobId}.png`);
    } catch {}
  }
  
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'temp') {
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ prompt, n: 1, size: '1024x1024' })
      });
      const d = await r.json();
      if (d.data?.[0]?.url) urls.push(d.data[0].url);
    } catch {}
  }
  return urls;
}

// ============================================================
// 🚀 تنظیمات ربات
// ============================================================

function setupBot(bot, env) {

  bot.use(async (ctx, next) => {
    if (!ctx.from?.id) return next();
    const user = await DB.getUser(env, ctx.from.id);
    if (user.blocked && ctx.chat?.type === 'private') {
      await ctx.reply('🚫 دسترسی مسدود\n\nحساب شما توسط مدیر مسدود شده است.\n\n📞 برای رفع مسدودیت با [@Hamid_Ai_pro](https://t.me/Hamid_Ai_pro) تماس بگیرید.', { parse_mode: 'Markdown' });
      return;
    }
    user.firstName = ctx.from.first_name || user.firstName || '';
    user.lastName = ctx.from.last_name || user.lastName || '';
    user.username = ctx.from.username || user.username || '';
    ctx.user = user;
    ctx.env = env;
    await next();
  });

  async function sendMainMenu(ctx) {
    const user = ctx.user;
    if (!user) return;
    
    let currentModel = user.currentModel;
    if (!currentModel || !MODELS[currentModel]) {
      currentModel = 'nova';
    }
    
    const modelInfo = MODELS[currentModel] || { name: 'نوا', emoji: '🤖' };
    const isGroup = ['group', 'supergroup'].includes(ctx.chat?.type);
    const status = user.isVIP ? '💎 VIP' : '🆓 حساب رایگان';

    const text =
      `📚 *مرکز راهنمای نوآ*\n\n` +
      `> 👤 کاربر: ${user.firstName || 'NØVA'}\n` +
      `> 🤖 موتور فعال: ${modelInfo.name} ${modelInfo.emoji}\n` +
      `> 💳 وضعیت: ${status}\n\n` +
      `لطفاً دسته‌بندی مورد نظرت رو از دکمه‌های زیر انتخاب کن 👇`;

    const keyboard = { inline_keyboard: [
      [{ text: '💬 گفتگو', callback_data: 'help_chat' }, { text: '🎨 تصویر', callback_data: 'help_image' }],
      [{ text: '🤖 مدل‌ها', callback_data: 'menu_models' }, { text: '✏️ شخصی‌سازی', callback_data: 'help_prompt' }],
      [{ text: '⚡ دستورات', callback_data: 'help_commands' }, { text: '⚙️ تنظیمات', callback_data: 'help_settings' }],
    ]};

    if (isGroup) {
      keyboard.inline_keyboard.push([{ text: '👥 تنظیمات گروه', callback_data: 'group_settings_menu' }]);
    }

    keyboard.inline_keyboard.push([{ text: '❌ بستن', callback_data: 'close' }]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  }

  // ===== دستور /start =====
  bot.command('/start', async (ctx) => {
    if (!ctx.user) return;
    let user = ctx.user;
    user.firstName = ctx.from?.first_name || user.firstName || '';
    user = resetLimitsIfNeeded(user);
    await DB.saveUser(ctx.env, ctx.from.id, user);

    const isAdmin = String(ctx.from.id) === String(ctx.env.ADMIN_ID);

    const userCommands = [
      { command: 'start', description: '🚀 صفحه اصلی و منوی اصلی' },
      { command: 'new', description: '🧠 چت جدید و پاک کردن حافظه' },
      { command: 'model', description: '🤖 تغییر مدل هوش مصنوعی' },
      { command: 'img', description: '🎨 ایجاد تصویر' },
      { command: 'edit', description: '✨ ویرایش تصویر' },
      { command: 'search', description: '🔍 جستجوی تصاویر گوگل' },
      { command: 'prompt', description: '✏️ شخصی‌سازی شخصیت' },
      { command: 'language', description: '🌐 تغییر زبان' },
      { command: 'help', description: '❓ راهنمای کامل' }
    ];

    const adminCommands = [
      ...userCommands,
      { command: 'admin', description: '👑 پنل مدیریت' },
      { command: 'log', description: '📋 لاگ‌ها' },
      { command: 'stats', description: '📊 آمار ربات' },
      { command: 'blocked', description: '🚫 کاربران مسدود' },
      { command: 'broadcast', description: '📣 پیام همگانی' },
      { command: 'vip', description: '💎 افزودن VIP' },
      { command: 'rebuild', description: '🔧 بازسازی دیتابیس' },
      { command: 'keys', description: '🔑 وضعیت API keyها' }
    ];

    try {
      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: isAdmin ? adminCommands : userCommands,
          scope: { type: 'chat', chat_id: ctx.from.id }
        })
      });
    } catch (e) {}

    const isGroup = ['group', 'supergroup'].includes(ctx.chat?.type);
    if (isGroup) return sendMainMenu(ctx);

    const welcomeText =
      `🚀 سلام ${user.firstName} عزیز!\n\n` +
      `خوش اومدی به نوآ 🤖 - دستیار هوشمند همه‌کاره تو!\n\n` +
      `🌐 زبان انتخاب شده: فارسی\n\n` +
      `✨ قابلیت‌های من:\n` +
      `🧠 هوش مصنوعی چندگانه: گفتگو با مدل‌های قدرتمند (نوا، لونا، زارا)\n` +
      `🎨 ساخت تصویر: فقط کافیه بگی چی می‌خوای!\n` +
      `🎤 تشخیص صدا: ویس بفرست، من متنش رو می‌فهمم و جواب می‌دم.\n` +
      `🔍 جستجوی تصویر: پیدا کردن عکس از گوگل.\n\n` +
      `از منوی زیر شروع کن: 👇`;

    await ctx.reply(welcomeText, {
      reply_markup: { inline_keyboard: [
        [{ text: '🤖 انتخاب مدل', callback_data: 'menu_models' }, { text: '❓ راهنما', callback_data: 'back_to_start' }]
      ]}
    });
  });

  bot.command('/help', async (ctx) => {
    if (!ctx.user) return;
    await sendMainMenu(ctx);
  });

  // ===== دستور /keys =====
  bot.command('/keys', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;

    const statusMsg = await ctx.reply('⏳ در حال بررسی API keyها...');

    const results = { gemini: [], sambanova: [], pollinations: null };

    const geminiKeys = [];
    for (let i = 1; i <= 10; i++) {
      const key = ctx.env[`GEMINI_API_KEY${i === 1 ? '' : '_' + i}`] || ctx.env[`GEMINI_KEY_${i}`];
      if (key && key !== 'temp') geminiKeys.push(key);
    }
    if (ctx.env.GEMINI_API_KEY && ctx.env.GEMINI_API_KEY !== 'temp' && !geminiKeys.includes(ctx.env.GEMINI_API_KEY)) {
      geminiKeys.unshift(ctx.env.GEMINI_API_KEY);
    }

    for (const key of geminiKeys.slice(0, 5)) {
      try {
        const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
        });
        const shortKey = key.substring(0, 8) + '...' + key.slice(-4);
        if (testRes.ok) {
          results.gemini.push({ key: shortKey, status: 'ok' });
        } else {
          const errData = await testRes.json();
          const isRateLimit = errData?.error?.code === 429;
          results.gemini.push({ key: shortKey, status: isRateLimit ? 'ratelimit' : 'error', code: testRes.status });
        }
      } catch (e) {
        results.gemini.push({ key: key.substring(0, 8) + '...', status: 'error' });
      }
    }

    const sambanovaKeys = [];
    for (let i = 1; i <= 10; i++) {
      const key = ctx.env[`SAMBANOVA_API_KEY${i === 1 ? '' : '_' + i}`] || ctx.env[`SAMBANOVA_KEY_${i}`];
      if (key && key !== 'temp') sambanovaKeys.push(key);
    }
    if (ctx.env.SAMBANOVA_API_KEY && ctx.env.SAMBANOVA_API_KEY !== 'temp' && !sambanovaKeys.includes(ctx.env.SAMBANOVA_API_KEY)) {
      sambanovaKeys.unshift(ctx.env.SAMBANOVA_API_KEY);
    }

    for (const key of sambanovaKeys.slice(0, 5)) {
      try {
        const testRes = await fetch('https://api.sambanova.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'Meta-Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
        });
        const shortKey = key.substring(0, 8) + '...' + key.slice(-4);
        if (testRes.ok) {
          results.sambanova.push({ key: shortKey, status: 'ok' });
        } else {
          results.sambanova.push({ key: shortKey, status: 'error', code: testRes.status });
        }
      } catch (e) {
        results.sambanova.push({ key: key.substring(0, 8) + '...', status: 'error' });
      }
    }

    try {
      const testRes = await fetch('https://text.pollinations.ai/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'openai' })
      });
      results.pollinations = testRes.ok ? 'ok' : 'error';
    } catch {
      results.pollinations = 'error';
    }

    const now = new Date().toLocaleTimeString('fa-IR');

    let text = `📊 *گزارش وضعیت و سلامت API های ربات*\n\n`;

    text += `🤖 Gemini (نوا) - کلید${results.gemini.length}:\n`;
    if (results.gemini.length === 0) {
      text += `❌ هیچ کلیدی تنظیم نشده\n`;
    } else {
      results.gemini.forEach((r, i) => {
        const icon = r.status === 'ok' ? '🟢' : '🔴';
        const statusText = r.status === 'ok' ? 'سالم (OK)' : r.status === 'ratelimit' ? `مسدود (لیمیت شده)` : `خطا (${r.code || 'err'})`;
        text += `${i + 1}. ${r.key} ${icon} ${statusText}\n`;
      });
    }

    text += `\n🧠 SambaNova (لونا) - کلید${results.sambanova.length}:\n`;
    if (results.sambanova.length === 0) {
      text += `⚠️ هیچ کلیدی تنظیم نشده\n`;
    } else {
      results.sambanova.forEach((r, i) => {
        const icon = r.status === 'ok' ? '🟢' : '🔴';
        const statusText = r.status === 'ok' ? 'سالم (OK)' : `خطا (${r.code || 'err'})`;
        text += `${i + 1}. ${r.key} ${icon} ${statusText}\n`;
      });
    }

    text += `\n🔬 Pollinations (زارا):\n`;
    text += results.pollinations === 'ok' ? `🟢 سالم (OK)\n` : `🔴 خطا در اتصال\n`;

    text += `\n⏰ زمان تست: ${now}`;

    await bot.editMessageText(ctx.chat.id, statusMsg.result?.message_id, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 تست و بروزرسانی مجدد', callback_data: 'keys_refresh' }],
          [{ text: '❌ بستن', callback_data: 'close' }]
        ]
      }
    });
  });

  // ===== Callback ها =====
  bot.callbackQuery('keys_refresh', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery('⏳ در حال بررسی...');
    await ctx.editMessageText('⏳ در حال بررسی API keyها...', { reply_markup: { inline_keyboard: [] } });

    const results = { gemini: null, sambanova: null, pollinations: null };

    const geminiKey = ctx.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey !== 'temp') {
      const shortKey = geminiKey.substring(0, 8) + '...' + geminiKey.slice(-4);
      try {
        const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
        });
        if (testRes.ok) results.gemini = { key: shortKey, status: 'ok' };
        else {
          const errData = await testRes.json().catch(() => ({}));
          results.gemini = { key: shortKey, status: errData?.error?.code === 429 ? 'ratelimit' : 'error', code: testRes.status };
        }
      } catch { results.gemini = { key: shortKey, status: 'error' }; }
    }

    const sambanovaKey = ctx.env.SAMBANOVA_API_KEY;
    if (sambanovaKey && sambanovaKey !== 'temp') {
      const shortKey = sambanovaKey.substring(0, 8) + '...' + sambanovaKey.slice(-4);
      try {
        const testRes = await fetch('https://api.sambanova.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${sambanovaKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'Meta-Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
        });
        results.sambanova = { key: shortKey, status: testRes.ok ? 'ok' : 'error', code: testRes.status };
      } catch { results.sambanova = { key: shortKey, status: 'error' }; }
    }

    try {
      const testRes = await fetch('https://text.pollinations.ai/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'openai' })
      });
      results.pollinations = testRes.ok ? 'ok' : 'error';
    } catch { results.pollinations = 'error'; }

    const now = new Date().toLocaleTimeString('fa-IR');
    let text = `📊 *گزارش وضعیت API های ربات*\n\n`;

    text += `🤖 Gemini (نوا):\n`;
    if (!results.gemini) text += `❌ کلید تنظیم نشده\n`;
    else text += `${results.gemini.key} ${results.gemini.status === 'ok' ? '🟢 سالم' : results.gemini.status === 'ratelimit' ? '🔴 rate limit' : `🔴 خطا (${results.gemini.code})`}\n`;

    text += `\n🧠 SambaNova (لونا):\n`;
    if (!results.sambanova) text += `⚠️ کلید تنظیم نشده\n`;
    else text += `${results.sambanova.key} ${results.sambanova.status === 'ok' ? '🟢 سالم' : `🔴 خطا (${results.sambanova.code})`}\n`;

    text += `\n🔬 Pollinations (زارا):\n`;
    text += results.pollinations === 'ok' ? `🟢 سالم\n` : `🔴 خطا\n`;
    text += `\n⏰ زمان تست: ${now}`;

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 تست مجدد', callback_data: 'keys_refresh' }],
          [{ text: '❌ بستن', callback_data: 'close' }]
        ]
      }
    });
  });

  bot.callbackQuery('menu_models', async (ctx) => {
    const user = ctx.user;
    if (!user) return ctx.answerCallbackQuery();

    const text =
      `🤖 *راهنمای مدل‌ها*\n\n` +
      `مدل فعال: ${user.currentModel === 'nova' ? 'نوا' : user.currentModel === 'luna' ? 'لونا' : 'زارا'}\n\n` +
      `🌟 *مدل‌های موجود:*\n\n` +
      `🤖 *نوا (Gemini)*\n` +
      `- سریع و دقیق\n` +
      `- پشتیبانی کامل از فارسی\n` +
      `- چند رسانه‌ای (متن + تصویر)\n` +
      `- 5 کلید API\n\n` +
      `🧠 *لونا (SambaNova)*\n` +
      `- مدل‌های متنوع\n` +
      `- قدرتمند در استدلال\n` +
      `- ${LUNA_MODELS.length} مدل\n` +
      `- 5 کلید API\n\n` +
      `🎨 *زارا (Pollinations)*\n` +
      `- مدل‌های متنوع (متن + تصویر)\n` +
      `- خلاقیت بالا\n` +
      `- ${ZARA_MODELS.length} مدل\n` +
      `- رایگان و نامحدود\n\n` +
      `🔄 *تغییر مدل:*\n` +
      `/model یا دکمه زیر\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 هر مدل شخصیت خاص خودش رو داره!`;

    const keyboard = { inline_keyboard: [
      [{ text: `🤖 نوا ${user.currentModel === 'nova' ? '✅' : ''}`, callback_data: 'set_model_nova' },
       { text: `🧠 لونا ${user.currentModel === 'luna' ? '✅' : ''}`, callback_data: 'set_model_luna' }],
      [{ text: `🎨 زارا ${user.currentModel === 'zara' ? '✅' : ''}`, callback_data: 'set_model_zara' }],
      [{ text: '⚙️ تنظیمات مدل', callback_data: 'model_settings' },
       { text: '✏️ شخصیت', callback_data: 'menu_prompt' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
    ]};

    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^set_model_(nova|luna|zara)$/, async (ctx) => {
    try {
      if (!ctx.user) return ctx.answerCallbackQuery();
      const key = ctx.match[1];
      const user = ctx.user;

      if (key === 'luna' && !user.isVIP) {
        return ctx.answerCallbackQuery('⚠️ مدل لونا فقط برای کاربران VIP است', { show_alert: true });
      }

      user.currentModel = key;
      await DB.saveUser(ctx.env, ctx.from.id, user);
      await ctx.answerCallbackQuery(`✅ مدل ${MODELS[key].name} فعال شد`);

      const text =
        `🤖 *راهنمای مدل‌ها*\n\n` +
        `مدل فعال: ${MODELS[key].name}\n\n` +
        `🌟 *مدل‌های موجود:*\n\n` +
        `🤖 *نوا (Gemini)*\n` +
        `- سریع و دقیق\n` +
        `- پشتیبانی کامل از فارسی\n` +
        `- چند رسانه‌ای (متن + تصویر)\n` +
        `- 5 کلید API\n\n` +
        `🧠 *لونا (SambaNova)*\n` +
        `- مدل‌های متنوع\n` +
        `- قدرتمند در استدلال\n` +
        `- ${LUNA_MODELS.length} مدل\n` +
        `- 5 کلید API\n\n` +
        `🎨 *زارا (Pollinations)*\n` +
        `- مدل‌های متنوع (متن + تصویر)\n` +
        `- خلاقیت بالا\n` +
        `- ${ZARA_MODELS.length} مدل\n` +
        `- رایگان و نامحدود\n\n` +
        `🔄 *تغییر مدل:*\n` +
        `/model یا دکمه زیر\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 هر مدل شخصیت خاص خودش رو داره!`;

      const keyboard = {
        inline_keyboard: [
          [{ text: `🤖 نوا ${key === 'nova' ? '✅' : ''}`, callback_data: 'set_model_nova' },
           { text: `🧠 لونا ${key === 'luna' ? '✅' : ''}`, callback_data: 'set_model_luna' }],
          [{ text: `🎨 زارا ${key === 'zara' ? '✅' : ''}`, callback_data: 'set_model_zara' }],
          [{ text: '⚙️ تنظیمات مدل', callback_data: 'model_settings' },
           { text: '✏️ شخصیت', callback_data: 'menu_prompt' }],
          [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
        ]
      };

      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } catch (error) {
      console.error('Error in set_model callback:', error);
      await ctx.answerCallbackQuery('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.', { show_alert: true });
    }
  });

  bot.callbackQuery('model_settings', async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const user = ctx.user;
    await ctx.editMessageText(
      `⚙️ *تنظیمات مدل*\n\n🎨 مدل Luna فعال: \`${user.lunaModel}\`\n🔬 مدل Zara فعال: \`${user.zaraModel}\`\n\nبرای تغییر انتخاب کن:`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🎨 انتخاب مدل Luna (VIP)', callback_data: 'show_luna_models' }],
        [{ text: '🔬 انتخاب مدل Zara', callback_data: 'show_zara_models' }],
        [{ text: '🔙 بازگشت', callback_data: 'menu_models' }]
      ]}}
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('show_luna_models', async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const user = ctx.user;
    if (!user.isVIP) return ctx.answerCallbackQuery('⚠️ انتخاب مدل Luna فقط برای VIP است', { show_alert: true });
    const rows = [];
    for (let i = 0; i < LUNA_MODELS.length; i += 2) {
      const row = [{ text: (user.lunaModel === LUNA_MODELS[i] ? '✅ ' : '') + LUNA_MODELS[i].replace('Meta-', '').replace('-Instruct', ''), callback_data: `luna_set_${i}` }];
      if (LUNA_MODELS[i + 1]) row.push({ text: (user.lunaModel === LUNA_MODELS[i + 1] ? '✅ ' : '') + LUNA_MODELS[i + 1].replace('Meta-', '').replace('-Instruct', ''), callback_data: `luna_set_${i + 1}` });
      rows.push(row);
    }
    rows.push([{ text: '🔙 بازگشت', callback_data: 'model_settings' }]);
    await ctx.editMessageText(`🎨 *انتخاب مدل Luna*\n\nمدل فعال: \`${user.lunaModel}\``, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^luna_set_(\d+)$/, async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const idx = parseInt(ctx.match[1]);
    const user = ctx.user;
    if (!user.isVIP) return ctx.answerCallbackQuery('⚠️ فقط VIP', { show_alert: true });
    if (!LUNA_MODELS[idx]) return ctx.answerCallbackQuery('❌ مدل نامعتبر');
    user.lunaModel = LUNA_MODELS[idx];
    await DB.saveUser(ctx.env, ctx.from.id, user);
    await ctx.answerCallbackQuery(`✅ مدل Luna: ${LUNA_MODELS[idx]}`);
    await ctx.editMessageText(`✅ *مدل Luna فعال: ${LUNA_MODELS[idx]}*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'model_settings' }]] } });
  });

  bot.callbackQuery('show_zara_models', async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const user = ctx.user;
    const rows = ZARA_MODELS.map(m => ([{ text: (user.zaraModel === m ? '✅ ' : '') + m, callback_data: `zara_set_${m}` }]));
    rows.push([{ text: '🔙 بازگشت', callback_data: 'model_settings' }]);
    await ctx.editMessageText(`🔬 *انتخاب مدل Zara*\n\nمدل فعال: \`${user.zaraModel}\``, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^zara_set_(.+)$/, async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const model = ctx.match[1];
    const user = ctx.user;
    if (!ZARA_MODELS.includes(model)) return ctx.answerCallbackQuery('❌ مدل نامعتبر');
    user.zaraModel = model;
    await DB.saveUser(ctx.env, ctx.from.id, user);
    await ctx.answerCallbackQuery(`✅ مدل Zara: ${model}`);
    await ctx.editMessageText(`✅ *مدل Zara فعال: ${model}*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'model_settings' }]] } });
  });

  bot.callbackQuery('menu_prompt', async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const user = ctx.user;
    const text =
      `✏️ *تنظیمات پرامپت شخصی*\n\n` +
      `پرامپت‌های فعلی:\n\n` +
      `🤖 نوا: ${user.prompts.nova === DEFAULT_PROMPTS.nova ? 'پیش‌فرض' : 'سفارشی ✅'}\n` +
      `🎨 لونا: ${user.prompts.luna === DEFAULT_PROMPTS.luna ? 'پیش‌فرض' : (user.isVIP ? 'سفارشی ✅' : 'پیش‌فرض')}\n` +
      `🔬 زارا: ${user.prompts.zara === DEFAULT_PROMPTS.zara ? 'پیش‌فرض' : (user.isVIP ? 'سفارشی ✅' : 'پیش‌فرض')}\n\n` +
      `💡 برای تنظیم: /setprompt [موتور] متن شما\n\nمثال:\n• \`/setprompt نوا تو یک مشاور حرفه‌ای هستی\``;
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '✏️ مدیریت پرامپت‌ها', callback_data: 'manage_prompts' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
      ]}
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('manage_prompts', async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const user = ctx.user;
    await ctx.editMessageText(
      `✏️ *مدیریت پرامپت‌ها*\n\n` +
      `🤖 نوا:\n${user.prompts.nova === DEFAULT_PROMPTS.nova ? 'پیش‌فرض' : user.prompts.nova.substring(0, 80) + '...'}\n\n` +
      `🎨 لونا:\n${user.prompts.luna === DEFAULT_PROMPTS.luna ? 'پیش‌فرض' : user.prompts.luna.substring(0, 80) + '...'}\n\n` +
      `🔬 زارا:\n${user.prompts.zara === DEFAULT_PROMPTS.zara ? 'پیش‌فرض' : user.prompts.zara.substring(0, 80) + '...'}`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🗑️ ریست نوا', callback_data: 'reset_p_nova' }, { text: '🗑️ ریست لونا', callback_data: 'reset_p_luna' }],
        [{ text: '🗑️ ریست زارا', callback_data: 'reset_p_zara' }],
        [{ text: '👁️ نمایش پرامپت‌ها', callback_data: 'show_prompts_full' }],
        [{ text: '🔙 بازگشت', callback_data: 'menu_prompt' }]
      ]}}
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('show_prompts_full', async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const user = ctx.user;
    await ctx.editMessageText(
      `✏️*پرامپت‌های کامل شما:*\n\n🤖 *نوا:*\n\`${user.prompts.nova}\`\n\n🎨 *لونا:*\n\`${user.prompts.luna}\`\n\n🔬 *زارا:*\n\`${user.prompts.zara}\``,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'manage_prompts' }]] } }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^reset_p_(nova|luna|zara)$/, async (ctx) => {
    if (!ctx.user) return ctx.answerCallbackQuery();
    const key = ctx.match[1];
    const user = ctx.user;
    if ((key === 'luna' || key === 'zara') && !user.isVIP) return ctx.answerCallbackQuery('⚠️ فقط VIP', { show_alert: true });
    user.prompts[key] = DEFAULT_PROMPTS[key];
    await DB.saveUser(ctx.env, ctx.from.id, user);
    await ctx.answerCallbackQuery(`✅ پرامپت ${MODELS[key].name} ریست شد`);
    await ctx.editMessageText(
      `✏️ *مدیریت پرامپت‌ها*\n\n` +
      `🤖 نوا:\n${user.prompts.nova === DEFAULT_PROMPTS.nova ? 'پیش‌فرض' : user.prompts.nova.substring(0, 80) + '...'}\n\n` +
      `🎨 لونا:\n${user.prompts.luna === DEFAULT_PROMPTS.luna ? 'پیش‌فرض' : user.prompts.luna.substring(0, 80) + '...'}\n\n` +
      `🔬 زارا:\n${user.prompts.zara === DEFAULT_PROMPTS.zara ? 'پیش‌فرض' : user.prompts.zara.substring(0, 80) + '...'}`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🗑️ ریست نوا', callback_data: 'reset_p_nova' }, { text: '🗑️ ریست لونا', callback_data: 'reset_p_luna' }],
        [{ text: '🗑️ ریست زارا', callback_data: 'reset_p_zara' }],
        [{ text: '👁️ نمایش پرامپت‌ها', callback_data: 'show_prompts_full' }],
        [{ text: '🔙 بازگشت', callback_data: 'menu_prompt' }]
      ]}}
    );
  });

  bot.callbackQuery('help_chat', async (ctx) => {
    const user = ctx.user;
    resetLimitsIfNeeded(user);
    await ctx.editMessageText(
      `✏️ *راهنمای شخصی‌سازی*\n\n` +
      `🎭 تنظیم شخصیت ربات:\n\n` +
      `من میتونم شخصیت‌های مختلف داشته باشم! تو میتونی برای هر مدل یه شخصیت جداگانه بسازی.\n\n` +
      `📝 روش استفاده:\n\n` +
      `1️⃣ با دستور:\n` +
      `\`\`\`sql\n/setprompt نوا تو یک معلم ریاضی هستی\n\`\`\`\n\n` +
      `2️⃣ با منو:\n` +
      `/prompt → دکمه "مدیریت پرامپت‌ها"\n\n` +
      `🎨 مثال‌های کاربردی:\n\n` +
      `معلم:\n` +
      `\`\`\`sql\n/setprompt نوا تو یک معلم صبور هستی که با مثال توضیح میدی\n\`\`\`\n\n` +
      `دوست صمیمی:\n` +
      `\`\`\`sql\n/setprompt نوا تو یک دوست صمیمی و شوخ‌طبع هستی\n\`\`\`\n\n` +
      `مشاور:\n` +
      `\`\`\`sql\n/setprompt نوا تو یک مشاور حرفه‌ای و محترم هستی\n\`\`\`\n\n` +
      `برنامه‌نویس:\n` +
      `\`\`\`sql\n/setprompt نوا تو یک برنامه‌نویس حرفه‌ای هستی\n\`\`\`\n\n` +
      `🔄 ریست کردن:\n` +
      `از منو /prompt دکمه "ریست" رو بزن\n\n` +
      `💡 نکته:\n` +
      `- هر مدل پرامپت مستقل خودش رو داره\n` +
      `- بعد از تنظیم، بدون /new اجرا میشه\n` +
      `- VIP: دسترسی به همه مدل‌ها\n` +
      `- Free: فقط نوا\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `پرامپت‌های فعلی شما:\n\n` +
      `🤖 نوا: ${user.prompts.nova === DEFAULT_PROMPTS.nova ? 'پیش‌فرض' : 'سفارشی ✅'}\n` +
      `🎨 لونا: ${user.prompts.luna === DEFAULT_PROMPTS.luna ? 'پیش‌فرض' : (user.isVIP ? 'سفارشی ✅' : 'پیش‌فرض')}\n` +
      `🔬 زارا: ${user.prompts.zara === DEFAULT_PROMPTS.zara ? 'پیش‌فرض' : (user.isVIP ? 'سفارشی ✅' : 'پیش‌فرض')}\n\n` +
      `⚠️ تنظیم لونا و زارا فقط برای VIP`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]] } }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('help_image', async (ctx) => {
    const user = ctx.user;
    resetLimitsIfNeeded(user);
    await ctx.editMessageText(
      `🎨 *راهنمای تصاویر*\n\n` +
      `🖼️ ساخت تصویر:\n` +
      `\`\`\`sql\n/img یک گربه در فضا\n\`\`\`\n\n` +
      `- 3 مدل قدرتمند همزمان میسازن\n` +
      `- کیفیت بالا (1280x1280)\n` +
      `- حداکثر 5 تصویر در روز (رایگان)\n\n` +
      `🔍 جستجوی تصویر:\n` +
      `\`\`\`sql\n/search طبیعت زیبا\n\`\`\`\n\n` +
      `- جستجو در گوگل\n` +
      `- ۵ تصویر برتر\n` +
      `- دانلود مستقیم\n\n` +
      `💡 نکات:\n` +
      `- برای نتیجه بهتر، توضیحات دقیق بده\n` +
      `- میتونی به فارسی بنویسی، من ترجمه میکنم\n` +
      `- VIP: نامحدود\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `امروز:\n` +
      `- تصاویر ساخته شده: ${user.limits.images}/5\n` +
      `🌟 VIP شو برای نامحدود`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]] } }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('help_prompt', async (ctx) => {
    const user = ctx.user;
    const novaPrompt = user?.prompts?.nova === DEFAULT_PROMPTS.nova ? 'پیش‌فرض' : 'سفارشی ✅';
    const lunaPrompt = user?.prompts?.luna === DEFAULT_PROMPTS.luna ? 'پیش‌فرض' : (user?.isVIP ? 'سفارشی ✅' : 'پیش‌فرض');
    const zaraPrompt = user?.prompts?.zara === DEFAULT_PROMPTS.zara ? 'پیش‌فرض' : (user?.isVIP ? 'سفارشی ✅' : 'پیش‌فرض');
    await ctx.editMessageText(
      `✏️ *شخصیت جداگانه بسازی*\n\n` +
      `🎭 تنظیم شخصیت ربات:\n\n` +
      `من میتونم شخصیت‌های مختلف داشته باشم! تو میتونی برای هر مدل یه شخصیت جداگانه بسازی.\n\n` +
      `📝 روش استفاده:\n\n` +
      `1️⃣ با دستور:\n` +
      `\`\`\`sql\n/setprompt نوا تو یک معلم ریاضی هستی\n\`\`\`\n\n` +
      `2️⃣ با منو:\n` +
      `/prompt → دکمه "مدیریت پرامپت‌ها"\n\n` +
      `🎨 مثال‌های کاربردی:\n\n` +
      `- **معلم:**\n  \`\`\`sql\n  /setprompt نوا تو یک معلم صبور هستی که با مثال توضیح میدی\n  \`\`\`\n\n` +
      `- **دوست صمیمی:**\n  \`\`\`sql\n  /setprompt نوا تو یک دوست صمیمی و شوخ‌طبع هستی\n  \`\`\`\n\n` +
      `- **مشاور:**\n  \`\`\`sql\n  /setprompt نوا تو یک مشاور حرفه‌ای و محترم هستی\n  \`\`\`\n\n` +
      `- **برنامه‌نویس:**\n  \`\`\`sql\n  /setprompt نوا تو یک برنامه‌نویس حرفه‌ای هستی\n  \`\`\`\n\n` +
      `🔄 ریست کردن:\n` +
      `از منو /prompt دکمه "ریست" رو بزن\n\n` +
      `💡 نکته:\n` +
      `- هر مدل پرامپت مستقل خودش رو داره\n` +
      `- بعد از تنظیم، بدون /new اجرا میشه\n` +
      `- VIP: دسترسی به همه مدل‌ها\n` +
      `- Free: فقط نوا\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `پرامپت‌های فعلی شما:\n\n` +
      `🤖 نوا: ${novaPrompt}\n` +
      `🎨 لونا: ${lunaPrompt}\n` +
      `🔬 زارا: ${zaraPrompt}\n\n` +
      `⚠️ تنظیم لونا و زارا فقط برای VIP`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '✏️ مدیریت پرامپت‌ها', callback_data: 'manage_prompts' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
      ]}}
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('help_commands', async (ctx) => {
    await ctx.editMessageText(
      `⚡ *لیست کامل دستورات*\n\n` +
      `🏠 *دستورات اصلی:*\n` +
      `- \`/start\` - صفحه اصلی و خوش‌آمدگویی\n` +
      `- \`/help\` - راهنمای کامل (همین صفحه)\n` +
      `- \`/new\` - شروع مکالمه جدید و پاک کردن حافظه\n\n` +
      `🤖 *مدیریت مدل‌ها:*\n` +
      `- \`/model\` - تغییر مدل هوش مصنوعی\n` +
      `- انتخاب از: نوا، لونا، زارا\n\n` +
      `🎨 *تصاویر:*\n` +
      `- \`/img [توضیح]\` - ساخت تصویر\n` +
      `  مثال: \`/img یک گربه در فضا\`\n\n` +
      `- \`/search [متن]\` - جستجوی تصویر در گوگل\n` +
      `  مثال: \`/search طبیعت زیبا\`\n\n` +
      `✏️ *شخصی‌سازی:*\n` +
      `- \`/prompt\` - مشاهده و مدیریت پرامپت‌ها\n` +
      `- \`/setprompt [مدل] [متن]\` - تنظیم شخصیت\n` +
      `  مثال: \`/setprompt نوا تو یک معلم هستی\`\n\n` +
      `🌐 *تنظیمات:*\n` +
      `- \`/language\` - تغییر زبان (فارسی/انگلیسی)\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 *نکات مهم:*\n` +
      `- بیشتر کارها با دکمه‌ها انجام میشه\n` +
      `- برای مشاهده وضعیت: /start\n` +
      `- برای راهنمای هر بخش: همین منو\n\n` +
      `🎯 *میانبرها:*\n` +
      `- برای پاسخ سریع، فقط پیام بفرست\n` +
      `- برای تصویر، /img کافیه\n` +
      `- برای حافظه جدید، /new بزن`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]] } }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('help_settings', async (ctx) => {
    const user = ctx.user;
    resetLimitsIfNeeded(user);
    const lim = user.limits;
    await ctx.editMessageText(
      `⚙️ *راهنمای تنظیمات*\n\n` +
      `🌐 زبان:\n` +
      `- فارسی 🇮🇷 / انگلیسی 🇺🇸\n` +
      `- تغییر با: /language\n` +
      `- همه متن‌ها و منوها تغییر میکنه\n\n` +
      `🤖 مدل فعال:\n` +
      `- نوا (Gemini) - سریع و دقیق\n` +
      `- لونا (SambaNova) - قدرتمند\n` +
      `- زارا (Pollinations) - خلاق\n` +
      `- تغییر: /model\n\n` +
      `✏️ شخصی‌سازی:\n` +
      `- پرامپت سفارشی برای هر مدل\n` +
      `- ذخیره خودکار\n` +
      `- ریست در هر لحظه\n` +
      `- مدیریت: /prompt\n\n` +
      `🧠 حافظه:\n` +
      `- ۱۰۰ پیام آخر ذخیره میشه\n` +
      `- پاکسازی: /new\n` +
      `- جداگانه برای هر مدل\n\n` +
      `📊 محدودیت‌ها:\n\n` +
      `رایگان (روزانه):\n` +
      `- پیام: ${lim.messages}/100\n` +
      `- ویس ارسالی: ${lim.voiceSent}/10\n` +
      `- ویس دریافتی: ${lim.voiceReceived}/10\n` +
      `- تصویر: ${lim.images}/5\n\n` +
      `🌟 VIP شوید:\n` +
      `- دسترسی نامحدود\n` +
      `- همه مدل‌ها\n` +
      `- پرامپت‌های سفارشی\n` +
      `- اولویت در پردازش\n` +
      `- تماس: [@Hamid_Ai_pro](https://t.me/Hamid_Ai_pro)\n\n` +
      `━━━━━━━━━━━━━━━━━━\n`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]] } }
    );
    await ctx.answerCallbackQuery();
  });

  async function showGroupSettingsMenu(ctx, settings) {
    const modeText = { all: 'همیشه', mention: 'فقط منشن', smart: 'هوشمند' }[settings.mode] || 'فقط منشن';
    const typingStatus = settings.typingIndicator ? 'فعال ✅' : 'غیرفعال ❌';
    const text =
        `👥 تنظیمات گروه\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📢 حالت پاسخ: ${modeText}\n` +
        `⌨️ نشانگر تایپ: ${typingStatus}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `راهنمای حالت‌ها:\n` +
        `• همیشه — به همه پیام‌ها جواب میدم\n` +
        `• فقط منشن — فقط وقتی صدام کنید\n` +
        `• هوشمند — خودم تصمیم می‌گیرم (پیشنهادی)`;

    await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `همیشه ${settings.mode === 'all' ? '✅' : ''}`, callback_data: 'gmode_all' },
                    { text: `فقط منشن ${settings.mode === 'mention' ? '✅' : ''}`, callback_data: 'gmode_mention' },
                    { text: `هوشمند ${settings.mode === 'smart' ? '✅' : ''}`, callback_data: 'gmode_smart' }
                ],
                [{ text: `نشانگر تایپ: ${settings.typingIndicator ? 'خاموش کن' : 'روشن کن'}`, callback_data: 'gtoggle_typing' }],
                [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
            ]
        }
    });
  }

  bot.callbackQuery('group_settings_menu', async (ctx) => {
    if (!await isGroupAdmin(ctx)) {
      await ctx.answerCallbackQuery('❌ فقط ادمین گروه می‌تواند تنظیمات را تغییر دهد.', { show_alert: true });
      return;
    }
    const s = await DB.getGroupSettings(ctx.env, ctx.chat.id);
    await showGroupSettingsMenu(ctx, s);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('gmode_all', async (ctx) => {
    if (!await isGroupAdmin(ctx)) {
      await ctx.answerCallbackQuery('❌ فقط ادمین گروه', { show_alert: true });
      return;
    }
    const s = await DB.getGroupSettings(ctx.env, ctx.chat.id);
    s.mode = 'all'; await DB.saveGroupSettings(ctx.env, ctx.chat.id, s);
    await ctx.answerCallbackQuery('✅ حالت: همیشه'); await showGroupSettingsMenu(ctx, s);
  });

  bot.callbackQuery('gmode_mention', async (ctx) => {
    if (!await isGroupAdmin(ctx)) {
      await ctx.answerCallbackQuery('❌ فقط ادمین گروه', { show_alert: true });
      return;
    }
    const s = await DB.getGroupSettings(ctx.env, ctx.chat.id);
    s.mode = 'mention'; await DB.saveGroupSettings(ctx.env, ctx.chat.id, s);
    await ctx.answerCallbackQuery('✅ حالت: فقط منشن'); await showGroupSettingsMenu(ctx, s);
  });

  bot.callbackQuery('gmode_smart', async (ctx) => {
    if (!await isGroupAdmin(ctx)) {
      await ctx.answerCallbackQuery('❌ فقط ادمین گروه', { show_alert: true });
      return;
    }
    const s = await DB.getGroupSettings(ctx.env, ctx.chat.id);
    s.mode = 'smart'; await DB.saveGroupSettings(ctx.env, ctx.chat.id, s);
    await ctx.answerCallbackQuery('✅ حالت: هوشمند'); await showGroupSettingsMenu(ctx, s);
  });

  bot.callbackQuery('gtoggle_typing', async (ctx) => {
    if (!await isGroupAdmin(ctx)) {
      await ctx.answerCallbackQuery('❌ فقط ادمین گروه', { show_alert: true });
      return;
    }
    const s = await DB.getGroupSettings(ctx.env, ctx.chat.id);
    s.typingIndicator = !s.typingIndicator; await DB.saveGroupSettings(ctx.env, ctx.chat.id, s);
    await ctx.answerCallbackQuery(s.typingIndicator ? '✅ تایپ فعال' : '✅ تایپ غیرفعال'); await showGroupSettingsMenu(ctx, s);
  });

  bot.callbackQuery('close', async (ctx) => { await ctx.deleteMessage(); await ctx.answerCallbackQuery(); });
  bot.callbackQuery('back_to_start', async (ctx) => { if (!ctx.user) return ctx.answerCallbackQuery(); await sendMainMenu(ctx); await ctx.answerCallbackQuery(); });

  // ===== دستورات اصلی =====
  bot.command('/new', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    const m = user.currentModel;
    user.history[m] = [];
    await DB.saveUser(ctx.env, ctx.from.id, user);
    await ctx.reply(t(user, `✅ حافظه مدل ${MODELS[m].name} پاک شد.`, `✅ ${MODELS[m].name} memory cleared.`));
  });

  bot.command('/model', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    const mi = MODELS[user.currentModel] || MODELS.nova;
    await ctx.reply(
      `🔮 *انتخاب هوش مصنوعی*\n\nمدل فعال: ${mi.name} ${mi.emoji}\n⚡ ${mi.description}\n\nبرای تغییر مدل، انتخاب کن:`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: `🤖 نوا ${user.currentModel === 'nova' ? '✅' : ''}`, callback_data: 'set_model_nova' }, { text: `🧠 لونا ${user.currentModel === 'luna' ? '✅' : ''}`, callback_data: 'set_model_luna' }],
        [{ text: `🎨 زارا ${user.currentModel === 'zara' ? '✅' : ''}`, callback_data: 'set_model_zara' }],
        [{ text: '⚙️ تنظیمات مدل', callback_data: 'model_settings' }, { text: '✏️ شخصیت', callback_data: 'menu_prompt' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
      ]}}
    );
  });

  bot.command('/language', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    user.language = user.language === 'fa' ? 'en' : 'fa';
    await DB.saveUser(ctx.env, ctx.from.id, user);
    await ctx.reply(user.language === 'fa' ? '✅ زبان به فارسی تغییر یافت.' : '✅ Language changed to English.');
  });

  bot.command('/prompt', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    await ctx.reply(
      `✏️ *پرامپت‌های فعلی شما:*\n\n🤖 نوا:\n\`${user.prompts.nova.substring(0, 100)}${user.prompts.nova.length > 100 ? '...' : ''}\`\n\n🎨 لونا:\n\`${user.prompts.luna.substring(0, 100)}${user.prompts.luna.length > 100 ? '...' : ''}\`\n\n🔬 زارا:\n\`${user.prompts.zara.substring(0, 100)}${user.prompts.zara.length > 100 ? '...' : ''}\`\n\nبرای تغییر:\n/setprompt [مدل] [متن]\n\nمثال:\n/setprompt نوا تو یک معلم ریاضی هستی`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🗑️ ریست نوا', callback_data: 'reset_p_nova' }, { text: '🗑️ ریست لونا', callback_data: 'reset_p_luna' }],
        [{ text: '🗑️ ریست زارا', callback_data: 'reset_p_zara' }],
        [{ text: '👁️ نمایش پرامپت‌ها', callback_data: 'show_prompts_full' }],
        [{ text: '🔙 بازگشت', callback_data: 'back_to_start' }]
      ]}}
    );
  });

  bot.command('/setprompt', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('❌ فرمت: /setprompt [مدل] [پرامپت]\nمثال: /setprompt نوا تو یک معلم هستی');
    const nameMap = { 'NOVA': 'nova', 'Luna': 'luna', 'Zara': 'zara', 'nova': 'nova', 'luna': 'luna', 'zara': 'zara', 'نوا': 'nova', 'لونا': 'luna', 'زارا': 'zara' };
    const key = nameMap[args[0]];
    if (!key) return ctx.reply('❌ مدل نامعتبر. مدل‌های موجود: نوا، لونا، زارا');
    if ((key === 'luna' || key === 'zara') && !user.isVIP) return ctx.reply('⚠️ تنظیم لونا و زارا فقط برای VIP است.');
    user.prompts[key] = args.slice(1).join(' ');
    await DB.saveUser(ctx.env, ctx.from.id, user);
    await ctx.reply(`✅ *پرامپت ${MODELS[key].name} تنظیم و اعمال شد*\n\nبدون نیاز به /new از الان فعال است!`, { parse_mode: 'Markdown' });
  });

  bot.command('/img', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    const prompt = ctx.message.text.split(' ').slice(1).join(' ');
    if (!prompt) return ctx.reply('❌ مثال: /img یک گربه در فضا');
    if (!checkLimit(user, 'images')) { await DB.saveUser(ctx.env, ctx.from.id, user); return ctx.reply(t(user, '❌ به سقف تصویر روزانه (۵) رسیدید.', '❌ Daily image limit reached.')); }
    const seed = Math.floor(Math.random() * 99999);
    user.lastImage = { seed, prompt };
    await DB.saveUser(ctx.env, ctx.from.id, user);
    await ctx.api.sendChatAction(ctx.chat.id, 'upload_photo');
    try {
      const imageUrls = await generateImagesWithThreeModels(ctx.env, prompt, seed);
      for (let i = 0; i < imageUrls.length; i++) {
        await ctx.replyWithPhoto(imageUrls[i], { caption: i === 0 ? `🖼 *تصویر ساخته شده!*\n📝 پرامپت: ${prompt}\n\n✨ برای ویرایش: /edit [توضیح تغییر]` : undefined }).catch(() => {});
      }
    } catch (e) {
      await DB.addLog(ctx.env, { type: 'error', message: `img command error: ${e.message}` });
      await ctx.reply('❌ خطا در تولید تصویر. دوباره تلاش کنید.');
    }
  });

  bot.command('/edit', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    const editPrompt = ctx.message.text.split(' ').slice(1).join(' ');
    if (!editPrompt) return ctx.reply('❌ مثال: /edit رنگ زمینه رو آبی کن');
    if (!user.lastImage) return ctx.reply('❌ اول با /img یک تصویر بساز، بعد ویرایش کن.');
    if (!checkLimit(user, 'images')) { await DB.saveUser(ctx.env, ctx.from.id, user); return ctx.reply('❌ سقف تصویر.'); }
    await ctx.api.sendChatAction(ctx.chat.id, 'upload_photo');
    try {
      const combinedPrompt = `${user.lastImage.prompt}, ${editPrompt}`;
      const newSeed = Math.floor(Math.random() * 99999);
      user.lastImage = { seed: newSeed, prompt: combinedPrompt };
      await DB.saveUser(ctx.env, ctx.from.id, user);
      const imageUrls = await generateImagesWithThreeModels(ctx.env, combinedPrompt, newSeed);
      for (let i = 0; i < imageUrls.length; i++) {
        await ctx.replyWithPhoto(imageUrls[i], { caption: i === 0 ? `✨ *تصویر ویرایش شده!*\n📝 پرامپت: ${combinedPrompt}` : undefined }).catch(() => {});
      }
    } catch (e) { await ctx.reply('❌ خطا در ویرایش تصویر.'); }
  });

  bot.command('/search', async (ctx) => {
    if (!ctx.user) return;
    const query = ctx.message.text.split(' ').slice(1).join(' ');
    if (!query) return ctx.reply('❌ مثال: /search طبیعت زیبا');
    if (!ctx.env.GOOGLE_API_KEY || !ctx.env.GOOGLE_CX) return ctx.reply('❌ سرویس جستجو پیکربندی نشده است.');
    await ctx.api.sendChatAction(ctx.chat.id, 'find_location');
    try {
      const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${ctx.env.GOOGLE_API_KEY}&cx=${ctx.env.GOOGLE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=5`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (!data.items?.length) return ctx.reply('❌ هیچ تصویری یافت نشد.');
      for (const item of data.items.slice(0, 5)) await ctx.replyWithPhoto(item.link).catch(() => {});
    } catch (e) { await ctx.reply('❌ خطا در جستجو.'); }
  });

  // ===== دستورات گروه =====
  bot.command('/delete', async (ctx) => {
    if (!['group', 'supergroup'].includes(ctx.chat?.type)) return;
    if (!await isGroupAdmin(ctx)) return ctx.reply('❌ فقط ادمین‌ها می‌تونن این دستور رو بزنن.');
    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) return ctx.reply('❌ روی پیامی که می‌خوای حذف بشه ریپلای کن.');
    try {
      await bot.deleteMessage(ctx.chat.id, replyMsg.message_id);
      await bot.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      await ctx.reply('❌ نتونستم حذف کنم. مطمئن شو ربات ادمین گروهه.');
    }
  });

  bot.command('/del', async (ctx) => {
    if (!['group', 'supergroup'].includes(ctx.chat?.type)) return;
    if (!await isGroupAdmin(ctx)) return ctx.reply('❌ فقط ادمین‌ها می‌تونن این دستور رو بزنن.');
    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) return ctx.reply('❌ روی پیامی که می‌خوای حذف بشه ریپلای کن.');
    try {
      await bot.deleteMessage(ctx.chat.id, replyMsg.message_id);
      await bot.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      await ctx.reply('❌ نتونستم حذف کنم. مطمئن شو ربات ادمین گروهه.');
    }
  });

  bot.command('/remove', async (ctx) => {
    if (!['group', 'supergroup'].includes(ctx.chat?.type)) return;
    if (!await isGroupAdmin(ctx)) return ctx.reply('❌ فقط ادمین‌ها می‌تونن این دستور رو بزنن.');
    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) return ctx.reply('❌ روی پیام کاربری که می‌خوای حذف بشه ریپلای کن.');
    try {
      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/banChatMember`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ctx.chat.id, user_id: replyMsg.from.id, until_date: Math.floor(Date.now() / 1000) + 40 })
      });
      await bot.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      await ctx.reply('❌ نتونستم حذف کنم. مطمئن شو ربات ادمین گروهه.');
    }
  });

  bot.command('/ban', async (ctx) => {
    if (!['group', 'supergroup'].includes(ctx.chat?.type)) return;
    if (!await isGroupAdmin(ctx)) return ctx.reply('❌ فقط ادمین‌ها می‌تونن این دستور رو بزنن.');
    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) return ctx.reply('❌ روی پیام کاربری که می‌خوای بن بشه ریپلای کن.');
    try {
      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/banChatMember`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ctx.chat.id, user_id: replyMsg.from.id })
      });
      await ctx.reply(`🚫 کاربر ${replyMsg.from.first_name || replyMsg.from.id} بن شد.`);
      await bot.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      await ctx.reply('❌ نتونستم بن کنم. مطمئن شو ربات ادمین گروهه.');
    }
  });

  // ===== پیام‌های متنی =====
  bot.on('message:text', async (ctx) => {
    if (!ctx.user) return;
    const userId = ctx.from.id;
    let user = ctx.user;
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    // ری‌اکشن خودکار
    if (ctx.message?.message_id && ctx.chat?.id) {
      let reaction = '👍';
      const t2 = text.toLowerCase();
      if (t2.includes('😂') || t2.includes('خنده') || t2.includes('جوک') || t2.includes('باحال')) reaction = '🤣';
      else if (t2.includes('❤️') || t2.includes('عشق') || t2.includes('دوست دارم') || t2.includes('مرسی') || t2.includes('ممنون')) reaction = '❤️';
      else if (t2.includes('وای') || t2.includes('عالی') || t2.includes('باورم') || t2.includes('جدی') || t2.includes('😮')) reaction = '😮';
      else if (t2.includes('؟') || t2.includes('?') || t2.includes('چرا') || t2.includes('چطور')) reaction = '🤔';
      else if (t2.includes('🔥') || t2.includes('آتیش') || t2.includes('خفن') || t2.includes('داغ')) reaction = '🔥';
      else if (t2.includes('غمگین') || t2.includes('ناراحت') || t2.includes('😢') || t2.includes('گریه')) reaction = '🥺';
      else if (t2.includes('اوکی') || t2.includes('باشه') || t2.includes('چشم') || t2.includes('آره')) reaction = '👌';
      else if (t2.includes('سلام') || t2.includes('هی') || t2.includes('درود') || t2.includes('hello') || t2.includes('hi')) reaction = '👋';
      else if (t2.includes('ممنون') || t2.includes('دمت') || t2.includes('آفرین') || t2.includes('خوبی')) reaction = '🙏';
      else if (t2.length < 10) reaction = '👀';
      ctx.react(reaction).catch(() => {});
    }

    // چک گروه
    const isGroup = ['group', 'supergroup'].includes(ctx.chat?.type);
    if (isGroup) {
      const s = await DB.getGroupSettings(ctx.env, ctx.chat.id);
      if (s.mode === 'mention') {
        const isReply = ctx.message.reply_to_message?.from?.is_bot;
        const isMentioned = (ctx.message.entities || []).some(e => e.type === 'mention');
        if (!isReply && !isMentioned) return;
      } else if (s.mode === 'smart') {
        const isReply = ctx.message.reply_to_message?.from?.is_bot;
        const hasKw = ['نوا', 'nova', '؟', '?'].some(k => text.toLowerCase().includes(k));
        if (!isReply && !hasKw) return;
      }
    }

    // حالت ادمین
    if (String(userId) === String(ctx.env.ADMIN_ID)) {
      const adminState = await DB.getAdminState(ctx.env, userId);
      if (adminState) {
        await DB.setAdminState(ctx.env, userId, null);
        if (adminState.action === 'broadcast') {
          const users = await DB.getAllUsers(ctx.env);
          let sent = 0, failed = 0;
          for (const u of users) {
            if (!u.blocked) {
              const ok = await ctx.api.sendMessage(u.id, `📢 *پیام همگانی از طرف مدیریت ربات:*\n\n${text}`, { parse_mode: 'Markdown' }).then(() => true).catch(() => false);
              ok ? sent++ : failed++;
            }
          }
          await ctx.reply(`✅ پیام به ${sent} کاربر ارسال شد.\n${failed > 0 ? `❌ ${failed} کاربر ناموفق` : ''}`);
          return;
        }
        if (adminState.action === 'add_vip') {
          const target = await DB.getUser(ctx.env, text.trim());
          target.isVIP = true;
          await DB.saveUser(ctx.env, text.trim(), target);
          await ctx.reply(`✅ کاربر ${text.trim()} VIP شد.`);
          await ctx.api.sendMessage(text.trim(), '🌟 تبریک! حساب شما VIP شد!').catch(() => {});
          return;
        }
        if (adminState.action === 'block_user') {
          const target = await DB.getUser(ctx.env, text.trim());
          target.blocked = true;
          await DB.saveUser(ctx.env, text.trim(), target);
          await ctx.reply(`🚫 کاربر ${text.trim()} مسدود شد.`);
          return;
        }
        if (adminState.action === 'unblock_user') {
          const target = await DB.getUser(ctx.env, text.trim());
          target.blocked = false;
          await DB.saveUser(ctx.env, text.trim(), target);
          await ctx.reply(`✅ کاربر ${text.trim()} رفع مسدود شد.`);
          return;
        }
        if (adminState.action === 'change_user_model') {
          const parts = text.trim().split(' ');
          if (parts.length < 2) { await ctx.reply('❌ فرمت: [آیدی] [مدل]\nمثال: `123456789 luna`'); return; }
          const targetId = parts[0];
          const newModel = parts[1];
          if (!MODELS[newModel]) { await ctx.reply('❌ مدل نامعتبر. موجود: nova, luna, zara'); return; }
          const target = await DB.getUser(ctx.env, targetId);
          target.currentModel = newModel;
          await DB.saveUser(ctx.env, targetId, target);
          await ctx.reply(`✅ مدل کاربر ${targetId} به ${MODELS[newModel].name} ${MODELS[newModel].emoji} تغییر یافت.`);
          await ctx.api.sendMessage(targetId, `🔄 مدل شما توسط مدیر به *${MODELS[newModel].name}* ${MODELS[newModel].emoji} تغییر یافت.`, { parse_mode: 'Markdown' }).catch(() => {});
          return;
        }
      }
    }

    // محدودیت پیام
    if (!checkLimit(user, 'messages')) {
      await DB.saveUser(ctx.env, userId, user);
      return ctx.reply(t(user, '❌ به سقف پیام‌های روزانه (۱۰۰) رسیدید.', '❌ Daily message limit reached (100).'));
    }

    const modelKey = user.currentModel;
    const systemPrompt = user.prompts[modelKey] || DEFAULT_PROMPTS[modelKey];
    const history = user.history[modelKey] || [];

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    try {
      const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-20), { role: 'user', content: text }];
      const reply = await callAI(ctx.env, user, messages);

      user.history[modelKey] = [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }].slice(-40);
      user.totalMessages = (user.totalMessages || 0) + 1;
      await DB.saveUser(ctx.env, userId, user);

      await DB.addLog(ctx.env, { type: 'info', message: `✅ Success Model: ${modelKey}` });

      const words = reply.split(' ');
      const sentMsg = await ctx.reply('.‏.‏.✍️', { reply_to_message_id: ctx.message.message_id });
      const msgId = sentMsg.result?.message_id;
      if (msgId && words.length > 6) {
        const chunkSize = Math.max(5, Math.floor(words.length / 3));
        const chunks = [];
        for (let i = chunkSize; i < words.length; i += chunkSize) {
          chunks.push(words.slice(0, i).join(' ') + ' ✍️');
        }
        chunks.push(reply);
        for (let i = 0; i < chunks.length; i++) {
          await new Promise(r => setTimeout(r, 900));
          await bot.editMessageText(ctx.chat.id, msgId, chunks[i]).catch(() => {});
        }
      } else if (msgId) {
        await new Promise(r => setTimeout(r, 500));
        await bot.editMessageText(ctx.chat.id, msgId, reply).catch(() => {});
      }

    } catch (e) {
      await DB.addLog(ctx.env, { type: 'error', message: `API Call Failed: ${e.message}` });
      await ctx.reply(t(user, '❌ خطا در پردازش پیام. چند لحظه بعد دوباره تلاش کن.', '❌ Error processing message.'));
    }
  });

  // ===== پیام صوتی =====
  bot.on('message:voice', async (ctx) => {
    if (!ctx.user) return;
    const userId = ctx.from.id;
    const user = ctx.user;
    if (!checkLimit(user, 'voiceReceived')) { await DB.saveUser(ctx.env, userId, user); return ctx.reply(t(user, '❌ به سقف ویس دریافتی روزانه (۱۰) رسیدید.', '❌ Daily voice limit reached.')); }
    if (!ctx.env.OPENAI_API_KEY || ctx.env.OPENAI_API_KEY === 'temp') return ctx.reply(t(user, '❌ سرویس ویس موقتاً در دسترس نیست.', '❌ Voice service unavailable.'));
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    try {
      const fileLink = await ctx.api.getFile(ctx.message.voice.file_id).then(f => f.getUrl());
      const audioBuffer = await (await fetch(fileLink)).arrayBuffer();
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
      formData.append('model', 'whisper-1');
      formData.append('language', 'fa');
      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': `Bearer ${ctx.env.OPENAI_API_KEY}` }, body: formData });
      if (!whisperRes.ok) throw new Error(`Whisper error: ${whisperRes.status}`);
      const transcribedText = (await whisperRes.json()).text;
      if (!transcribedText) return ctx.reply(t(user, '❌ متن تشخیص داده نشد.', '❌ Could not transcribe.'));
      const modelKey = user.currentModel;
      const messages = [{ role: 'system', content: user.prompts[modelKey] }, ...user.history[modelKey].slice(-20), { role: 'user', content: transcribedText }];
      const reply = await callAI(ctx.env, user, messages);
      user.history[modelKey] = [...user.history[modelKey], { role: 'user', content: transcribedText }, { role: 'assistant', content: reply }].slice(-40);
      await DB.saveUser(ctx.env, userId, user);
      await ctx.reply(`🎤 *متن تشخیص داده شده:*\n${transcribedText}\n\n🤖 *پاسخ:*\n${reply}`, { parse_mode: 'Markdown' });
    } catch (e) {
      await DB.addLog(ctx.env, { type: 'error', message: `Voice handler error: ${e.message}` });
      await ctx.reply(t(user, '❌ خطا در پردازش ویس.', '❌ Voice processing error.'));
    }
  });

  // ===== عکس =====
  bot.on('message:photo', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileLink = await ctx.api.getFile(photo.file_id).then(f => f.getUrl());
      const imageBuffer = await (await fetch(fileLink)).arrayBuffer();
      const base64Image = arrayBufferToBase64(imageBuffer);
      const caption = ctx.message.caption || t(user, 'این تصویر را به فارسی توضیح بده', 'Describe this image');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${ctx.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: caption }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }], generationConfig: { maxOutputTokens: 800 } })
      });
      if (!response.ok) throw new Error(`Vision API error: ${response.status}`);
      const data = await response.json();
      await ctx.reply(`📸 *تحلیل تصویر:*\n\n${data.candidates[0].content.parts[0].text}`, { parse_mode: 'Markdown' });
    } catch (e) {
      await DB.addLog(ctx.env, { type: 'error', message: `Photo handler error: ${e.message}` });
      await ctx.reply(t(user, '❌ خطا در تحلیل تصویر.', '❌ Image analysis error.'));
    }
  });

  // ===== گیف =====
  bot.on('message:animation', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    try {
      const animation = ctx.message.animation;
      if (!animation.thumbnail) {
        return ctx.reply(t(user, '❌ این گیف thumbnail ندارد و قابل تحلیل نیست.', '❌ This GIF has no thumbnail.'));
      }
      const fileLink = await ctx.api.getFile(animation.thumbnail.file_id).then(f => f.getUrl());
      const imageBuffer = await (await fetch(fileLink)).arrayBuffer();
      if (!imageBuffer || imageBuffer.byteLength === 0) throw new Error('Empty thumbnail');
      const base64Image = arrayBufferToBase64(imageBuffer);
      const caption = ctx.message.caption || t(user, 'این گیف را توضیح بده', 'Describe this gif');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${ctx.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: caption }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }], generationConfig: { maxOutputTokens: 500 } })
      });
      if (!response.ok) throw new Error(`Gemini API error (${response.status})`);
      const data = await response.json();
      await ctx.reply(`🎞️ *تحلیل گیف:*\n\n${data.candidates[0].content.parts[0].text}`, { parse_mode: 'Markdown' });
    } catch (e) {
      await DB.addLog(ctx.env, { type: 'error', message: `Animation handler error: ${e.message}` });
      await ctx.reply(t(user, '❌ خطا در تحلیل گیف.', '❌ GIF analysis error.'));
    }
  });

  // ===== ویدیو =====
  bot.on('message:video', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    try {
      if (!ctx.message.video.thumbnail) return ctx.reply(t(user, '❌ این ویدیو thumbnail ندارد.', '❌ No thumbnail.'));
      const fileLink = await ctx.api.getFile(ctx.message.video.thumbnail.file_id).then(f => f.getUrl());
      const imageBuffer = await (await fetch(fileLink)).arrayBuffer();
      const base64Image = arrayBufferToBase64(imageBuffer);
      const caption = ctx.message.caption || t(user, 'این ویدیو را تحلیل کن', 'Analyze this video');
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${ctx.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: caption }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }], generationConfig: { maxOutputTokens: 800 } })
      });
      const data = await response.json();
      await ctx.reply(`🎬 *تحلیل ویدیو (بر اساس فریم اول):*\n\n${data.candidates[0].content.parts[0].text}`, { parse_mode: 'Markdown' });
    } catch (e) {
      await DB.addLog(ctx.env, { type: 'error', message: `Video handler error: ${e.message}` });
      await ctx.reply(t(user, '❌ خطا در تحلیل ویدیو.', '❌ Video analysis error.'));
    }
  });

  // ===== پنل مدیریت =====
  async function showAdminUsers(ctx, page, sortBy) {
    const isAdmin = String(ctx.from.id) === String(ctx.env.ADMIN_ID);
    if (!isAdmin) return ctx.answerCallbackQuery ? ctx.answerCallbackQuery('⛔') : ctx.reply('⛔');

    const allUsers = await DB.getAllUsers(ctx.env);
    const total = allUsers.length;
    const vipCount = allUsers.filter(u => u.isVIP).length;
    const blockedCount = allUsers.filter(u => u.blocked).length;

    let sorted = [...allUsers];
    if (sortBy === 'newest') sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    else if (sortBy === 'active') sorted.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
    else if (sortBy === 'messages') sorted.sort((a, b) => (b.totalMessages || 0) - (a.totalMessages || 0));

    const totalPages = Math.max(1, Math.ceil(sorted.length / USERS_PER_PAGE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * USERS_PER_PAGE;
    const pageUsers = sorted.slice(start, start + USERS_PER_PAGE);

    let text = `📊 *پنل مدیریت نوآ*\n\n`;
    text += `👥 کل: ${total} | 💎 VIP: ${vipCount} | 🚫 مسدود: ${blockedCount}\n\n`;

    pageUsers.forEach((u, i) => {
      resetLimitsIfNeeded(u);
      const num = start + i + 1;
      const name = (u.firstName || '') + (u.lastName ? ' ' + u.lastName : '') || 'ناشناس';
      const lastDate = u.lastActive ? new Date(u.lastActive).toLocaleDateString('fa-IR') : '-';
      const todayMsgs = u.limits?.messages || 0;
      const totalMsgs = u.totalMessages || 0;
      text += `${num}\\. ${u.isVIP ? '👑' : ''}${name}\n`;
      text += `🪪 ID \`${u.id}\`\n`;
      text += `🕐 ${totalMsgs} پیام \\| ${lastDate}\n`;
      text += `امروز: ${todayMsgs}/100 📊 پیام\n\n`;
    });

    const pageRow = [];
    const maxPageBtns = Math.min(totalPages, 5);
    for (let p = 1; p <= maxPageBtns; p++) {
      pageRow.push({ text: String(p), callback_data: `adm_p_${p}_${sortBy}` });
    }

    const keyboard = { inline_keyboard: [
      pageRow.length > 0 ? pageRow : [{ text: '1', callback_data: `adm_p_1_${sortBy}` }],
      [
        { text: `◀️ قبلی`, callback_data: `adm_p_${Math.max(1, safePage - 1)}_${sortBy}` },
        { text: `${safePage}/${totalPages}`, callback_data: 'adm_noop' },
        { text: `بعدی ▶️`, callback_data: `adm_p_${Math.min(safePage + 1, totalPages)}_${sortBy}` }
      ],
      [
        { text: `🆕 جدیدترین${sortBy === 'newest' ? ' ✅' : ''}`, callback_data: 'adm_sort_newest' },
        { text: `⚡ فعال‌ترین${sortBy === 'active' ? ' ✅' : ''}`, callback_data: 'adm_sort_active' },
        { text: `💬 پرپیام${sortBy === 'messages' ? ' ✅' : ''}`, callback_data: 'adm_sort_messages' }
      ],
      [
        { text: '🔧 تعمیرات', callback_data: 'adm_repair' },
        { text: '📊 CSV', callback_data: 'adm_csv' },
        { text: '🚫 بلاک', callback_data: 'adm_ask_block' },
        { text: '✅ آنبلاک', callback_data: 'adm_ask_unblock' }
      ],
      [
        { text: '📣 پیام همگانی', callback_data: 'adm_broadcast_btn' },
        { text: '👑 افزودن VIP', callback_data: 'adm_add_vip_btn' }
      ],
      [
        { text: '🔄 تغییر مدل کاربر', callback_data: 'adm_change_model_btn' }
      ],
      [
        { text: '🔑 وضعیت API Keyها', callback_data: 'adm_keys_btn' }
      ],
      [
        { text: '🔄 بروزرسانی', callback_data: `adm_p_${safePage}_${sortBy}` },
        { text: '❌ بستن', callback_data: 'close' }
      ]
    ]};

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  }

  bot.command('/admin', async (ctx) => {
    if (ctx.chat?.type !== 'private') return ctx.reply('⚠️ پنل مدیریت فقط در چت خصوصی');
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.reply('⛔ شما دسترسی به پنل مدیریت ندارید.');
    await showAdminUsers(ctx, 1, 'newest');
  });

  bot.callbackQuery(/^adm_p_(\d+)_(newest|active|messages)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await showAdminUsers(ctx, parseInt(ctx.match[1]), ctx.match[2]);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^adm_sort_(newest|active|messages)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await showAdminUsers(ctx, 1, ctx.match[1]);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('adm_noop', async (ctx) => { await ctx.answerCallbackQuery(); });

  bot.callbackQuery('adm_keys_btn', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery('⏳ در حال بررسی...');
    await ctx.editMessageText('⏳ در حال بررسی API keyها...', { reply_markup: { inline_keyboard: [] } });

    const results = { gemini: null, sambanova: null, pollinations: null };

    const geminiKey = ctx.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey !== 'temp') {
      const shortKey = geminiKey.substring(0, 8) + '...' + geminiKey.slice(-4);
      try {
        const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
        });
        if (testRes.ok) results.gemini = { key: shortKey, status: 'ok' };
        else {
          const errData = await testRes.json().catch(() => ({}));
          results.gemini = { key: shortKey, status: errData?.error?.code === 429 ? 'ratelimit' : 'error', code: testRes.status };
        }
      } catch { results.gemini = { key: shortKey, status: 'error' }; }
    }

    const sambanovaKey = ctx.env.SAMBANOVA_API_KEY;
    if (sambanovaKey && sambanovaKey !== 'temp') {
      const shortKey = sambanovaKey.substring(0, 8) + '...' + sambanovaKey.slice(-4);
      try {
        const testRes = await fetch('https://api.sambanova.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${sambanovaKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'Meta-Llama-3.1-8B-Instruct', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
        });
        results.sambanova = { key: shortKey, status: testRes.ok ? 'ok' : 'error', code: testRes.status };
      } catch { results.sambanova = { key: shortKey, status: 'error' }; }
    }

    try {
      const testRes = await fetch('https://text.pollinations.ai/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'openai' })
      });
      results.pollinations = testRes.ok ? 'ok' : 'error';
    } catch { results.pollinations = 'error'; }

    const now = new Date().toLocaleTimeString('fa-IR');
    let text = `📊 *گزارش وضعیت API های ربات*\n\n`;

    text += `🤖 Gemini (نوا):\n`;
    if (!results.gemini) text += `❌ کلید تنظیم نشده\n`;
    else text += `${results.gemini.key} ${results.gemini.status === 'ok' ? '🟢 سالم' : results.gemini.status === 'ratelimit' ? '🔴 rate limit' : `🔴 خطا (${results.gemini.code})`}\n`;

    text += `\n🧠 SambaNova (لونا):\n`;
    if (!results.sambanova) text += `⚠️ کلید تنظیم نشده\n`;
    else text += `${results.sambanova.key} ${results.sambanova.status === 'ok' ? '🟢 سالم' : `🔴 خطا (${results.sambanova.code})`}\n`;

    text += `\n🔬 Pollinations (زارا):\n`;
    text += results.pollinations === 'ok' ? `🟢 سالم\n` : `🔴 خطا\n`;
    text += `\n⏰ زمان تست: ${now}`;

    await ctx.editMessageText(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 تست مجدد', callback_data: 'adm_keys_btn' }],
          [{ text: '🔙 بازگشت به پنل', callback_data: 'adm_back' }]
        ]
      }
    });
  });

  bot.callbackQuery('adm_broadcast_btn', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.setAdminState(ctx.env, ctx.from.id, { action: 'broadcast' });
    await ctx.editMessageText('📣 *ارسال پیام همگانی*\n\nمتن پیام خود را بفرستید:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'adm_cancel' }]] } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('adm_add_vip_btn', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.setAdminState(ctx.env, ctx.from.id, { action: 'add_vip' });
    await ctx.editMessageText('👑 *افزودن VIP*\n\nآیدی عددی کاربر را بفرستید:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'adm_cancel' }]] } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('adm_change_model_btn', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.setAdminState(ctx.env, ctx.from.id, { action: 'change_user_model' });
    await ctx.editMessageText(
      `🔄 *تغییر مدل کاربر*\n\nفرمت: \`آیدی مدل\`\n\nمثال:\n\`123456789 nova\`\n\`123456789 luna\`\n\`123456789 zara\`\n\nمدل‌های موجود:\n🤖 nova | 🎨 luna | 🔬 zara`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'adm_cancel' }]] } }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('adm_ask_block', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.setAdminState(ctx.env, ctx.from.id, { action: 'block_user' });
    await ctx.editMessageText('🚫 *مسدود کردن کاربر*\n\nآیدی عددی کاربر را بفرستید:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'adm_cancel' }]] } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('adm_ask_unblock', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.setAdminState(ctx.env, ctx.from.id, { action: 'unblock_user' });
    await ctx.editMessageText('✅ *رفع مسدودیت کاربر*\n\nآیدی عددی کاربر را بفرستید:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'adm_cancel' }]] } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('adm_cancel', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.setAdminState(ctx.env, ctx.from.id, null);
    await showAdminUsers(ctx, 1, 'newest');
    await ctx.answerCallbackQuery('❌ لغو شد');
  });

  bot.callbackQuery('adm_csv', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery('⏳ در حال آماده‌سازی...');
    try {
      const users = await DB.getAllUsers(ctx.env);
      let csv = 'ID,Name,Username,VIP,Blocked,TotalMessages,CreatedAt,LastActive\n';
      for (const u of users) {
        const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
        csv += `${u.id},"${name}",${u.username || ''},${u.isVIP},${u.blocked},${u.totalMessages || 0},${u.createdAt || ''},${u.lastActive || ''}\n`;
      }
      const buf = new TextEncoder().encode(csv);
      await bot.sendDocument(ctx.from.id, buf, `nova_users_${Date.now()}.csv`, { caption: `📊 ${users.length} کاربر` });
    } catch (e) {
      await bot.sendMessage(ctx.from.id, '❌ خطا در تولید CSV.');
    }
  });

  bot.callbackQuery('adm_repair', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await ctx.editMessageText(
      `🔧 *پنل تعمیرات*\n\nعملیات موجود:`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: '🔄 بازسازی دیتابیس', callback_data: 'adm_rebuild_do' }],
        [{ text: '🗑️ پاکسازی لاگ', callback_data: 'adm_clearlogs' }],
        [{ text: '🔙 بازگشت', callback_data: 'adm_back' }]
      ]}}
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('adm_rebuild_do', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery('✅ بازسازی در حال انجام...');
    try {
      const users = await DB.getAllUsers(ctx.env);
      let fixed = 0;
      for (const u of users) {
        let changed = false;
        if (!u.prompts) { u.prompts = { ...DEFAULT_PROMPTS }; changed = true; }
        if (!u.history) { u.history = { nova: [], luna: [], zara: [] }; changed = true; }
        if (!u.limits) { u.limits = { date: '', messages: 0, voiceSent: 0, voiceReceived: 0, images: 0 }; changed = true; }
        if (!u.lunaModel) { u.lunaModel = 'Meta-Llama-3.1-8B-Instruct'; changed = true; }
        if (!u.zaraModel) { u.zaraModel = 'openai'; changed = true; }
        if (!u.currentModel || !MODELS[u.currentModel]) { u.currentModel = 'zara'; changed = true; }
        if (changed) { await DB.saveUser(ctx.env, u.id, u); fixed++; }
      }
      await ctx.editMessageText(
        `✅ *بازسازی دیتابیس کامل شد*\n\n👥 کل کاربران: ${users.length}\n🔧 تعمیر شده: ${fixed} کاربر`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'adm_back' }]] } }
      );
    } catch (e) {
      await ctx.editMessageText(
        `❌ *خطا در بازسازی:*\n${e.message}`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'adm_back' }]] } }
      );
    }
  });

  bot.callbackQuery('adm_clearlogs', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.clearLogs(ctx.env);
    await ctx.answerCallbackQuery('✅ لاگ‌ها پاک شدند');
    await ctx.editMessageText(
      `🗑️ *لاگ‌ها پاک شدند*`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'adm_back' }]] } }
    );
  });

  bot.callbackQuery('adm_back', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await showAdminUsers(ctx, 1, 'newest');
    await ctx.answerCallbackQuery();
  });

  // ===== لاگ‌ها =====
  async function showLogs(ctx, filter) {
    const isAdmin = String(ctx.from.id) === String(ctx.env.ADMIN_ID);
    if (!isAdmin) return;
    const allLogs = await DB.getLogs(ctx.env, 'all');
    const errors = allLogs.filter(l => l.type === 'error');
    const warnings = allLogs.filter(l => l.type === 'warning');
    const infos = allLogs.filter(l => l.type === 'info');

    let displayLogs = allLogs;
    if (filter === 'errors') displayLogs = errors;
    else if (filter === 'warnings') displayLogs = warnings;

    let text = `📊 لاگ‌های اخیر ربات\n\nکل: ${allLogs.length}/200 | خطا: ${errors.length} | هشدار: ${warnings.length}\n\n`;

    if (displayLogs.length === 0) {
      text += 'لاگی در این دسته وجود ندارد.';
    } else {
      displayLogs.slice(0, 8).forEach(l => {
        const icon = l.type === 'error' ? '🔴' : l.type === 'warning' ? '🟡' : '🟢';
        const msg = String(l.msg || '').substring(0, 150);
        text += `${icon} ${l.ts}\n${msg}\n\n`;
      });
    }

    const kb = { inline_keyboard: [
      [{ text: `🔴 خطاها (${errors.length})`, callback_data: 'log_errors' }, { text: `🟡 هشدارها (${warnings.length})`, callback_data: 'log_warnings' }],
      [{ text: '🟢 همه', callback_data: 'log_refresh' }, { text: '🗑️ پاکسازی', callback_data: 'log_clear' }],
      [{ text: '📥 دانلود کامل', callback_data: 'log_download' }]
    ]};
    if (ctx.callbackQuery) await ctx.editMessageText(text, { reply_markup: kb });
    else await ctx.reply(text, { reply_markup: kb });
  }

  bot.command('/log', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    await showLogs(ctx, 'all');
  });

  bot.callbackQuery('log_refresh', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await showLogs(ctx, 'all'); await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('log_errors', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await showLogs(ctx, 'errors'); await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('log_warnings', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await showLogs(ctx, 'warnings'); await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('log_clear', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await DB.clearLogs(ctx.env);
    await showLogs(ctx, 'all'); await ctx.answerCallbackQuery('✅ لاگ‌ها پاک شدند');
  });

  bot.callbackQuery('log_download', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return ctx.answerCallbackQuery('⛔');
    await ctx.answerCallbackQuery('⏳ در حال آماده‌سازی...');
    try {
      const logs = await DB.getLogs(ctx.env, 'all');
      const content = logs.map(l => `[${l.ts}] [${l.type}] ${l.msg}`).join('\n');
      const buf = new TextEncoder().encode(content);
      await bot.sendDocument(ctx.from.id, buf, `nova_logs_${Date.now()}.txt`, { caption: `📋 ${logs.length} لاگ` });
    } catch (e) {
      await bot.sendMessage(ctx.from.id, '❌ خطا در دانلود لاگ.');
    }
  });

  // ===== دستورات مدیریتی =====
  bot.command('/vip', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    const targetId = ctx.message.text.split(' ')[1];
    if (!targetId) return ctx.reply('❌ /vip [آیدی]');
    const target = await DB.getUser(ctx.env, targetId);
    target.isVIP = true;
    await DB.saveUser(ctx.env, targetId, target);
    await ctx.reply(`✅ کاربر ${targetId} به VIP ارتقا یافت.`);
    await ctx.api.sendMessage(targetId, '🌟 تبریک! حساب شما به VIP ارتقا یافت!').catch(() => {});
  });

  bot.command('/unvip', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    const targetId = ctx.message.text.split(' ')[1];
    if (!targetId) return ctx.reply('❌ /unvip [آیدی]');
    const target = await DB.getUser(ctx.env, targetId);
    target.isVIP = false;
    await DB.saveUser(ctx.env, targetId, target);
    await ctx.reply(`✅ VIP کاربر ${targetId} لغو شد.`);
  });

  bot.command('/block', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    const targetId = ctx.message.text.split(' ')[1];
    if (!targetId) return ctx.reply('❌ /block [آیدی]');
    const target = await DB.getUser(ctx.env, targetId);
    target.blocked = true;
    await DB.saveUser(ctx.env, targetId, target);
    await ctx.reply(`🚫 کاربر ${targetId} مسدود شد.`);
  });

  bot.command('/unblock', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    const targetId = ctx.message.text.split(' ')[1];
    if (!targetId) return ctx.reply('❌ /unblock [آیدی]');
    const target = await DB.getUser(ctx.env, targetId);
    target.blocked = false;
    await DB.saveUser(ctx.env, targetId, target);
    await ctx.reply(`✅ کاربر ${targetId} رفع مسدود شد.`);
  });

  bot.command('/broadcast', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    const text = ctx.message.text.split(' ').slice(1).join(' ');
    if (!text) return ctx.reply('❌ /broadcast [متن]');
    const users = await DB.getAllUsers(ctx.env);
    let sent = 0, failed = 0;
    for (const u of users) {
      if (!u.blocked) {
        const ok = await ctx.api.sendMessage(u.id, `📢 *پیام همگانی از طرف مدیریت ربات:*\n\n${text}`, { parse_mode: 'Markdown' }).then(() => true).catch(() => false);
        ok ? sent++ : failed++;
      }
    }
    await ctx.reply(`✅ پیام به ${sent} کاربر ارسال شد.\n${failed > 0 ? `❌ ${failed} کاربر ناموفق` : ''}`);
  });

  bot.command('/stats', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    const stats = await DB.getStats(ctx.env);
    await ctx.reply(
      `📊 *آمار ربات NOVA*\n\n` +
      `👥 کل کاربران: ${stats.total}\n` +
      `💎 VIP: ${stats.vip}\n` +
      `🚫 مسدود: ${stats.blocked}\n` +
      `💬 کل پیام‌ها: ${stats.totalMsgs}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('/blocked', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    const users = await DB.getAllUsers(ctx.env);
    const blocked = users.filter(u => u.blocked);
    if (!blocked.length) return ctx.reply('✅ هیچ کاربر مسدودی وجود ندارد.');
    const text = `🚫 *کاربران مسدود:*\n\n` + blocked.map(u => `• ${u.firstName || 'بدون نام'} (\`${u.id}\`)`).join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.command('/rebuild', async (ctx) => {
    if (String(ctx.from.id) !== String(ctx.env.ADMIN_ID)) return;
    try {
      const users = await DB.getAllUsers(ctx.env);
      let fixed = 0;
      for (const u of users) {
        let changed = false;
        if (!u.prompts) { u.prompts = { ...DEFAULT_PROMPTS }; changed = true; }
        if (!u.history) { u.history = { nova: [], luna: [], zara: [] }; changed = true; }
        if (!u.limits) { u.limits = { date: '', messages: 0, voiceSent: 0, voiceReceived: 0, images: 0 }; changed = true; }
        if (!u.lunaModel) { u.lunaModel = 'Meta-Llama-3.1-8B-Instruct'; changed = true; }
        if (!u.zaraModel) { u.zaraModel = 'openai'; changed = true; }
        if (!u.currentModel || !MODELS[u.currentModel]) { u.currentModel = 'zara'; changed = true; }
        if (changed) { await DB.saveUser(ctx.env, u.id, u); fixed++; }
      }
      await ctx.reply(`✅ بازسازی دیتابیس کامل شد.\n👥 کل: ${users.length} | 🔧 تعمیر: ${fixed}`);
    } catch (e) {
      await ctx.reply(`❌ خطا: ${e.message}`);
    }
  });

  bot.command('/mystats', async (ctx) => {
    if (!ctx.user) return;
    const user = ctx.user;
    resetLimitsIfNeeded(user);
    const mi = MODELS[user.currentModel] || MODELS.nova;
    await ctx.reply(
      `📊 *آمار شما*\n\n👤 آیدی: \`${user.id}\`\n💎 وضعیت: ${user.isVIP ? 'VIP 👑' : 'رایگان'}\n🤖 مدل: ${mi.name} ${mi.emoji}\n📨 کل پیام‌ها: ${user.totalMessages || 0}\n📅 تاریخ عضویت: ${new Date(user.createdAt).toLocaleDateString('fa-IR')}\n\n━━━ امروز ━━━\n💬 پیام: ${user.limits.messages}/100\n🎤 ویس: ${user.limits.voiceReceived}/10\n🖼 تصویر: ${user.limits.images}/5`,
      { parse_mode: 'Markdown' }
    );
  });
}

// ============================================================
// 🚀 Worker اصلی
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===== تنظیم Webhook =====
    if (url.pathname === '/setwebhook') {
      const secret = url.searchParams.get('secret');
      if (secret !== env.SECRET_TOKEN) return new Response('❌ دسترسی غیرمجاز', { status: 403 });
      const webhookUrl = `${url.protocol}//${url.host}/webhook`;
      const bot = new Bot(env.BOT_TOKEN);
      const result = await bot.setWebhook(webhookUrl);
      return new Response(result ? `✅ Webhook تنظیم شد: ${webhookUrl}` : '❌ خطا در تنظیم webhook', { status: 200 });
    }

    // ===== Webhook =====
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        const bot = new Bot(env.BOT_TOKEN);
        setupBot(bot, env);
        await bot.handleUpdate(update, env);
      } catch (err) {
        console.error('Webhook error:', err);
      }
      return new Response('OK', { status: 200 });
    }

    // ===== صفحه اصلی =====
    return new Response(
      `🤖 ربات NOVA - فعال ✅\n\n` +
      `📊 آمار:\n` +
      `• کاربران: ${await DB.getTotalUsers(env)}\n` +
      `• وضعیت: آنلاین\n` +
      `• نسخه: 5.0.0\n\n` +
      `برای تنظیم webhook:\n` +
      `/setwebhook?secret=YOUR_SECRET`,
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  },

  // ===== Scheduled (پاکسازی خودکار) =====
  async scheduled(event, env, ctx) {
    try {
      // پاکسازی لاگ‌های قدیمی
      await DB.clearLogs(env);
      
      // پاکسازی کاربران مسدود قدیمی (اختیاری)
      const users = await DB.getAllUsers(env);
      const now = Date.now();
      for (const u of users) {
        const lastActive = new Date(u.lastActive).getTime();
        if (now - lastActive > 90 * 24 * 60 * 60 * 1000) {
          await DB.deleteUser(env, u.id);
        }
      }
      
      console.log('🧹 Cleanup completed');
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
};

// ============================================================
// 🏁 پایان سورس
// ============================================================
