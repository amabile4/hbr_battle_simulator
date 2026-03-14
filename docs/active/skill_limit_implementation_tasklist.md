# Skill Usage Limits 実装タスクリスト（PRI-018）

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-14

## 目的

- `HealSkillUsedCount` 等、スキル使用回数回復効果の受け皿となる「使用回数管理」を完成させる
- 各スキルの最大使用可能回数（`limit`）を `turn-controller` / `scenario` で制限（validate）可能にする
- `SkillLimitCountUp` パッシブによる上限増加を適宜加味する
- UI 上で残弾 0 となったスキルを選択不可、あるいは warning として可視化し、シミュレータの「長期戦計画」機能としての価値を押し上げる

## 事前調査・前提

- 各スキル（`skill.json` の項目）には `limit` (最大使用可能回数) が定義されている（例：一部のスキルは 1〜4 回など）
- 回数上限を持たないスキルは `limit: 0` または未定義であることが多い
- `HealSkillUsedCount`（使用回数回復）や `SkillLimitCountUp`（使用回数上限アップ）の skill_type が存在し、パッシブ等を通じて発動する
- 既存の `record` や `turnState` で「既に何回使用したか」をトラッキングする仕組みを統合する必要がある（`PlayedSkillCount(...)` の履歴が流用できるか、あるいは独自の `usedSkillCounts` を状態に持たせるか検討する）

## 今回のスコープ

### やること

- [ ] **T01**: スキル固有の「最大使用可能回数（`limit`）」と、`SkillLimitCountUp` の補正を合算した動的な上限値算出ロジックの実装
- [ ] **T02**: 指定ターンの状態（`turnState` または `record` 履歴）から、「各スキルの消費済み回数」を正確に導出する仕組みの構築
- [ ] **T03**: `HealSkillUsedCount` による「消費済み回数の回復（減算）」処理の実装と記録（特定のスキル条件に合致する場合のみ回復するなど、対象の絞り込みも含む）
- [ ] **T04**: `turn-controller` の `previewTurn` および `scenario` の validation で、計算上の残弾が `0` 以下の場合にエラーとするハードリミットの導入
- [ ] **T05**: UI (dom-adapter) にて、選択キャラのスキル残弾が 0 の場合にセレクトボックスへの表示を無効化する（あるいは warning 表示する）対応

### やらないこと

- ダメージ計算の本体コア（`PRI-019` 以降へ回す）
- SP/DP等の消費以外の追加厳密化（すでに完了済み）

## 参照ファイル・関連コンポーネント

- `json/skills.json` (各スキルの `limit` 値の確認)
- `src/turn/turn-controller.js`
- `src/records/record-assembler.js`
- `src/contracts/interfaces.js`
- `src/ui/dom-adapter.js`

## 完了条件

- [ ] 限度回数が設定されたスキルを規定回数を超えて使用しようとした際に、シミュレーションがエラー（またはブロック）になる
- [ ] `HealSkillUsedCount` 系効果が発動した際に、消費済み回数が正しく回復し、再度スキル使用が可能になる
- [ ] UI で残弾 0 のスキルが見える化（または disabled 表示）される
- [ ] 全ての既存テストおよび追加の回数制限テストが PASS する
