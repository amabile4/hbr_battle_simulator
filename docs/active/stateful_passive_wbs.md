# 状態付与型パッシブ 実装WBS（38件）

> **ステータス**: ✅ 完了 | 📅 最終更新: 2026-04-10
> 対象: `json/passives.json` 内の `AdditionalHit*` を持つ全パッシブ（750件中38件）

---

## 2026-04-10 HEAD再照合

- `node scripts/generate-t33-skill-passive-audit.mjs` 実行結果
  - `HbrDataStore.fromJsonDirectory('json')` 基準で `styles=345`, `scannedEntries=1789`, `embeddedOnlyPassiveIds=116`
  - structural residual は `condition=0`, `overwrite=0`, `enemy-status=0`
  - `BorderRefPDownByAdmiral` は `silentSkipEnemyStatusCandidates=3` として別カウント化した
- `node --test tests/turn-state-transitions.test.js` 実行結果: `pass 422 / fail 0`
- `AdditionalHitOnRemovingBuff + AttackUp`（浄化の喝采）、`AdditionalHitOnBreaking + AttackUp`、`AdditionalHitOnExtraSkill + DebuffGuard/BuffCharge/Talisman` はいずれも実装・テスト済み
- `OnAdditionalHit` 系 38件は runtime 接続と回帰テスト固定まで完了した

### 現在の残課題（AdditionalHit 38件スコープ）

- runtime 残課題はなし
- 監査上の残件は `OnEveryTurnIncludeSpecial` の observability gap のみで、AdditionalHit 38件スコープからは外す

---

## 実装ステータス定義

| 記号 | ステータス | 意味 |
|------|----------|------|
| ✅ | **完全実装** | トリガー検出・効果適用ともに正常動作 |
| ⚠️ | **部分実装（制約未対応）** | 発火・主効果は適用されるが一部制約が未対応 |
| 📝 | **発火・ログのみ** | 発火・ログ記録はされるが効果が数値に反映されない |
| 🔧 | **発火のみ（効果未実装）** | トリガーは検出されるが effectType 未実装のためスキップ |
| ❌ | **無発火** | トリガー検出自体が未実装（Silent skip） |

---

## 実装概要（集計）

| ステータス | 件数 |
|----------|------|
| ✅ 完全実装 | 38 |
| ⚠️ 部分実装 | 0 |
| 📝 発火・ログのみ | 0 |
| 🔧 発火のみ（効果未実装） | 0 |
| ❌ 無発火 | 0 |
| **合計** | **38** |

---

## 全38件 詳細テーブル

