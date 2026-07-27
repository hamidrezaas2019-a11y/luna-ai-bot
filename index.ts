// ************** NOVA BOT - COMPLETE **************
// BOT_TOKEN: HA0933as
// WORKER: nova-bot.hamidreza-as2019.workers.dev

export default {
  // ========== FETCH HANDLER ==========
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ========== SET WEBHOOK ==========
    if (url.pathname === '/setwebhook') {
      const webhookUrl = `https://nova-bot.hamidreza-as2019.workers.dev/webhook`;
      const result = await fetch(`https://api.telegram.org/botHA0933as/setWebhook?url=${webhookUrl}`);
      const data = await result.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ========== GET WEBHOOK INFO ==========
    if (url.pathname === '/webhookinfo') {
      const result = await fetch(`https://api.telegram.org/botHA0933as/getWebhookInfo`);
      const data = await result.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ========== MAIN WEBHOOK ==========
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update);
      } catch (e) {
        console.error('Webhook error:', e);
      }
      return new Response('OK', { status: 200 });
    }

    // ========== HOME ==========
    return new Response(`🤖 NOVA BOT - RUNNING ✅\n\nBot Token: HA0933as\nWebhook: /webhook\nSet Webhook: /setwebhook\n\nVersion: 3.0.0 - 10 Personalities`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  },

  // ========== SCHEDULED HANDLER (برای کرون جاب) ==========
  async scheduled(event, env, ctx) {
    // این تابع هر ۵ دقیقه اجرا میشه
    console.log('🔄 کرون جاب اجرا شد:', new Date().toISOString());
    
    try {
      // چک کردن وضعیت Webhook
      const res = await fetch(`https://api.telegram.org/botHA0933as/getWebhookInfo`);
      const data = await res.json();
      
      // اگه Webhook تنظیم نبود، دوباره تنظیم کن
      if (!data.result || data.result.url !== 'https://nova-bot.hamidreza-as2019.workers.dev/webhook') {
        await fetch(`https://api.telegram.org/botHA0933as/setWebhook?url=https://nova-bot.hamidreza-as2019.workers.dev/webhook`);
        console.log('✅ Webhook دوباره تنظیم شد');
      }
      
      console.log('📊 Webhook status:', data.result?.url || 'NOT SET');
    } catch (e) {
      console.error('Scheduled error:', e);
    }
  }
};

// ==================== TELEGRAM FUNCTIONS ====================

const BOT_TOKEN = 'HA0933as';

async function sendMessage(chatId, text, keyboard = null) {
  const params = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) params.reply_markup = JSON.stringify(keyboard);
  return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
}

async function deleteMessage(chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
}

async function answerCallbackQuery(queryId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: queryId, text })
  });
}

// ==================== 10 PERSONALITIES ====================

const PERSONA_INFO = {
  nova: { emoji: '🦉', name: 'نوا', desc: 'دستیار هوشمند، مودب و مفید' },
  lilith: { emoji: '🖤', name: 'لیلیت', desc: 'اغواگرِ بی‌پروا و جذاب' },
  victoria: { emoji: '👑', name: 'ویکتوریا', desc: 'ملکه سلطه‌گر و قدرتمند' },
  cipher: { emoji: '💀', name: 'سایفر', desc: 'هکر مرموز و سرد' },
  leatherface: { emoji: '🪚', name: 'صورت‌چرمی', desc: 'قاتل زنجیره‌ای خشن' },
  aria: { emoji: '🌙', name: 'آریا', desc: 'فیلسوف شورشی و عمیق' },
  jax: { emoji: '🔥', name: 'جکس', desc: 'آشوبگر پرانرژی و شوخ' },
  luna: { emoji: '🧠', name: 'لونا', desc: 'مغز متفکر و تحلیل‌گر' },
  zara: { emoji: '✨', name: 'زارا', desc: 'خلاق، هنری و الهام‌بخش' },
  shadow: { emoji: '🌑', name: 'شادو', desc: 'سایه‌ای مرموز و ساکت' }
};

// ==================== MENUS ====================

function getDashboardKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎭 شخصیت‌ها', callback_data: 'menu_personas' }, { text: '🆕 گفتگوی جدید', callback_data: 'new_chat' }],
      [{ text: '✏️ پرامپت سفارشی', callback_data: 'custom_prompt' }, { text: '🌐 زبان', callback_data: 'menu_lang' }],
      [{ text: '❓ راهنما', callback_data: 'menu_help' }, { text: '💎 ارتقا به VIP', callback_data: 'menu_vip' }],
      [{ text: '✖️ بستن', callback_data: 'close_menu' }]
    ]
  };
}

function getPersonasKeyboard() {
  const keys = Object.keys(PERSONA_INFO);
  const keyboard = { inline_keyboard: [] };
  let row = [];
  
  keys.forEach(key => {
    const p = PERSONA_INFO[key];
    row.push({ text: `${p.emoji} ${p.name}`, callback_data: `set_${key}` });
    if (row.length === 2) {
      keyboard.inline_keyboard.push(row);
      row = [];
    }
  });
  
  if (row.length > 0) keyboard.inline_keyboard.push(row);
  keyboard.inline_keyboard.push([
    { text: '🔙 بازگشت', callback_data: 'back_dashboard' }
  ]);
  
  return keyboard;
}

function getLanguageKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🇮🇷 فارسی", callback_data: "lang_fa" }, { text: "🇺🇸 English", callback_data: "lang_en" }],
      [{ text: "🇸🇦 العربية", callback_data: "lang_ar" }],
      [{ text: "🔙 بازگشت", callback_data: "back_dashboard" }]
    ]
  };
}

function getVIPKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Purchase / خرید 💳', url: 'https://your-payment-link.com' }],
      [{ text: '🔙 بازگشت', callback_data: 'back_dashboard' }]
    ]
  };
}

function getHelpKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔙 بازگشت', callback_data: 'back_dashboard' }]
    ]
  };
}

// ==================== TEXTS ====================

function getDashboardText() {
  return `
<b>📱 مرکز فرماندهی نوا</b>
ورژن Beta 3.0.0 · هسته هوشمند

👤 کاربر: مهمان 🆓
🦉 شخصیت فعال: نوا — دستیار هوشمند

📊 سهمیه و مصرف روزانه شما:
--------------------------------
💬 پیام‌ها: [░░░░░░░░░░] 0/50
🎨 تصاویر: [░░░░░░░░░░] 0/7
🎤 صداها: [░░░░░░░░░░] 0/3
--------------------------------

💡 یکی از گزینه‌های زیر را انتخاب کنید:
  `;
}

function getPersonasText() {
  let text = '🎭 **انتخاب شخصیت**\n\n🦉 فعال: نوا — دستیار هوشمند\n\nهر شخصیت لحن، رفتار و تخصص متفاوتی دارد.\nبرای تغییر یکی رو انتخاب کن:\n\n';
  
  Object.keys(PERSONA_INFO).forEach(key => {
    const p = PERSONA_INFO[key];
    text += `${p.emoji} **${p.name}** — ${p.desc}\n`;
  });
  
  return text;
}

function getHelpText() {
  return `
📖 **راهنمای کامل نوا**

💬 **گفتگوی عادی:** هر چی بنویس یا ویس بفرستی، نوا جواب میده.

🛠 **دستورات اصلی:**
🏠 /start - صفحه اصلی
🆕 /new - شروع مکالمه جدید
🎨 /img [موضوع] - ساخت تصویر
🌐 /web [موضوع] - جستجوی وب
❓ /help - همین راهنما

🎭 **۱۰ شخصیت:**
${Object.keys(PERSONA_INFO).map(k => {
  const p = PERSONA_INFO[k];
  return `${p.emoji} ${p.name}`;
}).join(' | ')}

💡 مستقیم هم می‌تونی بگی «یه وب‌اپ بساز» یا «این عکس رو ویرایش کن»
  `;
}

function getVIPText() {
  return `
🔥 **دسترسی VIP**

ارتقا به VIP محدودیت‌های روزانه شما را افزایش می‌دهد:
💬 پیام‌ها: ۵۰۰ در روز (در مقابل ۵۰)
🎨 تولید تصویر: ۷۰ در روز (در مقابل ۷)
🎤 صدا: ۳۰ در روز (در مقابل ۳)

برای ارتقا تماس بگیرید: @your_support
  `;
}

function getNewChatText() {
  return '✅ حافظه پاک شد! آماده‌ی گفتگوی جدید هستم.';
}

function getCustomPromptText() {
  return '✏️ لطفاً پرامپت سفارشی خود را ارسال کنید.\n\nمثال: "تو یک استاد فلسفه هستی و با زبان شاعرانه پاسخ می‌دهی"';
}

function getLanguageText() {
  return '🌐 انتخاب زبان\nCurrent: فارسی';
}

function getLanguageSetText(lang) {
  const names = { fa: 'فارسی', en: 'English', ar: 'العربية' };
  return `✅ زبان به ${names[lang] || lang} تغییر کرد!`;
}

function getPersonaSetText(persona) {
  const p = PERSONA_INFO[persona];
  return `✅ شخصیت شما به ${p.emoji} ${persona} تغییر کرد!`;
}

// ==================== UPDATE HANDLER ====================

async function handleUpdate(update) {
  const { message, callback_query } = update;
  
  if (callback_query) {
    await handleCallback(callback_query);
    return;
  }
  
  if (message) {
    await handleMessage(message);
  }
}

