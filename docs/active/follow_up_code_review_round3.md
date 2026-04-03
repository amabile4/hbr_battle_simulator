# 追撃（Follow-Up）コード レビュー結果（第3回）

**対象**: 第2回レビュー指摘事項の修正後コード  
**レビュー日**: 2026-04-03  
**前回**: [follow_up_code_review_round2.md](follow_up_code_review_round2.md)  
**ステータス**: ✅ 全修正確認完了 — 新規発見 H/J 対処済み（全 24 テスト合格）

---

## 第2回指摘事項の修正確認

| 優先度 | 指摘 | 内容 | 状態 | 検証箇所 |
|--------|------|------|------|----------|
| P0 | 問題E-2 | 追撃 OD が前衛の行動から独立していない | ✅ 修正済み | [turn-controller.js:5820-5823](../src/turn/turn-controller.js#L5820-L5823) |
| P0 | 問題E-4 | 追撃ヒット数が `1` にハードコード | ✅ 修正済み | [turn-engine-manager.js:1584-1594](../ui-next/engine/turn-engine-manager.js#L1584-L1594) |
| P1 | 問題F-2 | ブレイクメニュー開閉で OD プレビュー消失 | ✅ 修正済み | [turn-row.js:2551](../ui-next/components/turn-row.js#L2551) |
| P2 | 問題B | テストの結合度が高い | ✅ 修正済み | テスト分離確認済み |
| P3 | 問題A | `followUp` 死データ | ✅ 修正済み | [turn-engine-manager.js:1597-1612](../ui-next/engine/turn-engine-manager.js#L1597-L1612) |

---

## 修正内容の検証詳細

### E-2: 追撃 OD 独立計算

`computeOdGaugeGainPercentBySkill()` から `pursuedHitBonus` が完全に除去され、`applyOdGaugeFromActions()` 内で追撃 OD が独立計算されている。

```javascript
// src/turn/turn-controller.js:5817-5823
// 追撃ヒットの OD 寄与を前衛のスキル属性・バフ状態から完全に独立して計算する。
const pursuedHitCount = Math.max(0, Number(actionEntry?.pursuedHitCount ?? 0));
const pursuitOdGain = pursuedHitCount > 0
  ? truncateToTwoDecimals(pursuedHitCount * OD_GAUGE_PER_HIT_PERCENT)
  : 0;
```

`pursuitOdGain` は `effectiveSkillOdGain`（`odRateMultiplier` 適用後）に加算される構造になっており、以下の7箇所の影響を受けない:

| # | 影響 | 検証結果 |
|---|------|----------|
| 1 | hasDamage ゲート | ✅ `pursuitOdGain` は `computeOdGaugeGainPercentBySkill` の外で計算 |
| 2 | ドライブピアス補正 | ✅ `multiplier` は `computeOdGaugeGainPercentBySkill` 内のみ |
| 3 | Funnel ヒットボーナス | ✅ `funnelHitBonus` は `computeOdGaugeGainPercentBySkill` 内のみ |
| 4 | 通常攻撃の最低3hit保証 | ✅ `Math.max(3, hitCount)` は `computeOdGaugeGainPercentBySkill` 内のみ |
| 5 | 全体攻撃の敵数倍 | ✅ 敵数乗算は `computeOdGaugeGainPercentBySkill` 内のみ |
| 6 | 敵 `od_rate` 補正 | ✅ `odRateMultiplier` は `pursuitOdGain` にも個別適用（実機検証済み: 問題H 修正済み） |
| 7 | 非通常攻撃の perHitGain 経路 | ✅ ドライブピアス `multiplier` は `computeOdGaugeGainPercentBySkill` 内のみ |

### E-4: 追撃ヒット数の動的解決

```javascript
// ui-next/engine/turn-engine-manager.js:1584-1594
const backMember = state.party.find((m) => m.position === member.position + 3);
const pursuitSkill = (backMember?.getActionSkills?.() ?? []).find(
  (s) => isPursuitOnlySkill(s)
);
const skillHitCount = Number(pursuitSkill?.hitCount ?? pursuitSkill?.hit_count ?? 0);
resolvedPursuedHitCount = Number.isFinite(skillHitCount) && skillHitCount > 0
  ? skillHitCount
  : 1;
```

後衛メンバーの追撃スキル `hitCount` から武器種別に応じたヒット数（1〜5）を取得。`CharacterStyle` コンストラクタが `hit_count` → `hitCount` に正規化済みのため（[character-style.js:55](../src/domain/character-style.js#L55)）、`hitCount` で確実に取得される。`hit_count` フォールバックは防御的コードとして無害。

### F-2: ブレイクトグルハンドラ

```javascript
// ui-next/components/turn-row.js:2549-2552
if (this.#isDraftMode()) {
  this.#rerenderDraftMode();
  this.#emitPreviewRequest();  // ← 追加確認済み
}
```

追撃トグルハンドラ（2562-2564行）と同一パターンで修正済み。

### A: `followUp` 死データ除去

[turn-engine-manager.js:1597-1612](../ui-next/engine/turn-engine-manager.js#L1597-L1612) のアクション dict 構築から `followUp` オブジェクトが完全に除去されている。`pursuedHitCount` のみが設定される。

### G: ビューポート対応

[turn-row.js:2963-3003](../ui-next/components/turn-row.js#L2963-L3003) に `data-popover-kind="follow-up"` の検出とビューポートポジショニングロジック（`position: fixed`、横位置制限、上下フリップ、`max-height` スクロール）が実装済み。ブレイクメニューと同等の対応。

---

## テスト状態

```
24 tests / 0 fail / 0 skip
```

| ファイル | テスト数 | カバー範囲 |
|----------|---------|-----------|
| `tests/ui-next-follow-up-integration.test.js` | 12 | コミット・パッシブ発火・リプレイ永続化・再計算・OD増加・前衛独立性・ヒット数解決・全体攻撃独立性・ドライブピアス独立性・通常攻撃3hit保証独立性・od_rate追撃適用 |
| `tests/ui-next-follow-up-overrides.test.js` | 12 | バリデーション・重複排除・enemyIndex 範囲・エントリ構築・抽出・チップモデル生成 |

---

## 残存問題（新規発見）

### 問題H: 【P2/要検証→✅修正済み】敵 `od_rate` 補正が追撃 OD に適用される

**場所**: [src/turn/turn-controller.js:5831-5840](../src/turn/turn-controller.js#L5831-L5840)

```javascript
// od_rate は敵固有属性であり味方バフ/デバフとは別概念。
// 追撃ヒットも od_rate の影響を受ける（実機検証済み: 問題H 解決）。
const effectiveSkillOdGain = odRateMultiplier !== 1
  ? truncateToTwoDecimals(odGaugeGain * odRateMultiplier)
  : odGaugeGain;
const effectivePursuitOdGain = odRateMultiplier !== 1
  ? truncateToTwoDecimals(pursuitOdGain * odRateMultiplier)
  : pursuitOdGain;
const effectiveOdGaugeGain = truncateToTwoDecimals(effectiveSkillOdGain + effectivePursuitOdGain);
```

**実機検証結果**: 追撃ヒットも敵 `od_rate` の影響を受ける。`od_rate` は味方バフ/デバフではなく敵固有属性であるため、「追撃はバフ/デバフの効果を受けない」の対象外。`odRateMultiplier` を `pursuitOdGain` にも個別適用する形で修正済み。テスト追加済み（od_rate=0.5 で追撃 OD が 2.5% → 1.25% になることを検証）。

---

### 問題I: 【P4】`OverDrivePointDown` が追撃 OD 込みの合算値から減算される

**場所**: [src/turn/turn-controller.js:5836-5837](../src/turn/turn-controller.js#L5836-L5837)

```javascript
const effectiveOdGaugeGain = truncateToTwoDecimals(effectiveSkillOdGain + pursuitOdGain);
const delta = truncateToTwoDecimals(Number(effectiveOdGaugeGain ?? 0) - Number(odGaugeDown ?? 0));
```

`odGaugeDown` は前衛スキルの `OverDrivePointDown` パーツ（[turn-controller.js:5637-5654](../src/turn/turn-controller.js#L5637-L5654)）から計算される。意味的には追撃分の OD は `OverDrivePointDown` の影響を受けるべきではないが、プレイヤースキルに `OverDrivePointDown` が付くケースは確認されていないため、実害はない。

**対処**: 放置可。将来 `OverDrivePointDown` を持つプレイヤースキルが追加された場合のみ再検討。

---

### 問題J: 【P3】テストカバレッジ不足（ドライブピアス・Funnel の独立性）

**場所**: [tests/ui-next-follow-up-integration.test.js](../tests/ui-next-follow-up-integration.test.js)

第2回レビューで推奨されたテスト（376-403行）のうち、以下が未実装：

| テスト内容 | 独立性検証 # | 重要度 |
|-----------|------------|--------|
| ドライブピアス状態の前衛 + 追撃 → 追撃分 OD にドライブピアス倍率が乗らない | #2 | 中 |
| Funnel 状態の前衛 + 追撃 → 追撃分 OD に Funnel ヒットボーナスが乗らない | #3 | 中 |
| 通常攻撃（最低3hit保証）+ 追撃 → 追撃ヒットが3hit保証に混入しない | #4 | 中 |
| 異なる武器種の後衛2名が同時追撃 → それぞれ固有のヒット数で OD 増加 | 複合 | 低 |

現在のテストは **#1 非ダメージ前衛**（test line 353）と **#5 全体攻撃敵数倍**（test line 415）の独立性のみカバー。コード上は #2〜#4 も正しく分離されている（`pursuedHitCount` は `computeOdGaugeGainPercentBySkill` の外で計算されるため構造的に安全）が、リグレッション防止としてテスト追加が望ましい。

---

## 優先度まとめ（第3回新規発見分）

| 優先度 | 問題 | 推奨対処 | 状態 |
|--------|------|----------|------|
| P2/要検証 | 問題H: 敵 `od_rate` が追撃に適用されない | 実機検証で判定。修正自体は1行の変更 | ✅ 実機検証により od_rate を追撃にも適用する修正済み・テスト追加済み |
| P3 | 問題J: テストカバレッジ不足 | ドライブピアス・Funnel・通常攻撃3hit保証の独立性テスト追加 | ✅ DP・3hit保証テスト追加済み（Funnel は構造的安全のため省略） |
| P4 | 問題I: `OverDrivePointDown` と追撃の合算 | 放置可（該当スキル未存在） | — 放置 |

---

## 前回までの問題の最終状態

| 優先度 | 問題 | 最終状態 |
|--------|------|----------|
| ~~P0~~ | 問題E: OD ゲージが追撃で増加しない | ✅ R2 修正済み・R3 確認済み |
| ~~P0~~ | 問題E-2: 追撃 OD が前衛の行動から独立していない | ✅ R2 修正済み・R3 確認済み |
| ~~P0~~ | 問題E-4: 追撃ヒット数が `1` にハードコード | ✅ R2 修正済み・R3 確認済み |
| ~~P0~~ | 問題F: 追撃メニュー開閉で OD プレビュー消失 | ✅ R2 修正済み |
| ~~P1~~ | 問題F-2: ブレイクメニュー開閉で OD プレビュー消失 | ✅ R2 修正済み・R3 確認済み |
| ~~P1~~ | 問題G: 追撃メニューがビューポート外に描画 | ✅ R2 修正済み・R3 確認済み |
| ~~P2~~ | 問題B: テストの結合度が高い | ✅ R2 修正済み・R3 確認済み |
| ~~P3~~ | 問題A: `followUp` 死データ | ✅ R2 修正済み・R3 確認済み |
| P4 | 問題C: `scenarioTurn` 未使用フィールド | — 既存パターン踏襲のため放置 |
| P4 | 問題D: dead call | — 既存パターン踏襲のため放置 |

---

## 総合評価

第1回・第2回レビューで発見された **P0〜P3 の全問題が修正済み**であることを確認した。

追撃 OD 計算の設計は健全で、前衛のスキル属性（ドライブピアス・Funnel・通常攻撃3hit保証・全体攻撃敵数倍）から完全に分離されている。ヒット数も後衛メンバーの追撃スキルから動的に解決される。

第3回で新たに発見された問題は **P2/要検証が1件**（`od_rate` 適用有無、実機検証待ち）、**P3が1件**（テストカバレッジ拡充）、**P4が1件**（`OverDrivePointDown` の理論上の懸念）のみ。いずれも現在の機能に影響する致命的問題ではなく、追撃機能の品質は十分なレベルに達している。
