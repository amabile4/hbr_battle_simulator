# Setup パネル レイアウト改善 & ロード高速化 タスクリスト

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-29 | 🔄 最終更新: 2026-03-29
>
> **ブランチ**: `feature/ui-next-layout-rework`
>
> **進捗サマリー**: L01〜L04 ✅ 完了 / P01 ✅ / P02 ✅ / P03 ❌

## 目的

- 右サイドバー（setup-area）の設定タブを使いやすく・コンパクトにする
- 画面ロード時の Party タブ初期表示を高速化する

---

## L: レイアウト改善タスク

### L01: タブ名の短縮

- [x] `Party Setup` → `Party`
- [x] `Enemy Setup` → `Enemy`
- [x] `Stage Setup` → `Stage`
- [x] `Simulator Settings` → `Global`

> ✅ L01 完了（2026-03-29）: `initial-setup.js` の TABS 定数と `#switchTab` を変更。

---

### L02: タブボタン高さの削減

- [x] タブボタンの縦パディングを `py-2.5` → `py-1.5` に変更
- [x] `#switchTab` でのクラス再付与にも同様に反映

> ✅ L02 完了（2026-03-29）: mount テンプレートと `#switchTab` の両方を変更。

---

### L03: 設定反映/戦闘開始ボタンの全タブ共通化

- [x] フッター（`↺ 設定を反映` / `▶ 戦闘開始` / ヒント）を Party タブ content div の外に移動
- [x] 全タブ共通の `shrink-0` フッターとして全タブコンテンツの後に配置
- [x] `data-tab-content="party"` を `overflow-y-auto` + `party-setup-root` のみのシンプルな構造に変更

完了条件:
- [x] Enemy / Stage / Global タブに切り替えても戦闘開始ボタンが表示される
- [x] Party タブのフッターが消えていない

> ✅ L03 完了（2026-03-29）: `#updateFooterButtons()` / `#applyBtn` / `#recalcBtn` の参照は `#root.querySelector` なので移動後も動作に変化なし。

---

### L04: 前衛ラベルと PT解散ボタンの同行配置

- [x] `party-setup.js` の `#render()` で PT解散ボタンを単独行から「前衛」ラベルの右側に移動
- [x] `flex items-center justify-between` で同行配置、縦幅を1行分削減
- [x] PT解散ボタンの縦パディングを `py-1` → `py-0.5` に調整

> ✅ L04 完了（2026-03-29）: `party-setup.js` の `#render()` テンプレートを変更。イベントリスナー登録コード（`disband-party`）に変更なし。

---

## P: ロード高速化タスク

> **背景**: `styles.json`（10 MB）を含む 9 ファイルの `Promise.all()` fetch が完了するまで Party タブが一切表示されない。詳細分析は調査ログを参照。

### P01: `<link rel="preload">` の追加 ★低コスト

- [x] `index.html` に主要 JSON ファイルの preload hint を追加
  ```html
  <link rel="preload" href="../json/styles.json" as="fetch" crossorigin>
  <link rel="preload" href="../json/skills.json" as="fetch" crossorigin>
  <link rel="preload" href="../json/passives.json" as="fetch" crossorigin>
  <link rel="preload" href="../json/characters.json" as="fetch" crossorigin>
  <link rel="preload" href="../json/accessories.json" as="fetch" crossorigin>
  ```
- [ ] ブラウザの DevTools Network タブで fetch 開始タイミングが早まることを確認

完了条件:
- [ ] `app.js` の実行開始より前に fetch が始まっている（Network ウォーターフォール確認）

> ✅ P01 完了（2026-03-29）: `index.html` の `<head>` に 5 ファイル分の preload hint を追加。styles.json/skills.json/passives.json/characters.json/accessories.json を対象。

**工数**: 5分 / **効果**: 数百ms削減

---

### P02: Cache API による JSON キャッシュ ★2回目以降を瞬時化

- [x] `app.js` の `fetchJson()` を Cache API ラッパーに差し替える
  - `caches.open('hbr-data-v1')` でキャッシュストアを開く
  - cache hit 時は `cache.match()` から即時返却
  - cache miss 時は fetch して `cache.put()` で保存
- [x] キャッシュキー（バージョン文字列）を定数として管理し、JSON更新時に上げる運用にする
- [ ] 動作確認: 初回ロード後にオフラインでリロードしても表示されること

完了条件:
- [ ] 2回目以降のロードで Network タブに JSON fetch が出ない（キャッシュから配信）
- [ ] `hbr-data-v1` → `hbr-data-v2` にキャッシュキーを変えると強制リフレッシュされる

> ✅ P02 完了（2026-03-29）: `app.js` に `HBR_CACHE_VERSION = 'hbr-data-v1'` 定数を追加し、`fetchJson()` を Cache API ラッパーに変更。`file:` プロトコル時は既存 `import()` パスを維持。Response は `.clone()` してキャッシュ保存。

**工数**: 30〜60分 / **効果**: 2回目以降のロードがほぼ瞬時（< 500ms）

---

### P03: UI 先行描画（store lazy injection） ★初回から即表示

> ⚠️ 設計変更を伴う中〜大規模タスク。P01/P02 を先に入れてから着手を推奨。

- [ ] `InitialSetupController.mount()` を `await Promise.all()` の前に呼べるよう、`store` を constructor から切り離す
  - `setStore(store)` メソッドを追加
  - store なし状態での mount → 空スロット（disabled）表示
- [ ] `PartySetupController` も同様に `setStore(store)` を追加
  - store なし時は `open-picker` / `open-skill-settings` ボタンを disabled にする
  - store 注入後に `#render()` を再実行して活性化
- [ ] `app.js` の初期化順序を変更:
  1. `InitialSetup.mount()` + `PartySetup.mount()`（空状態）← fetch 前に移動
  2. `await Promise.all([...])` ← バックグラウンドで fetch
  3. `store = HbrDataStore.fromRawData(...)`
  4. `initialSetup.setStore(store)` で活性化

完了条件:
- [ ] ページロード直後（JSON fetch 完了前）に Party タブの空スロットが表示される
- [ ] JSON fetch 完了後にキャラクター選択ボタンが有効化される
- [ ] 戦闘開始ボタンは store 活性化後も引き続き正常動作する

**工数**: 3〜6時間 / **効果**: 初回から Party タブが即表示（ロード体感が大幅改善）
