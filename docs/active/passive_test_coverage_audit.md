# パッシブ発火トリガー × exitCond テストカバレッジ監査

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-04-04
> 調査ファイル: `tests/turn-state-transitions.test.js`（13,000行超）・`tests/real-data-mechanics-coverage.test.js`

---

## 0. 2026-04-04 HEAD再照合サマリ（main@48d98c4）

- 2026-03-29 時点で未実装/未テスト扱いだった以下は、`tests/turn-state-transitions.test.js` に専用テスト追加済み
	- `P1-A`: リバーブレーション（SP30）
	- `P1-B`: クロノチェイン（OnHealedSpWithoutSelfHeal + OD上昇）
	- `P1-C`: OnKillCount + HealSp 倍率
	- `P2-A`: OnZone
	- `P2-B`: OnPursuit
	- `P2-C`: OnOverDrivePointDownSkill
	- `P3-A`: `exitCond=Count`（激動）
	- `P3-B`: `exitCond=PlayerTurnEnd`（二度咲き）
- 一般 timing 側も追加確認済み
	- `OnBattleWin`（`commitTurn applies OnBattleWin passives when all enemies are dead`）
	- `OnOverdriveStart` の基本発火/非発火境界（front/backline/non-OD）
- 実行確認: `node --test tests/turn-state-transitions.test.js` → `pass 402 / fail 0`

### 現時点の残課題（テスト監査観点）

- AdditionalHit 経路での未実装 effect（実装+テストが必要）
	- `Talisman`（恐怖の叫び）
	- `DebuffGuard`（ライトプロテクション）
	- `BuffCharge`（役者魂）
- `AttackUp` trigger（浄化の喝采 / 破砕の喝采）
	- 現在はログ中心。active buff としての持続/消費仕様テストは未整備
- `OnOverdriveStart × OverDriveEnd` の解除側追跡
	- 現在は発火側テスト中心で、OD終了時解除の厳密トレースは薄い

> 注: 以下の 2026-03-29 本文は履歴として保持。最新判定は本セクション「0」とセクション「4」を優先する。

---

## カバレッジ凡例

| 記号 | 意味 |
|------|------|
| ✅ | 専用テスト確認済み（行番号付き） |
| 🟡 | 同系統パターンのテスト済み（専用テストなし） |
| ❌ | 実装済みだが未テスト |
| 🔧 | 未実装・未テスト |
| ❓ | テスト存在不確実（要確認） |

---

## 1. 状態付与型（AdditionalHit*）38件 詳細カバレッジ

### グループ A: AdditionalHitOnSpecifiedSkill × Eternal（3件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| 心ときめく応援 | Morale(Self) | ✅ | 行3832 `can raise morale via passive trigger` |
| 即応の型 | AdditionalTurn(Self) | ❓ | OnSpecifiedSkill+Moraleのみ確認。AdditionalTurn経由は未確認 |
| リバーブレーション | HealSp(AllyAll,+5,SP30) | ❌ | HealSp via SpecifiedSkill未テスト。SP30制約も未テスト（既知バグ: ACTOR基準でSP30未適用） |

---

### グループ B: AdditionalHitOnExtraSkill × Eternal（9件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| ダークチアリング | Morale(AllyAll) | ✅ | 行3878 `can raise morale when restricted skill is used` |
| ホールチアリング | Morale(AllyAll) | 🟡 | 同系統（AllyAllターゲット差のみ） |
| 追加支援 | OverDrivePointUp(Self) | ✅ | 行10213 `OD gauge increases when EX skill used` |
| 慶福の一矢 | HealDpRate(AllyFront) | ✅ | 行10663 `DP healed to AllyFront targets when EX skill used` |
| 元気注入 | HealSp(AllyAll) | ❌ | ExtraSkill+HealSp 未テスト |
| 恐怖の叫び | Talisman(All) | 🔧 | AdditionalHit経由のTalisman未実装・未テスト |
| 二股の尻尾 | DoubleActionExtraSkill(Self) | ✅ | 行14338 `EX使用後に次回ぶんの二連権を再付与する`、行14307 `初回EXは二連` |
| ライトプロテクション | DebuffGuard(AllyAll) | ✅ | 行11548 `AdditionalHitOnExtraSkill + DebuffGuard: EX skill used grants DebuffGuard to allies` |
| 役者魂 | BuffCharge(Self) | ✅ | 行11601 `AdditionalHitOnExtraSkill + BuffCharge: EX skill used grants BuffCharge to self` |

### グループ B': AdditionalHitOnExtraSkill × PlayerTurnEnd（1件）

| パッシブ名 | effectType | テスト状況 | 備考 |
|-----------|-----------|---------|------|
| 二度咲き | AdditionalTurn(Self) | ❌ | ExtraSkill+AdditionalTurn の発火自体未確認。exitCond=PlayerTurnEnd の期限切れ挙動も未テスト（現状: Eternal扱いで毎回発火） |

---

