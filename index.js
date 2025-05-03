const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: '***REMOVED***',
  channelSecret: '5c699f1ece44e1986f0f612184a4354e'
};

const app = express();
app.use(express.json());
app.post('/webhook', line.middleware(config), (req, res) => {
  const events = req.body.events;
  Promise.all(events.map(handleEvent)).then(result => res.json(result));
});

function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const reply = {
      type: 'text',
      text: '你說的是：「' + event.message.text + '」\n這句話我已經記起來了喔！'
    };
    return client.replyMessage(event.replyToken, reply);
  }
  return Promise.resolve(null);
}

const client = new line.Client(config);
app.listen(3000, () => {
  console.log('機器人正在監聽 port 3000!');
});
// 測試用註解：確認 Git 推送流程是否順利

