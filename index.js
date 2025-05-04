const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

// Line 設定
const config = {
  channelAccessToken: '***REMOVED***',
  channelSecret: '***REMOVED***'
};
const client = new line.Client(config);

// Supabase 設定
const supabase = createClient(
  'https://fjavortirkzrxyfauvwx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqYXZvcnRpcmt6cnh5ZmF1dnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyODk4NDksImV4cCI6MjA2MTg2NTg0OX0.GWcICDpFWwJJCBJCG04ZzT4pIHjWenwtSF_iE3cyLao'
);

const app = express();
app.use(express.json());

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

  // 儲存到 Supabase
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

// 測試用註解：確認 Git 推送流程是否順利


