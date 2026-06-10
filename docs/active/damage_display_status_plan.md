# damage_display_status_plan

- ステータス: 🟢 進行中
- 作成日: 2026-06-10
- 最終更新: 2026-06-10
- 対象: `ui-next` の威力詳細タブ / 敵詳細ポップアップ

## 1. 目的

以下を「簡素な表示」で追加する。

1. 威力詳細タブ
- 現時点DP / DP MAX
- 現時点HP / HP MAX
- 現時点の破壊率 / 破壊率MAX

2. 敵詳細ポップアップ
- 現時点DP / DP MAX
- 現時点HP / HP MAX
- 現時点の破壊率 / 破壊率MAX

## 2. 現状

### 2.1 既存表示

- 威力詳細タブ
  - 非クリDP/クリDP、非クリHP/クリHP は表示済み
  - 現在破壊率の表示あり
  - 破壊率（入力）→ このスキル後 の表示あり
- 敵詳細ポップアップ
  - `HPゲージ remaining/total`（extra gauge）表示あり
  - `最大D率` 表示あり

### 2.2 データの可用性

- DP
  - `enemyDpByEnemy`（DP MAX）あり
  - `remainingDpByEnemy`（現DP）あり
- 破壊率
  - `destructionRateByEnemy`（現破壊率）あり
  - `destructionRateCapByEnemy`（破壊率MAX）あり
- HP
  - `extraHpGaugeStateByEnemy`（remaining/total）はあり
  - 通常HPの `current/max` を全敵共通で持つ正式状態は現時点で未統一

## 3. 表示仕様（提案）

## 3.1 共通フォーマット

- DP: `current / max`
- HP: `current / max`（extra gauge がある場合）
- 破壊率: `current% / cap%`

## 3.2 値がない場合

- DP: `-`
- HP:
  - extra gauge あり: `remaining / total`
  - extra gauge なし: `N/A`
- 破壊率: `100.00% / cap%` を既定値として表示（cap不明なら `300%`）

## 3.3 最小UI変更

- 既存の情報ブロックに1行ずつ追加
- 表示順
  1. DP
  2. HP
  3. 破壊率

## 4. 実装方針

## 4.1 威力詳細タブ (`ui-next/utils/char-detail-popup.js`)

1. `damageCalculationActionModels` に `enemyStateSnapshot` を追加して渡す
2. `resolveDamageCalculatorEnemyAdapter` で以下を解決
- `dpCurrent`, `dpMax`
- `hpCurrent`, `hpMax`（extra gauge ベース）
- `destructionRateCurrent`, `destructionRateCap`
3. `buildDamageCalculatorPaneHtml` に表示項目追加
4. `updateDamageCalculatorPane` で表示値更新

## 4.2 敵詳細ポップアップ (`ui-next/components/enemy-detail-popup.js`)

1. `#buildEnemyEntries()` へ `dpCurrent/dpMax`, `destructionRateCurrent/destructionRateCap`, `hpCurrent/hpMax` を受け取る項目追加
2. `#buildBasicInfoHtml()` の infoRows に `DP`, `HP`, `破壊率` を追加
3. `turn-row` 側モデル組み立てで sourceState から値を供給

## 4.3 turn-row モデル供給 (`ui-next/components/turn-row.js`)

1. `sourceState.turnState.enemyState` から以下を取り出して popup model に渡す
- `remainingDpByEnemy`, `enemyDpByEnemy`
- `destructionRateByEnemy`, `destructionRateCapByEnemy`
- `extraHpGaugeStateByEnemy`
2. committed / draft で参照する state を明確化（現仕様に合わせる）

## 5. 受け入れ条件

1. 威力詳細タブで対象敵を切り替えると、DP/HP/破壊率が対象ごとに更新される
2. 敵詳細ポップアップで E1/E2/E3 切替時に同様に更新される
3. extra gauge なし敵で HP は `N/A` 表示になる
4. 既存のダメージ期待値表示と破壊率入力計算を壊さない

## 6. テスト計画

- unit
  - `char-detail-popup` の表示値解決ヘルパー
  - `enemy-detail-popup` infoRows 生成
- integration
  - `turn-row` から popup モデルに値が渡ること
- e2e
  - 対象切替時の表示更新
  - extra gauge あり/なしの表示分岐

## 7. リスク

1. HPは extra gauge 非搭載敵に統一 current/max がない
- 当面は `N/A` 表示で運用
2. committed/draft の状態差
- sourceState 選択を固定し、テストで期待値を明示

## 8. 次アクション

1. 本計画に沿って UI 表示追加を実装
2. 将来課題として通常HPの current/max 正式状態を別WBSで管理
