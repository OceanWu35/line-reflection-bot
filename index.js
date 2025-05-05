import express from 'express';
import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dotenv.config();

dayjs.extend(isoWeek);

// --- LINE 設定 ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(config);

// --- Supabase 設定 ---
const supabase = createClient(
  'https://fjavortirkzrxyfauvwx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqYXZvcnRpcmt6cnh5ZmF1dnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyODk4NDksImV4cCI6MjA2MTg2NTg0OX0.GWcICDpFWwJJCBJCG04ZzT4pIHjWenwtSF_iE3cyLao'
);

const app = express(); // 不使用 express.json()

// --- Webhook 入口 ---
app.post('/webhook', line.middleware(config), async (req, res) => {
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

  // --- Rich Menu 綁定 ---
  const richMenuId = 'richmenu-4eae5690441718ee0d1610528012be5b';
  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingUser) {
      await client.linkRichMenuToUser(userId, richMenuId);
      console.log(`已綁定 Rich Menu 給使用者 ${userId}`);
      await supabase.from('users').insert([{ user_id: userId }]);
    }
  } catch (e) {
    console.error('Rich Menu 綁定或用戶紀錄錯誤:', e);
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
  const richMenuId = '16700635';
  await client.linkRichMenuToUser(userId, richMenuId);
  console.log(`已綁定 Rich Menu 給使用者 ${userId}`);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`機器人正在監聽 port ${port}!`);
});