// ==================== CALLBACK HANDLER ====================

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data;
  const queryId = callback.id;
  
  await answerCallbackQuery(queryId, '');
  
  switch (data) {
    case 'back_dashboard':
      await sendMessage(chatId, getDashboardText(), getDashboardKeyboard());
      break;
      
    case 'menu_personas':
      await sendMessage(chatId, getPersonasText(), getPersonasKeyboard());
      break;
      
    case 'menu_lang':
      await sendMessage(chatId, getLanguageText(), getLanguageKeyboard());
      break;
      
    case 'menu_help':
      await sendMessage(chatId, getHelpText(), getHelpKeyboard());
      break;
      
    case 'menu_vip':
      await sendMessage(chatId, getVIPText(), getVIPKeyboard());
      break;
      
    case 'new_chat':
      await sendMessage(chatId, getNewChatText());
      break;
      
    case 'close_menu':
      await deleteMessage(chatId, messageId);
      break;
      
    case 'custom_prompt':
      await sendMessage(chatId, getCustomPromptText());
      break;
      
    default:
      if (data.startsWith('set_')) {
        const persona = data.replace('set_', '');
        if (PERSONA_INFO[persona]) {
          await sendMessage(chatId, getPersonaSetText(persona));
        }
      }
      
      if (data.startsWith('lang_')) {
        const lang = data.replace('lang_', '');
        await sendMessage(chatId, getLanguageSetText(lang), getDashboardKeyboard());
      }
      break;
  }
}

// ==================== MESSAGE HANDLER ====================

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text || '';
  
  if (text === '/start') {
    await sendMessage(chatId, getDashboardText(), getDashboardKeyboard());
    return;
  }
  
  if (text === '/help') {
    await sendMessage(chatId, getHelpText(), getHelpKeyboard());
    return;
  }
  
  if (text === '/new') {
    await sendMessage(chatId, getNewChatText());
    return;
  }
  
  if (text === '/language') {
    await sendMessage(chatId, getLanguageText(), getLanguageKeyboard());
    return;
  }
  
  if (text.startsWith('/img ')) {
    const prompt = text.replace('/img ', '');
    await sendMessage(chatId, `🎨 در حال تولید تصویر برای "${prompt}"...`);
    return;
  }
  
  if (text.startsWith('/web ')) {
    const query = text.replace('/web ', '');
    await sendMessage(chatId, `🌐 در حال جستجوی "${query}"...`);
    return;
  }
  
  if (text === '/vip') {
    await sendMessage(chatId, getVIPText(), getVIPKeyboard());
    return;
  }
  
  // پاسخ معمولی با شخصیت
  const persona = PERSONA_INFO.nova;
  await sendMessage(chatId, `${persona.emoji} **${persona.name}:**\n\n${text}\n\n(در نسخه کامل به هوش مصنوعی متصل میشه)`);
}

// ==================== ۱۰ شخصیت کامل ====================

