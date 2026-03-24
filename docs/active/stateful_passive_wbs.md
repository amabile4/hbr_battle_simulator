# 状態付与型パッシブ 実装WBS（38件）

> 最終更新: 2026-03-25
> 対象: `json/passives.json` 内の `AdditionalHit*` を持つ全パッシブ（750件中38件）

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
| ✅ 完全実装 | 28 |
| ⚠️ 部分実装 | 0 |
| 📝 発火・ログのみ | 2 |
| 🔧 発火のみ（効果未実装） | 5 |
| ❌ 無発火 | 3 |
| **合計** | **38** |

---

## 全38件 詳細テーブル

| # | パッシブ名 | トリガー | effectType | target | exitCond | ステータス | 備考 |
|---|-----------|---------|-----------|--------|---------|---------|------|
| 1 | 即応の型 | OnSpecifiedSkill | AdditionalTurn | Self | Eternal | ✅ 完全実装 | |
| 2 | 浄化の喝采 | OnRemovingBuff | AttackUp | AllyAll | Eternal | 📝 発火・ログのみ | バフ持続管理なし。ログ記録のみ |
| 3 | 破砕の喝采 | OnBreaking | AttackUp | AllyAll | Eternal | 📝 発火・ログのみ | バフ持続管理なし。ログ記録のみ |
| 4 | リバーブレーション | OnSpecifiedSkill | HealSp +5 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyMoralePassiveTriggerEffects に skillCeiling を適用 2026-03-25修正）|
| 5 | 愛嬌 | OnHealedSpWithoutSelfHeal | HealSp +3 | Self | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 6 | お裾分け | OnHealedSpWithoutSelfHeal | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 7 | クリアリング | OnKillCount | HealSp +2+1 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み（2026-03-25修正）|
| 8 | 貴様に託した【カレン専用】 | OnBreaking | OverDrivePointUp +25% | Self | PlayerTurnEnd | ✅ 完全実装 | exitCond=PlayerTurnEnd（発火数制限は未管理）|
| 9 | 恐怖の叫び | OnExtraSkill | Talisman | All | Eternal | 🔧 発火のみ | Talisman未実装 |
| 10 | 心ときめく応援 | OnSpecifiedSkill | Morale +2 | Self | Eternal | ✅ 完全実装 | |
| 11 | 迸る衝動 (100230600) | OnKillCount | Morale +2 | Self | Eternal | ✅ 完全実装 | killCount倍率適用済み |
| 12 | 二股の尻尾 | OnExtraSkill | DoubleActionExtraSkill | Self | Eternal | 🔧 発火のみ | DoubleActionExtraSkill未実装（追加行動2回化） |
| 13 | ダークチアリング | OnExtraSkill | Morale +2 | AllyAll | Eternal | ✅ 完全実装 | |
| 14 | エネルギー補給 | OnHealedSpWithoutSelfHeal | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 15 | 迸る衝動 (100250600) | OnKillCount | Morale +2 | Self | Eternal | ✅ 完全実装 | killCount倍率適用済み |
| 16 | 意気軒昂 (100250603) | OnKillCount | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み（2026-03-25修正）|
| 17 | 占星術 | OnHealedSpWithoutSelfHeal | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 18 | ひれ伏すでゲス！ | OnBreaking | BreakDownTurnUp | None | Eternal | ✅ 完全実装 | テスト行10782 `extends DownTurn remaining when break occurs` で確認済み |
| 19 | 二度咲き | OnExtraSkill | AdditionalTurn | Self | PlayerTurnEnd | ✅ 完全実装 | exitCond=PlayerTurnEnd（発火数制限は未管理） |
| 20 | 慶福の一矢 | OnExtraSkill | HealDpRate +30% | AllyFront | Eternal | ✅ 完全実装 | |
| 21 | ホールチアリング | OnExtraSkill | Morale +2 | AllyAll | Eternal | ✅ 完全実装 | |
| 22 | 先導者 | OnKillCount | Morale +1 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み |
| 23 | 意気軒昂 (100460603) | OnKillCount | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | killCount倍率適用済み（2026-03-25修正）|
| 24 | オーバーレイ | **OnZone** | HealSp +2 | AllyAll | Eternal | ❌ 無発火 | OnZoneトリガー検出未実装 |
| 25 | 追加支援 | OnExtraSkill | OverDrivePointUp +10% | Self | Eternal | ✅ 完全実装 | |
| 26 | 元気注入 | OnExtraSkill | HealSp +2 | AllyAll | Eternal | ✅ 完全実装 | |
| 27 | アプローチショット | OnRemovingBuff | OverDrivePointUp +50% | Self | Eternal | ✅ 完全実装 | |
| 28 | トップアップ | **OnOverDrivePointDownSkill** | AdditionalTurn | Self | Eternal | ❌ 無発火 | ODゲージダウンスキルトリガー未実装 |
| 29 | 破竹の勢い | OnBreaking | OverDrivePointUp +25% | Self | Eternal | ✅ 完全実装 | breakHitCount倍率未適用（OverDrivePointUpへの乗算なし）※注1 |
| 30 | そよぐ新緑 | **OnPursuit** | HealSp +2 | AllyFront | Eternal | ❌ 無発火 | 追撃（Pursuit）トリガー未実装 |
| 31 | ライトプロテクション | OnExtraSkill | DebuffGuard | AllyAll | Eternal | 🔧 発火のみ | DebuffGuard未実装（デバフ防御） |
| 32 | 役者魂 | OnExtraSkill | BuffCharge | Self | Eternal | 🔧 発火のみ | BuffCharge未実装（バフ蓄積） |
| 33 | 激震 (100760403) | OnBreaking | HealSp +8 | Self | Eternal | ✅ 完全実装 | breakHitCount倍率未適用（HealSpへの乗算なし）※注1 |
| 34 | 怪盗乱麻 | OnRemovingBuff | HealSp +2 | AllyFront | Eternal | ✅ 完全実装 | |
| 35 | 愛嬌 (100830700) | OnHealedSpWithoutSelfHeal | HealSp +3 | Self | Eternal | ✅ 完全実装 | SP30対応済み（applyReceiverSpHealPassiveTriggers） |
| 36 | クロノチェイン | OnHealedSpWithoutSelfHeal | **OverDrivePointUp +25%** | Self | Eternal | ✅ 完全実装 | `applyReceiverSpHealPassiveTriggers` に OverDrivePointUp ブランチ追加済み（2026-03-25修正）|
| 37 | 激動 (102020400) | OnBreaking | HealSp +8 | Self | **Count** | ✅ 完全実装 | exitCond=Count（発火回数上限1回）は未管理 |
| 38 | アンコール | OnBreaking | AdditionalTurn | Self | Eternal | ✅ 完全実装 | |

