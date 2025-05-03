const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

// ⬇️ 請把這兩個值換成你自己的 Supabase 資訊
const supabaseUrl = 'https://fjavortirkzrxyfauvwx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqYXZvcnRpcmt6cnh5ZmF1dnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyODk4NDksImV4cCI6MjA2MTg2NTg0OX0.GWcICDpFWwJJCBJCG04ZzT4pIHjWenwtSF_iE3cyLao';
const supabase = createClient(supabaseUrl, supabaseKey);

// LINE 設定
const config = {
  channelAccessToken: '***REMOVED***',
  channelSecret: '***REMOVED***'
};

const client = new line.Client(config);
const app = express();
app.use(express.json());

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  try {
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (error) {
    console.error('處理 webhook 時發生錯誤：', error);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    // ⬇️ 把訊息存到 Supabase
    const { error } = await supabase.from('messages').insert([
      {
        user_id: event.source.userId,
        message: event.message.text,
      }
    ]);
    if (error) {
      console.error('儲存訊息時出錯：', error);
    }

    // ⬇️ 回覆訊息
    const reply = {
      type: 'text',
      text: `你說的是：「${event.message.text}」\n這句話我已經記起來了喔！`
    };
    return client.replyMessage(event.replyToken, reply);
  }
  return Promise.resolve(null);
}

app.listen(process.env.PORT || 3000, () => {
  console.log('機器人正在監聽 port 3000!');
});

// 測試用註解：確認 Git 推送流程是否順利


