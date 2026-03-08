# 01 As-Is Implemented Spec

## A. 事実（コード/文書根拠あり）

### A-1. 初期化とデータロード
- `Must` 起動時に `skillDatabase.json` を読み込み、失敗時は模擬データへフォールバックする。
  - 根拠: `js/globals.js:37`, `js/data-manager.js:4`, `js/data-manager.js:19`, `js/data-manager.js:25`
- `Must` スキルDBは `metadata` + `characters` 構造を持ち、実データは58キャラ/443スキル。
  - 根拠: `skillDatabase.json`, `tests/skill-database.test.js:14`, `tests/skill-database.test.js:58`

### A-2. パーティー編成
- `Must` 6枠のキャラ選択、初期SP入力、ターン経過ボーナス入力UIを動的生成する。
  - 根拠: `js/party-manager.js:16`, `js/party-manager.js:29`, `js/party-manager.js:33`
- `Must` キャラ重複選択をUIレベルで抑止する。
  - 根拠: `js/party-manager.js:95`, `js/party-manager.js:105`
- `Must` 編成確定時に `currentParty` を構築し、表示/結果ヘッダを更新する。
  - 根拠: `js/party-manager.js:141`, `js/party-manager.js:157`, `js/results-manager.js:4`

### A-3. 戦闘画面と操作
- `Must` 前衛3・後衛3の表示を持ち、カードクリックで「入れ替え」または「スキル選択」を切替処理する。
  - 根拠: `hbr_gui_simulator_modular.html:47`, `js/event-handlers.js:4`, `js/event-handlers.js:16`
- `Must` 前衛のみスキル選択対象とし、SP不足スキルは選択肢で無効化する。
  - 根拠: `js/event-handlers.js:212`, `js/event-handlers.js:230`
- `Should` 前衛カードにコスト0スキル（通常攻撃）をデフォルト設定する。
  - 根拠: `js/display-manager.js:41`, `js/control-manager.js:122`, `tests/skill-database.test.js:21`

### A-4. ターン実行/SP管理
- `Must` ターン実行はSPを即確定せずプレビューを `battleHistory` に保存し、次ターン遷移時にSP消費を確定する。
  - 根拠: `js/control-manager.js:26`, `js/control-manager.js:69`, `js/control-manager.js:97`, `js/control-manager.js:160`
- `Must` 次ターン時に `BASE_SP_RECOVERY + spBonus` を全員へ加算し、`MAX_SP` 上限を適用する。
  - 根拠: `js/globals.js:18`, `js/control-manager.js:109`, `js/control-manager.js:111`
- `Must` 前衛位置に対応する行動のみSP消費対象にする。
  - 根拠: `js/control-manager.js:162`, `tests/control-manager.test.js:107`

### A-5. 結果表示とテスト
- `Must` 結果はHTMLテーブルとして表示し、列は「ターン/敵行動/各キャラ 始・行動・終」で再描画する。
  - 根拠: `hbr_gui_simulator_modular.html:86`, `js/results-manager.js:24`, `js/results-manager.js:39`
- `Could` デバッグ用にヘッダ列幅情報を表示する。
  - 根拠: `hbr_gui_simulator_modular.html:81`, `js/results-manager.js:50`
- `Must` テスト基盤は Vitest + jsdom を利用し、SP計算とDB整合性を検証する。
  - 根拠: `package.json:7`, `package.json:13`, `tests/control-manager.test.js`, `tests/skill-database.test.js`

## B. 推測（再開発上の解釈）
- `Should` 現行実装は「UI主導の状態管理」で、ドメイン状態と表示状態が密結合しているため、再開発では状態遷移を先に分離すべき。
  - 根拠: `js/*.js` 全体（特に `js/control-manager.js`, `js/results-manager.js`）
- `Should` `battleHistory` は将来CSV/分析出力の基礎データ構造として再利用価値が高い。
  - 根拠: `js/control-manager.js:36`, `js/results-manager.js:30`, `README.md:224`
