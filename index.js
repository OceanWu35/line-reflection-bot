import express from 'express';
import { Client, middleware } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
dayjs.extend(isoWeek);

dotenv.config();

import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

// --- LINE 設定 ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

console.log('✅ channelSecret:', process.env.CHANNEL_SECRET ? 'OK' : '❌ 缺少 channelSecret');
console.log('✅ channelAccessToken:', process.env.CHANNEL_ACCESS_TOKEN ? 'OK' : '❌ 缺少 channelAccessToken');

const client = new Client(config);

// --- Supabase 設定 ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('✅ SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : '❌ 缺少 SUPABASE_URL');
console.log('✅ SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'OK' : '❌ 缺少 SUPABASE_ANON_KEY');

// --- 預設 Rich Menu ID ---
const DEFAULT_RICH_MENU_ID = process.env.DEFAULT_RICH_MENU_ID;

const app = express();

// --- Webhook 路由 ---
app.post('/webhook', middleware(config), async (req, res) => {
  const events = req.body.events;

  try {
    const results = await Promise.all(events.map(handleEvent));
    res.status(200).json(results);
  } catch (err) {
    console.error('Webhook 錯誤:', err);
    res.status(500).end();
  }
});

// --- 主處理函式 ---
async function handleEvent(event) {
  const userId = event.source.userId;

  // 1. 綁定 Rich Menu
  await linkRichMenu(userId, DEFAULT_RICH_MENU_ID);

  // ✅ postback 查詢今日紀錄
  if (event.type === 'postback' && event.postback?.data === '查詢今日紀錄') {
    const todayStart = dayjs().startOf('day').utc().format();
    const todayEnd = dayjs().endOf('day').utc().format();

    const { data, error } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Postback 查詢今日紀錄錯誤:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '查詢失敗，請稍後再試～'
      });
    }

    console.log(`📋 查詢到 ${data.length} 筆今日紀錄（Postback）`);

    const replyText = data.length
      ? data.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')
      : '你今天還沒有留下任何紀錄喔！';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 今日紀錄：\n${replyText}`
    });
  }

  // ✅ postback 查詢本週紀錄
  if (event.type === 'postback' && event.postback?.data === '查詢本週紀錄') {
    const startOfWeek = dayjs().startOf('isoWeek').utc().format();
    const endOfWeek = dayjs().endOf('isoWeek').utc().format();

    const { data, error } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', startOfWeek)
      .lte('created_at', endOfWeek)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('📛 Postback 查詢錯誤:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '查詢失敗，請稍後再試～'
      });
    }

    console.log(`📋 查詢到 ${data.length} 筆本週紀錄（Postback）`);

    const replyText = data.length
      ? data.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')
      : '這週你還沒有留下任何紀錄喔！';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🗓️ 本週紀錄：\n${replyText}`
    });
  }

  // 2. 非文字訊息就跳過
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.trim();
  console.log('👀 使用者傳來的訊息：', userMessage);

  const contains = (keywords) => keywords.some(kw => userMessage.includes(kw));

  // 3. 查詢今日紀錄
  if (contains(['查詢今日紀錄'])) {
    const todayStart = dayjs().startOf('day').utc().format();
    const todayEnd = dayjs().endOf('day').utc().format();

    const { data, error } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('📛 查詢今日紀錄錯誤:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '查詢失敗，請稍後再試～'
      });
    }

    console.log(`📋 查詢到 ${data.length} 筆今日紀錄`);

    const replyText = data.length
      ? data.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')
      : '你今天還沒有留下任何紀錄喔！';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 今日紀錄：\n${replyText}`
    });
  }

  // 4. 查詢本週紀錄
  if (contains(['查詢本週紀錄'])) {
    const startOfWeek = dayjs().startOf('isoWeek').utc().format();
    const endOfWeek = dayjs().endOf('isoWeek').utc().format();

    const { data, error } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', startOfWeek)
      .lte('created_at', endOfWeek)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('📛 查詢本週紀錄錯誤:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '查詢失敗，請稍後再試～'
      });
    }

    console.log(`📋 查詢到 ${data.length} 筆本週紀錄`);

    const replyText = data.length
      ? data.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')
      : '這週你還沒有留下任何紀錄喔！';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🗓️ 本週紀錄：\n${replyText}`
    });
  }

  // 5. 儲存訊息
  const createdAt = new Date().toISOString();
  const { error: insertError } = await supabase.from('messages').insert([
    {
      user_id: userId,
      content: userMessage,
      created_at: createdAt
    }
  ]);

  if (insertError) {
    console.error('📛 儲存訊息失敗:', insertError);
  } else {
    console.log(`✅ 成功儲存訊息：${userMessage} @ ${createdAt}`);
  }

  // 6. 回覆訊息
  try {
    return await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `你說的是：「${userMessage}」\n這句話我已經記起來了喔！`
    });
  } catch (err) {
    console.error('📛 回覆訊息失敗:', err);
  }
}

// --- 綁定 Rich Menu ---
async function linkRichMenu(userId, richMenuId) {
  try {
    await client.linkRichMenuToUser(userId, richMenuId);
    console.log(`綁定 Rich Menu：${richMenuId} → 使用者 ${userId}`);
  } catch (error) {
    console.error('Rich Menu 綁定錯誤:', error);
  }
}

// --- 手動切換 Rich Menu API ---
app.post('/update-richmenu', express.json(), async (req, res) => {
  const { userId, richMenuId } = req.body;

  if (!userId || !richMenuId) {
    return res.status(400).json({ message: '缺少 userId 或 richMenuId' });
  }

  try {
    await linkRichMenu(userId, richMenuId);
    res.status(200).json({ message: '更新成功' });
  } catch (error) {
    console.error('更新圖文選單錯誤:', error);
    res.status(500).json({ message: '更新失敗' });
  }
});

// --- 測試首頁 ---
app.get('/', (req, res) => {
  res.send('🤖 LINE Reflection Bot is running!');
});

// --- 啟動伺服器 ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Bot 正在監聽 port ${port}`);
});