| # | パッシブ名 | トリガー | effectType | target | exitCond | ステータス | 備考 |
|---|-----------|---------|-----------|--------|---------|---------|------|
| 1 | 即応の型 | OnSpecifiedSkill | AdditionalTurn | Self | Eternal | ✅ 完全実装 | |
| 2 | 浄化の喝采 | OnRemovingBuff | AttackUp | AllyAll | Eternal | ✅ 完全実装 | `AttackUp` statusEffect を AllyAll に付与。turn-state-transitions の dedicated test で固定済み |
| 3 | AdditionalHitOnBreaking + AttackUp（旧「破砕の喝采」表記） | OnBreaking | AttackUp | AllyAll | Eternal | ✅ 完全実装 | runtime は実装済み。現行 live store では同名 passive を確認できず、回帰は synthetic fixture で固定 |
| 4 | リバーブレーション | OnSpecifiedSkill | HealSp +5 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyMoralePassiveTriggerEffects に skillCeiling を適用 2026-03-25修正）|
| 5 | 愛嬌 | OnHealedSpWithoutSelfHeal | HealSp +3 | Self | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 6 | お裾分け | OnHealedSpWithoutSelfHeal | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 7 | クリアリング | OnKillCount | HealSp +2+1 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み（2026-03-25修正）|
| 8 | 貴様に託した【カレン専用】 | OnBreaking | OverDrivePointUp +25% | Self | PlayerTurnEnd | ✅ 完全実装 | exitCond=PlayerTurnEnd 管理済み（同一プレイヤーターン内1回、2026-03-25実装）|
| 9 | 恐怖の叫び | OnExtraSkill | Talisman | All | Eternal | ✅ 完全実装 | EX 使用後 `+2`、攻撃由来 `+1`、inactive 不発、Lv10 clamp、`damageContext`/UI 露出まで dedicated test で固定 |
| 10 | 心ときめく応援 | OnSpecifiedSkill | Morale +2 | Self | Eternal | ✅ 完全実装 | |
| 11 | 迸る衝動 (100230600) | OnKillCount | Morale +2 | Self | Eternal | ✅ 完全実装 | killCount倍率適用済み |
| 12 | 二股の尻尾 | OnExtraSkill | DoubleActionExtraSkill | Self | Eternal | ✅ 完全実装 | EX二連権を再付与。水瀬すももLB3の次回EX二連を確認済み |
| 13 | ダークチアリング | OnExtraSkill | Morale +2 | AllyAll | Eternal | ✅ 完全実装 | |
| 14 | エネルギー補給 | OnHealedSpWithoutSelfHeal | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 15 | 迸る衝動 (100250600) | OnKillCount | Morale +2 | Self | Eternal | ✅ 完全実装 | killCount倍率適用済み |
| 16 | 意気軒昂 (100250603) | OnKillCount | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み（2026-03-25修正）|
| 17 | 占星術 | OnHealedSpWithoutSelfHeal | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 18 | ひれ伏すでゲス！ | OnBreaking | BreakDownTurnUp | None | Eternal | ✅ 完全実装 | テスト行10782 `extends DownTurn remaining when break occurs` で確認済み |
| 19 | 二度咲き | OnExtraSkill | AdditionalTurn | Self | PlayerTurnEnd | ✅ 完全実装 | exitCond=PlayerTurnEnd 管理済み（同一プレイヤーターン内1回、2026-03-25実装）|
| 20 | 慶福の一矢 | OnExtraSkill | HealDpRate +30% | AllyFront | Eternal | ✅ 完全実装 | |
| 21 | ホールチアリング | OnExtraSkill | Morale +2 | AllyAll | Eternal | ✅ 完全実装 | |
| 22 | 先導者 | OnKillCount | Morale +1 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み |
| 23 | 意気軒昂 (100460603) | OnKillCount | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み（2026-03-25修正）|
| 24 | オーバーレイ | **OnZone** | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | `applyReceiverZonePassiveTriggers` 新設（RECEIVER-based、actor自身も対象、2026-03-24実装）|
| 25 | 追加支援 | OnExtraSkill | OverDrivePointUp +10% | Self | Eternal | ✅ 完全実装 | |
| 26 | 元気注入 | OnExtraSkill | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | |
| 27 | アプローチショット | OnRemovingBuff | OverDrivePointUp +50% | Self | Eternal | ✅ 完全実装 | |
| 28 | トップアップ | **OnOverDrivePointDownSkill** | AdditionalTurn | Self | Eternal | ✅ 完全実装 | OverDrivePointDown部位を持つスキル使用時に発火（2026-03-24実装）|
| 29 | 破竹の勢い | OnBreaking | OverDrivePointUp +25% | Self | Eternal | ✅ 完全実装 | breakHitCount倍率未適用（OverDrivePointUpへの乗算なし）※注1 |
| 30 | そよぐ新緑 | **OnPursuit** | HealSp +2 | AllyFront | Eternal | ✅ 完全実装 | `actionEntry.pursuedHitCount` で追撃発動回数を受け取り発火（2026-03-24実装）|
| 31 | ライトプロテクション | OnExtraSkill | DebuffGuard | AllyAll | Eternal | ✅ 完全実装 | EX使用時付与を実装・テスト確認済み（2026-04-04） |
| 32 | 役者魂 | OnExtraSkill | BuffCharge | Self | Eternal | ✅ 完全実装 | EX使用時付与を実装・テスト確認済み（2026-04-04） |
| 33 | 激震 (100760403) | OnBreaking | HealSp +8 | Self | Eternal | ✅ 完全実装 | breakHitCount倍率未適用（HealSpへの乗算なし）※注1 |
| 34 | 怪盗乱麻 | OnRemovingBuff | HealSp +2 | AllyFront | Eternal | ✅ 完全実装 | |
| 35 | 愛嬌 (100830700) | OnHealedSpWithoutSelfHeal | HealSp +3 | Self | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 36 | クロノチェイン | OnHealedSpWithoutSelfHeal | **OverDrivePointUp +25%** | Self | Eternal | ✅ 完全実装 | `applyReceiverSpHealPassiveTriggers` に OverDrivePointUp ブランチ追加済み（2026-03-25修正）|
| 37 | 激動 (102020400) | OnBreaking | HealSp +8 | Self | **Count** | ✅ 完全実装 | exitCond=Count 管理済み（バトル中1回上限、2026-03-25実装）|
| 38 | アンコール | OnBreaking | AdditionalTurn | Self | Eternal | ✅ 完全実装 | |

