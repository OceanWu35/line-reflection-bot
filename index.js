const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); 

console.log("=== Render 上的環境變數 ===");
console.log("CHANNEL_SECRET:", process.env.CHANNEL_SECRET);
console.log("CHANNEL_ACCESS_TOKEN:", process.env.CHANNEL_ACCESS_TOKEN);

// Line 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(config);

// Supabase 設定
const supabase = createClient(
  'https://fjavortirkzrxyfauvwx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqYXZvcnRpcmt6cnh5ZmF1dnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyODk4NDksImV4cCI6MjA2MTg2NTg0OX0.GWcICDpFWwJJCBJCG04ZzT4pIHjWenwtSF_iE3cyLao'
);

const app = express(); // ❗️不要加 express.json()

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

async function handleEvent(event) {
  console.log('收到的 event：', JSON.stringify(event, null, 2));

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;

  const { error } = await supabase.from('messages').insert([
    {
      user_id: event.source.userId,
      content: userMessage
    }
  ]);

  if (error) {
    console.error('Supabase 儲存錯誤:', error);
  }

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



