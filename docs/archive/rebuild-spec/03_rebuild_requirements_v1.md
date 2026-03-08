# 03 Rebuild Requirements v1

## 1. 前提
- 事実起点: 現行実装の動作と既存README要求の共通部分を基礎とする。
- 推測起点: 実装欠落分は再開発可能なレベルで正規化する。

## 2. 機能要件（v1）

### R-01 バトル状態エンジン
- `Must` `BattleState` でターン、配置、行動、SP、特殊ターン状態を単一管理する。
  - 根拠: `js/globals.js`, `js/control-manager.js`, `README.md:163`
- `Must` 状態更新は純粋関数（例: `applyTurn`, `applySwap`, `applySkillAction`）で定義する。
  - 根拠: `js/control-manager.js` がUIと状態更新を混在

### R-02 ターン種別
- `Must` ターン種別を `normal | od | extra` として保持し、表示ラベル（OD1/追加1等）を生成可能にする。
  - 根拠: `README.md:176`, `README.md:182`, `README.md:256`
- `Must` OD段階ごとのSP回復と追加行動回数をルール化する。
  - 根拠: `README.md:142`

### R-03 SP計算
- `Must` SP計算をイベント列で実行し、`source`（base/passive/active/od/cost）を保持する。
  - 根拠: `README.md:152`, `README.md:156`, `js/control-manager.js:160`
- `Should` 前衛/後衛条件、他者付与、上限/下限処理の優先順を仕様化する。
  - 根拠: `README.md:119`, `README.md:124`, `README.md:110`

### R-04 配置交代
- `Must` 通常/OD/追加ターンで交代可能範囲を分岐し、違反操作を拒否する。
  - 根拠: `README.md:186`, `README.md:190`, `js/event-handlers.js:56`
- `Should` 交代後の行動整合（誰のスキル選択か）を再評価する。
  - 根拠: `js/event-handlers.js:121`, `js/control-manager.js:170`

### R-05 出力
- `Must` 結果テーブル表示に加えてCSVエクスポート機能を提供する。
  - 根拠: `README.md:22`, `README.md:240`, `js/results-manager.js:24`
- `Must` CSVに3行ヘッダ/ターンラベル/6人×(始,行動,終)を出力する。
  - 根拠: `README.md:246`, `README.md:253`, `README.md:261`

### R-06 テスト
- `Must` SP計算・ターン遷移・CSVスナップショット・DB整合性テストを自動化する。
  - 根拠: `tests/control-manager.test.js`, `tests/skill-database.test.js`
- `Could` 主要シナリオのE2E（ブラウザ操作）を追加する。
  - 根拠: 現行はユニット中心

## 3. 完成判定（この仕様でゼロから作れるか）
- 判定: **条件付きで可能（Not Ready for full lock）**
- 不足一覧:
  1. `Must` OD/追加ターンの厳密遷移表（開始条件、終了条件、重複時優先）
  2. `Must` パッシブ/特性の効果データモデル（対象範囲、発火タイミング、重複）
  3. `Must` CSV列仕様の最終確定（敵行動、バフ欄、空白列の扱い）
  4. `Should` バフ/デバフ辞書と継続ターン計算ルール
