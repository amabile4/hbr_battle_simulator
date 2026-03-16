# UI Next: 旧実装参照インデックス

> **ステータス**: 📚 参照 | **作成**: 2026-03-16
>
> **用途**: 新UI実装時に「このルールはエンジンのどこにある？」を即座に引くための辞書。
> タスクリスト: [active/ui_next_old_impl_reference_tasklist.md](../active/ui_next_old_impl_reference_tasklist.md)

---

## Part 1: 旧実装ファイル構造

### 調査対象の確定

- `archive/legacy_implementation_20260228_224026/` は入力データ形式が異なるため **調査対象外**
- **「旧実装」= `ui/index.html` + `src/ui/dom-adapter.js`（+ 関連 `src/ui/` ファイル）**

### ファイル一覧

| ファイル | 行数 | 主な責務 |
|---------|------|---------|
| `src/ui/dom-adapter.js` | 8726 | キャラ選択・ターン制御・スキル選択・swap・OD・Enemy Setup・Records テーブル・CSV export を一括担当（肥大化の根源） |
| `src/ui/adapter-core.js` | 498 | StatusEffect 正規化、replay turn への override 適用、`previewTurnRecord` / `commitTurnRecord` bridge |
| `src/ui/battle-adapter-facade.js` | 202 | `createInitializedBattleSnapshot()` ファサード、BattleState 初期化 |
| `src/ui/lightweight-replay-script.js` | 443 | ReplayScript 構造定義・生成・操作 API |
| `src/ui/dom-view.js` | 80 | `BattleDomView` – DOM 構造の基礎生成 |
| `ui/index.html` | 408 | 旧 UI の HTML。フラットなパネル積み重ねレイアウト（`div.panel`） |
| `ui/app.js` | 75 | エントリポイント。`HbrDataStore.fromRawData()` → `BattleDomAdapter.mount()` |

### spec 要素 vs 実装状況対応表

`ui_next_gui_design_spec.md` の各要素に対する旧実装・新実装の対応状況。

| spec 要素 | 旧実装 `ui/` での実現方法 | `ui-next/` 実装状況 |
|-----------|--------------------------|---------------------|
| Party Setup 6スロット | `data-role="style-slots"` フォーム（select 形式・画像なし） | ✅ `party-setup.js` |
| Style Picker 全画面 | なし（style は select で直接選ぶ） | ✅ `style-picker.js` |
| D&D スロット並替 | なし（`data-role="swap-from/to"` select 形式） | ✅ `turn-row.js` |
| main style 画像表示 | なし（テキストのみ） | ✅ `party-setup.js`, `turn-row.js` |
| support style + 共鳴表示 | `data-role="resonance-detail"` テキスト表示 | ✅ `party-setup.js` |
| **ゲーム画面ビュー (aspect-video)** | **なし** | **❌ 未実装** |
| キャラアイコン群 SP バッジ (6人横一列) | なし（`data-role="party-state"` リストテキスト） | ✅ `turn-row.js` |
| OD ゲージ表示 | `data-role="turn-label"` テキスト固定幅 | ✅ `turn-row.js` |
| ターンレコードテーブル（5列） | 詳細多列テーブル（20列+: turnId/turnLabel/actions/snapBefore/snapAfter 等） | 🔶 TurnRow カスタム形式 |
| スキル選択 | `data-role="action-slots"` select | ✅ `turn-row.js` |
| Commit / Preview ボタン | `data-action="commit"` / `data-action="preview"` | ✅ `turn-row.js`（Commit のみ） |
| **全ターン再計算** | `data-action="turn-plan-recalc"` ボタン | **❌ T12-E 未実装** |
| **OD発動・割込OD** | `data-action="open-od"` / `data-action="open-interrupt-od"` | **❌ T12-E 未実装** |
| **鬼神化** | `data-action="kishinka"` ボタン | **❌ T12-E 未実装** |
| Enemy Setup（敵設定） | Turn Controls パネルに enemy-action/count/status 等の詳細フォーム | 🔶 `initial-setup.js` placeholder のみ |
| Scenario Runner | `data-role="scenario-json"` JSON replay | 🔶 `TurnEngineManager` に ReplayScript あり |
| **CSV Export** | `data-action="export-csv"` | **❌ 未実装** |
| タブ UI (スキル選択/部隊設定) | なし（パネル積み重ね） | 🔶 右ペインに InitialSetup タブ |

