import express from 'express';
import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';

dayjs.extend(isoWeek);

dotenv.config();

// --- LINE 設定 ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new Client(config);

// --- Supabase 設定 ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const app = express();
app.use(express.json()); // 開啟 JSON 解析

// --- Webhook 入口 ---
app.post('/webhook', client.middleware(config), async (req, res) => {
  const events = req.body.events;
  try {
    const results = await Promise.all(events.map(handleEvent));
    res.status(200).json(results);
  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
    res.status(500).end();
  }
});

// --- 主處理函式 ---
async function handleEvent(event) {
  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  // 綁定 Rich Menu
  await linkRichMenu(userId);

  console.log('收到的 event：', JSON.stringify(event, null, 2));

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // --- 查詢今日紀錄 ---
  if (userMessage === '查詢今日紀錄') {
    const today = dayjs().format('YYYY-MM-DD');
    const { data, error } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('查詢今日紀錄錯誤:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '查詢失敗，請稍後再試～'
      });
    }

    const replyText = data.length
      ? data.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')
      : '你今天還沒有留下任何紀錄喔！';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `📅 今日紀錄：\n${replyText}`
    });
  }

  // --- 查詢本週紀錄 ---
  if (userMessage === '查詢本週紀錄') {
    const startOfWeek = dayjs().startOf('isoWeek').format();
    const endOfWeek = dayjs().endOf('isoWeek').format();

    const { data, error } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', startOfWeek)
      .lte('created_at', endOfWeek)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('查詢本週紀錄錯誤:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '查詢失敗，請稍後再試～'
      });
    }

    const replyText = data.length
      ? data.map((msg, i) => `${i + 1}. ${msg.content}`).join('\n')
      : '這週你還沒有留下任何紀錄喔！';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🗓️ 本週紀錄：\n${replyText}`
    });
  }

  // --- 儲存訊息 ---
  const { error: insertError } = await supabase.from('messages').insert([
    {
      user_id: userId,
      content: userMessage
    }
  ]);
  if (insertError) {
    console.error('Supabase 儲存訊息失敗:', insertError);
  }

  // --- 回覆使用者訊息 ---
  try {
    const replyMessage = {
      type: 'text',
      text: `你說的是：「${userMessage}」\n這句話我已經記起來了喔！`
    };
    return await client.replyMessage(event.replyToken, replyMessage);
  } catch (err) {
    console.error('回覆訊息失敗:', err);
  }
}

// --- 綁定 Rich Menu ---
async function linkRichMenu(userId) {
  const richMenuId = 'richmenu-4eae5690441718ee0d1610528012be5b';
  await client.linkRichMenuToUser(userId, richMenuId);
  console.log(`已綁定 Rich Menu 給使用者 ${userId}`);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`機器人正在監聽 port ${port}!`);
});







