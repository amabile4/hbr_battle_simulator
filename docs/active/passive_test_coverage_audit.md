# パッシブ発火トリガー × exitCond テストカバレッジ監査

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-05-17
> 調査ファイル: `tests/turn-state-transitions.test.js`・`tests/real-data-mechanics-coverage.test.js`・`tests/t33-skill-passive-audit.test.js`・`scripts/generate-t33-skill-passive-audit.mjs`

---

## 0. 2026-05-17 HEAD再照合サマリ

- 実データ監査を `HbrDataStore.fromJsonDirectory('json')` 基準へ切り替え、`skill` / `skills[].passive` / `style.passives[]` をまとめて棚卸しした
- `node scripts/generate-t33-skill-passive-audit.mjs` 結果
  - `styles=352`, `styleSkillEntries=1289`, `skillPassiveEntries=28`, `stylePassiveEntries=513`
  - `scannedEntries=1830`, `embeddedOnlyPassiveIds=120`
  - structural residual は `condition=0`, `overwrite=0`, `enemy-status=0`
  - `BorderRefPDownByAdmiral` は `silentSkipEnemyStatusCandidates=4` として別カウント化
- `node --test tests/t33-skill-passive-audit.test.js` で post-talisman-completion baseline を固定済み
- `node --test tests/turn-state-transitions.test.js` → `pass 422 / fail 0`
- 旧「未実装/未テスト」扱いだった `Talisman` / `DebuffGuard` / `BuffCharge` / `OnOverdriveStart` / `AttackUp` trigger は stale claim 解消済み
- 2026-05-17 時点でも `logicGaps=[]` / `staleDocFalsePositives=[]` を維持しており、Diva / 歌姫の加護追加後も T33 runtime gap は増えていない
- current live store では `AdditionalHitOnBreaking + AttackUp` の旧記載名 `破砕の喝采` を確認できず、runtime coverage は synthetic fixture 側で維持している

### 現時点の残課題（テスト監査観点）

- observability gap
  - `OnEveryTurnIncludeSpecial`: preview-path 発火のため `passiveEventsLastApplied` / Passive Log からは見えにくい
  - style 埋め込み passive: `passives.json` 単体では 120 件を取り逃すため、監査は `HbrDataStore` 経由を必須とする
- out-of-scope
  - `use_count` / `HealSkillUsedCount` は `PRI-018`
  - `ConquestBikeLevel` UI override、印 / `Territory` の見える化拡張は既存 backlog 管理

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
| リバーブレーション | HealSp(AllyAll,+5,SP30) | ✅ | 行16338 `P1-A: OnSpecifiedSkill + HealSp + SP30` で `skillCeiling=30` を確認 |

---

### グループ B: AdditionalHitOnExtraSkill × Eternal（9件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| ダークチアリング | Morale(AllyAll) | ✅ | 行3878 `can raise morale when restricted skill is used` |
| ホールチアリング | Morale(AllyAll) | 🟡 | 同系統（AllyAllターゲット差のみ） |
| 追加支援 | OverDrivePointUp(Self) | ✅ | 行10213 `OD gauge increases when EX skill used` |
| 慶福の一矢 | HealDpRate(AllyFront) | ✅ | 行10663 `DP healed to AllyFront targets when EX skill used` |
| 元気注入 | HealSp(AllyAll) | ❌ | ExtraSkill+HealSp 未テスト |
| 恐怖の叫び | Talisman(All) | ✅ | 行11769, 11847, 11898 `EX skill use applies Talisman trigger...`, inactive 不発, clamp |
| 二股の尻尾 | DoubleActionExtraSkill(Self) | ✅ | 行14338 `EX使用後に次回ぶんの二連権を再付与する`、行14307 `初回EXは二連` |
| ライトプロテクション | DebuffGuard(AllyAll) | ✅ | 行11548 `AdditionalHitOnExtraSkill + DebuffGuard: EX skill used grants DebuffGuard to allies` |
| 役者魂 | BuffCharge(Self) | ✅ | 行11601 `AdditionalHitOnExtraSkill + BuffCharge: EX skill used grants BuffCharge to self` |

### グループ B': AdditionalHitOnExtraSkill × PlayerTurnEnd（1件）

| パッシブ名 | effectType | テスト状況 | 備考 |
|-----------|-----------|---------|------|
| 二度咲き | AdditionalTurn(Self) | ✅ | 行17171, 17235 `P3-B` で「同一プレイヤーターン内1回」と「次ターンで再発火」を確認 |

---

### グループ C: AdditionalHitOnKillCount × Eternal（6件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| 迸る衝動 (100230600) | Morale(Self,+2) | ✅ | 行3916 `can raise morale per defeated enemy`（killCount×2倍確認） |
| 迸る衝動 (100250600) | Morale(Self,+2) | 🟡 | 同系統（行3916カバー） |
| 先導者 | Morale(AllyAll,+1) | 🟡 | KillCount+Moraleは行3916でカバー。AllyAll差のみ |
| クリアリング | HealSp(AllyAll,+3) | ✅ | 行13711 `AdditionalHitOnKillCount + HealSp` 系テストで HealSp 発火を確認。killCount 倍率未適用の旧注記は解消済み |
| 意気軒昂 (100250603) | HealSp(AllyAll,+2) | 🟡 | クリアリングテストと同系統 |
| 意気軒昂 (100460603) | HealSp(AllyAll,+2) | 🟡 | 同系統 |