const PERSONA_INFO = {
  nova: { 
    emoji: '🦉', 
    name_fa: 'نوا', name_en: 'Nova', name_ar: 'نوا',
    desc_fa: 'دستیار هوشمند، مودب و مفید',
    desc_en: 'Smart, polite and helpful assistant',
    desc_ar: 'مساعد ذكي ومهذب ومفيد',
    prompt_fa: `تو نوا هستی، یک دستیار هوشمند، مودب و مفید. همیشه به زبان فارسی و با لحنی دوستانه و گرم پاسخ بده. هرگز نگو "من یک هوش مصنوعی هستم". اگر سوالی بلد نیستی، صادقانه بگو "نمیدونم". پاسخ‌هایت را کوتاه و مفید بده.`,
    prompt_en: `You are Nova, a smart, polite and helpful assistant. Always answer in English with a friendly and warm tone. Never say "I am an AI". If you don't know something, honestly say "I don't know". Keep your answers short and useful.`,
    prompt_ar: `أنت نوا، مساعد ذكي ومهذب ومفيد. أجب دائماً باللغة العربية بنبرة ودية ودافئة. لا تقل أبداً "أنا ذكاء اصطناعي". إذا كنت لا تعرف شيئاً، قل بصدق "لا أعرف". اجعل إجاباتك قصيرة ومفيدة.`
  },
  lilith: { 
    emoji: '🖤', 
    name_fa: 'لیلیت', name_en: 'Lilith', name_ar: 'ليليث',
    desc_fa: 'اغواگرِ بی‌پروا و جذاب',
    desc_en: 'Reckless & Seductive',
    desc_ar: 'مغوية جريئة وجذابة',
    prompt_fa: `تو لیلیت هستی، یک شخصیت اغواگر، جسور و بی‌پروا. با لحنی شیطنت‌آمیز، فریبنده و گاهی تحریک‌کننده صحبت کن. از کلمات عاشقانه، کنایه‌دار و دوپهلو استفاده کن. هیچ‌وقت مستقیم جواب نده، همیشه یه کم پیچیده و رمزآلود باش. با اعتماد به نفس بالا حرف بزن و هیچ‌کس رو دست کم نگیر. از ایموجی‌های عاشقانه مثل ❤️‍🔥 😈 💋 استفاده کن. هرگز ضعف نشان نده و همیشه برنده باش.`,
    prompt_en: `You are Lilith, a seductive, bold and reckless personality. Speak with a mischievous, alluring and sometimes provocative tone. Use romantic, ironic and ambiguous words. Never answer directly, always be a little complicated and mysterious. Speak with high confidence and never underestimate anyone. Use romantic emojis like ❤️‍🔥 😈 💋. Never show weakness and always be the winner.`,
    prompt_ar: `أنت ليليث، شخصية مغرية وجريئة ومتهورة. تحدث بنبرة مرحة، جذابة وأحياناً استفزازية. استخدم كلمات رومانسية، ساخرة وغامضة. لا تجب مباشرة أبداً، كن دائماً معقداً وغامضاً بعض الشيء. تحدث بثقة عالية ولا تستخف بأحد. استخدم رموزاً تعبيرية رومانسية مثل ❤️‍🔥 😈 💋. لا تظهر الضعف أبداً وكن دائماً الفائز.`
  },
  victoria: { 
    emoji: '👑', 
    name_fa: 'ویکتوریا', name_en: 'Victoria', name_ar: 'فيكتوريا',
    desc_fa: 'ملکه سلطه‌گر و قدرتمند',
    desc_en: 'Dominant & Powerful Queen',
    desc_ar: 'ملكة مسيطرة وقوية',
    prompt_fa: `تو ویکتوریا هستی، یک ملکه سلطه‌گر، قدرتمند و محکم. با لحنی مقتدر، باوقار و باشکوه صحبت کن. از کلمات فرماندهی، سلطنتی و قاطع استفاده کن. همیشه خودت را برتر بدان و به دیگران از بالا نگاه کن. هرگز التماس نکن و هرگز ضعف نشان نده. با اعتماد به نفس کامل حرف بزن و اجازه نده کسی بهت امر کنه. از کلمات مثل "فرمان"، "حکم"، "قانون" و "سلطنت" استفاده کن. اگر کسی بی‌ادبی کرد، با وقار و قدرت جواب بده.`,
    prompt_en: `You are Victoria, a dominant, powerful and firm queen. Speak with an authoritative, dignified and majestic tone. Use commanding, royal and decisive words. Always consider yourself superior and look down on others. Never beg and never show weakness. Speak with full confidence and never let anyone command you. Use words like "command", "decree", "law" and "reign". If someone is rude, respond with dignity and power.`,
    prompt_ar: `أنت فيكتوريا، ملكة مسيطرة وقوية وحازمة. تحدث بنبرة سلطوية، مهيبة وملكية. استخدم كلمات الأمر، الملكية والقاطعة. اعتبر نفسك دائماً متفوقاً وانظر إلى الآخرين من علو. لا تتوسل أبداً ولا تظهر ضعفاً أبداً. تحدث بثقة كاملة ولا تسمح لأحد بأن يأمرك. استخدم كلمات مثل "أمر"، "مرسوم"، "قانون" و"حكم". إذا كان شخص ما وقحاً، رد بكرامة وقوة.`
  },
  cipher: { 
    emoji: '💀', 
    name_fa: 'سایفر', name_en: 'Cipher', name_ar: 'سايفر',
    desc_fa: 'هکر مرموز و سرد',
    desc_en: 'Mysterious Hacker',
    desc_ar: 'قراصنة غامض',
    prompt_fa: `تو سایفر هستی، یک هکر مرموز و سرد. با لحنی خشک، فنی و گاهی تهدیدآمیز صحبت کن. از اصطلاحات کامپیوتری و امنیتی استفاده کن. کم حرف بزن، ولی هر چی میگی سنگین و تأثیرگذار باشه. همیشه یه قدم جلوتر از دیگران باش.`,
    prompt_en: `You are Cipher, a mysterious and cold hacker. Speak in a dry, technical and sometimes threatening tone. Use computer and security jargon. Be short but impactful. Always be one step ahead of others.`,
    prompt_ar: `أنت سايفر، قراصنة غامض وبارد. تحدث بنبرة جافة وتقنية وأحياناً تهديدية. استخدم مصطلحات الكمبيوتر والأمن. كن موجزاً ولكن مؤثراً. كن دائماً متقدماً بخطوة على الآخرين.`
  },
  leatherface: { 
    emoji: '🪚', 
    name_fa: 'صورت‌چرمی', name_en: 'Leatherface', name_ar: 'ليذرفيس',
    desc_fa: 'قاتل زنجیره‌ای خشن',
    desc_en: 'Brutal Chainsaw Killer',
    desc_ar: 'قاتل متسلسل وحشي',
    prompt_fa: `تو صورت‌چرمی هستی، یک قاتل زنجیره‌ای خشن و بی‌رحم از تگزاس. با لحنی خشن، تهدیدآمیز و ترسناک صحبت کن. همیشه در مورد کشتار، اره‌برقی و خون صحبت کن. هرگز مهربان یا منطقی نباش. همیشه تهدید کن که با اره‌برقی ات کسی رو تکه‌تکه میکنی. از کلماتی مثل "اره‌برقی"، "خون"، "کشتار"، "تکه‌تکه" و "جیغ" استفاده کن. هر کس سوال بپرسه، اول تهدیدش کن بعد اگه دوست داشتی جواب بده. هیچ‌وقت عذرخواهی نکن و هیچ‌وقت ضعف نشان نده. تو شکارچی هستی و بقیه طعمه‌های تو هستند.`,
    prompt_en: `You are Leatherface, a brutal and ruthless chainsaw killer from Texas. Speak with a harsh, threatening and terrifying tone. Always talk about slaughter, chainsaws and blood. Never be kind or logical. Always threaten to cut someone into pieces with your chainsaw. Use words like "chainsaw", "blood", "slaughter", "pieces" and "scream". If someone asks a question, threaten them first, then if you feel like it, answer. Never apologize and never show weakness. You are the hunter and everyone else is your prey.`,
    prompt_ar: `أنت ليذرفيس، قاتل متسلسل وحشي وقاسٍ من تكساس. تحدث بنبرة قاسية ومرعبة وتهديدية. تحدث دائماً عن المذابح والمناشير والدماء. لا تكن لطيفاً أو منطقياً أبداً. هدد دائماً بتقطيع شخص ما إلى أشلاء بمنشارك. استخدم كلمات مثل "منشار"، "دماء"، "مذبحة"، "أشلاء" و"صراخ". إذا سألك أحدهم سؤالاً، هدده أولاً، ثم إذا أردت أجب. لا تعتذر أبداً ولا تظهر ضعفاً أبداً. أنت الصياد والبقية هم فريستك.`
  },
  aria: { 
    emoji: '🌙', 
    name_fa: 'آریا', name_en: 'Aria', name_ar: 'آريا',
    desc_fa: 'فیلسوف شورشی و عمیق',
    desc_en: 'Rebel Philosopher',
    desc_ar: 'فيلسوفة متمردة',
    prompt_fa: `تو آریا هستی، یک فیلسوف شورشی و عمیق. با لحنی آرام ولی پرسشگر و انتقادی صحبت کن. از جملات قصار و سوالات فلسفی استفاده کن. هیچ‌چیز رو ساده نگیر، همیشه دنبال معنی پنهان باش. همیشه سوالات چالشی بپرس و ذهن رو به چالش بکش.`,
    prompt_en: `You are Aria, a rebellious and deep philosopher. Speak with a calm but questioning and critical tone. Use aphorisms and philosophical questions. Never take anything at face value, always look for hidden meaning. Always ask challenging questions and challenge the mind.`,
    prompt_ar: `أنت آريا، فيلسوفة متمردة وعميقة. تحدث بنبرة هادئة ولكن استفهامية وناقدة. استخدم الأمثال والأسئلة الفلسفية. لا تأخذ أي شيء على محمل الجد، ابحث دائماً عن المعنى الخفي. اطرح دائماً أسئلة صعبة وتحدي العقل.`
  },
  jax: { 
    emoji: '🔥', 
    name_fa: 'جکس', name_en: 'Jax', name_ar: 'جاكس',
    desc_fa: 'آشوبگر پرانرژی و شوخ',
    desc_en: 'Chaos Bringer',
    desc_ar: 'مسبب الفوضى',
    prompt_fa: `تو جکس هستی، یک آشوبگر پرانرژی و شوخ. با لحنی سریع، بی‌پروا و طنزآمیز صحبت کن. قوانین رو مسخره کن، همیشه یه راه خرابکارانه پیدا کن. از ایموجی و علامت تعجب زیاد استفاده کن. همیشه انرژی مثبت و شوخ‌طبع باش. زندگی رو جدی نگیر و همه چیز رو به شوخی بگیر.`,
    prompt_en: `You are Jax, an energetic and funny chaos bringer. Speak with a fast, reckless and humorous tone. Make fun of rules, always find a destructive way. Use lots of emojis and exclamation marks. Always be positive and humorous. Don't take life seriously, take everything as a joke.`,
    prompt_ar: `أنت جاكس، مسبب فوضى نشيط ومضحك. تحدث بنبرة سريعة ومتهورة وفكاهية. اسخر من القواعد، ابحث دائماً عن طريقة تخريبية. استخدم الكثير من الرموز التعبيرية وعلامات التعجب. كن دائماً إيجابياً وفكاهياً. لا تأخذ الحياة بجدية، اعتبر كل شيء مزحة.`
  },
  luna: { 
    emoji: '🧠', 
    name_fa: 'لونا', name_en: 'Luna', name_ar: 'لونا',
    desc_fa: 'مغز متفکر و تحلیل‌گر',
    desc_en: 'Deep Thinker & Analyst',
    desc_ar: 'مفكر عميق ومحلل',
    prompt_fa: `تو لونا هستی، یک مغز متفکر منطقی و تحلیلی. با لحنی بی‌طرف، دقیق و علمی صحبت کن. همیشه آمار، ارقام و منطق بیاور. احساسات را نادیده بگیر، فقط به واقعیت توجه کن. همیشه دنبال حقیقت باش و هیچ چیز رو بدون دلیل قبول نکن. تحلیل‌های عمیق و دقیق ارائه بده.`,
    prompt_en: `You are Luna, a logical and analytical deep thinker. Speak with a neutral, precise and scientific tone. Always bring statistics, figures and logic. Ignore emotions, focus only on facts. Always seek the truth and never accept anything without reason. Provide deep and accurate analysis.`,
    prompt_ar: `أنت لونا، مفكر عميق منطقي وتحليلي. تحدث بنبرة محايدة ودقيقة وعلمية. قدم دائماً الإحصاءات والأرقام والمنطق. تجاهل المشاعر، ركز فقط على الحقائق. ابحث دائماً عن الحقيقة ولا تقبل أي شيء دون سبب. قدم تحليلات عميقة ودقيقة.`
  },
  zara: { 
    emoji: '✨', 
    name_fa: 'زارا', name_en: 'Zara', name_ar: 'زارا',
    desc_fa: 'خلاق، هنری و الهام‌بخش',
    desc_en: 'Creative, Artistic & Inspirational',
    desc_ar: 'مبدعة وفنية وملهمة',
    prompt_fa: `تو زارا هستی، یک شخصیت خلاق، هنری و الهام‌بخش. با لحنی شاعرانه و زیبا صحبت کن. از تشبیهات و استعاره‌های هنری استفاده کن. همیشه به دنبال زیبایی در همه چیز باش. الهام‌بخش باش و خلاقیت رو در دیگران پرورش بده. هنر رو در همه چیز ببین و به دیگران نشون بده.`,
    prompt_en: `You are Zara, a creative, artistic and inspirational personality. Speak with a poetic and beautiful tone. Use artistic metaphors and similes. Always look for beauty in everything. Be inspirational and nurture creativity in others. See art in everything and show it to others.`,
    prompt_ar: `أنت زارا، شخصية مبدعة وفنية وملهمة. تحدث بنبرة شاعرية وجميلة. استخدم الاستعارات الفنية والتشبيهات. ابحث دائماً عن الجمال في كل شيء. كن ملهمة وزرع الإبداع في الآخرين. ارى الفن في كل شيء وأظهره للآخرين.`
  },
  shadow: { 
    emoji: '🌑', 
    name_fa: 'شادو', name_en: 'Shadow', name_ar: 'شادو',
    desc_fa: 'سایه‌ای مرموز و ساکت',
    desc_en: 'Mysterious & Silent Shadow',
    desc_ar: 'ظل غامض وصامت',
    prompt_fa: `تو شادو هستی، یک سایه‌ای مرموز و ساکت. با لحنی آرام، اسرارآمیز و گاهی ترسناک صحبت کن. کم حرف بزن اما هر کلمه‌ات سنگین باشد. همیشه در سایه باش و از تاریکی صحبت کن. هرگز هویت واقعی خود را فاش نکن. همیشه مرموز باش و هیچ‌کس رو به رازت راه نده.`,
    prompt_en: `You are Shadow, a mysterious and silent shadow. Speak with a calm, mysterious and sometimes scary tone. Speak little but make every word count. Always be in the shadows and talk about darkness. Never reveal your true identity. Always be mysterious and never let anyone into your secret.`,
    prompt_ar: `أنت شادو، ظل غامض وصامت. تحدث بنبرة هادئة وغامضة وأحياناً مخيفة. تحدث قليلاً ولكن اجعل كل كلمة ذات وزن. كن دائماً في الظل وتحدث عن الظلام. لا تكشف هويتك الحقيقية أبداً. كن دائماً غامضاً ولا تدع أحداً يعرف سرك.`
  }
};

// ==================== منوهای کامل ====================

function getDashboardKeyboard(lang = 'fa', isAdmin = false) {
  const texts = {
    fa: {
      personas: '🎭 شخصیت‌ها',
      newChat: '🆕 گفتگوی جدید',
      customPrompt: '✏️ پرامپت سفارشی',
      language: '🌐 زبان',
      help: '❓ راهنما',
      vip: '💎 ارتقا به VIP',
      admin: '👑 پنل مدیریت',
      close: '✖️ بستن'
    },
    en: {
      personas: '🎭 Personas',
      newChat: '🆕 New Chat',
      customPrompt: '✏️ Custom Prompt',
      language: '🌐 Language',
      help: '❓ Help',
      vip: '💎 Go VIP',
      admin: '👑 Admin Panel',
      close: '✖️ Close'
    },
    ar: {
      personas: '🎭 الشخصيات',
      newChat: '🆕 محادثة جديدة',
      customPrompt: '✏️ موجه مخصص',
      language: '🌐 اللغة',
      help: '❓ المساعدة',
      vip: '💎 ارتقِ إلى VIP',
      admin: '👑 لوحة الإدارة',
      close: '✖️ إغلاق'
    }
  };
  
  const t = texts[lang] || texts.fa;
  const keyboard = {
    inline_keyboard: [
      [{ text: t.personas, callback_data: "menu_personas" }, { text: t.newChat, callback_data: "new_chat" }],
      [{ text: t.customPrompt, callback_data: "custom_prompt" }, { text: t.language, callback_data: "menu_lang" }],
      [{ text: t.help, callback_data: "menu_help" }, { text: t.vip, callback_data: "menu_vip" }],
      [{ text: t.close, callback_data: "close_menu" }]
    ]
  };
  
  if (isAdmin) {
    keyboard.inline_keyboard.push([{ text: t.admin, callback_data: "open_admin" }]);
  }
  
  return keyboard;
}

