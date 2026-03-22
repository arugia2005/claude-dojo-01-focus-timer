# iPhone 在庫通知（LINE）

## 使い方

1. `LINE_NOTIFY_TOKEN` を発行して、環境変数に設定
2. `iphone-stock-notify.js` の `products` 部分を実際の Apple part number に置き換える
3. `node iphone-stock-notify.js`

### Railway で実行
- Railway にこのリポジトリをデプロイ
- `LINE_NOTIFY_TOKEN` を環境変数に登録
- `CHECK_INTERVAL_MS` をオプションで設定（3分程度）
- 起動コマンド: `node iphone-stock-notify.js`

## ポイント
- Apple APIから在庫をポーリング
- 在庫が「0->1」になった時のみ LINE に通知
- 在庫なしの場合は通知しない