---

## Part 2: ゲームルール参照インデックス

エンジン層（`src/`）のゲームルール実装を新UI開発時に即座に参照できるインデックス。
索引は「ルール名 → `src/` の関数・行番号 → 旧UIでの使われ方」の構成。

### エンジン主要ファイル行数

| ファイル | 行数 | 主要な export |
|---------|------|--------------|
| `src/turn/turn-controller.js` | ~8700 | `previewTurn`, `commitTurn`, `activateOverdrive`, `grantExtraTurn`, `resolveEffectiveSkillForAction`, `isMemberActionableInCurrentTurn` |
| `src/domain/character-style.js` | 1164 | `CharacterStyle`（class）, `canSwapWith`, `normalizePartyPosition`, `getActionSkills`, `previewSkillUseResolved`, `commitSkillPreview` |
| `src/domain/sp.js` | 46 | `applySpChange`, `getEventCeiling`, `SP_CHANGE_SOURCES` |
| `src/domain/party.js` | 100 | `Party`（class）, `MIN_PARTY_SIZE=3`, `MAX_PARTY_SIZE=6`, `swap` |
| `src/contracts/interfaces.js` | 354 | `TURN_TYPES`, `OD_CONTEXTS`, `RECORD_STATUSES`, `buildPositionMap`, `createInitialTurnState`, `createBattleState` |
| `src/config/battle-defaults.js` | 86 | `DEFAULT_INITIAL_SP=3`, `getOdGaugeRequirement`, `OD_RECOVERY_BY_LEVEL`, `OD_COST_BY_LEVEL`, `DRIVE_PIERCE_OPTIONS` |
| `src/ui/adapter-core.js` | 498 | `createInitializedBattleSnapshot`, `previewTurnRecord`, `commitTurnRecord`, `queueSwapState` |
| `src/ui/lightweight-replay-script.js` | 443 | `REPLAY_OPERATION_TYPES`, `REPLAY_SETUP_ENTRY_TYPES`, `normalizeLightweightReplayScript`, `createLightweightReplayScriptFromBaseSetup` |

---

### A. ターン種別とキャラクター行動制約

| ルール名 | 実装ファイル | 関数名・行番号 | 概要 |
|---------|------------|--------------|------|
| ターン種別の定義 | `src/contracts/interfaces.js:9` | `TURN_TYPES = ['normal', 'od', 'extra']` | 3種類固定。normal=通常、od=OD中、extra=追加ターン |
| ターン初期状態 | `src/contracts/interfaces.js:127` | `createInitialTurnState()` | `odLevel`, `odContext`, `remainingOdActions`, `odGauge`, `turnType` を保持 |
| 行動可能性判定 | `src/turn/turn-controller.js:5852` | `isMemberActionableInCurrentTurn(state, member)` | EX時は `allowedCharacterIds` チェック。鬼神化（Tezuka）は特殊扱い |
| EXターン発動 | `src/turn/turn-controller.js:8683` | `grantExtraTurn(state, allowedCharacterIds)` | turnType を 'extra' に変更し `allowedCharacterIds` を設定 |
| EX中スキル使用禁止判定 | `src/turn/turn-controller.js:6112` | `resolveEffectiveSkillForAction()` 内 | `skill.additionalTurnRule?.skillUsableInExtraTurn === false` で EX中使用禁止 |
| 行動スキル一覧取得 | `src/domain/character-style.js:396` | `getActionSkills()` | 行動不可ターン中は `[createNoActionSkill()]` のみ返す |
| ターン確定（preview） | `src/ui/adapter-core.js` | `previewTurnRecord(state, replayTurn, options)` | 旧UIが使う bridge。turn-engine-manager.js もここを呼ぶ |
| ターン確定（commit） | `src/ui/adapter-core.js` | `commitTurnRecord(state, replayTurn, options)` | record を永続化し次ターン state を生成 |
| **旧UI参照** | `src/ui/dom-adapter.js:3200, 3382, 5354` | `member.getActionSkills()` | スキル選択欄生成・アクション検証時 |

---

### B. ポジション・スワップ制約

