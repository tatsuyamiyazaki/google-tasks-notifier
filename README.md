# Google Tasks Notifier

Google ToDo リスト（Google Tasks）の**新規追加・内容更新**を検知し、Slack に通知する [Google Apps Script](https://developers.google.com/apps-script) プロジェクトです。

定期実行トリガーで**すべてのタスクリスト**の未完了タスクを監視し、前回の状態をスプレッドシートに保存しておくことで、差分を検知して Slack へ投稿します。

## 機能

- すべてのタスクリストの**未完了タスク**を定期的に取得
- スプレッドシートを状態保存ストア（簡易DB）として利用し、前回実行時との差分を比較
- 検知した変更を Slack の Incoming Webhook（Block Kit メッセージ）で通知
  - `[TASK_NEW]` 新規タスクの作成
  - `[TASK_UPDATED]` 既存タスクの**タイトル・期限・メモ**のいずれかが変更されたとき
- 各通知にはリスト名・タイトル・ステータス・期限・メモを含む
- 完了または削除されたタスクはスプレッドシートの保存データから自動削除
- 初回実行時は通知せず、現在の状態をスプレッドシートに記録するだけ（大量通知の防止）

## 仕組み

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────┐
│ Google Tasks │ ───▶ │  Apps Script     │ ───▶ │    Slack    │
│ (全タスクリスト)│      │ (checkGoogleTasks)│      │  (Webhook)  │
└──────────────┘      └────────┬─────────┘      └─────────────┘
                               │ 前回状態の読み書き
                               ▼
                      ┌──────────────────┐
                      │  Spreadsheet     │
                      │ (状態保存シート)  │
                      └──────────────────┘
```

1. スクリプトプロパティから設定値を読み込む
2. すべてのタスクリストを取得し、各リストの未完了タスクを収集
3. スプレッドシートから前回の状態を読み込む
4. タスクごとに差分を比較し、新規タスク・更新タスクを Slack に通知
5. 完了・削除されたタスク（今回の取得に含まれないタスク）を状態から除外し、最新の状態をスプレッドシートに一括で書き戻す

## ファイル構成

| ファイル | 説明 |
| --- | --- |
| `code.js` | メインスクリプト。`checkGoogleTasks()` と `notifySlack()` を定義 |
| `appsscript.json` | Apps Script のマニフェスト（タイムゾーン・依存サービス等） |
| `.clasp.json` | [clasp](https://github.com/google/clasp) によるローカル管理用設定 |
| `LICENSE` | ライセンス（MIT） |

## セットアップ

### 1. 前提

- Google アカウント
- 状態保存用の Google スプレッドシート
- Slack の [Incoming Webhook URL](https://api.slack.com/messaging/webhooks)
- （ローカル開発する場合）[clasp](https://github.com/google/clasp) と Node.js

### 2. スプレッドシートの準備

状態保存用のシートを用意し、1 行目に以下のヘッダーを設定します（2 行目以降にデータが書き込まれます）。

| A | B | C | D | E | F | G |
| --- | --- | --- | --- | --- | --- | --- |
| ID | ListName | Title | Status | Due | Notes | Updated |

### 3. Advanced Google Service の有効化

`appsscript.json` で **Google Tasks API（Advanced Service）** を利用しています。`clasp` でデプロイする場合は同梱の設定がそのまま適用されますが、エディタ上で作成する場合は「サービス」から **Tasks API** を追加してください。

> Google Cloud プロジェクト側でも Tasks API を有効化しておく必要があります。

### 4. スクリプトプロパティの設定

Apps Script エディタの「プロジェクトの設定 → スクリプト プロパティ」に以下を登録します。

| プロパティ名 | 説明 | 例 |
| --- | --- | --- |
| `SLACK_WEBHOOK_URL` | Slack の Incoming Webhook URL | `https://hooks.slack.com/services/...` |
| `SPREADSHEET_ID` | 状態保存用スプレッドシートの ID | `1AbC...xyz` |
| `SHEET_NAME` | 状態を保存するシート名 | `tasks` |

> Webhook URL などの秘匿情報はコードに直接埋め込まず、必ずスクリプトプロパティで管理してください。

### 5. トリガーの設定

`checkGoogleTasks` を定期実行するトリガーを設定します。

1. Apps Script エディタの「トリガー」を開く
2. 「トリガーを追加」をクリック
3. 実行する関数: `checkGoogleTasks`
4. イベントのソース: 時間主導型
5. 任意の間隔（例: 5 分 / 15 分おき）を設定

## ローカル開発（clasp）

```bash
# clasp のインストール
npm install -g @google/clasp

# Google アカウントでログイン
clasp login

# リモートのコードを取得
clasp pull

# ローカルの変更をプッシュ
clasp push
```

`.clasp.json` の `scriptId` が対象の Apps Script プロジェクトを指しています。

## 通知例

新規タスク作成時:

```
[TASK_NEW]
リスト: 仕事
タイトル: 買い物リストを作る
ステータス: needsAction
期限: 2026-06-30
メモ: なし
```

既存タスク更新時（タイトル・期限・メモのいずれかが変更されたとき）:

```
[TASK_UPDATED]
リスト: 仕事
タイトル: 買い物リストを作る（牛乳を追加）
ステータス: needsAction
期限: 2026-07-01
メモ: スーパーで購入
```

## 注意事項

- **すべてのタスクリスト**の未完了タスクが監視対象です。完了済みタスクは取得しません（`showCompleted: false`）。
- 通知されるのは**新規タスクの作成**と、既存タスクの**タイトル・期限・メモ**の変更です。ステータスのみの変更は更新通知の対象外です。
- タスクを**完了・削除**すると、今回の取得結果に含まれなくなるため、スプレッドシートの保存データからも除外されます（再追加されると新規タスクとして再通知されます）。
- 各タスクリストの 1 回の取得上限は `maxResults: 100` です。タスク数が多い場合は調整してください。

## ライセンス

[MIT License](LICENSE) © 2026 t-miyazaki