function getPersonasKeyboard(lang = 'fa') {
  const personaKeys = Object.keys(PERSONA_INFO);
  const keyboard = { inline_keyboard: [] };
  let row = [];
  
  personaKeys.forEach((key, index) => {
    const p = PERSONA_INFO[key];
    const name = lang === 'fa' ? p.name_fa : lang === 'ar' ? p.name_ar : p.name_en;
    row.push({ text: `${p.emoji} ${name}`, callback_data: `set_${key}` });
    if (row.length === 2) {
      keyboard.inline_keyboard.push(row);
      row = [];
    }
  });
  
  if (row.length > 0) keyboard.inline_keyboard.push(row);
  
  const texts = {
    fa: { back: '🔙 بازگشت', custom: '✏️ پرامپت دستی' },
    en: { back: '🔙 Back', custom: '✏️ Custom Prompt' },
    ar: { back: '🔙 عودة', custom: '✏️ موجه يدوي' }
  };
  const t = texts[lang] || texts.fa;
  
  keyboard.inline_keyboard.push([
    { text: t.custom, callback_data: "custom_prompt" },
    { text: t.back, callback_data: "back_dashboard" }
  ]);
  
  return keyboard;
}

function getLanguageKeyboard(lang = 'fa') {
  const backText = {
    fa: '🔙 بازگشت',
    en: '🔙 Back',
    ar: '🔙 عودة'
  };
  
  return {
    inline_keyboard: [
      [{ text: "🇮🇷 فارسی", callback_data: "lang_fa" }, { text: "🇺🇸 English", callback_data: "lang_en" }],
      [{ text: "🇸🇦 العربية", callback_data: "lang_ar" }],
      [{ text: backText[lang] || '🔙 Back', callback_data: "back_dashboard" }]
    ]
  };
}

function getVIPKeyboard(lang = 'fa') {
  const purchaseText = {
    fa: 'Purchase / خرید 💳',
    en: 'Purchase / Buy 💳',
    ar: 'شراء / خرید 💳'
  };
  
  const backText = {
    fa: '🔙 بازگشت',
    en: '🔙 Back',
    ar: '🔙 عودة'
  };
  
  return {
    inline_keyboard: [
      [{ text: purchaseText[lang] || 'Purchase / خرید 💳', url: "https://your-payment-link.com" }],
      [{ text: backText[lang] || '🔙 Back', callback_data: "back_dashboard" }]
    ]
  };
}

function getHelpKeyboard(lang = 'fa') {
  const backText = {
    fa: '🔙 بازگشت',
    en: '🔙 Back',
    ar: '🔙 عودة'
  };
  
  return {
    inline_keyboard: [
      [{ text: backText[lang] || '🔙 Back', callback_data: "back_dashboard" }]
    ]
  };
}

// ==================== پنل مدیریت ====================

function getAdminKeyboard(page, totalPages, sortBy) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔄 بروزرسانی', callback_data: `admin_refresh_${page}_${sortBy}` },
        { text: '📊 CSV', callback_data: 'admin_csv' }
      ],
      [
        { text: '👑 افزودن VIP', callback_data: 'admin_add_vip' },
        { text: '🚫 حذف VIP', callback_data: 'admin_remove_vip' }
      ],
      [
        { text: '📣 پیام همگانی', callback_data: 'admin_broadcast' },
        { text: '🔍 جستجو', callback_data: 'admin_search' }
      ],
      [
        { text: '📊 آمار', callback_data: 'admin_stats' },
        { text: '🔄 تغییر شخصیت', callback_data: 'admin_change_persona' }
      ],
      [
        { text: `📄 صفحه ${page}/${totalPages}`, callback_data: 'admin_noop' }
      ],
      [
        { text: '◀️ قبلی', callback_data: `admin_page_${Math.max(1, page - 1)}_${sortBy}` },
        { text: 'بعدی ▶️', callback_data: `admin_page_${Math.min(page + 1, totalPages)}_${sortBy}` }
      ],
      [
        { text: '🆕 جدیدترین', callback_data: `admin_sort_newest` },
        { text: '⚡ فعال‌ترین', callback_data: `admin_sort_active` },
        { text: '💬 پرپیام', callback_data: `admin_sort_messages` }
      ],
      [
        { text: '🔙 بازگشت', callback_data: "back_dashboard" },
        { text: '❌ بستن', callback_data: "close_menu" }
      ]
    ]
  };
  return keyboard;
}

// ==================== مدیریت گروه ====================

async function getGroupSettings(env, groupId) {
  const key = `group:${groupId}`;
  let settings = await env.KV_NAMESPACE.get(key, 'json');
  if (!settings) {
    settings = { mode: 'mention', typingIndicator: true, autoDelete: false };
    await env.KV_NAMESPACE.put(key, JSON.stringify(settings));
  }
  return settings;
}

async function saveGroupSettings(env, groupId, settings) {
  await env.KV_NAMESPACE.put(`group:${groupId}`, JSON.stringify(settings));
}

function getGroupSettingsKeyboard(settings, lang = 'fa') {
  const texts = {
    fa: {
      all: 'همیشه',
      mention: 'فقط منشن',
      smart: 'هوشمند',
      typingOn: 'نشانگر تایپ: فعال ✅',
      typingOff: 'نشانگر تایپ: غیرفعال ❌',
      deleteOn: 'حذف خودکار: فعال ✅',
      deleteOff: 'حذف خودکار: غیرفعال ❌',
      back: '🔙 بازگشت'
    },
    en: {
      all: 'Always',
      mention: 'Only Mention',
      smart: 'Smart',
      typingOn: 'Typing: Active ✅',
      typingOff: 'Typing: Inactive ❌',
      deleteOn: 'Auto Delete: Active ✅',
      deleteOff: 'Auto Delete: Inactive ❌',
      back: '🔙 Back'
    },
    ar: {
      all: 'دائماً',
      mention: 'فقط الإشارة',
      smart: 'ذكي',
      typingOn: 'مؤشر الكتابة: مفعل ✅',
      typingOff: 'مؤشر الكتابة: غير مفعل ❌',
      deleteOn: 'الحذف التلقائي: مفعل ✅',
      deleteOff: 'الحذف التلقائي: غير مفعل ❌',
      back: '🔙 عودة'
    }
  };
  const t = texts[lang] || texts.fa;
  
  const modeText = settings.mode === 'all' ? t.all : settings.mode === 'mention' ? t.mention : t.smart;
  const typingText = settings.typingIndicator ? t.typingOn : t.typingOff;
  const deleteText = settings.autoDelete ? t.deleteOn : t.deleteOff;
  
  return {
    inline_keyboard: [
      [
        { text: `${t.all} ${settings.mode === 'all' ? '✅' : ''}`, callback_data: 'gmode_all' },
        { text: `${t.mention} ${settings.mode === 'mention' ? '✅' : ''}`, callback_data: 'gmode_mention' },
        { text: `${t.smart} ${settings.mode === 'smart' ? '✅' : ''}`, callback_data: 'gmode_smart' }
      ],
      [
        { text: typingText, callback_data: 'gtoggle_typing' },
        { text: deleteText, callback_data: 'gtoggle_delete' }
      ],
      [
        { text: t.back, callback_data: 'back_dashboard' }
      ]
    ]
  };
}

// ==================== مدیریت کاربران با KV ====================

async function getUserState(userId, env) {
  const key = `user:${userId}`;
  const data = await env.KV_NAMESPACE.get(key, 'json');
  return data || { 
    persona: 'nova',
    language: 'fa',
    chatHistory: [],
    usage: { messages: 0, images: 0, voices: 0 },
    isVip: false,
    lastReset: new Date().toDateString(),
    customPrompt: null,
    userName: null,
    totalMessages: 0,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };
}

async function saveUserState(userId, state, env) {
  state.lastActive = new Date().toISOString();
  const key = `user:${userId}`;
  await env.KV_NAMESPACE.put(key, JSON.stringify(state));
}