| ルール名 | 実装ファイル | 関数名・行番号 | 概要 |
|---------|------------|--------------|------|
| ポジション定義 | `src/domain/character-style.js:381` | `isFront()` | position 0–2 = 前衛、position 3–5 = 後衛 |
| ポジション正規化 | `src/domain/character-style.js:26` | `normalizePartyPosition(position)` | 0–5 範囲外は null。`MAX_PARTY_POSITION=5` |
| EX中スワップ可否 | `src/domain/character-style.js:85` | `canSwapWith(a, b, isExtraActive, allowedCharacterIds)` | EX時は `allowedCharacterIds` に両者が含まれる場合のみ可。通常時は常に可 |
| スワップ実行 | `src/domain/party.js:49` | `Party.swap(posA, posB, options)` | `canSwapWith` で制約チェック後、position 値を交換。前衛↔後衛の制限なし |
| ターン内スワップキューイング | `src/ui/adapter-core.js:425` | `queueSwapState(state, pendingSwapEvents, fromPos, toPos)` | ターン内複数スワップを `pendingSwapEvents` に蓄積し commit で適用 |
| SP・バフへの影響 | — | — | スワップ単体では SP/バフに影響なし。ポジション順序変更のみ |
| **旧UI参照** | `src/ui/dom-adapter.js:5456, 6851` | `member.setPosition(targetPosition)` | UI操作でポジション即時変更 |

---

### C. スキル使用制約

| ルール名 | 実装ファイル | 関数名・行番号 | 概要 |
|---------|------------|--------------|------|
| 有効スキル解決 | `src/turn/turn-controller.js:4640` | `resolveEffectiveSkillForAction(state, member, skill)` | スキル変形(variant)・SP消費削減(passive)・上書きコストを統合して有効スキルを返す |
| スキルコスト計算 | `src/domain/character-style.js:424` | `previewSkillUseResolved(skillLike)` | consumeType 別に消費量を計算。spCost=-1 は全SP消費。`{startSP, endSP, delta}` を返す |
| スキルコスト確定 | `src/domain/character-style.js:538` | `commitSkillPreview(preview)` | revision 一致チェック後、preview の終了値をそのまま反映。再計算なし（Q-S001仕様） |
| 行動禁止時スキル | `src/domain/character-style.js:387` | `getSkill(skillId)` 内の actionDisabledTurns 判定 | actionDisabledTurns > 0 の場合、skillId=0 のみ有効 |
| EX中使用禁止 | `src/turn/turn-controller.js:6112` | `resolveEffectiveSkillForAction()` 内チェック | `additionalTurnRule.skillUsableInExtraTurn === false` |
| スキル条件式評価 | `src/turn/turn-controller.js` | `cond` / `iuc_cond` の evaluator | PRI-018（スキル使用回数制約）で対応中 |
| **旧UI参照** | `src/ui/dom-adapter.js:547, 942, 3254, 3326, 3934` | `resolveEffectiveSkillForAction(state, member, skill)` | スキル詳細表示・検証・バッジ更新 |

---

### D. OD ゲージ

| ルール名 | 実装ファイル | 関数名・行番号 | 概要 |
|---------|------------|--------------|------|
| OD必要ゲージ量 | `src/config/battle-defaults.js:75` | `getOdGaugeRequirement(level)` + `OD_COST_BY_LEVEL` | Lv1=100%, Lv2=200%, Lv3=300% |
| OD回復量（スキル後） | `src/config/battle-defaults.js:57` | `OD_RECOVERY_BY_LEVEL` | Lv1=5, Lv2=12, Lv3=20 |
| 被弾1HIT当たりのOD増加 | `src/config/battle-defaults.js:60` | `OD_GAUGE_PER_HIT_PERCENT = 2.5` | 敵から被弾1HIT毎に +2.5% |
| OD ゲージ計算 | `src/turn/turn-controller.js:4865` | `applyOdGaugeFromActions(state, previewRecord, options)` | ダメージ・被弾カウントから総ODゲージを集計。上下限 [-999.99, 300] |
| OD 発動 | `src/turn/turn-controller.js:8593` | `activateOverdrive(state, level, context, options)` | level=1–3。context='preemptive'=先制、='interrupt'=割込。`remainingOdActions=level` |
| OD 状態保持 | `src/contracts/interfaces.js:127` | `createInitialTurnState()` 内の `odLevel`, `odContext`, `remainingOdActions` | OD段階・コンテキスト・残行動数を turnState に保持 |
| OD ゲージ詳細仕様 | `docs/specs/od_gauge_calculation_spec.md` | — | ドライブピアス補正式・実機照合済み |
| **旧UI参照** | `src/ui/dom-adapter.js:6155, 6309, 6332, 6582` | `turnState.odGauge` 参照・更新 | OD%表示・ゲージ予測・OD発動判定 |
| **旧UI参照** | `src/ui/dom-adapter.js:921, 7396` | `turnState.odLevel`, `turnState.odContext` | OD段階・コンテキスト判定 |

