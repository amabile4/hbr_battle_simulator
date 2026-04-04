# T34 敵状態変化管理・表示 実装プラン/WBS

> ステータス: 🟢 進行中
> 作成日: 2026-04-05
> 最終更新: 2026-04-05
> 親タスク: [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)

## 進捗チェック

- [x] T34 を単一 backlog の最優先へ昇格
- [x] T34 の実行順（設計→実装→表示→テスト）を確定
- [x] T34 専用プラン/WBS文書を作成
- [x] 親タスクと docs/README に参照導線を追加
- [ ] WBS-1 設計: 敵 status モデル整理
- [ ] WBS-2 実装: replay/再計算接続
- [ ] WBS-3 実装: UI表示（turn row/popup/enemy UI）
- [ ] WBS-4 テスト: unit/integration/e2e
- [ ] WBS-5 受け入れ検証

## 目的

T34 の最優先タスクとして、敵側の状態変化（バフ/デバフ）を以下の観点で一貫管理する。

- engine で付与/更新/消滅が再現可能
- replay/再計算で同一結果を再生可能
- UI で残ターンを含めて可視化可能
- unit/integration/e2e で回帰を固定可能

## スコープ

実装対象:

- 敵側 status effect データモデルの正規化
- turn/replay 経路での付与/更新/消滅
- UI Next での敵状態表示
- テスト整備（unit/integration/e2e）

スコープ外:

- 新しいゲーム仕様（未定義の新規 effectType）追加
- 旧 UI (`dom_adapter`) の parity 対応
- 既存仕様を変える挙動変更

## 前提と依存

- 主実装対象は `ui-next/`
- 既存の generic enemy status 基盤は活用し、UI 層で補正しない
- `PRI-018` の Cover 意味差分（enemy status / player-side status）は本タスク内で設計判断を明文化する

関連ドキュメント:

- [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md)
- [implementation_priority_tasklist.md](implementation_priority_tasklist.md)
- [stage_setup_gimmick_pattern_analysis.md](stage_setup_gimmick_pattern_analysis.md)
- [passive_implementation_tasklist.md](passive_implementation_tasklist.md)

## 実行順（確定）

1. データモデル整理
2. replay/再計算への接続
3. UI 表示実装
4. 表示成立性の確認
5. テスト追加
6. 受け入れ検証（付与/更新/消滅）

## 詳細WBS

### WBS-1 設計: 敵 status モデル整理

目的:

- 敵 status の最小必要フィールドを確定し、保存場所を一意化する

作業:

- `enemyState` 配下の status 保存形式を確認
- status の必須フィールドを定義
  - `statusType`
  - `remaining` or `duration`
  - `source` (`skill`/`passive`/`stage`)
  - `effectId`（同一種識別用）
  - `metadata`（必要最小限）
- Cover の扱いを仕様上で明示
  - enemy status として扱うケース
  - player-side self status/buff として扱うケース

完了条件:

- モデル仕様が文書化され、実装参照元が一意に決まっている

### WBS-2 実装: replay/再計算接続

目的:

- commit/replay/recalculate で敵 status の結果が一致する

作業:

- `turn-controller` の付与/更新/消滅経路を一本化
- `record`/`snapshot` に必要な enemy status 断面を保存
- `recalculateFrom` 実行で敵 status が再構築されるように接続
- 既存の `PlayerTurnEnd`/敵行動境界での tick を再確認

完了条件:

- 同一 ReplayScript で再計算前後の enemy status が一致する

### WBS-3 実装: UI 表示（turn row/popup/enemy UI）

目的:

- UI 上で敵バフ/デバフと残ターンが確認できる

作業:

- 表示面の優先順位を固定
  - turn row: 要約表示
  - 詳細 popup: 全件表示
  - enemy setup/詳細 panel: 現在値表示
- アイコン/ラベル/残ターン表示のフォーマット統一
- 表示上限と省略ルールを定義（過密防止）

完了条件:

- 主要画面で状態確認が可能、情報欠落がない

### WBS-4 テスト: unit/integration/e2e

目的:

- 変更を回帰可能な形で固定する

作業:

- unit
  - status 付与/更新/消滅の純ロジック
  - 表示フォーマット
- integration
  - commit -> record -> replay の整合
  - 再計算時の一致
- e2e
  - fixture 読込後に UI 表示が一致
  - commit 後の残ターン更新が一致

完了条件:

- 該当テストが green
- 既存関連テストを壊さない

### WBS-5 受け入れ検証

目的:

- 「付与/更新/消滅」が実運用で成立することを確定

作業:

- 代表ケースを 3 区分で実施
  - 付与されること
  - ターン進行で更新されること
  - 条件で消滅すること
- Cover を含むケースで仕様逸脱がないことを確認

完了条件:

- T34 の 6 項目を [ui_next_unimplemented_tasklist.md](ui_next_unimplemented_tasklist.md) で完了化可能

## 対象ファイル候補

engine/replay:

- `src/turn/turn-controller.js`
- `src/records/*`
- `ui-next/engine/turn-engine-manager.js`

ui:

- `ui-next/components/turn-row.js`
- `ui-next/components/*enemy*`
- `ui-next/utils/*status*`

tests:

- `tests/turn-state-transitions.test.js`
- `tests/ui-next-*.test.js`
- `tests/e2e/*.spec.js`
- `tests/e2e/fixtures/*.json`

## リスクと対策

- リスク: Cover の意味差分で仕様がぶれる
  - 対策: WBS-1 で先に設計判断を固定し、テスト名に明示
- リスク: 表示実装が engine 差分を隠す
  - 対策: engine 断面の integration テストを先に追加
- リスク: e2e fixture と runtime の乖離
  - 対策: fixture 生成元を 1 つに統一し、テストで断面比較

## AIレビュー用チェックリスト

### レビュー観点A（設計）

- enemy status の保存先は一意か
- status identity（effectId等）は衝突しないか
- Cover の仕様分岐は明文化されているか

### レビュー観点B（実装）

- commit/replay/recalculate で同じ結果になるか
- UI 層で推測補正していないか
- 既存の tick/expiry と矛盾していないか

### レビュー観点C（テスト）

- 付与/更新/消滅をそれぞれ検証しているか
- e2e が表示だけでなく状態遷移を検証しているか
- 既存関連テストに回帰がないか

## AIレビュー依頼テンプレート

以下を他 AI に渡してレビュー依頼できる。

1. 対象: T34 実装差分（engine/replay/UI/tests）
2. 観点: 設計整合、replay整合、UI表示整合、テスト十分性
3. 必須確認:
   - enemy status の単一ソース化
   - Cover 仕様の整合
   - commit/recalculate 同値性
4. 出力形式:
   - Critical/Major/Minor で指摘
   - 再現手順
   - 最小修正案

## 進め方（短期）

- Day 1: WBS-1 設計確定 + unit 下書き
- Day 2: WBS-2 実装 + integration
- Day 3: WBS-3 UI + e2e
- Day 4: WBS-4/WBS-5 仕上げ + docs 反映
