const express = require('express');
const line = require('@line/bot-sdk');

// LINE 機器人設定
const config = {
  channelAccessToken: '***REMOVED***',
  channelSecret: '***REMOVED***'
};

const client = new line.Client(config);
const app = express();

app.use(express.json());

// webhook endpoint，加上錯誤處理
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results); // 回傳 200
  } catch (err) {
    console.error('處理 webhook 時出錯：', err);
    res.status(500).end(); // 回傳 500
  }
});

// 處理 LINE 傳來的訊息
function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const reply = {
      type: 'text',
      text: `你說的是：「${event.message.text}」\n這句話我已經記起來了喔！`
    };
    return client.replyMessage(event.replyToken, reply);
  }
  return Promise.resolve(null);
}

// 用 Render 提供的 PORT，不要硬寫 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`機器人正在監聽 port ${PORT}!`);
});


// 測試用註解：確認 Git 推送流程是否順利