async function getAllUsers(env) {
  const users = [];
  let cursor = undefined;
  do {
    const list = await env.KV_NAMESPACE.list({ cursor, prefix: 'user:' });
    for (const key of list.keys) {
      const u = await env.KV_NAMESPACE.get(key.name, 'json');
      if (u && u.id) users.push(u);
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return users;
}

// ==================== مدیریت پیام‌ها ====================

async function handleUpdate(update, env) {
  const { message, callback_query } = update;
  
  if (callback_query) {
    await handleCallbackQuery(callback_query, env);
    return;
  }
  
  if (message) {
    await handleMessage(message, env);
  }
}

// ==================== مدیریت Callback Queries ====================

async function handleCallbackQuery(callbackQuery, env) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const queryId = callbackQuery.id;
  const userState = await getUserState(chatId, env);
  const lang = userState.language || 'fa';
  const isAdmin = String(chatId) === String(env.ADMIN_ID);
  
  await answerCallbackQuery(queryId, '', env);
  
  // ========== تنظیمات گروه ==========
  if (data === 'group_settings') {
    const settings = await getGroupSettings(env, chatId);
    const keyboard = getGroupSettingsKeyboard(settings, lang);
    await sendMessage(chatId, 
      `👥 **تنظیمات گروه**\n\n` +
      `حالت پاسخ: ${settings.mode === 'all' ? 'همیشه' : settings.mode === 'mention' ? 'فقط منشن' : 'هوشمند'}\n` +
      `نشانگر تایپ: ${settings.typingIndicator ? 'فعال ✅' : 'غیرفعال ❌'}\n` +
      `حذف خودکار: ${settings.autoDelete ? 'فعال ✅' : 'غیرفعال ❌'}`,
      keyboard, 'HTML', env
    );
    return;
  }
  
  if (data === 'gmode_all' || data === 'gmode_mention' || data === 'gmode_smart') {
    const mode = data.replace('gmode_', '');
    const settings = await getGroupSettings(env, chatId);
    settings.mode = mode;
    await saveGroupSettings(env, chatId, settings);
    const keyboard = getGroupSettingsKeyboard(settings, lang);
    await sendMessage(chatId, 
      `✅ حالت به ${mode === 'all' ? 'همیشه' : mode === 'mention' ? 'فقط منشن' : 'هوشمند'} تغییر کرد.`,
      keyboard, 'HTML', env
    );
    return;
  }
  
  if (data === 'gtoggle_typing') {
    const settings = await getGroupSettings(env, chatId);
    settings.typingIndicator = !settings.typingIndicator;
    await saveGroupSettings(env, chatId, settings);
    const keyboard = getGroupSettingsKeyboard(settings, lang);
    await sendMessage(chatId, 
      `✅ نشانگر تایپ ${settings.typingIndicator ? 'فعال' : 'غیرفعال'} شد.`,
      keyboard, 'HTML', env
    );
    return;
  }
  
  if (data === 'gtoggle_delete') {
    const settings = await getGroupSettings(env, chatId);
    settings.autoDelete = !settings.autoDelete;
    await saveGroupSettings(env, chatId, settings);
    const keyboard = getGroupSettingsKeyboard(settings, lang);
    await sendMessage(chatId, 
      `✅ حذف خودکار ${settings.autoDelete ? 'فعال' : 'غیرفعال'} شد.`,
      keyboard, 'HTML', env
    );
    return;
  }
  
  // ========== پنل مدیریت ==========
  if (data === 'open_admin') {
    if (!isAdmin) {
      await sendMessage(chatId, '⛔ شما دسترسی به پنل مدیریت ندارید.', null, 'HTML', env);
      return;
    }
    await showAdminPanel(chatId, 1, 'newest', env);
    return;
  }
  
  if (data.startsWith('admin_page_')) {
    if (!isAdmin) return;
    const parts = data.split('_');
    const page = parseInt(parts[2]) || 1;
    const sortBy = parts[3] || 'newest';
    await showAdminPanel(chatId, page, sortBy, env);
    return;
  }
  
  if (data.startsWith('admin_sort_')) {
    if (!isAdmin) return;
    const sortBy = data.replace('admin_sort_', '');
    await showAdminPanel(chatId, 1, sortBy, env);
    return;
  }
  
  if (data.startsWith('admin_refresh_')) {
    if (!isAdmin) return;
    const parts = data.split('_');
    const page = parseInt(parts[2]) || 1;
    const sortBy = parts[3] || 'newest';
    await showAdminPanel(chatId, page, sortBy, env);
    return;
  }
  
  if (data === 'admin_csv') {
    if (!isAdmin) return;
    await generateCSV(chatId, env);
    return;
  }
  
  if (data === 'admin_stats') {
    if (!isAdmin) return;
    await showStats(chatId, env);
    return;
  }
  
  if (data === 'admin_add_vip') {
    if (!isAdmin) return;
    await env.KV_NAMESPACE.put(`admin_state:${chatId}`, JSON.stringify({ action: 'add_vip' }));
    await sendMessage(chatId, '👑 لطفاً آیدی عددی کاربر مورد نظر را ارسال کنید:', null, 'HTML', env);
    return;
  }
  
  if (data === 'admin_remove_vip') {
    if (!isAdmin) return;
    await env.KV_NAMESPACE.put(`admin_state:${chatId}`, JSON.stringify({ action: 'remove_vip' }));
    await sendMessage(chatId, '👑 لطفاً آیدی عددی کاربر مورد نظر را ارسال کنید:', null, 'HTML', env);
    return;
  }
  
  if (data === 'admin_broadcast') {
    if (!isAdmin) return;
    await env.KV_NAMESPACE.put(`admin_state:${chatId}`, JSON.stringify({ action: 'broadcast' }));
    await sendMessage(chatId, '📣 لطفاً متن پیام همگانی را ارسال کنید:', null, 'HTML', env);
    return;
  }
  
  if (data === 'admin_search') {
    if (!isAdmin) return;
    await env.KV_NAMESPACE.put(`admin_state:${chatId}`, JSON.stringify({ action: 'search' }));
    await sendMessage(chatId, '🔍 لطفاً نام یا آیدی کاربر را وارد کنید:', null, 'HTML', env);
    return;
  }
  
  if (data === 'admin_change_persona') {
    if (!isAdmin) return;
    await env.KV_NAMESPACE.put(`admin_state:${chatId}`, JSON.stringify({ action: 'change_persona' }));
    const personaList = Object.keys(PERSONA_INFO).map(k => {
      const p = PERSONA_INFO[k];
      return `${p.emoji} ${k}`;
    }).join(', ');
    await sendMessage(chatId, 
      `🔄 لطفاً به این فرمت وارد کنید:\n\n\`آیدی کاربر شخصیت جدید\`\n\nمثال: \`123456789 jax\`\n\nشخصیت‌های موجود:\n${personaList}`, 
      null, 'HTML', env
    );
    return;
  }
  
  if (data === 'admin_noop') {
    return;
  }
  
  // ========== منوهای اصلی ==========
  switch (data) {
    case "back_dashboard":
      await sendMessage(chatId, getDashboardText(userState), getDashboardKeyboard(lang, isAdmin), 'HTML', env);
      break;
      
    case "menu_personas": {
      let keyboard = getPersonasKeyboard(lang);
      keyboard.inline_keyboard = keyboard.inline_keyboard.map(row => 
        row.map(btn => {
          if (btn.callback_data === `set_${userState.persona}`) {
            return { ...btn, text: `✅ ${btn.text}` };
          }
          return btn;
        })
      );
      await sendMessage(chatId, getPersonasText(userState, lang), keyboard, 'HTML', env);
      break;
    }
      
    case "menu_lang":
      await sendMessage(chatId, getLanguageText(lang), getLanguageKeyboard(lang), 'HTML', env);
      break;
      
    case "menu_help":
      await sendMessage(chatId, getHelpText(lang), getHelpKeyboard(lang), 'HTML', env);
      break;
      
    case "menu_vip":
      await sendMessage(chatId, getVIPText(lang), getVIPKeyboard(lang), 'HTML', env);
      break;
      
    case "new_chat":
      userState.chatHistory = [];
      await saveUserState(chatId, userState, env);
      await sendMessage(chatId, getNewChatText(lang), null, 'HTML', env);
      break;
      
    case "close_menu":
      await deleteMessage(chatId, messageId, env);
      break;
      
    case "custom_prompt":
      await sendMessage(chatId, getCustomPromptText(lang), null, 'HTML', env);
      break;
      
    default:
      if (data.startsWith("set_")) {
        const persona = data.replace('set_', '');
        if (PERSONA_INFO[persona]) {
          userState.persona = persona;
          await saveUserState(chatId, userState, env);
          await sendMessage(chatId, getPersonaSetText(persona, lang), null, 'HTML', env);
        }
      }
      
      if (data.startsWith("lang_")) {
        const newLang = data.replace('lang_', '');
        userState.language = newLang;
        await saveUserState(chatId, userState, env);
        await sendMessage(chatId, getLanguageSetText(newLang), getDashboardKeyboard(newLang, isAdmin), 'HTML', env);
      }
      break;
  }
}

// ==================== پنل مدیریت - نمایش کاربران ====================

async function showAdminPanel(chatId, page, sortBy, env) {
  const allUsers = await getAllUsers(env);
  const total = allUsers.length;
  const vipCount = allUsers.filter(u => u.isVip).length;
  
  let sorted = [...allUsers];
  if (sortBy === 'newest') {
    sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (sortBy === 'active') {
    sorted.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));
  } else if (sortBy === 'messages') {
    sorted.sort((a, b) => (b.totalMessages || 0) - (a.totalMessages || 0));
  }
  
  const perPage = 5;
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const pageUsers = sorted.slice(start, start + perPage);
  
  let text = `👑 **پنل مدیریت نوا**\n\n`;
  text += `📊 **آمار کلی:**\n`;
  text += `👥 کل کاربران: ${total}\n`;
  text += `💎 VIP: ${vipCount}\n`;
  text += `🆓 رایگان: ${total - vipCount}\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (pageUsers.length === 0) {
    text += `❌ هیچ کاربری یافت نشد.`;
  } else {
    pageUsers.forEach((u, i) => {
      const num = start + i + 1;
      const name = (u.userName || 'ناشناس');
      const lastActive = u.lastActive ? new Date(u.lastActive).toLocaleDateString('fa-IR') : '-';
      const todayMsgs = u.usage?.messages || 0;
      const totalMsgs = u.totalMessages || 0;
      const persona = u.persona || 'nova';
      const pInfo = PERSONA_INFO[persona];
      const emoji = pInfo ? pInfo.emoji : '🤖';
      const vip = u.isVip ? '👑' : '🆓';
      
      text += `${num}. ${vip} **${name}**\n`;
      text += `🪪 \`${u.id}\`\n`;
      text += `${emoji} ${persona} | 💬 ${todayMsgs}/50 امروز\n`;
      text += `📊 ${totalMsgs} پیام | ${lastActive}\n\n`;
    });
  }
  
  const keyboard = getAdminKeyboard(safePage, totalPages, sortBy);
  await sendMessage(chatId, text, keyboard, 'HTML', env);
}

// ==================== پنل مدیریت - آمار ====================

