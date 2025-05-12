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

// ❗ 不可全域使用 express.json()，否則會破壞 LINE webhook 驗證
app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Webhook 錯誤:', err);
    res.status(500).end();
  }
});

// ✅ 如果有其他 API，再針對其他路由加上 JSON 解析中介軟體
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
  console.log(`🔎 查詢 ${userId} 的訊息（${start} ~ ${end}）`); // 印出查詢範圍
  const { data, error } = await supabase
    .from('messages')
    .select('content, created_at')
    .eq('user_id', userId)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true });

  if (error) console.error('❌ 查詢錯誤:', error);
  
  // 印出查詢結果
  console.log(`🔎 查詢結果: ${JSON.stringify(data)}`);

  return { data, error };
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
    ? messages.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')
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
        ? dayjs().startOf('day').utc().format()
        : dayjs().startOf('isoWeek').utc().format();
      const end = isToday
        ? dayjs().endOf('day').utc().format()
        : dayjs().endOf('isoWeek').utc().format();
      return replyWithMessages(userId, start, end, event.replyToken, isToday ? '📅 今日紀錄：' : '🗓️ 本週紀錄：');
    }
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();

    if (contains(['查詢今日紀錄'])) {
      const start = dayjs().startOf('day').utc().format();
      const end = dayjs().endOf('day').utc().format();
      return replyWithMessages(userId, start, end, event.replyToken, '📅 今日紀錄：');
    }

    if (contains(['查詢本週紀錄'])) {
      const start = dayjs().startOf('isoWeek').utc().format();
      const end = dayjs().endOf('isoWeek').utc().format();
      return replyWithMessages(userId, start, end, event.replyToken, '🗓️ 本週紀錄：');
    }

    // --- 儲存訊息到 Supabase ---
    const { error } = await supabase
      .from('messages')
      .insert([
        {
          user_id: userId,
          content: text,
          created_at: dayjs().utc().toISOString()
        }
      ]);

    if (error) {
      console.error('❌ 儲存訊息失敗:', error);
    } else {
      console.log(`✅ 已儲存訊息：${text}`);
    }

    // 修改回覆訊息
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