### グループ C: AdditionalHitOnKillCount × Eternal（6件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| 迸る衝動 (100230600) | Morale(Self,+2) | ✅ | 行3916 `can raise morale per defeated enemy`（killCount×2倍確認） |
| 迸る衝動 (100250600) | Morale(Self,+2) | 🟡 | 同系統（行3916カバー） |
| 先導者 | Morale(AllyAll,+1) | 🟡 | KillCount+Moraleは行3916でカバー。AllyAll差のみ |
| クリアリング | HealSp(AllyAll,+3) | ✅ | 行追加済み `HealSp: SP healed to AllyAll when kill occurs`（killCount倍率未適用の現状を文書化） |
| 意気軒昂 (100250603) | HealSp(AllyAll,+2) | 🟡 | クリアリングテストと同系統 |
| 意気軒昂 (100460603) | HealSp(AllyAll,+2) | 🟡 | 同系統 |

> **注**: `AdditionalHitOnKillCount + HealSp` の killCount 倍率は現状未適用（Morale のみ乗算）。
> killCount=2 でも HealSp は power[0]×1 固定。詳細は `stateful_passive_wbs.md` 注1 参照。

---

### グループ D: AdditionalHitOnBreaking × Eternal（5件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| 激震 (100760403) | HealSp(Self,+8) | ✅ | 行10130 `SP healed for self when breakHitCount > 0` |
| アンコール | AdditionalTurn(Self) | ✅ | 行10572 `passive trigger grants extra turn when breakHitCount > 0` |
| ひれ伏すでゲス！ | BreakDownTurnUp | ✅ | 行10782 `extends DownTurn remaining when break occurs` |
| 破砕の喝采 | AttackUp(AllyAll) | ✅ | 行10876 `records passive event with attackUpRate` |
| 破竹の勢い | OverDrivePointUp(Self) | ✅ | 行追加済み `OD gauge increases when breaking` |

### グループ D': AdditionalHitOnBreaking × PlayerTurnEnd（1件）

| パッシブ名 | effectType | テスト状況 | 備考 |
|-----------|-----------|---------|------|
| 貴様に託した【カレン専用】 | OverDrivePointUp(Self) | ❌ | OnBreaking+OD の組み合わせ自体は破竹の勢いテストでカバー。exitCond=PlayerTurnEnd の期限切れ挙動は未テスト（現状: Eternal扱いで毎回発火） |

### グループ D'': AdditionalHitOnBreaking × Count（1件）

| パッシブ名 | effectType | テスト状況 | 備考 |
|-----------|-----------|---------|------|
| 激動 (102020400) | HealSp(Self,+8) | ❌ | HealSp発火自体は行10130でカバー。exitCond=Count（1回上限）の制限挙動は未テスト（現状: 上限なしで毎回発火） |

---

### グループ E: AdditionalHitOnRemovingBuff × Eternal（3件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| 浄化の喝采 | AttackUp(AllyAll) | ✅ | 行10924 `fires when skill has RemoveBuff part` |
| アプローチショット | OverDrivePointUp(Self) | ✅ | 行追加済み `OD gauge increases when buff removed` |
| 怪盗乱麻 | HealSp(AllyFront) | ❌ | RemovingBuff+HealSp の組み合わせ未テスト |

---

### グループ F: AdditionalHitOnHealedSpWithoutSelfHeal × Eternal（6件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| お裾分け | HealSp(AllyAll,+2,SP30) | ✅ | 行10358, 10415, 10458（発動/不発/SP30の3パターン）、行14530（水瀬すもも二連EXで2回発火） |
| 愛嬌 (100140800) | HealSp(Self,+3,SP30) | ✅ | 行10520 `別メンバーHealSp → 自身SP+3`、行14530（水瀬すもも二連EXで2回発火） |
| エネルギー補給 | HealSp(AllyAll,+2,SP30) | 🟡 | お裾分けと同系統。専用テストなし |
| 占星術 | HealSp(AllyAll,+2,SP30) | 🟡 | お裾分けと同系統。専用テストなし |
| 愛嬌 (100830700) | HealSp(Self,+3,SP30) | 🟡 | 愛嬌100140800と同系統。専用テストなし |
| クロノチェイン | OverDrivePointUp(Self) | 🔧 | `applyReceiverSpHealPassiveTriggers` がHealSpのみ処理のため未実装・未テスト |

---

### グループ G: 未実装トリガー（3件）

| パッシブ名 | トリガー | effectType | テスト状況 |
|-----------|---------|-----------|---------|
| オーバーレイ | **OnZone** × Eternal | HealSp(AllyAll) | 🔧 未実装・未テスト |
| トップアップ | **OnOverDrivePointDownSkill** × Eternal | AdditionalTurn(Self) | 🔧 未実装・未テスト |
| そよぐ新緑 | **OnPursuit** × Eternal | HealSp(AllyFront) | 🔧 未実装・未テスト |

---

## 2. 状態付与型 カバレッジ集計

