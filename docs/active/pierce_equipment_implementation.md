# ピアス装備・エンシェントチェーン装備実装

> **ステータス**: ✅ 完了 | 📅 作成: 2026-06-13 | 最終更新: 2026-06-13

## 目的

PartySetup のピアス装備をドライブピアス専用からピアス4種（種別 × 10/12/15%）へ拡張し、
ヒット数依存の効果値をダメージ計算機・破壊率計算機へ接続する。
加えて、エンシェントチェーン（スキル攻撃力+10% / 破壊率上昇量+10% / 初期SP+3）を
汎用1択のチェーン装備として PartySetup から選べるようにする。
破壊率上昇量+10%の実計算適用は hbr_calc 側で `flatDestructionRateBonus` 受け口がマージされ（PR #16 同期、2026-06-13）、
turn-controller / char-detail-popup からの供給配線まで接続済み。
共鳴アビリティの「破壊率上昇量+」は `support_skills.json` の支援パッシブ `DamageRateUp`
（31D `Fly High!` LB0-4: +30/+35/+40/+45/+50%、`Self` / `IsFront()` / `OnPlayerTurnStart`）を
`resonanceDestructionRateBonus` として action / damageContext / 破壊率計算へ接続済み。

## 計算仕様

- 共通: `clampedHit = min(max(hit, 1), 10)`、許容倍率は 10/12/15%（それ以外は補正 0）
- **減衰型**（アタック=対HPダメージ乗数 / ブレイク=対DPダメージ乗数）:
  `bonus = p - ((p - 5) / 9) * (clampedHit - 1)` … 1ヒットで最大 p%、10ヒット以上で 5%
- **上昇型**（ブラスト=破壊率上昇量 / ドライブ=OD上昇量）:
  `bonus = 5 + ((p - 5) / 9) * (clampedHit - 1)` … 1ヒットで 5%、10ヒット以上で最大 p%
- 通常攻撃・追撃にはピアス乗数を適用しない（スキル攻撃力カテゴリ扱い）
- ブラストピアスは raw ratio を `accessoryDestructionRateBonus` に渡し、
  `calculateDestruction` 既存のヒット数傾斜（上昇型と同式）でスケール（二重傾斜なし）
- エンシェントチェーン:
  - スキル攻撃力+10% は `accessoryAttackUpRate=0.1` として既存の攻撃バフ枠へ接続し、
    `accessoryContributions` に `エンシェントチェーン` ラベルを出す
  - 破壊率上昇量+10% はヒット数依存表記がないためフラット加算とし、
    `chainDestructionRateBonus=0.1` を damageContext まで供給、
    `calculateDestruction.attacker.flatDestructionRateBonus` で消費（hbr_calc 同期済み）
  - 初期SP+3 は既存 `startSpEquipByPartyIndex` 経路を再利用する

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
| 共鳴破壊率 | `turn-controller.js` / `damage-calculation-context.js` / `char-detail-popup.js` | support `DamageRateUp` を `resonanceDestructionRateBonus` へ接続し、ブラスト傾斜/フラット加算後の乗算枠として供給 |
| UI | `ui-next/components/party-setup.js` | SP装備 select にエンシェントチェーンを追加。選択時も旧互換の `startSpEquipByPartyIndex=3` を出力 |
| snapshot | `ui-next/utils/session-snapshot.js` | `chainEquipByPartyIndex` を追加。旧 `startSpEquipByPartyIndex` のみの保存データは通常SP装備として維持 |
| engine 受け渡し | `battle-state-manager.js` → `adapter-core.js` → `hbr-data-store.js` → `character-style.js` | `chainSkillAttackUpRate` / `chainDestructionRateBonus` を ratio で追加 |
| ダメージ/破壊率 | `turn-controller.js` / `damage-calculation-context.js` / `char-detail-popup.js` | チェーン攻撃+10%をアクセサリ攻撃枠へ接続。チェーン破壊率+10%は `chainDestructionRateBonus` → `flatDestructionRateBonus`（フラット加算、hbr_calc 同期済み）で接続 |

## 後方互換

- 旧 snapshot / preset（`drivePierceByPartyIndex` / `drivePierce` のみ）はドライブピアスとして読み込み
- `drivePierceByPartyIndex` は出力にも維持（ドライブ以外の種別は 0）
- percent は任意正数をラウンドトリップ保持（補正計算側で 10/12/15 以外は 0 扱い）
- エンシェントチェーンは `chainEquipByPartyIndex` を正本にし、旧読み手互換のため
  `startSpEquipByPartyIndex` には 3 を出力する。`chainEquipByPartyIndex` がない旧データの SP+3 は
  通常のSP装備として扱い、チェーン効果は付けない

## テスト

- `tests/pierce-correction.test.js` — 期待値テーブル（ヒット1〜10 × 10/12/15%）
- `tests/pierce-damage-integration.test.js` — HP/DP効き分け・通常攻撃除外・破壊率傾斜
- `tests/destruction-calculator.test.js` — 共鳴破壊率がブラスト傾斜/フラット加算/耐性後に乗算されることを固定
- `tests/turn-state-transitions.test.js` — support `DamageRateUp` の `resonanceDestructionRateBonus` 解決と damageContext 伝搬
- `tests/damage-breakdown.test.js` / `tests/damage-calculation-context.test.js` — チェーン攻撃+10%のラベル・context保持、共鳴破壊率 context 保持
- `tests/ui-next-party-setup.test.js` / `tests/ui-next-session-snapshot.test.js` / `tests/ui-next-battle-state-manager.test.js` — chain snapshot往復・旧SP互換・CharacterStyle伝搬
- `tests/e2e/party-setup-drag-and-drop.spec.js` — `pierce` / エンシェントチェーン select でのD&D設定維持

## 残課題（関連バックログ）

- エンシェントチェーンの「属性スキル回数+1」は未実装（属性別チェーン選択も未分化）。今回は汎用1択で攻撃+10% / 破壊率+10% / SP+3のみ実装
- 属性リング等のアクセサリ基盤（`damage_breakdown/unimplemented_elements_wbs.md` 参照）
