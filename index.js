import express from 'express';
import { Client, middleware } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dotenv.config();
dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);

// --- 環境變數檢查 ---
console.log('✅ channelSecret:', process.env.CHANNEL_SECRET ? 'OK' : '❌ 缺少 channelSecret');
console.log('✅ channelAccessToken:', process.env.CHANNEL_ACCESS_TOKEN ? 'OK' : '❌ 缺少 channelAccessToken');
console.log('✅ SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : '❌ 缺少 SUPABASE_URL');
console.log('✅ SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'OK' : '❌ 缺少 SUPABASE_ANON_KEY');
console.log('DEFAULT_RICH_MENU_ID:', process.env.DEFAULT_RICH_MENU_ID);

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new Client(config);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const DEFAULT_RICH_MENU_ID = process.env.DEFAULT_RICH_MENU_ID;

const app = express();

app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Webhook 錯誤:', err);
    res.status(500).end();
  }
});

app.use('/api', express.json());

// --- Rich Menu 綁定 ---
async function linkRichMenu(userId, menuId) {
  try {
    await client.linkRichMenuToUser(userId, menuId);
    console.log(`✅ 已綁定 Rich Menu: ${menuId} 給 ${userId}`);
  } catch (err) {
    console.error('❌ 綁定 Rich Menu 失敗:', err);
  }
}

// --- 查詢訊息 ---
async function queryMessages(userId, start, end) {
  console.log(`🔎 查詢 ${userId} 的訊息（${start} ~ ${end}）`);
  const { data, error } = await supabase
    .from('messages')
    .select('content, created_at')
    .eq('user_id', userId)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  if (error) console.error('❌ 查詢錯誤:', error);
  console.log(`🔎 查詢結果: ${JSON.stringify(data)}`);
  return { data, error };
}

// --- 產生文字雲網址 ---
async function generateWordCloudImageUrl(userId, start, end) {
  const { data: messages, error } = await queryMessages(userId, start, end);
  if (error || !messages.length) {
    return null;
  }

  const allText = messages.map(m => m.content).join(' ');
  const imageUrl = `https://quickchart.io/wordcloud?text=${encodeURIComponent(allText)}`;
  return imageUrl;
}

// --- 回覆訊息封裝 ---
async function replyWithMessages(userId, start, end, replyToken, title) {
  const { data: messages, error } = await queryMessages(userId, start, end);

  if (error) {
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '查詢失敗，請稍後再試～'
    });
  }

  const replyText = messages.length
    ? messages.map((msg, i) => {
        const formattedDate = dayjs(msg.created_at).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');
        return `${i + 1}. ${msg.content} (發送時間: ${formattedDate})`;
      }).join('\n')
    : title.includes('今日')
      ? '你今天還沒有留下任何紀錄喔！'
      : '這週你還沒有留下任何紀錄喔！';

  console.log('📝 回覆內容：\n' + replyText);

  return client.replyMessage(replyToken, {
    type: 'text',
    text: `${title}\n${replyText}`
  });
}

// --- 主事件處理 ---
async function handleEvent(event) {
  if (!event.source?.userId) return;

  const userId = event.source.userId;
  await linkRichMenu(userId, DEFAULT_RICH_MENU_ID);

  const contains = (keywords) => keywords.some(kw => event.message?.text?.includes(kw));

  if (event.type === 'postback') {
    const data = event.postback?.data;
    if (data === '查詢今日紀錄' || data === '查詢本週紀錄') {
      const isToday = data === '查詢今日紀錄';
      const start = isToday
        ? dayjs().tz('Asia/Taipei').startOf('day').utc().format()
        : dayjs().tz('Asia/Taipei').startOf('isoWeek').utc().format();
      const end = isToday
        ? dayjs().tz('Asia/Taipei').add(1, 'day').startOf('day').utc().format()
        : dayjs().tz('Asia/Taipei').add(1, 'week').startOf('isoWeek').utc().format();

      console.log(`📅 查詢範圍（${isToday ? '今日' : '本週'}）UTC: ${start} ~ ${end}`);
      return replyWithMessages(userId, start, end, event.replyToken, isToday ? '📅 今日紀錄：' : '🗓️ 本週紀錄：');
    }
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();

    if (contains(['查詢今日紀錄'])) {
      const start = dayjs().tz('Asia/Taipei').startOf('day').utc().format();
      const end = dayjs().tz('Asia/Taipei').add(1, 'day').startOf('day').utc().format();
      console.log(`📅 查詢範圍（今日）UTC: ${start} ~ ${end}`);
      return replyWithMessages(userId, start, end, event.replyToken, '📅 今日紀錄：');
    }

    if (contains(['查詢本週紀錄'])) {
      const start = dayjs().tz('Asia/Taipei').startOf('isoWeek').utc().format();
      const end = dayjs().tz('Asia/Taipei').add(1, 'week').startOf('isoWeek').utc().format();
      console.log(`📅 查詢範圍（本週）UTC: ${start} ~ ${end}`);
      return replyWithMessages(userId, start, end, event.replyToken, '🗓️ 本週紀錄：');
    }
    
      if (text === '產生文字雲') {
    const start = dayjs().tz('Asia/Taipei').startOf('isoWeek').utc().format();
    const end = dayjs().tz('Asia/Taipei').add(1, 'week').startOf('isoWeek').utc().format();

    const imageUrl = await generateWordCloudImageUrl(userId, start, end);

    if (!imageUrl) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '你這週還沒有記錄任何訊息喔，沒辦法產生文字雲～'
      });
    }

    return client.replyMessage(event.replyToken, {
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl
    });
  }

    // ✅ 儲存訊息：使用台灣時間轉成 UTC 再存
    const createdAt = dayjs().tz('Asia/Taipei').toISOString();
    console.log(`🕒 實際儲存時間（台灣時間轉 UTC）: ${createdAt}`);

    const { error } = await supabase
      .from('messages')
      .insert([
        {
          user_id: userId,
          content: text,
          created_at: createdAt
        }
      ]);

    if (error) {
      console.error('❌ 儲存訊息失敗:', error);
    } else {
      console.log(`✅ 已儲存訊息：${text}`);
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `你說的是：「${text}」，我已經記錄起來囉！`
    });
  }

  return Promise.resolve(null);
}

// --- 啟動伺服器 ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});