| ステータス | 件数 | 対象パッシブ |
|----------|------|------------|
| ✅ テスト済み | 13 | 心ときめく応援 / ダークチアリング / 追加支援 / 慶福の一矢 / 迸る衝動(100230600) / 激震 / アンコール / ひれ伏すでゲス！ / 破砕の喝采 / 浄化の喝采 / お裾分け / 愛嬌(100140800) / 破竹の勢い / アプローチショット / クリアリング |
| 🟡 同系統カバー（専用テストなし） | 9 | ホールチアリング / 先導者 / 迸る衝動(100250600) / エネルギー補給 / 占星術 / 愛嬌(100830700) / 意気軒昂×2 |
| ❓ 要確認 | 1 | 即応の型（AdditionalTurn via SpecifiedSkillの発火確認が必要） |
| ❌ 実装済み・未テスト | 8 | リバーブレーション(SP30未対応) / 元気注入 / 二度咲き / 貴様に託した / 激動(Count) / 怪盗乱麻 |
| 🔧 未実装・未テスト | 6 | 恐怖の叫び / ライトプロテクション / 役者魂 / クロノチェイン / オーバーレイ / トップアップ / そよぐ新緑 |
| **合計** | **38** | |

### exitCond 別カバレッジ

| exitCond | 件数 | テスト済み | 未テスト | 備考 |
|---------|------|---------|---------|------|
| Eternal | 35 | 13+9(同系統) | 10 | 主流。実装側はすべてEternal扱い |
| PlayerTurnEnd | 2 | 0 | 2 | 「二度咲き」「貴様に託した」。期限切れ挙動は現状未実装 |
| Count | 1 | 0 | 1 | 「激動」。1回上限は現状未実装 |

---

## 3. 一瞬発火型 timing × exitCond カバレッジ概要

| timing | exitCond | 件数 | テスト状況 | 代表テスト |
|--------|---------|------|---------|---------|
| OnEveryTurn | None | 287 | ✅ | SP回復/DP回復/条件付きパッシブ多数 |
| OnPlayerTurnStart | PlayerTurnEnd | 195 | ✅ | real-data-mechanics 行77, 110 等 |
| OnFirstBattleStart | Eternal | 73 | ✅ | markState / パッシブ初期適用 多数 |
| OnBattleStart | None | 33 | ✅ | OverDrivePointUp/HealDpRate等 |
| OnBattleStart | PlayerTurnEnd | 24 | 🟡 | OnBattleStart自体はテスト済み。exitCond=PlayerTurnEnd 専用は未確認 |
| OnBattleStart | Count | 14 | ❌ | Count型OnBattleStartの制限挙動は未テスト |
| OnEnemyTurnStart | EnemyTurnEnd | 31 | ✅ | 行1558 `commitTurn records OnEnemyTurnStart passive events` |
| OnOverdriveStart | OverDriveEnd | 7 | ❌ | OD終了時の効果解除は未テスト（現状: OD終了追跡なし） |
| OnAdditionalTurnStart | PlayerTurnEnd/None | 10 | ✅ | 行4729, 9018, 11504 |
| OnEveryTurnIncludeSpecial | PlayerTurnEnd | 5 | ✅ | 行9121, 9163, 9208 |
| OnBattleWin | None | 8 | ❌ | バトル勝利時発火のテスト未確認 |

---

## 4. 残課題（優先度付き / 2026-04-04 更新）

### 優先度 🔴 高（実装未接続）

| 項目 | 内容 | 難易度 |
|-----|------|--------|
| AdditionalHitOnExtraSkill + Talisman | trigger 経路で `Talisman` 適用を未接続。専用テストも未整備 | 中 |

### 優先度 🟠 中（仕様・観測ギャップ）

| 項目 | 内容 | 難易度 |
|-----|------|--------|
| AttackUp trigger の持続/消費挙動 | 浄化の喝采/破砕の喝采は現状ログ中心。active buff としての仕様固定とテストが必要 | 中 |
| OnOverdriveStart × OverDriveEnd | 発火テストはあるが、OD終了時解除の追跡テストは薄い | 中 |

### 優先度 🟡 低（カバレッジ厚み）

| 項目 | 内容 |
|-----|------|
| 同系統扱いの専用実データ回帰追加 | `元気注入` / `怪盗乱麻` など、同系統カバー済み項目を個別ケースとして厚くする |

---

## 5. 監査で判明したWBS誤分類

> `docs/active/stateful_passive_wbs.md` に適用済み（2026-03-24）

| パッシブ | 旧分類 | 正しい分類 | 根拠 |
|---------|------|---------|------|
| ひれ伏すでゲス！（BreakDownTurnUp） | 🔧 発火のみ（未実装） | ✅ 完全実装 | 行10782でテスト確認済み |

---

## 6. 実装コード対応表

| 関数 | 担当 | ファイル |
|-----|------|---------|
| `applyMoralePassiveTriggerEffects` | OnSpecifiedSkill / OnExtraSkill / OnKillCount / OnBreaking / OnRemovingBuff | `src/turn/turn-controller.js` |
| `applyReceiverSpHealPassiveTriggers` | OnHealedSpWithoutSelfHeal（RECEIVER基準） | `src/turn/turn-controller.js` |
| `applyPassiveTimingInternal` | AdditionalHit*を識別して効果部スキップ（`hasAdditionalHitTrigger`） | `src/turn/turn-controller.js` L6954 |
