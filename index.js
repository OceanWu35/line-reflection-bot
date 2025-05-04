const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// --- 環境變數驗證 ---
console.log("=== Render 上的環境變數 ===");
console.log("CHANNEL_SECRET:", process.env.CHANNEL_SECRET);
console.log("CHANNEL_ACCESS_TOKEN:", process.env.CHANNEL_ACCESS_TOKEN);

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

const app = express(); // 不要使用 express.json()

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
  console.log('收到的 event：', JSON.stringify(event, null, 2));

  // 僅處理純文字訊息
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const userMessage = event.message.text;

  // --- 綁定 Rich Menu（僅執行一次） ---
  const richMenuId = 'richmenu-4eae5690441718ee0d1610528012be5b';


  try {
    // 先從資料庫檢查這位用戶是否已綁定過
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingUser) {
      // 尚未記錄 => 綁定 rich menu 並記錄此用戶
      await client.linkRichMenuToUser(userId, richMenuId);
      console.log(`已綁定 Rich Menu 給使用者 ${userId}`);

      await supabase.from('users').insert([{ user_id: userId }]);
    }
  } catch (e) {
    console.error('Rich Menu 綁定或用戶紀錄錯誤:', e);
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

  // --- 回覆訊息 ---
  const replyMessage = {
    type: 'text',
    text: `你說的是：「${userMessage}」\n這句話我已經記起來了喔！`
  };

  return client.replyMessage(event.replyToken, replyMessage);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`機器人正在監聽 port ${port}!`);
});




