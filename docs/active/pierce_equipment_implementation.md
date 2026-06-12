# ピアス装備（アタック/ブレイク/ブラスト/ドライブ）ヒット数補正実装

> **ステータス**: ✅ 完了 | 📅 作成: 2026-06-13 | 最終更新: 2026-06-13

## 目的

PartySetup のピアス装備をドライブピアス専用からピアス4種（種別 × 10/12/15%）へ拡張し、
ヒット数依存の効果値をダメージ計算機・破壊率計算機へ接続する。

## 計算仕様

- 共通: `clampedHit = min(max(hit, 1), 10)`、許容倍率は 10/12/15%（それ以外は補正 0）
- **減衰型**（アタック=対HPダメージ乗数 / ブレイク=対DPダメージ乗数）:
  `bonus = p - ((p - 5) / 9) * (clampedHit - 1)` … 1ヒットで最大 p%、10ヒット以上で 5%
- **上昇型**（ブラスト=破壊率上昇量 / ドライブ=OD上昇量）:
  `bonus = 5 + ((p - 5) / 9) * (clampedHit - 1)` … 1ヒットで 5%、10ヒット以上で最大 p%
- 通常攻撃・追撃にはピアス乗数を適用しない（スキル攻撃力カテゴリ扱い）
- ブラストピアスは raw ratio を `accessoryDestructionRateBonus` に渡し、
  `calculateDestruction` 既存のヒット数傾斜（上昇型と同式）でスケール（二重傾斜なし）

## 実装ポイント

| 層 | ファイル | 内容 |
|----|---------|------|
| domain | `src/domain/pierce-correction.js` | 減衰型/上昇型ヘルパー（新規） |
| config | `src/config/battle-defaults.js` | `PIERCE_OPTION_VALUES` / `PIERCE_EQUIP_OPTIONS` 等 |
| UI | `ui-next/components/party-setup.js` | `pierce` select（`type:percent` 値）、preset/snapshot 互換 |
| snapshot | `ui-next/utils/session-snapshot.js` | `pierceByPartyIndex` 正規化（旧 `drivePierceByPartyIndex` 互換） |
| engine 受け渡し | `battle-state-manager.js` → `adapter-core.js` → `hbr-data-store.js` → `character-style.js` | `attackPiercePercent` / `breakPiercePercent` / `blastPiercePercent` 追加 |
| ダメージ | `turn-controller.js`（damageContext）→ `damage-calculation-context.js` → `damage-calculator-input-builder.js` → `damage-calculator.js` | `attackPierceUpRate` / `breakPierceUpRate`（ヒット数解決済み ratio）を isHpTarget で効き分け乗算 |
| 破壊率 | `turn-controller.js:calculateDestruction` 入力、`char-detail-popup.js` probe | 超越バースト + ブラストピアスを `accessoryDestructionRateBonus` へ合算 |

## 後方互換

- 旧 snapshot / preset（`drivePierceByPartyIndex` / `drivePierce` のみ）はドライブピアスとして読み込み
- `drivePierceByPartyIndex` は出力にも維持（ドライブ以外の種別は 0）
- percent は任意正数をラウンドトリップ保持（補正計算側で 10/12/15 以外は 0 扱い）

## テスト

- `tests/pierce-correction.test.js` — 期待値テーブル（ヒット1〜10 × 10/12/15%）
- `tests/pierce-damage-integration.test.js` — HP/DP効き分け・通常攻撃除外・破壊率傾斜
- `tests/ui-next-party-setup.test.js` — pierce select ラウンドトリップ・旧形式互換
- `tests/e2e/party-setup-drag-and-drop.spec.js` — `pierce` select でのD&D設定維持

## 残課題（関連バックログ）

- エンシェントチェーン（スキル攻撃力+10% / 破壊率上昇量+10% / SP+3 / 属性スキル回数+1）の複合装備対応
- 共鳴アビリティの破壊率上昇量+を `resonanceDestructionRateBonus` へ接続
- EnemySetup への敵 `d_rate`（破壊率上昇倍率）手動入力（`destruction_rate_implementation_plan.md` 参照）
- 属性リング等のアクセサリ基盤（`damage_breakdown/unimplemented_elements_wbs.md` 参照）