> トリガー名は `AdditionalHit` プレフィックスを省略表記。

---

## 注釈

### 注1: ~~triggerMultiplier のHealSp 未適用~~ → 2026-03-25 修正済み

**修正内容**:
- `killCountMultiplier` 変数を導入し、OnKillCount トリガーのみ HealSp に適用
- OnBreaking トリガー（激震/破竹の勢い）は単発発動（「ブレイクしたとき」= 倍率なし）のため適用しない
- 例: 3体キル時に「クリアリング」は SP+2×3=6 が適用される（修正前: SP+2×1=2）

### 注2: exitCond 管理（2026-03-25 実装済み）
- `Eternal`: 永続（常に発火可）→ **問題なし**（シミュレータでは毎回発火が自然）
- `PlayerTurnEnd`: ターン終了で解除（「貴様に託した」「二度咲き」）→ `turnState.passiveTurnFiredKeys` で管理済み。turnIndex 増加時にリセット。
- `Count`: 発火回数上限（「激動」: 1回まで）→ 既存 `turnState.passiveUsageCounts` を再利用して管理済み。

---

## 未実装トリガー（❌ 無発火）

> 2026-03-25 時点で未実装トリガーは 0 件。全トリガーが実装済み。

---

## 未実装 effectType（🔧 発火のみ 対象）

> 2026-04-10 時点で 0 件。

---

## 実装コード対応表

| 関数 | 担当トリガー | 場所 |
|-----|-----------|------|
| `applyMoralePassiveTriggerEffects` | OnSpecifiedSkill / OnExtraSkill / OnKillCount / OnBreaking / OnRemovingBuff / OnOverDrivePointDownSkill / OnPursuit | `src/turn/turn-controller.js` |
| `applyReceiverSpHealPassiveTriggers` | OnHealedSpWithoutSelfHeal（RECEIVER基準） | `src/turn/turn-controller.js` |
| `applyReceiverZonePassiveTriggers` | OnZone（RECEIVER基準、actor自身も対象） | `src/turn/turn-controller.js` |
| `applyPassiveTimingInternal` | 状態付与型を識別して効果部をスキップ（`hasAdditionalHitTrigger`） | `src/turn/turn-controller.js` L6954 |

---

## 今後のフォローアップ（実装完了後）

| 優先度 | 対象 | 理由 |
|--------|------|------|
| 低 | `OnEveryTurnIncludeSpecial` の passive log 可視化 | runtime 自体は正常だが、preview-path 発火のため `passiveEventsLastApplied` に載らず観測が薄い |