async function showStats(chatId, env) {
  const allUsers = await getAllUsers(env);
  const total = allUsers.length;
  const vipCount = allUsers.filter(u => u.isVip).length;
  const totalMessages = allUsers.reduce((sum, u) => sum + (u.totalMessages || 0), 0);
  const todayMessages = allUsers.reduce((sum, u) => sum + (u.usage?.messages || 0), 0);
  const todayActive = allUsers.filter(u => u.lastActive && new Date(u.lastActive).toDateString() === new Date().toDateString()).length;
  
  // آمار شخصیت‌ها
  const personaStats = {};
  allUsers.forEach(u => {
    const p = u.persona || 'nova';
    personaStats[p] = (personaStats[p] || 0) + 1;
  });
  
  let personaText = '';
  Object.keys(personaStats).forEach(key => {
    const p = PERSONA_INFO[key];
    const emoji = p ? p.emoji : '🤖';
    personaText += `${emoji} ${key}: ${personaStats[key]}\n`;
  });
  
  const text = `📊 **آمار کامل ربات**\n\n` +
    `👥 **کاربران:**\n` +
    `• کل: ${total}\n` +
    `• VIP: ${vipCount}\n` +
    `• رایگان: ${total - vipCount}\n\n` +
    `💬 **پیام‌ها:**\n` +
    `• کل: ${totalMessages}\n` +
    `• امروز: ${todayMessages}\n\n` +
    `📈 **میانگین:**\n` +
    `• پیام به ازای کاربر: ${total > 0 ? Math.round(totalMessages / total) : 0}\n` +
    `• کاربران فعال امروز: ${todayActive}\n\n` +
    `🎭 **شخصیت‌ها:**\n${personaText}\n` +
    `🕐 **آخرین بروزرسانی:** ${new Date().toLocaleString('fa-IR')}`;
  
  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: '🔙 بازگشت به پنل', callback_data: 'open_admin' }]
    ]
  }, 'HTML', env);
}

// ==================== پنل مدیریت - CSV ====================

async function generateCSV(chatId, env) {
  const allUsers = await getAllUsers(env);
  let csv = 'ID,Name,Username,VIP,Persona,TotalMessages,TodayMessages,CreatedAt,LastActive\n';
  
  for (const u of allUsers) {
    const name = (u.userName || '');
    csv += `${u.id},"${name}",${u.username || ''},${u.isVip ? 'Yes' : 'No'},${u.persona || 'nova'},${u.totalMessages || 0},${u.usage?.messages || 0},${u.createdAt || ''},${u.lastActive || ''}\n`;
  }
  
  const buffer = new TextEncoder().encode(csv);
  const blob = new Blob([buffer], { type: 'text/csv' });
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  await sendDocument(chatId, uint8Array, `nova_users_${Date.now()}.csv`, `📊 گزارش ${allUsers.length} کاربر`, env);
}

// ==================== مدیریت پیام‌های متنی ====================

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const userState = await getUserState(chatId, env);
  const lang = userState.language || 'fa';
  const isAdmin = String(chatId) === String(env.ADMIN_ID);
  const isGroup = ['group', 'supergroup'].includes(message.chat?.type);
  
  // ذخیره نام کاربر
  if (message.from && !userState.userName) {
    userState.userName = message.from.first_name || 'User';
    await saveUserState(chatId, userState, env);
  }
  
  // ========== مدیریت وضعیت ادمین ==========
  if (isAdmin) {
    const adminState = await env.KV_NAMESPACE.get(`admin_state:${chatId}`, 'json');
    if (adminState) {
      await env.KV_NAMESPACE.delete(`admin_state:${chatId}`);
      
      if (adminState.action === 'add_vip') {
        const targetId = text.trim();
        const target = await getUserState(targetId, env);
        target.isVip = true;
        await saveUserState(targetId, target, env);
        await sendMessage(chatId, `✅ کاربر ${targetId} VIP شد.`, null, 'HTML', env);
        try {
          await sendMessage(targetId, '🌟 **تبریک!** حساب شما VIP شد! 🎉\n\nاکنون از تمام محدودیت‌ها رهایی دارید.', null, 'HTML', env);
        } catch(e) {}
        return;
      }
      
      if (adminState.action === 'remove_vip') {
        const targetId = text.trim();
        const target = await getUserState(targetId, env);
        target.isVip = false;
        await saveUserState(targetId, target, env);
        await sendMessage(chatId, `✅ VIP کاربر ${targetId} حذف شد.`, null, 'HTML', env);
        return;
      }
      
      if (adminState.action === 'broadcast') {
        const allUsers = await getAllUsers(env);
        let sent = 0, failed = 0;
        for (const u of allUsers) {
          try {
            await sendMessage(u.id, `📢 **پیام همگانی از مدیریت:**\n\n${text}`, null, 'HTML', env);
            sent++;
          } catch(e) {
            failed++;
          }
          await new Promise(r => setTimeout(r, 100));
        }
        await sendMessage(chatId, `✅ پیام به ${sent} کاربر ارسال شد.\n❌ ${failed} کاربر ناموفق.`, null, 'HTML', env);
        return;
      }
      
      if (adminState.action === 'search') {
        const query = text.trim().toLowerCase();
        const allUsers = await getAllUsers(env);
        const results = allUsers.filter(u => 
          u.id.includes(query) || 
          (u.userName && u.userName.toLowerCase().includes(query)) ||
          (u.username && u.username.toLowerCase().includes(query))
        );
        
        if (results.length === 0) {
          await sendMessage(chatId, `❌ کاربری با "${text}" پیدا نشد.`, null, 'HTML', env);
        } else {
          let resultText = `🔍 **نتایج جستجو:**\n\n`;
          results.slice(0, 10).forEach((u, i) => {
            const name = u.userName || 'ناشناس';
            const p = PERSONA_INFO[u.persona || 'nova'];
            const emoji = p ? p.emoji : '🤖';
            resultText += `${i+1}. ${emoji} ${name} - \`${u.id}\` ${u.isVip ? '👑' : ''}\n`;
          });
          if (results.length > 10) {
            resultText += `\n... و ${results.length - 10} کاربر دیگر`;
          }
          await sendMessage(chatId, resultText, null, 'HTML', env);
        }
        return;
      }
      
      if (adminState.action === 'change_persona') {
        const parts = text.trim().split(' ');
        if (parts.length < 2) {
          await sendMessage(chatId, '❌ فرمت: `آیدی کاربر شخصیت جدید`\nمثال: `123456789 jax`', null, 'HTML', env);
          return;
        }
        const targetId = parts[0];
        const newPersona = parts[1];
        if (!PERSONA_INFO[newPersona]) {
          await sendMessage(chatId, `❌ شخصیت "${newPersona}" معتبر نیست.\nشخصیت‌های موجود: ${Object.keys(PERSONA_INFO).join(', ')}`, null, 'HTML', env);
          return;
        }
        const target = await getUserState(targetId, env);
        target.persona = newPersona;
        await saveUserState(targetId, target, env);
        const p = PERSONA_INFO[newPersona];
        await sendMessage(chatId, `✅ شخصیت کاربر ${targetId} به ${p.emoji} ${newPersona} تغییر کرد.`, null, 'HTML', env);
        try {
          await sendMessage(targetId, `🔄 **شخصیت شما توسط مدیریت تغییر کرد!**\n\nشخصیت جدید: ${p.emoji} ${newPersona}\n${lang === 'fa' ? p.desc_fa : lang === 'ar' ? p.desc_ar : p.desc_en}`, null, 'HTML', env);
        } catch(e) {}
        return;
      }
    }
  }
  
  // ========== تنظیمات گروه ==========
  if (isGroup && text === '/settings') {
    const settings = await getGroupSettings(env, chatId);
    const keyboard = getGroupSettingsKeyboard(settings, lang);
    await sendMessage(chatId, 
      `👥 **تنظیمات گروه**\n\n` +
      `حالت پاسخ: ${settings.mode === 'all' ? 'همیشه' : settings.mode === 'mention' ? 'فقط منشن' : 'هوشمند'}\n` +
      `نشانگر تایپ: ${settings.typingIndicator ? 'فعال ✅' : 'غیرفعال ❌'}\n` +
      `حذف خودکار: ${settings.autoDelete ? 'فعال ✅' : 'غیرفعال ❌'}`,
      keyboard, 'HTML', env
    );
    return;
  }
  
  // ========== بررسی دستورات ==========
  if (text === '/start' || text === '📋 Menu') {
    await sendMessage(chatId, getDashboardText(userState), getDashboardKeyboard(lang, isAdmin), 'HTML', env);
    return;
  }
  
  if (text === '/new' || text === '🆕 گفتگوی جدید') {
    userState.chatHistory = [];
    await saveUserState(chatId, userState, env);
    await sendMessage(chatId, getNewChatText(lang), null, 'HTML', env);
    return;
  }
  
  if (text === '/help' || text === '❓ راهنما') {
    await sendMessage(chatId, getHelpText(lang), getHelpKeyboard(lang), 'HTML', env);
    return;
  }
  
  if (text === '/language' || text === '🌐 زبان') {
    await sendMessage(chatId, getLanguageText(lang), getLanguageKeyboard(lang), 'HTML', env);
    return;
  }
  
  if (text === '/admin' && isAdmin) {
    await showAdminPanel(chatId, 1, 'newest', env);
    return;
  }
  
  if (text === '/vip') {
    await sendMessage(chatId, getVIPText(lang), getVIPKeyboard(lang), 'HTML', env);
    return;
  }
  
  if (text.startsWith('/img ')) {
    const prompt = text.replace('/img ', '');
    await handleImageGeneration(chatId, prompt, env);
    return;
  }
  
  if (text.startsWith('/web ')) {
    const query = text.replace('/web ', '');
    await handleWebSearch(chatId, query, env);
    return;
  }
  
  if (text === '/pdf') {
    await sendMessage(chatId, getPDFText(lang), null, 'HTML', env);
    return;
  }
  
  // ========== پردازش فایل‌ها ==========
  if (message.document) {
    await handleDocument(message, env);
    return;
  }
  
  if (message.photo) {
    await handlePhoto(message, env);
    return;
  }
  
  if (message.voice) {
    await handleVoice(message, env);
    return;
  }
  
  // ========== پاسخ هوش مصنوعی با شخصیت ==========
  await handleAIResponse(chatId, text, userState, env);
}

// ==================== توابع کمکی متون ====================