> **注**: `AdditionalHitOnKillCount + HealSp` の killCount 倍率未適用は修正済み。
> `stateful_passive_wbs.md` 注1 と `tests/turn-state-transitions.test.js` の kill-count 系回帰を最新とする。

---

### グループ D: AdditionalHitOnBreaking × Eternal（5件）

| パッシブ名 | effectType | テスト状況 | 行番号 |
|-----------|-----------|---------|--------|
| 激震 (100760403) | HealSp(Self,+8) | ✅ | 行10130 `SP healed for self when breakHitCount > 0` |
| アンコール | AdditionalTurn(Self) | ✅ | 行10572 `passive trigger grants extra turn when breakHitCount > 0` |
| ひれ伏すでゲス！ | BreakDownTurnUp | ✅ | 行10782 `extends DownTurn remaining when break occurs` |
| AdditionalHitOnBreaking + AttackUp（旧「破砕の喝采」表記） | AttackUp(AllyAll) | ✅ | synthetic fixture による dedicated test で runtime を固定。current live store では同名 passive を確認できない |
| 破竹の勢い | OverDrivePointUp(Self) | ✅ | 行追加済み `OD gauge increases when breaking` |

### グループ D': AdditionalHitOnBreaking × PlayerTurnEnd（1件）

| パッシブ名 | effectType | テスト状況 | 備考 |
|-----------|-----------|---------|------|
| 貴様に託した【カレン専用】 | OverDrivePointUp(Self) | 🟡 | OnBreaking+OD は `破竹の勢い` 系テスト、`PlayerTurnEnd` lifecycle は generic / 二度咲き系回帰でカバー。専用の real-data 名義ケースは未追加 |

### グループ D'': AdditionalHitOnBreaking × Count（1件）

| パッシブ名 | effectType | テスト状況 | 備考 |
|-----------|-----------|---------|------|
| 激動 (102020400) | HealSp(Self,+8) | ✅ | 行16898, 16951 付近の `P3-A` で `exitCond=Count` の1回上限を確認 |

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
| クロノチェイン | OverDrivePointUp(Self) | ✅ | 行14530 付近（受け手SP回復起点で OD 上昇を検証） |

---

### グループ G: 実装済みトリガー（3件）

| パッシブ名 | トリガー | effectType | テスト状況 |
|-----------|---------|-----------|---------|
| オーバーレイ | **OnZone** × Eternal | HealSp(AllyAll) | ✅ 実装・テスト済み |
| トップアップ | **OnOverDrivePointDownSkill** × Eternal | AdditionalTurn(Self) | ✅ 実装・テスト済み |
| そよぐ新緑 | **OnPursuit** × Eternal | HealSp(AllyFront) | ✅ 実装・テスト済み |

---

## 2. T33 phase-1 判定サマリ

| 分類 | 件数 | 内容 |
|------|------|------|
| runtime gap | 0 | なし |
| observability gap | 2 | `OnEveryTurnIncludeSpecial` passive log 非掲載、style-embedded passive 120件は `passives.json` 単体では棚卸し不可 |
| stale doc false positive | 0 | なし |
| out-of-scope | 3 | `PRI-018`、`ConquestBikeLevel` UI override、印 / `Territory` 見える化 |

### exitCond 補足

- `exitCond=Count`（激動）と `exitCond=PlayerTurnEnd`（二度咲き / 貴様に託した）は既存 `turn-state-transitions` で回帰化済み
- `OnOverdriveStart × OverDriveEnd` は runtime gap ではなく、必要なら追加の観測テストを厚くするフォローアップ扱い

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
| OnOverdriveStart | OverDriveEnd | 9 | ✅ | `activateOverdrive()` から `applyPassiveTimingInternal('OnOverdriveStart')` へ到達。OD終了側の追加トレースは任意の厚み課題 |
| OnAdditionalTurnStart | PlayerTurnEnd/None | 10 | ✅ | 行4729, 9018, 11504 |
| OnEveryTurnIncludeSpecial | PlayerTurnEnd | 5 | ✅ | 行9121, 9163, 9208 |
| OnBattleWin | None | 8 | ✅ | 行9268, 9284 付近でバトル勝利時発火と HealDpRate を確認 |

---

## 4. 残課題（優先度付き / 2026-05-17 更新）

### 優先度 🔴 高（実装未接続）

- なし

### 優先度 🟠 中（観測ギャップ）

| 項目 | 内容 | 難易度 |
|-----|------|--------|
| OnEveryTurnIncludeSpecial passive log | preview-path 実装のため `passiveEventsLastApplied` / Passive Log では観測できない | 低 |
| style-embedded passive audit surface | `passives.json` 単体監査では style 埋め込み passive 120件を取り逃すため、T33 監査は `HbrDataStore` 経由を維持する | 低 |

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
| `applyReceiverZonePassiveTriggers` | OnZone（RECEIVER基準） | `src/turn/turn-controller.js` |
| `applyPassiveTimingInternal` | AdditionalHit*を識別して効果部スキップ（`hasAdditionalHitTrigger`） | `src/turn/turn-controller.js` L6954 |