---

### E. SP 管理

| ルール名 | 実装ファイル | 関数名・行番号 | 概要 |
|---------|------------|--------------|------|
| SP変動統一関数 | `src/domain/sp.js:14` | `applySpChange(current, delta, min, eventCeiling)` | 回復時は `effectiveCeiling = Math.max(current, eventCeiling)` で凍結。消費時は下限のみチェック |
| SP上限計算 (source 別) | `src/domain/sp.js:30` | `getEventCeiling(source, spMax, skillCeiling)` | `'cost'`=∞、`'od'`=99、`'active'`=skillCeiling、その他=spMax |
| SP 凍結ルール | `src/domain/sp.js:19` | `applySpChange()` 内の effectiveCeiling 計算 | 現在値以下の上限には回復不可（上昇禁止） |
| 毎ターン SP 回復 | `src/turn/turn-controller.js:32` | `BASE_SP_RECOVERY = 2` | 毎ターン固定 +2 回復 |
| キャラ個別回復 | `src/domain/character-style.js:749` | `recoverBaseSP(baseRecovery)` | totalRecovery = baseRecovery(=2) + sp.bonus。`applySpDelta('base')` で適用 |
| 回復パイプライン | `src/turn/turn-controller.js:7958` | `applyRecoveryPipeline(party, turnState)` | 基本回復 → パッシブ回復 → 強化モード回復を順次適用 |
| SP 削減パッシブ | `src/turn/turn-controller.js:4658` | `resolveEffectiveSkillForAction()` 内 | `reduceSpTimings` 配列からパッシブ削減量を解決し有効コストから減算 |
| SP 最小値（特殊） | `src/domain/character-style.js:10` | `SHREDDING_SP_MIN = -30` | 「速弾き（Shredding）」状態中は最小値が -30 に変更 |
| SP 上限拡張（特性） | `src/domain/character-style.js:305` | `sp.max`, `sp.bonus` | パーティー編成時に設定。基本20、特性で25/30 拡張可 |
| SP 仕様詳細 | `docs/specs/sp_condition_skill_spec.md` | — | `Sp()<0` / `Sp()>19` / sp_cost=-1 全SP消費仕様 |
| **旧UI参照** | `src/ui/dom-adapter.js` | `applySpChange`, `applySpDelta`, `recoverBaseSP` を多数箇所で使用 | SP表示・計算・検証に多用 |

---

## 新UI実装時の推奨参照フロー

```
1. ターン構造の確認
   → src/contracts/interfaces.js (TURN_TYPES, createInitialTurnState)

2. 行動可能メンバーの判定
   → src/turn/turn-controller.js:5852 (isMemberActionableInCurrentTurn)

3. スキル有効スキルの解決
   → src/turn/turn-controller.js:4640 (resolveEffectiveSkillForAction)

4. SP 変動の計算
   → src/domain/sp.js (applySpChange, getEventCeiling)

5. ターンの preview / commit
   → src/ui/adapter-core.js (previewTurnRecord, commitTurnRecord)

6. OD ゲージの管理
   → src/config/battle-defaults.js + src/turn/turn-controller.js:4865, 8593

7. ポジション・スワップの制御
   → src/domain/character-style.js:26-96 (normalizePartyPosition, canSwapWith, isFront)
      src/domain/party.js:49 (Party.swap)

8. 旧UIでの実装例を参照したい場合
   → src/ui/dom-adapter.js（8726行・該当キーワードで grep）
```
