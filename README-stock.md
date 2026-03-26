# iPhone 在庫通知（Discord）

## 使い方

1. Discord webhook URL を発行して、環境変数 `DISCORD_WEBHOOK_URL` に設定
2. `iphone-stock-notify.js` の `products` 部分を実際の Apple part number に置き換える
3. `node iphone-stock-notify.js`

### Railway で実行
- Railway にこのリポジトリをデプロイ（GitHubからインポート）
- 環境変数を設定:
  - `DISCORD_WEBHOOK_URL`: Discord webhook URL
  - `CHECK_INTERVAL_MS`: チェック間隔（デフォルト 2分 = 120000ms）
- 起動コマンド: `node iphone-stock-notify.js`

#### Railway 環境変数の設定方法
1. Railway ダッシュボードにログイン
2. プロジェクトを選択
3. 「Settings」タブ → 「Variables」セクション
4. 「Add Variable」ボタンをクリック
5. 以下の変数を追加:
   - Name: `DISCORD_WEBHOOK_URL`
   - Value: `https://discordapp.com/api/webhooks/1485127631971291155/1rjEwhpEqVoTFWk0Fw8iH8uGKjGEgUuronOLwragV3KoAvQy90wOZ28L7hQK1732cqaI`
   - Name: `CHECK_INTERVAL_MS`
   - Value: `120000`
6. 「Save」ボタンをクリック

## ポイント
- Apple APIから在庫をポーリング
- 在庫が「0->1」になった時のみ Discord に通知
- 在庫なしの場合は通知しない