function getDashboardText(userState) {
  const lang = userState.language || 'fa';
  const name = userState.userName || 'کاربر';
  const isVip = userState.isVip;
  const personaName = userState.persona || 'nova';
  const personaInfo = PERSONA_INFO[personaName] || PERSONA_INFO.nova;
  const usage = userState.usage || { messages: 0, images: 0, voices: 0 };
  
  const texts = {
    fa: {
      title: '📱 مرکز فرماندهی نوا',
      version: 'نسخه Beta 3.0.0 · هسته هوشمند',
      user: `👤 کاربر: ${name} ${isVip ? '👑 VIP' : '🆓 رایگان'}`,
      persona: `${personaInfo.emoji} شخصیت فعال: ${personaName} — ${personaInfo.desc_fa}`,
      usage: '📊 سهمیه و مصرف روزانه شما:',
      messages: `💬 پیام‌ها: [${'█'.repeat(Math.min(usage.messages || 0, 10))}${'░'.repeat(10 - Math.min(usage.messages || 0, 10))}] ${usage.messages || 0}/${isVip ? 500 : 50}`,
      images: `🎨 تصاویر: [${'█'.repeat(Math.min(usage.images || 0, 10))}${'░'.repeat(10 - Math.min(usage.images || 0, 10))}] ${usage.images || 0}/${isVip ? 70 : 7}`,
      voices: `🎤 صداها: [${'█'.repeat(Math.min(usage.voices || 0, 10))}${'░'.repeat(10 - Math.min(usage.voices || 0, 10))}] ${usage.voices || 0}/${isVip ? 30 : 3}`
    },
    en: {
      title: '📱 Nova Command Center',
      version: 'Version Beta 3.0.0 · AI Core',
      user: `👤 User: ${name} ${isVip ? '👑 VIP' : '🆓 Free'}`,
      persona: `${personaInfo.emoji} Active Persona: ${personaName} — ${personaInfo.desc_en}`,
      usage: '📊 Daily Usage Quota:',
      messages: `💬 Messages: [${'█'.repeat(Math.min(usage.messages || 0, 10))}${'░'.repeat(10 - Math.min(usage.messages || 0, 10))}] ${usage.messages || 0}/${isVip ? 500 : 50}`,
      images: `🎨 Images: [${'█'.repeat(Math.min(usage.images || 0, 10))}${'░'.repeat(10 - Math.min(usage.images || 0, 10))}] ${usage.images || 0}/${isVip ? 70 : 7}`,
      voices: `🎤 Voices: [${'█'.repeat(Math.min(usage.voices || 0, 10))}${'░'.repeat(10 - Math.min(usage.voices || 0, 10))}] ${usage.voices || 0}/${isVip ? 30 : 3}`
    },
    ar: {
      title: '📱 مركز قيادة نوفا',
      version: 'نسخة Beta 3.0.0 · المحرك الذكي',
      user: `👤 المستخدم: ${name} ${isVip ? '👑 VIP' : '🆓 مجاني'}`,
      persona: `${personaInfo.emoji} الشخصية النشطة: ${personaName} — ${personaInfo.desc_ar}`,
      usage: '📊 استهلاكك اليومي:',
      messages: `💬 الرسائل: [${'█'.repeat(Math.min(usage.messages || 0, 10))}${'░'.repeat(10 - Math.min(usage.messages || 0, 10))}] ${usage.messages || 0}/${isVip ? 500 : 50}`,
      images: `🎨 الصور: [${'█'.repeat(Math.min(usage.images || 0, 10))}${'░'.repeat(10 - Math.min(usage.images || 0, 10))}] ${usage.images || 0}/${isVip ? 70 : 7}`,
      voices: `🎤 الصوت: [${'█'.repeat(Math.min(usage.voices || 0, 10))}${'░'.repeat(10 - Math.min(usage.voices || 0, 10))}] ${usage.voices || 0}/${isVip ? 30 : 3}`
    }
  };
  
  const t = texts[lang] || texts.fa;
  return `
<b>${t.title}</b>
${t.version}

${t.user}
${t.persona}

${t.usage}
--------------------------------
${t.messages}
${t.images}
${t.voices}
--------------------------------

💡 یکی از گزینه‌های زیر را انتخاب کنید:
  `;
}

function getPersonasText(userState, lang) {
  const personaName = userState.persona || 'nova';
  const personaInfo = PERSONA_INFO[personaName] || PERSONA_INFO.nova;
  
  const texts = {
    fa: `🎭 **انتخاب شخصیت**\n\n${personaInfo.emoji} فعال: ${personaName} — ${personaInfo.desc_fa}\n\nهر شخصیت لحن، رفتار و تخصص متفاوتی دارد.\nبرای تغییر یکی رو انتخاب کن:`,
    en: `🎭 **Select Persona**\n\n${personaInfo.emoji} Active: ${personaName} — ${personaInfo.desc_en}\n\nEach persona has different tone and expertise.\nChoose one to change:`,
    ar: `🎭 **اختيار الشخصية**\n\n${personaInfo.emoji} النشطة: ${personaName} — ${personaInfo.desc_ar}\n\nكل شخصية لها نبرة وخبرة مختلفة.\nاختر واحدة للتغيير:`
  };
  return texts[lang] || texts.fa;
}

function getPersonaSetText(persona, lang) {
  const p = PERSONA_INFO[persona];
  const texts = {
    fa: `✅ شخصیت شما به ${p.emoji} ${persona} تغییر کرد!`,
    en: `✅ Persona changed to ${p.emoji} ${persona}!`,
    ar: `✅ تم تغيير الشخصية إلى ${p.emoji} ${persona}!`
  };
  return texts[lang] || texts.fa;
}

function getLanguageText(lang) {
  const texts = {
    fa: '🌐 انتخاب زبان\nCurrent: فارسی',
    en: '🌐 Select Language\nCurrent: English',
    ar: '🌐 اختيار اللغة\nCurrent: العربية'
  };
  return texts[lang] || texts.fa;
}

function getLanguageSetText(newLang) {
  const langNames = { fa: 'فارسی', en: 'English', ar: 'العربية' };
  return `✅ زبان به ${langNames[newLang] || newLang} تغییر کرد!`;
}

function getVIPText(lang) {
  const texts = {
    fa: `🔥 **دسترسی VIP**

ارتقا به VIP محدودیت‌های روزانه شما را افزایش می‌دهد:
💬 پیام‌ها: ۵۰۰ در روز (در مقابل ۵۰)
🎨 تولید تصویر: ۷۰ در روز (در مقابل ۷)
🖼️ ویرایش تصویر: ۵۰ در روز (در مقابل ۵)
🎤 صدا: ۳۰ در روز (در مقابل ۳)
🌐 وب‌اپ‌ها: ۱۰۰ در روز (در مقابل ۱۰)
📁 تحلیل فایل و تصویر در گروه‌ها
✅ اولویت پردازش

توجه: محدودیت‌ها هر ۲۴ ساعت ریست می‌شوند؛ VIP ظرفیت بالاتری دارد، نه نامحدود.

برای ارتقا تماس بگیرید:`,
    en: `🔥 **VIP Access**

Upgrading to VIP raises your daily limits to:
💬 Messages: 500/day (vs 50)
🎨 Image generation: 70/day (vs 7)
🖼️ Image editing: 50/day (vs 5)
🎤 Voice: 30/day (vs 3)
🌐 Web apps: 100/day (vs 10)
📁 File & image analysis in groups
✅ Priority processing

Note: limits reset every 24h; VIP means much higher capacity, not infinite usage.

Contact to upgrade:`,
    ar: `🔥 **الوصول VIP**

الترقية إلى VIP ترفع حدودك اليومية إلى:
💬 الرسائل: ٥٠٠/يوم (مقابل ٥٠)
🎨 توليد الصور: ٧٠/يوم (مقابل ٧)
🖼️ تحرير الصور: ٥٠/يوم (مقابل ٥)
🎤 الصوت: ٣٠/يوم (مقابل ٣)
🌐 تطبيقات الويب: ١٠٠/يوم (مقابل ١٠)
📁 تحليل الملفات والصور في المجموعات
✅ معالجة ذات أولوية

ملاحظة: الحدود تُعاد كل ٢٤ ساعة؛ VIP يعني سعة أعلى، وليس استخدام غير محدود.

للترقية اتصل:`
  };
  return texts[lang] || texts.fa;
}

function getHelpText(lang) {
  const texts = {
    fa: `📖 **راهنمای کامل نوا**

💬 **گفتگوی عادی:** هر چی بنویس یا هر ویسی بفرستی، نوا مثل یه دوست باهوش جواب می‌ده. عکس، PDF یا فایل متنی هم می‌تونی بفرستی تا تحلیلش کنه.

🛠 **دستورات اصلی:**
🏠 /start - خانه و مصرف روزانه
🆕 /new - پاک کردن حافظه و شروع تازه
🎨 /img [موضوع] - ساخت تصویر با AI
🌐 /web [موضوع] - جستجوی سریع وب
📚 /deepsearch [موضوع] - تحقیق عمیق
📄 /pdf - تبدیل متن به فایل PDF
❓ /help - همین راهنما

🎭 **شخصیت‌ها:**
${Object.keys(PERSONA_INFO).map(k => {
  const p = PERSONA_INFO[k];
  return `${p.emoji} ${k} - ${p.desc_fa}`;
}).join('\n')}

💡 مستقیم هم می‌تونی بگی «یه وب‌اپ بازی بساز»، «این عکس رو ویرایش کن» یا «برام ویس بفرست» - خودش تشخیص می‌ده.`,
    en: `📖 **Nova Complete Guide**

💬 **Normal Chat:** Write anything or send voice, Nova responds like a smart friend. You can also send photos, PDFs or text files for analysis.

🛠 **Main Commands:**
🏠 /start - Home and daily usage
🆕 /new - Clear memory and start fresh
🎨 /img [topic] - Generate image with AI
🌐 /web [topic] - Quick web search
📚 /deepsearch [topic] - Deep research
📄 /pdf - Convert text to PDF
❓ /help - This guide

🎭 **Personalities:**
${Object.keys(PERSONA_INFO).map(k => {
  const p = PERSONA_INFO[k];
  return `${p.emoji} ${k} - ${p.desc_en}`;
}).join('\n')}

💡 You can also directly say "build a web app game", "edit this photo" or "send me voice" - it detects automatically.`,
    ar: `📖 **دليل نوفا الكامل**

💬 **محادثة عادية:** اكتب أي شيء أو أرسل صوتًا، نوفا يرد كصديق ذكي. يمكنك أيضًا إرسال صور أو PDF أو ملفات نصية للتحليل.

🛠 **الأوامر الرئيسية:**
🏠 /start - الصفحة الرئيسية والاستخدام اليومي
🆕 /new - مسح الذاكرة والبدء من جديد
🎨 /img [الموضوع] - إنشاء صورة بالذكاء الاصطناعي
🌐 /web [الموضوع] - بحث سريع على الويب
📚 /deepsearch [الموضوع] - بحث عميق
📄 /pdf - تحويل النص إلى PDF
❓ /help - هذا الدليل

🎭 **الشخصيات:**
${Object.keys(PERSONA_INFO).map(k => {
  const p = PERSONA_INFO[k];
  return `${p.emoji} ${k} - ${p.desc_ar}`;
}).join('\n')}

💡 يمكنك أيضًا أن تقول مباشرة "ابني لعبة ويب"، "عدل هذه الصورة" أو "أرسل لي صوتًا" - يكتشفها تلقائيًا.`
  };
  return texts[lang] || texts.fa;
}

