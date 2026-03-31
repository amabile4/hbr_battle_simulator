# 国士無双・追加ターン未発生 調査報告

> **ステータス**: ✅ 完了 | 📅 最終更新: 2026-03-30

## 概要

セッション JSON（`ui_next_session_2026-03-30T07-28-15.502Z.json`）の #4ターン（エントリ index 3）で、
二階堂 三郷が国士無双（skill id: 46005117）を OD2 中に使用したが追加ターンが発生しなかった。

---

## 再現条件

| 項目 | 値 |
|------|-----|
| スキル | 国士無双 (id: 46005117) |
| キャラ | 二階堂 三郷 |
| ターン状態 | OD2 (`ReserveInterruptOd` で OD2 を予約、エントリ index 1) |
| `validationPolicy.allowSkillConditionMismatch` | `true` |

---

## 根本原因

### 問題の所在: `getAdditionalTurnRule()` が `SkillCondition.strval` を再帰しない

`src/data/hbr-data-store.js` の `getAdditionalTurnRule()`（line 1059〜1122 付近）は、
スキルの `parts` 配列を**フラットに走査**して `AdditionalTurn` を探す:

```javascript
const hasAdditionalTurnPart = (skill.parts ?? []).some(
  (part) => String(part.skill_type ?? '') === 'AdditionalTurn'
);
if (!hasAdditionalTurnPart) {
  return null;
}
```

### 国士無双のスキルデータ構造

`json/skills.json` の国士無双（id: 46005117）の `parts` は次の構造:

```
parts: [
  {
    skill_type: "SkillCondition",        // ← トップレベルはこれだけ
    cond: "IsOverDrive()",
    strval: [
      // [0] OD 有効バリアント (id: 46005118)
      {
        parts: [
          { skill_type: "AttackSkill", ... },
          { skill_type: "AdditionalTurn", target_type: "Self" },  // ← ここにある
          ...
        ]
      },
      // [1] OD 無効バリアント (id: 46005119)
      {
        parts: [
          { skill_type: "AttackSkill", ... }
          // AdditionalTurn なし
        ]
      }
    ]
  }
]
```

`AdditionalTurn` は `parts[0].strval[0].parts` に存在するが、
`getAdditionalTurnRule()` はトップレベル `parts` しか見ないため
`hasAdditionalTurnPart = false` → `return null` となる。

### 波及経路

```
getAdditionalTurnRule()
  └─ AdditionalTurn がトップレベルにない → return null
       ↓
skill.additionalTurnRule = null  (HbrDataStore でキャッシュ)
       ↓
deriveGrantedExtraTurnCharacterIds() (turn-controller.js line ~7162)
  └─ if (!skill?.additionalTurnRule) { continue; }  ← ここでスキップ
       ↓
追加ターン付与ゼロ → 追加ターン発生なし
```

OD 状態の有無・`requiresOverDrive` チェックに到達する前に、
`additionalTurnRule === null` でスキップされるため、OD 中であっても一切機能しない。

---

## 修正方針（2案）

### 案A: `getAdditionalTurnRule()` が `SkillCondition.strval` を再帰する（推奨）

`getAdditionalTurnRule()` の中で `SkillCondition` パートに遭遇したとき、
`strval` 内の各バリアントを再帰的に走査して `AdditionalTurn` を探す。

```javascript
// 疑似コード
function collectAdditionalTurnParts(parts) {
  const result = [];
  for (const part of parts ?? []) {
    if (String(part.skill_type) === 'AdditionalTurn') {
      result.push(part);
    } else if (String(part.skill_type) === 'SkillCondition') {
      // strval の各バリアントを再帰
      for (const variant of part.strval ?? []) {
        result.push(...collectAdditionalTurnParts(variant?.parts));
      }
    }
  }
  return result;
}
```

`getAdditionalTurnRule()` の戻り値として `requiresOverDrive` フラグも設定する場合は、
`SkillCondition.cond === 'IsOverDrive()'` バリアントの `strval[0]` に含まれる場合のみ
`requiresOverDrive: true` を付与するロジックも必要になる。

**メリット**: スキルデータの構造がそのまま正しく反映される。他の `SkillCondition` ネストスキルにも自動適用。
**注意点**: `requiresOverDrive` の判定ロジックが複雑になる（どのバリアントに入っているかで条件が変わる）。

### 案B: `deriveGrantedExtraTurnCharacterIds()` で有効パーツを実行時解決する

`additionalTurnRule` の pre-compute に頼らず、`deriveGrantedExtraTurnCharacterIds()` の中で
`resolveEffectiveSkillParts(skill, turnState, member)` を呼んで有効パーツを実行時に決定する。

**メリット**: OD 状態・キャラ状態に応じた正確なパーツ選択が行える。
**デメリット**: ターン評価のホットパスに追加コストが生じる可能性。

---

## 影響範囲

| 対象 | 影響 |
|------|------|
| `src/data/hbr-data-store.js` | 案A: `getAdditionalTurnRule()` に再帰ロジック追加 |
| `src/turn/turn-controller.js` | 案B: `deriveGrantedExtraTurnCharacterIds()` の参照先変更 |
| `SkillCondition` でラップされた `AdditionalTurn` を持つ全スキル | 同様の問題が発生している可能性あり |

---

## 関連ファイル

| ファイル | 該当箇所 |
|---------|---------|
| [src/data/hbr-data-store.js](../../src/data/hbr-data-store.js) | `getAdditionalTurnRule()` line ~1059 |
| [src/turn/turn-controller.js](../../src/turn/turn-controller.js) | `deriveGrantedExtraTurnCharacterIds()` line ~7153 |
| [json/skills.json](../../json/skills.json) | id: 46005117（国士無双）, 46005118（OD variant）, 46005119（非OD variant） |

---

## 実施内容

- `src/data/hbr-data-store.js` の `getAdditionalTurnRule()` を修正し、`SkillCondition.strval` 配下を再帰走査して `AdditionalTurn` を収集するように対応。
- 追加ターン検出時は、親 `SkillCondition` / variant の `cond`・`iuc_cond` を条件フラグへマージすることで、`requiresOverDrive` 等の文脈を保持。

## テスト

- Unit: `node --test tests/data-store-operations.test.js`（PASS）
  - 実データ回帰として `46005117`（国士無双）の `getAdditionalTurnRule()` が `requiresOverDrive: true` かつ `Self` 付与対象を返すことを検証。
- E2E: `npm run test:e2e -- tests/e2e/kokushipmusoujou-additional-turn.spec.js`（PASS）
  - 再現セッション `ui_next_session_2026-03-30T07-28-15.502Z.json` を読み込み、国士無双実行後の入力行が `EX` 表示になることを確認。

## ステータス

✅ 完了（修正・Unit/E2E確認済み, 2026-03-30）
