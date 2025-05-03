const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: '***REMOVED***',
  channelSecret: '***REMOVED***'
};

const client = new line.Client(config);
const app = express();

// ⭐ 修正：使用 express.raw 處理原始請求體
app.post(
  '/webhook',
  express.raw({ type: '*/*' }),
  line.middleware(config),
  async (req, res) => {
    try {
      const events = req.body.events;
      const results = await Promise.all(events.map(handleEvent));
      res.json(results);
    } catch (err) {
      console.error('處理 webhook 時出錯：', err);
      res.status(500).end();
    }
  }
);

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

// ✅ Render 要用 process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`機器人正在監聽 port ${PORT}!`);
});

// 測試用註解：確認 Git 推送流程是否順利