> トリガー名は `AdditionalHit` プレフィックスを省略表記。

---

## 注釈

### 注1: ~~triggerMultiplier のHealSp 未適用~~ → 2026-03-25 修正済み

**修正内容**:
- `killCountMultiplier` 変数を導入し、OnKillCount トリガーのみ HealSp に適用
- OnBreaking トリガー（激震/破竹の勢い）は単発発動（「ブレイクしたとき」= 倍率なし）のため適用しない
- 例: 3体キル時に「クリアリング」は SP+2×3=6 が適用される（修正前: SP+2×1=2）

### 注2: exitCond の未管理
- `Eternal`: 永続（常に発火可）→ **問題なし**（シミュレータでは毎回発火が自然）
- `PlayerTurnEnd`: ターン終了で解除（「貴様に託した」「二度咲き」）→ 現状は Eternal 扱いで毎回発火
- `Count`: 発火回数上限（「激動」: 1回まで）→ 現状は上限なしで毎回発火

---

## 未実装トリガー（❌ 無発火 3件）

| トリガータイプ | 対象パッシブ | 発動条件の説明 |
|-------------|-----------|-------------|
| `AdditionalHitOnZone` | オーバーレイ | Zoneを展開したとき |
| `AdditionalHitOnOverDrivePointDownSkill` | トップアップ | ODゲージを下げるスキルを使ったとき |
| `AdditionalHitOnPursuit` | そよぐ新緑 | 追撃（Pursuit）発動時 |

---

## 未実装 effectType（🔧 発火のみ 対象）

| effectType | 対象パッシブ | 効果の説明 |
|-----------|-----------|---------|
| `Talisman` | 恐怖の叫び | 敵全体へタリスマン付与（パーティ全体に恩恵） |
| `DoubleActionExtraSkill` | 二股の尻尾 | 追加スキル行動を2回実行可能にする |
| `DebuffGuard` | ライトプロテクション | 味方全体にデバフ防御付与 |
| `BuffCharge` | 役者魂 | 自身にバフ蓄積（攻撃力強化など） |
| `OverDrivePointUp`（RECEIVER経由） | クロノチェイン | `applyReceiverSpHealPassiveTriggers` 内でHealSp以外を未処理 |

---

## 実装コード対応表

| 関数 | 担当トリガー | 場所 |
|-----|-----------|------|
| `applyMoralePassiveTriggerEffects` | OnSpecifiedSkill / OnExtraSkill / OnKillCount / OnBreaking / OnRemovingBuff | `src/turn/turn-controller.js` |
| `applyReceiverSpHealPassiveTriggers` | OnHealedSpWithoutSelfHeal（RECEIVER基準） | `src/turn/turn-controller.js` |
| `applyPassiveTimingInternal` | 状態付与型を識別して効果部をスキップ（`hasAdditionalHitTrigger`） | `src/turn/turn-controller.js` L6954 |

---

## 今後の実装候補（優先度目安）

| 優先度 | 対象 | 理由 |
|--------|------|------|
| 高 | クロノチェイン（OD+25%） | `applyReceiverSpHealPassiveTriggers` にOverDrivePointUp処理を追加するだけ |
| 高 | リバーブレーション（SP30） | `applyMoralePassiveTriggerEffects` のHealSp処理に `value[0]` をskillCeilingとして渡すだけ |
| 中 | ひれ伏すでゲス！（BreakDownTurnUp） | ブレイクターン管理システムが必要 |
| 中 | 二度咲き / アンコール系のexitCond管理 | 発火回数・ターン終了のカウント管理が必要 |
| 低 | トップアップ（OnOverDrivePointDownSkill） | ODゲージダウンスキルの識別ロジックが必要 |
| 低 | そよぐ新緑（OnPursuit） | 追撃発動の検出ロジックが必要 |
| 低 | Talisman / DebuffGuard / BuffCharge | バフ/デバフ状態管理システムが必要 |