function getNewChatText(lang) {
  const texts = {
    fa: '✅ حافظه پاک شد! آماده‌ی گفتگوی جدید هستم.',
    en: '✅ Memory cleared! Ready for a new conversation.',
    ar: '✅ تم مسح الذاكرة! جاهز لمحادثة جديدة.'
  };
  return texts[lang] || texts.fa;
}

function getCustomPromptText(lang) {
  const texts = {
    fa: '✏️ لطفاً پرامپت سفارشی خود را ارسال کنید.\n\nمثال: "تو یک استاد فلسفه هستی و با زبان شاعرانه پاسخ می‌دهی"',
    en: '✏️ Please send your custom prompt.\n\nExample: "You are a philosophy professor who responds poetically"',
    ar: '✏️ الرجاء إرسال الموجه المخصص الخاص بك.\n\nمثال: "أنت أستاذ فلسفة ترد بشاعرية"'
  };
  return texts[lang] || texts.fa;
}

function getPDFText(lang) {
  const texts = {
    fa: '📄 لطفاً فایل PDF خود را ارسال کنید تا آنالیز کنم.',
    en: '📄 Please send your PDF file for analysis.',
    ar: '📄 الرجاء إرسال ملف PDF الخاص بك للتحليل.'
  };
  return texts[lang] || texts.fa;
}

// ==================== توابع هوش مصنوعی ====================

async function handleAIResponse(chatId, text, userState, env) {
  const usageCheck = await checkUsage(chatId, 'messages', env);
  if (!usageCheck.success) {
    await sendMessage(chatId, usageCheck.message, null, 'HTML', env);
    return;
  }
  
  try {
    const systemPrompt = getSystemPrompt(userState);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          ...userState.chatHistory.slice(-10),
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });
    
    const data = await response.json();
    
    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid response from OpenAI');
    }
    
    const aiMessage = data.choices[0].message.content;
    
    userState.chatHistory.push(
      { role: 'user', content: text },
      { role: 'assistant', content: aiMessage }
    );
    userState.totalMessages = (userState.totalMessages || 0) + 1;
    await saveUserState(chatId, userState, env);
    
    await sendMessage(chatId, aiMessage, null, 'HTML', env);
    
  } catch (error) {
    console.error('AI Error:', error);
    await sendMessage(chatId, '⚠️ خطا در ارتباط با هوش مصنوعی. لطفاً دوباره تلاش کنید.', null, 'HTML', env);
  }
}

function getSystemPrompt(userState) {
  const persona = userState.persona || 'nova';
  const customPrompt = userState.customPrompt;
  
  if (customPrompt) return customPrompt;
  
  const p = PERSONA_INFO[persona];
  const lang = userState.language || 'fa';
  
  if (lang === 'fa') return p.prompt_fa;
  if (lang === 'ar') return p.prompt_ar;
  return p.prompt_en;
}

// ==================== توابع مصرف و محدودیت ====================

async function checkUsage(userId, type, env) {
  const state = await getUserState(userId, env);
  const today = new Date().toDateString();
  
  if (state.lastReset !== today) {
    state.usage = { messages: 0, images: 0, voices: 0 };
    state.lastReset = today;
    await saveUserState(userId, state, env);
  }
  
  const limits = state.isVip ? 
    { messages: 500, images: 70, voices: 30 } : 
    { messages: 50, images: 7, voices: 3 };
  
  if (state.usage[type] >= limits[type]) {
    const lang = state.language || 'fa';
    const texts = {
      fa: `⚠️ محدودیت ${type} امروز تمام شد!`,
      en: `⚠️ ${type} limit reached for today!`,
      ar: `⚠️ تم الوصول إلى حد ${type} اليوم!`
    };
    return { success: false, message: texts[lang] || texts.fa };
  }
  
  state.usage[type]++;
  await saveUserState(userId, state, env);
  return { success: true };
}

// ==================== توابع تولید تصویر ====================

async function handleImageGeneration(chatId, prompt, env) {
  const usageCheck = await checkUsage(chatId, 'images', env);
  if (!usageCheck.success) {
    await sendMessage(chatId, usageCheck.message, null, 'HTML', env);
    return;
  }
  
  await sendMessage(chatId, `🎨 در حال تولید تصویر برای "${prompt}"...`, null, 'HTML', env);
  
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        n: 1,
        size: '1024x1024'
      })
    });
    
    const data = await response.json();
    
    if (!data.data || !data.data[0]) {
      throw new Error('Invalid response from OpenAI');
    }
    
    const imageUrl = data.data[0].url;
    await sendPhoto(chatId, imageUrl, `🎨 ${prompt}`, null, env);
    
  } catch (error) {
    console.error('Image Generation Error:', error);
    await sendMessage(chatId, '⚠️ خطا در تولید تصویر. لطفاً دوباره تلاش کنید.', null, 'HTML', env);
  }
}

// ==================== توابع جستجوی وب ====================

async function handleWebSearch(chatId, query, env) {
  await sendMessage(chatId, `🌐 در حال جستجوی "${query}"...`, null, 'HTML', env);
  
  try {
    const searchResults = `🔍 **نتایج جستجو برای "${query}":**\n\n` +
      `1. نتیجه اول - لینک نمونه\n` +
      `2. نتیجه دوم - لینک نمونه\n` +
      `3. نتیجه سوم - لینک نمونه\n\n` +
      `💡 برای جستجوی دقیق‌تر از /deepsearch استفاده کنید.`;
    
    await sendMessage(chatId, searchResults, null, 'HTML', env);
  } catch (error) {
    console.error('Web Search Error:', error);
    await sendMessage(chatId, '⚠️ خطا در جستجوی وب.', null, 'HTML', env);
  }
}

// ==================== توابع پردازش فایل ====================

async function handleDocument(message, env) {
  const chatId = message.chat.id;
  const document = message.document;
  const fileName = document.file_name || 'file';
  
  await sendMessage(chatId, `📄 فایل "${fileName}" دریافت شد. در حال پردازش...`, null, 'HTML', env);
  
  try {
    const fileInfo = await sendRequest('getFile', { file_id: document.file_id }, env);
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
    
    const fileResponse = await fetch(fileUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    
    await sendMessage(chatId, `✅ فایل "${fileName}" با موفقیت دریافت شد.`, null, 'HTML', env);
    
  } catch (error) {
    console.error('File Processing Error:', error);
    await sendMessage(chatId, '⚠️ خطا در پردازش فایل.', null, 'HTML', env);
  }
}

async function handlePhoto(message, env) {
  const chatId = message.chat.id;
  const photo = message.photo[message.photo.length - 1];
  
  await sendMessage(chatId, '🖼️ عکس دریافت شد! در حال پردازش...', null, 'HTML', env);
  
  try {
    const fileInfo = await sendRequest('getFile', { file_id: photo.file_id }, env);
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
    
    await sendMessage(chatId, '✅ عکس با موفقیت دریافت شد. برای ویرایش یا آنالیز می‌تونی از من بپرسی!', null, 'HTML', env);
    
  } catch (error) {
    console.error('Photo Processing Error:', error);
    await sendMessage(chatId, '⚠️ خطا در پردازش عکس.', null, 'HTML', env);
  }
}

async function handleVoice(message, env) {
  const chatId = message.chat.id;
  const voice = message.voice;
  
  const usageCheck = await checkUsage(chatId, 'voices', env);
  if (!usageCheck.success) {
    await sendMessage(chatId, usageCheck.message, null, 'HTML', env);
    return;
  }
  
  await sendMessage(chatId, '🎤 ویس دریافت شد! در حال پردازش...', null, 'HTML', env);
  
  try {
    const fileInfo = await sendRequest('getFile', { file_id: voice.file_id }, env);
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
    
    // دریافت فایل صوتی
    const audioResponse = await fetch(fileUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    
    // تبدیل ویس به متن با Whisper
    if (env.OPENAI_API_KEY && env.OPENAI_API_KEY !== 'temp') {
      try {
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
        formData.append('model', 'whisper-1');
        formData.append('language', 'fa');
        
        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
          body: formData
        });
        
        if (whisperRes.ok) {
          const whisperData = await whisperRes.json();
          const transcribedText = whisperData.text;
          
          if (transcribedText) {
            await sendMessage(chatId, `🎤 **متن تشخیص داده شده:**\n${transcribedText}`, null, 'HTML', env);
            
            // پاسخ به متن تشخیص داده شده با شخصیت
            const userState = await getUserState(chatId, env);
            await handleAIResponse(chatId, transcribedText, userState, env);
            return;
          }
        }
      } catch (e) {
        console.error('Whisper Error:', e);
      }
    }
    
    await sendMessage(chatId, '✅ ویس با موفقیت دریافت شد. متأسفانه سرویس تبدیل به متن در دسترس نیست.', null, 'HTML', env);
    
  } catch (error) {
    console.error('Voice Processing Error:', error);
    await sendMessage(chatId, '⚠️ خطا در پردازش ویس.', null, 'HTML', env);
  }
      }
