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

## ポイント
- Apple APIから在庫をポーリング
- 在庫が「0->1」になった時のみ Discord に通知
- 在庫なしの場合は通知しない
