# 追撃（Follow-Up）コード レビュー結果（第2回）

**対象**: 第1回レビュー指摘事項の修正後コード  
**レビュー日**: 2026-04-03  
**前回**: [follow_up_code_review.md](follow_up_code_review.md)  
**ステータス**: ✅ 修正完了（全 756 テスト合格）

---

## 第1回指摘事項の修正確認

| 指摘 | 内容 | 状態 |
|------|------|------|
| P0 | `followUp` → `pursuedHitCount` 変換なし | ✅ 修正済み（`pursuedHitCount: 1` をアクション dict に設定） |
| P1 | `buildFollowUpChipModels` テストが位置引数で呼び出し | ✅ 修正済み（オブジェクト引数形式に変更） |
| P1 | 統合テストが catch-all で機能を検証していない | ✅ 修正済み（具体的な assert に書き直し） |
| P2 | コミット済み行での追撃編集未実装 | ✅ **誤検出**（Break/Kill も同様に draft mode 専用、コードベース全体の方針） |
| P3 | スキル名マッチが文字列マッチで脆い | ✅ 修正済み（`isPursuitOnlySkill` 分類器を使用） |

---

## データフロー健全性検証

実装全体を追って正しく動作することを確認した：

```
UI 操作（後衛ボタンクリック）
  ↓ #draftFollowUpEnemyIndexByPartyIndex[partyIndex] 更新
getCurrentFollowUpOverrides()
  ↓ { position, enemyIndex } 配列（後衛メンバーの position 値）
turn-area.js → commitNextTurn(options.followUpOverrides)
  ↓
#normalizeFollowUpOverridesForState()
  ↓（後衛 position 3-5・該当メンバー存在チェック付きバリデーション）
#buildActionsDict()
  ↓ front member.position + 3 → 後衛 position 参照
actions[frontPos].pursuedHitCount = 1  ← エンジンが読む
  ↓
previewTurnRecord() → applyMoraleEffectsFromActions()
  ↓ AdditionalHitOnPursuit 発火チェック（pursuedHitCount > 0）
committedRecord.actions[x].spChanges += sp_passive
  ↓
#buildReplayTurn() → overrideEntries に FOLLOW_UP_OVERRIDES 保存
  ↓
recalculateFrom() → #resolveReplayTurnFollowUpOverrides()
  ↓（再計算でも overrideEntries から正しく復元）
computedRecords ← pursuedHitCount = 1 が維持される
```

**機能として正しく動作する実装になっている。**

---

## 残存問題（新規発見）

### 問題A: `followUp` オブジェクトが死データ（軽微）

**場所**: [ui-next/engine/turn-engine-manager.js](../ui-next/engine/turn-engine-manager.js) `#buildActionsDict`

```javascript
...(followUpEnemyIndex !== null
  ? {
      pursuedHitCount: 1,
      followUp: {                       // ← 死データ
        position: member.position + 3,
        enemyIndex: Number(followUpEnemyIndex),
        source: 'manual',
      },
    }
  : {}),
```

