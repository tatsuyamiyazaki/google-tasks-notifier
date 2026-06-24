const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();

function checkGoogleTasks() {
  const spreadsheetId = SCRIPT_PROPERTIES.getProperty('SPREADSHEET_ID');
  const sheetName = SCRIPT_PROPERTIES.getProperty('SHEET_NAME');

  if (!spreadsheetId || !sheetName) {
    console.error('必要なスクリプトプロパティ（SPREADSHEET_ID, SHEET_NAME）が設定されていません。');
    return;
  }

  // 1. 全てのタスクリストを取得
  const taskLists = Tasks.Tasklists.list();
  if (!taskLists.items) return;

  // 2. 全タスクリストからタスクを収集（未完了のみ）
  const allTasks = [];
  taskLists.items.forEach(taskList => {
    const tasks = Tasks.Tasks.list(taskList.id, {
      showCompleted: false, // 完了タスクは無視
      maxResults: 100
    });

    if (tasks.items) {
      tasks.items.forEach(task => {
        allTasks.push({
          id: task.id,
          listName: taskList.title,
          title: task.title || 'タイトルなし',
          status: task.status,
          // 期限は YYYY-MM-DD 形式で抽出（存在しない場合は空文字）
          due: task.due ? task.due.substring(0, 10) : '',
          notes: task.notes || '',
          updated: task.updated
        });
      });
    }
  });

  if (allTasks.length === 0) return;

  // 3. スプレッドシートから現在の全データを取得（7列分）
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) {
    console.error(`シート名「${sheetName}」が見つかりません。`);
    return;
  }
  
  const lastRow = sheet.getLastRow();
  const previousState = {};
  
  if (lastRow > 1) {
    // 7列（A〜G列）を取得
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
    data.forEach(row => {
      const [id, listName, title, status, due, notes, updated] = row;
      if (id) {
        previousState[id] = { listName, title, status, due, notes, updated };
      }
    });
  }

  const isFirstRun = Object.keys(previousState).length === 0;
  const currentState = { ...previousState };

  // 4. 差分の比較と状態の更新
  allTasks.forEach(task => {
    const prev = previousState[task.id];

    // 最新の状態で上書き
    currentState[task.id] = {
      listName: task.listName,
      title: task.title,
      status: task.status,
      due: task.due,
      notes: task.notes,
      updated: task.updated
    };

    if (!isFirstRun) {
      if (!prev) {
        // 新規タスク
        notifySlack(task, 'NEW');
      } else {
        // 更新チェック（タイトル、期限、メモのいずれかが変わっていればUPDATED）
        const isUpdated = 
          prev.title !== task.title || 
          prev.due !== task.due || 
          prev.notes !== task.notes;

        if (isUpdated) {
          notifySlack(task, 'UPDATED');
        }
      }
    }
  });

  // アプリ側で完了（または削除）されたタスクをDBから消去
  const activeTaskIds = allTasks.map(t => t.id);
  for (const id in currentState) {
    if (!activeTaskIds.includes(id)) {
      delete currentState[id];
    }
  }

  // 5. 最新の状態をスプレッドシートに一括書き戻し
  const outputData = [];
  for (const id in currentState) {
    const t = currentState[id];
    outputData.push([id, t.listName, t.title, t.status, t.due, t.notes, t.updated]);
  }

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 7).clearContent();
  }

  if (outputData.length > 0) {
    // 7列分のデータを書き込み
    sheet.getRange(2, 1, outputData.length, 7).setValues(outputData);
  }
}

// ご提示いただいた関数をベースに構築
function notifySlack(task, changeType) {
  // WebhookURLはスクリプトプロパティから取得するように調整
  const webhookUrl = SCRIPT_PROPERTIES.getProperty('SLACK_WEBHOOK_URL');
  if (!webhookUrl) return;

  const message = {
    text: `[TASK_${changeType}] ${task.title}`, // 通知ポップアップ用のテキスト
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          // どのリストのタスクか分かるように listName も追加しています
          text: `*[TASK_${changeType}]*\n*リスト:* ${task.listName}\n*タイトル:* ${task.title}\n*ステータス:* ${task.status}\n*期限:* ${task.due || '未設定'}\n*メモ:* ${task.notes || 'なし'}`
        }
      }
    ]
  };

  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(message)
  });
}