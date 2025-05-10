async function handleEvent(event) {
  const userId = event.source.userId;

  // 1. 綁定 Rich Menu
  await linkRichMenu(userId, DEFAULT_RICH_MENU_ID);

  // 2. 檢查是否是文字訊息
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.trim();

  // ✅ 新增：印出使用者訊息（用來除錯）
  console.log('👀 使用者傳來的訊息：', userMessage);

  // --- 關鍵字判斷（更靈活） ---
  const contains = (keywords) => keywords.some(kw => userMessage.includes(kw));

  // 3. 查詢「今日紀錄」
  if (contains(['查詢今日紀錄'])) {
    // ✅ 修改：使用 UTC 安全的查詢格式
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

    // 4. 查詢「本週紀錄」
    if (contains(['查詢本週紀錄'])) {
      // ✅ 修改：使用 UTC 安全的時間格式（避免查不到週日或週一的紀錄）
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
  

  // 5. 儲存訊息（含 created_at）
  const { error: insertError } = await supabase.from('messages').insert([
    {
      user_id: userId,
      content: userMessage,
      created_at: new Date().toISOString()
    }
  ]);
  if (insertError) {
    console.error('儲存訊息失敗:', insertError);
  }

  // 6. 回覆訊息
  try {
    return await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `你說的是：「${userMessage}」\n這句話我已經記起來了喔！`
    });
  } catch (err) {
    console.error('回覆失敗:', err);
  }
}

