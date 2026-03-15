# UI Next 実装タスクリスト

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-15
>
> **前提設計**:
> [ui_next_design.md](ui_next_design.md)
>
> **参考モック / レイアウト資料**:
> [ui_next_gui_design_spec.md](ui_next_gui_design_spec.md)

## 目的

- 新 UI の作業範囲を既存 UI / engine 改修から切り分ける
- style 画像付きの新しい party 操作体験を段階的に構築する
- D&D による position 編集を中核導線として実装する

## 実装原則

1. 新 UI は別ページとして実装する
2. 既存 UI の DOM 構造を前提にしない
3. 共有できるものだけを `main` に戻す
4. engine bugfix を新 UI branch の正本にしない
5. docs は設計と実装進捗を分けて管理する

## タスク

### T01: 新 UI の entry 作成

- [ ] `ui-next/` の entry files を作成する
- [ ] 新 UI 用の最小表示ページを表示できるようにする
- [ ] 既存 `ui/index.html` に影響を与えないことを確認する

完了条件:

- 新 UI の空ページが独立して開ける

### T02: style 画像表示基盤

- [ ] `resolveStyleImageUrl()` を使って style 画像を描画する
- [ ] 画像未設定時の fallback 表示を決める
- [ ] slot card に style 名 / character 名の最小情報を表示する

完了条件:

- 6 slot の style card が style 画像つきで描画できる

### T03: party / position 表示

- [ ] 前衛 / 後衛を視覚的に分ける
- [ ] slot index と commit 時 position の対応を UI 上で明確にする
- [ ] 選択中 slot の強調表示を入れる

完了条件:

- 6 slot の位置関係が UI だけで判断できる

### T04: D&D による position 入れ替え

- [ ] slot の drag start / hover / drop を実装する
- [ ] ドロップ時に slot 単位で style を入れ替える
- [ ] accidental drag を減らすための最小ガードを入れる

完了条件:

- style card をドラッグして position を入れ替えられる

### T05: style 選択導線

- [ ] style 選択 UI を追加する
- [ ] style 変更時に画像・style 名・character 名が更新される
- [ ] position 編集と style 編集が競合しないようにする

完了条件:

- slot ごとに style を差し替えられる

### T06: engine bridge の最小接続

- [ ] `HbrDataStore` 読み込みを新 UI entry から接続する
- [ ] 6 slot の表示状態を party / battle state と同期できるようにする
- [ ] 初期 battle state の生成まで接続する

完了条件:

- 新 UI から battle state の初期化まで到達できる

### T07: replay/edit 連携方針の固定

- [ ] 新 UI が `ReplayScript` を直接編集するかを決める
- [ ] turn / slots / operations / note のうち、初回で扱う範囲を固定する
- [ ] 旧編集 UI と新 UI の責務境界を整理する

完了条件:

- 新 UI がどこまで編集対象を持つか文書で固定されている

### T08: 新 UI 初回リリースの最低ライン

- [ ] 6 slot 表示
- [ ] D&D 入れ替え
- [ ] style 画像描画
- [ ] 初期化導線
- [ ] 最低限の error 表示

完了条件:

- 「style 画像つきで party を並べ替えられる新ページ」が成立している

## メモ

- engine bugfix が必要になった場合は、原則 `main` を経由して取り込む
- UI Next 側だけで必要な試験実装は、新 UI 専用ロジックへ閉じ込める
- 共有 asset / resolver / contract は `main` に戻しやすい粒度を維持する