`followUp` オブジェクトはアクション dict に付加されるが、エンジン側（`buildPreviewActionEntry`、[src/turn/turn-controller.js:7748](../src/turn/turn-controller.js#L7748)）は `pursuedHitCount` のみを参照する。プロジェクト全体を検索しても `followUp` プロパティを読むコードは存在しない。削除すべき死データ。

---

### 問題B: 統合テストのパッシブ検証が実装に対して結合度が高い（構造的懸念）

**場所**: [tests/ui-next-follow-up-integration.test.js:47-98](../tests/ui-next-follow-up-integration.test.js#L47-L98)

```javascript
assert.equal(actorEntry.pursuedHitCount, 1, ...);
const spPassive = (actorEntry.spChanges ?? []).find((c) => c.source === 'sp_passive');
assert.ok(spPassive, 'AdditionalHitOnPursuit should fire...');
assert.equal(spPassive.delta, 2, 'SP delta should be 2');
```

このテストは追撃オーバーライド機能単体のテストでなく、エンジン全体のパッシブ発火チェーン（`applyMoraleEffectsFromActions` → `AdditionalHitOnPursuit` → `HealSp`）まで依存している。追撃オーバーライドとは無関係な変更（`OnFirstBattleStart` タイミング処理の変更など）によってもテストが落ちる。

`pursuedHitCount` の設定確認（追撃機能の本質）と SP 変化確認（エンジン全体の動作）を別テストに分離することを検討すべき。

---

### 問題C: `scenarioTurn.followUpOverrides` が設定されるが参照されない（既存パターン踏襲）

**場所**: [ui-next/engine/turn-engine-manager.js:1195-1201](../ui-next/engine/turn-engine-manager.js#L1195-L1201)

```javascript
const scenarioTurn = {};
applyReplayOverrideEntriesToScenarioTurn(turn.overrideEntries ?? [], scenarioTurn, warnings);
// scenarioTurn.enemyCount は参照される
// scenarioTurn.followUpOverrides は設定されるが参照されない ←
// scenarioTurn.actionOutcomeOverrides も同様（既存問題）
```

`FOLLOW_UP_OVERRIDES` エントリは `scenarioTurn.followUpOverrides` に展開されるが直後には読まれず、代わりに `#resolveReplayTurnFollowUpOverrides(turn, ...)` が `overrideEntries` から直接読む。`actionOutcomeOverrides` も同じパターン（既存問題）であり追撃固有のバグではないが、`scenarioTurn` の役割が曖昧になっている。

---

### 問題D: `#buildFollowUpEditorHtml(isCommitted=true)` が無駄に呼ばれる（微小）

**場所**: [ui-next/components/turn-row.js:2341-2358](../ui-next/components/turn-row.js#L2341-L2358)

```javascript
const followUpControlHtml = `
  ...
  ${this.#buildFollowUpEditorHtml(isCommitted)}   // isCommitted=true の場合も生成
`;
if (isCommitted) {
  return `...<button data-role="edit-btn">編集</button>...`;
  // early return → followUpControlHtml は捨てられる
}
```

`isCommitted=true` の際に `followUpControlHtml` を生成するが early return で破棄される。`manualBreakControlHtml` も同じ既存パターン。軽微なパフォーマンス無駄。

---

## 優先度まとめ（初回レビュー分）

| 優先度 | 問題 | 推奨対処 |
|--------|------|----------|
| P2 | 問題B: テストの結合度が高い | `pursuedHitCount` 設定テストと SP 変化テストを分離 |
| P3 | 問題A: `followUp` 死データ | アクション dict から `followUp` プロパティを削除 |
| P4 | 問題C: `scenarioTurn` 未使用フィールド | 既存パターン踏襲のため今回は放置可 |
| P4 | 問題D: dead call | 既存パターン踏襲のため今回は放置可 |

---

## 追加指摘事項（ユーザー報告・第2回追加レビュー）

### 問題E: 【P0】追撃を実行しても OD ゲージが増加しない → ✅ 修正済み（部分的に不完全、問題E-2 参照）

**重要度**: P0（機能の存在意義に関わる致命的欠陥）  
**場所**: [src/turn/turn-controller.js:5656-5712](../src/turn/turn-controller.js#L5656-L5712) `computeOdGaugeGainPercentBySkill()`

**修正状態**: `pursuedHitCount` を `hitCountPerEnemy` に加算する修正が適用された。ただし以下の設計欠陥が残存。

---

### 問題E-2: 【P0】追撃ヒットの OD 計算が前衛の行動から独立していない

**重要度**: P0（追撃機能の根本設計に関わる致命的欠陥）  
**場所**: [src/turn/turn-controller.js:5656-5724](../src/turn/turn-controller.js#L5656-L5724) `computeOdGaugeGainPercentBySkill()` 全体  
**関連**: [src/turn/turn-controller.js:5746-5830](../src/turn/turn-controller.js#L5746-L5830) `applyOdGaugeFromActions()` ループ

#### ゲーム公式仕様（[追撃ヘルプ](../help/HEAVEN_BURNS_RED/バトル/追撃.md)より）

> 追撃は後衛にいるときに発動するアビリティです。前衛がスキル攻撃を行ったときに一定の確率で発動し、**SPを消費しない無属性の攻撃**を行います。  
> **追撃はバトル中に付与されたスキル攻撃に対するバフ/デバフの効果を受けません。**

追撃は前衛の行動とは**完全に独立した1ヒットの無属性ダメージ攻撃**である。

#### 根本原因

現在の実装は `pursuedHitCount` を前衛の `actionEntry` に付加し、`computeOdGaugeGainPercentBySkill()` 内で前衛のスキルのヒット数に加算している。このため、追撃ヒットの OD 計算が前衛のスキル属性・バフ状態すべてに依存してしまう。

#### 前衛の状態が追撃ヒットに不正に影響する箇所（全7箇所）

| # | 影響 | コード位置 | 内容 |
|---|------|-----------|------|
| 1 | **hasDamage ゲート** | [5669-5672行](../src/turn/turn-controller.js#L5669-L5672) | 前衛が非ダメージスキル（Protection・指揮行動等）→ `return 0` で追撃 OD がゼロ |
| 2 | **ドライブピアス補正** | [5706-5707行](../src/turn/turn-controller.js#L5706-L5707) | 前衛の `drivePiercePercent` による OD 倍率が追撃ヒットにも適用される |
| 3 | **Funnel ヒットボーナス** | [5783-5788行](../src/turn/turn-controller.js#L5783-L5788) | 前衛の Funnel ステータスから `funnelHitBonus` が計算され、追撃と合算される |
| 4 | **通常攻撃の最低3hit保証** | [5689-5691行](../src/turn/turn-controller.js#L5689-L5691) | 前衛の通常攻撃判定で `Math.max(3, hitCount)` が適用され、追撃ヒットが混入 |
| 5 | **全体攻撃の敵数倍** | [5688行](../src/turn/turn-controller.js#L5688) | 追撃ヒットが `hitCountPerEnemy` 経由で敵数倍される（本来1体への1ヒット） |
| 6 | **敵 od_rate 補正** | [5826-5828行](../src/turn/turn-controller.js#L5826-L5828) | `odRateMultiplier` が `odGaugeGain` 全体にかかり追撃ヒット分にも敵レート補正が適用 |
| 7 | **perHitGain 計算経路** | [5704-5712行](../src/turn/turn-controller.js#L5704-L5712) | 非通常攻撃スキルの場合、ドライブピアス倍率 `multiplier` が全ヒットに同一適用 |

#### 具体例1: 前衛が非ダメージスキルの場合

| 前衛 | 行動 | 追撃 | 現状の OD | 正しい OD |
|------|------|------|----------|----------|
| [0] | 通常攻撃（ダメージ） | あり | 2.5% 増加 | 2.5% 増加 ✅ |
| [2] | 指揮行動（非ダメージ） | あり | **0% 増加** | 2.5% 増加 ❌ |

#### 具体例2: 全体攻撃 + 追撃（敵3体）

| 計算 | 現状（バグ） | 正しい値 |
|------|------------|---------|
| 前衛スキルヒット | 1hit × 3体 = 3 | 1hit × 3体 = 3 |
| 追撃ヒット | **1 × 3体 = 3** | 1（特定1体への1ヒット） |
| 合計 | 6hit → 15% | 4hit → 10% |

#### 具体例3: ドライブピアス状態の前衛 + 追撃

前衛にドライブピアス補正がある場合、`perHitGain = 2.5% × multiplier` が全ヒット（追撃含む）に適用される。追撃はバフ/デバフの効果を受けないため、追撃ヒットの OD 寄与は `追撃ヒット数 × OD_GAUGE_PER_HIT_PERCENT` 固定であるべき（ドライブピアス multiplier を適用しない）。

#### 修正方針：追撃 OD を `computeOdGaugeGainPercentBySkill` の外で独立計算

`pursuedHitCount` を `hitCountPerEnemy` に加算するアプローチでは、上記7箇所すべてに個別対処が必要になり、既存ロジックの複雑化を招く。代わりに、追撃ヒットの OD 寄与を **`applyOdGaugeFromActions()` ループ内で独立計算** すべき。

```javascript
// applyOdGaugeFromActions() 内、computeOdGaugeGainPercentBySkill() 呼び出しの後
const odGaugeGain = computeOdGaugeGainPercentBySkill(
  skill, state, enemyCount, member, actionEntry, { funnelHitBonus }
);

// 追撃ヒット OD を前衛スキルから独立して計算
// pursuedHitCount は追撃スキルの実際のヒット数（武器種別により 1〜5、問題E-4 参照）
const pursuedHitCount = Math.max(0, Number(actionEntry?.pursuedHitCount ?? 0));
const pursuitOdGain = pursuedHitCount > 0
  ? truncateToTwoDecimals(pursuedHitCount * OD_GAUGE_PER_HIT_PERCENT)
  : 0;
// 注意: 通常攻撃と異なり、追撃には最低3hit保証（最小OD上昇量保証）はない

// 合算（追撃分はドライブピアス・Funnel・敵数倍などの影響を受けない）
const totalOdGaugeGain = truncateToTwoDecimals(odGaugeGain + pursuitOdGain);
```

同時に `computeOdGaugeGainPercentBySkill()` 内の `pursuedHitBonus` 加算（5681行・5683行）を**除去**する。これにより前衛のスキル計算は追撃を一切知らず、追撃の OD 計算は前衛の状態を一切参照しない、完全な分離が実現する。

**注意**: 敵 `od_rate` 補正（5826-5828行）を追撃ヒットにも適用すべきかは未確認。ゲーム仕様上「バフ/デバフの効果を受けない」のは味方側の効果を指しており、敵固有レートは別概念の可能性がある。要検証。

---

### 問題E-4: 【P0】追撃ヒット数が `1` にハードコードされている

**重要度**: P0（追撃 OD 増加量が武器種別に関わらず常に同じになる致命的欠陥）  
**場所**: [ui-next/engine/turn-engine-manager.js:1595](../ui-next/engine/turn-engine-manager.js#L1595)

**根本原因**: `#buildActionsDict()` で追撃ヒット数が `pursuedHitCount: 1` にハードコードされている。

```javascript
// ui-next/engine/turn-engine-manager.js:1593-1597
...(followUpEnemyIndex !== null && followUpEnemyIndex !== undefined
  ? {
      pursuedHitCount: 1,    // ← 常に 1。実際は武器種別で 1〜5
    }
  : {}),
```

**実際の追撃ヒット数**（[追撃ヘルプ](../help/HEAVEN_BURNS_RED/バトル/追撃.md) 参照）:

| 武器種別 | ヒット数 | 例外 |
|---------|---------|------|
| Gun | 1 | 水瀬いちごのみ 2 |
| DoubleSword | 2 | — |
| LargeSword | 2 | — |
| Cannon | 3 | — |
| Shield | 3 | — |
| Claw | 3 | — |
| Scythe | 4 | 山脇・ボン・イヴァールのみ 3 |
| Sword | 4 | — |
| 特殊（大島四ツ葉・温泉手形） | 5 | ネコジェット・シャテキ |

**影響**: 追撃の OD 増加量は `追撃ヒット数 × OD_GAUGE_PER_HIT_PERCENT` で計算されるべきだが、現在は常に `1 × 2.5% = 2.5%` になる。Sword キャラ（4hit）なら本来 `4 × 2.5% = 10%` であるべきところが `2.5%` しか増加しない。

**ヒット数解決ロジック**（追撃ヘルプに詳細記載あり、推奨順）:
1. `skills.json` からキャラ/スタイルに対応する exact name `追撃` の `hit_count` を取得
2. exact record がない場合、`styles.json` の `weapon.type` からフォールバックテーブルで決定
3. Gun・Scythe には例外マッピングあり（武器種だけでは確定しない）
4. 大島四ツ葉の温泉手形による変化（ネコジェット・シャテキ → 5hit）にも対応が必要

**修正方針**: `#buildActionsDict()` で、追撃を行う後衛メンバーの追撃スキルから `hit_count` を取得し、`pursuedHitCount` に設定する。

```javascript
// 後衛メンバーの追撃スキルからヒット数を解決
const backMember = state.party.find(m => m.position === member.position + 3);
const pursuitSkill = backMember?.getActionSkills?.()?.find(s => isPursuitOnlySkill(s));
const pursuitHitCount = pursuitSkill ? resolveSkillHitCount(pursuitSkill) : 0;

pursuedHitCount: pursuitHitCount > 0 ? pursuitHitCount : 1,  // フォールバック 1
```

**注意**: 通常攻撃には最低3hit保証（`Math.max(3, hitCount)`、[5689-5691行](../src/turn/turn-controller.js#L5689-L5691)）があるが、追撃には**最低保証はない**。追撃の OD 計算で `Math.max(3, ...)` を適用してはならない。

---

### 問題F: 【P0】追撃メニューを開閉すると OD プレビュー値が消失する → ✅ 修正済み

**重要度**: P0（ユーザー操作で正常なプレビューが壊れる）  
**場所**: [ui-next/components/turn-row.js:2555-2565](../ui-next/components/turn-row.js#L2555-L2565)

**修正確認**: 追撃トグルハンドラに `this.#emitPreviewRequest()` が追加されており、修正済み。

---

### 問題F-2: 【P1】ブレイクメニューを開閉すると OD プレビュー値が消失する（既存バグ）

**重要度**: P1（追撃メニューと同一パターンのバグが既存コードにも存在）  
**場所**: [ui-next/components/turn-row.js:2543-2553](../ui-next/components/turn-row.js#L2543-L2553)

**根本原因**: `manual-break-toggle` ハンドラにも `#emitPreviewRequest()` が欠落している。追撃トグルは修正されたが、ブレイクトグルは未修正のまま残っている。

```javascript
// ui-next/components/turn-row.js:2543-2553 (現状)
this.#root.querySelectorAll('[data-role="manual-break-toggle"]').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    this.#openTargetPickerPartyIndex = null;
    this.#isBreakEditorOpen = !this.#isBreakEditorOpen;
    this.#isFollowUpEditorOpen = false;
    if (this.#isDraftMode()) {
      this.#rerenderDraftMode();
      // ❌ this.#emitPreviewRequest() が呼ばれていない
    }
  });
});
```

**比較**: 他のすべてのドラフト状態変更ハンドラ（追撃トグル、ブレイク敵選択、追撃敵選択、ターゲットピッカー等）は `#emitPreviewRequest()` を呼んでおり、ブレイクトグルのみ欠落。

**修正方針**: `#rerenderDraftMode()` の直後に `this.#emitPreviewRequest()` を追加する。

---

### 問題G: 【P1】追撃メニューがビューポート外に描画される（Turn 1 で発生）

**重要度**: P1（機能は使えるがスクロール必須で UX が著しく低下）  
**場所**: [ui-next/components/turn-row.js:1365-1367](../ui-next/components/turn-row.js#L1365-L1367)（追撃メニュー HTML）

**根本原因**: 追撃メニューは `position: absolute` のみで配置されており、ビューポート境界を考慮するロジックがない。一方、ブレイクメニューにはビューポート対応の JavaScript ポジショニングロジック（line 2905-2958）が実装されている。

**ブレイクメニューの実装（参考にすべき実装）**:
```javascript
// ui-next/components/turn-row.js:2919-2955
// data-popover-kind="manual-break" を検出
// position: 'fixed' に変換
// ビューポート幅に基づいて横位置を計算
// 下にスペースがなければ上側に展開（フリップ）
// max-height + overflow: auto でスクロール対応
```

**追撃メニューの現状**:
- `absolute right-0 top-[calc(100%+4px)] z-30` のみ
- ビューポート対応なし → Turn 1 では親要素が画面上部にあるため、メニューが描画領域外に展開される

**修正方針**: ブレイクメニューと同様に `data-popover-kind` を設定し、既存のビューポート対応ポジショニングロジックを追撃メニューにも適用する。

---

## テスト行数減少についての調査結果

**結論: テストは削除されていない。むしろ増加している。**

| ファイル | テスト数 | 状態 |
|----------|---------|------|
| `tests/ui-next-follow-up-integration.test.js` | 4 | 新規（未コミット） |
| `tests/ui-next-follow-up-overrides.test.js` | 12 | 新規（未コミット） |
| `tests/turn-state-transitions.test.js`（P2-B セクション） | 2 | 既存（`babf117` 以降） |
| **合計** | **18** | |

- `git log --diff-filter=D` で follow-up 関連テストファイルの削除履歴なし
- `turn-state-transitions.test.js` は `babf117` 時点の 330 テスト → 現在 385 テスト（増加）
- 行数の減少は、第1回レビュー指摘への対応でコードをリファクタリング（冗長なコード削減）した結果と推定される

---

## 優先度まとめ（全問題統合）

| 優先度 | 問題 | 状態 | 推奨対処 |
|--------|------|------|----------|
| **P0** | **問題E-2: 追撃 OD が前衛の行動から独立していない** | ✅ 修正済み | 追撃 OD を `applyOdGaugeFromActions` 内で独立計算し、`computeOdGaugeGainPercentBySkill` から `pursuedHitBonus` を除去 |
| **P0** | **問題E-4: 追撃ヒット数が `1` にハードコード** | ✅ 修正済み | 後衛メンバーの追撃スキル `hit_count` から解決（武器種別で 1〜5） |
| **P1** | **問題F-2: ブレイクメニュー開閉で OD プレビュー消失** | ✅ 修正済み | ブレイクトグルに `#emitPreviewRequest()` を追加 |
| ~~P0~~ | ~~問題E: OD ゲージが追撃で増加しない~~ | ✅ 修正済み | `computeOdGaugeGainPercentBySkill` に `pursuedHitCount` を加算 |
| ~~P0~~ | ~~問題F: 追撃メニュー開閉で OD プレビュー消失~~ | ✅ 修正済み | トグルハンドラに `#emitPreviewRequest()` を追加 |
| ~~P1~~ | ~~問題G: 追撃メニューがビューポート外に描画~~ | ✅ 修正済み | ブレイクメニュー同様のビューポート対応ポジショニングを実装 |
| P2 | 問題B: テストの結合度が高い | ✅ 修正済み | `pursuedHitCount` 設定テストと SP 変化テストを分離 |
| P3 | 問題A: `followUp` 死データ | ✅ 修正済み | アクション dict から `followUp` プロパティを削除 |
| P4 | 問題C: `scenarioTurn` 未使用フィールド | — | 既存パターン踏襲のため今回は放置可 |
| P4 | 問題D: dead call | — | 既存パターン踏襲のため今回は放置可 |

### 追加すべきテスト

#### 前衛からの独立性（問題E-2）

| テスト内容 | 対応 |
|-----------|------|
| 前衛 Protection（非ダメージ） + 追撃 → 追撃ヒット数に応じた OD 増加があること | #1 hasDamage ゲート |
| 全体攻撃スキル + 追撃（敵3体） → 追撃分 OD が敵数倍されないこと | #5 敵数倍 |
| ドライブピアス状態の前衛 + 追撃 → 追撃分 OD にドライブピアス倍率が乗らないこと | #2 ドライブピアス |
| Funnel 状態の前衛 + 追撃 → 追撃分 OD に Funnel ヒットボーナスが乗らないこと | #3 Funnel |
| 通常攻撃（最低3hit保証）+ 追撃 → 追撃ヒットが3hit保証に混入しないこと | #4 通常攻撃 |
| 追撃に最低3hit保証が適用されないこと（Gun 1hit → OD 2.5%、3hit保証で 7.5% にならない） | 最小保証なし |

#### 武器種別ヒット数（問題E-4）

| テスト内容 | 対応 |
|-----------|------|
| Gun（1hit）の追撃 → OD `1 × 2.5% = 2.5%` | 基本ヒット数 |
| DoubleSword / LargeSword（2hit）の追撃 → OD `2 × 2.5% = 5%` | 基本ヒット数 |
| Cannon / Shield / Claw（3hit）の追撃 → OD `3 × 2.5% = 7.5%` | 基本ヒット数 |
| Sword / Scythe（4hit）の追撃 → OD `4 × 2.5% = 10%` | 基本ヒット数 |
| 武器種別が異なる後衛キャラ2名が同時に追撃 → それぞれ固有のヒット数で OD 増加 | 複合ケース |

#### 追撃の属性独立性

| テスト内容 | 対応 |
|-----------|------|
| 属性ベルト装備で通常攻撃が属性化していても、追撃は常に無属性であること | 公式仕様「SPを消費しない**無属性の攻撃**」 |

---

## 総合評価

初回レビュー指摘（P0〜P3）はすべて修正済み。第2回追加レビューの問題 E・F・G も修正が適用された。

しかし、第3回レビュー（ユーザー実機テスト＋公式仕様照合）により、**追撃 OD 計算の根本的な設計欠陥**が判明した：

### 問題E-2の本質

現在の実装は `pursuedHitCount` を前衛の `hitCountPerEnemy` に加算するアプローチだが、これでは追撃ヒットが前衛のスキル属性・バフ状態 **7箇所** に依存してしまう：

1. 前衛が非ダメージスキル → 追撃 OD がゼロ
2. 前衛のドライブピアス補正 → 追撃に倍率が乗る
3. 前衛の Funnel ボーナス → 追撃と合算される
4. 通常攻撃の最低3hit保証 → 追撃ヒットが混入
5. 全体攻撃の敵数倍 → 追撃が敵数倍される（実機で確認済み）
6. 敵 od_rate 補正 → 追撃に敵レートが適用
7. 非通常攻撃の perHitGain 経路 → ドライブピアス倍率が追撃に乗る

公式仕様では「追撃はバトル中に付与されたスキル攻撃に対するバフ/デバフの効果を受けません」と明記されており、追撃は前衛の行動と**完全に独立した無属性攻撃**である（ヒット数は武器種別により 1〜5 で変動）。

**必要な対処**:
1. **OD 計算の分離**: `hitCountPerEnemy` への加算ではなく、`applyOdGaugeFromActions()` 内で追撃 OD を独立計算し、`computeOdGaugeGainPercentBySkill()` から `pursuedHitBonus` を完全に除去する
2. **ヒット数の解決**: `pursuedHitCount: 1` のハードコードを廃止し、後衛メンバーの追撃スキルの `hit_count`（`skills.json` の exact name `追撃` レコード）から正しいヒット数を取得する（[追撃ヘルプ](../help/HEAVEN_BURNS_RED/バトル/追撃.md) に解決ロジック詳細あり）
3. **最小保証なし**: 通常攻撃には最低3hit保証があるが、追撃にはない。追撃の OD 計算に `Math.max(3, ...)` を適用してはならない

加えて、**ブレイクメニューのトグルハンドラにも `#emitPreviewRequest()` 欠落が発見**された（問題F-2）。これは追撃実装以前からの既存バグだが、追撃メニューの修正時に発見されたため記録する。
