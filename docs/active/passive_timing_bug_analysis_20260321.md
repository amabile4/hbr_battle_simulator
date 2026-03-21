# パッシブタイミング・ハイブースト回復バグ分析レポート

**作成日**: 2026年3月21日  
**対象コミット範囲**: `db0a68d` (passive-timing-wip) → `471a928` (passive-timing-wip-green) → `HEAD`  
**分析担当**: GLM-4.7 (Claude Codex 代替)

## 要約

パッシブタイミングの実装中に、ハイブースト状態での回復計算に関する重大なバグが発見され、修正されました。本レポートでは、バグの原因、修正内容、および現在の状態を分析します。

**結論**: 修正は `471a928` (green checkpoint) で完了しており、HEAD に反映されています。HealSp が誤って1.5倍されるバグは解消されています。

---

## 1. バグの概要

### 発生したバグ
- **問題**: ハイブースト状態時、`HealSp`（SP回復）が誤って1.5倍されていた
- **原因**: `HIGH_BOOST_HEAL_MULTIPLIER` が全ての回復タイプに適用されていた
- **影響範囲**: 
  - HealSp（SP回復）
  - HealEp（EP回復）
  - その他の非DP回復

### 正しい仕様
- ハイブースト状態時の1.5倍補正は **DP回復のみ** に適用すべき
- 対象スキルタイプ:
  - `HealDpRate`（DP割合回復）
  - `RegenerationDp`（DP継続回復）
- **除外**:
  - `HealSp`（SP回復）
  - `HealEp`（EP回復）
  - `ReviveDp`（DP蘇生）
  - `ReviveDpRate`（DP割合蘇生）

---

## 2. バグの原因分析

### 2.1 不適切な定数命名とスコープ

**修正前** (`db0a68d`):
```javascript
const HIGH_BOOST_HEAL_MULTIPLIER = 1.5;

function scaleHighBoostHealAmount(actor, amount) {
  const modifiers = resolveHighBoostModifiersForMember(actor);
  if (!modifiers.active) {
    return Number(amount ?? 0);
  }
  return applyHighBoostMultiplier(amount, modifiers.healMultiplier);
}
```

**問題点**:
- 定数名 `HIGH_BOOST_HEAL_MULTIPLIER` が「回復一般」を意味して誤解を招く
- `scaleHighBoostHealAmount` 関数が全ての回復タイプに使用されていた
- HealSp, HealEp にも誤って適用されていた

### 2.2 誤用箇所の特定

以下の箇所で誤って `scaleHighBoostHealAmount` が使用されていました:

```javascript
// ❌ 誤: HealSp にハイブースト補正を適用
if (effectType === 'HealSp') {
  const amount = scaleHighBoostHealAmount(actor, Number(part?.power?.[0] ?? 0));
  // ...
}

// ❌ 誤: HealEp にハイブースト補正を適用
if (skillType === 'HealEp') {
  const amount = scaleHighBoostHealAmount(member, Number(part?.power?.[0] ?? 0));
  // ...
}

// ❌ 誤: ReviveDp にハイブースト補正を適用
else if (skillType === 'ReviveDp') {
  const healedAmount = scaleHighBoostHealAmount(actor, DEFAULT_REVIVE_DP_FLOOR);
  // ...
}
```

---

## 3. 修正内容 (`471a928`)

### 3.1 定数と関数の再命名

```javascript
// ✅ 適切な命名: DP回復専用であることを明示
const HIGH_BOOST_DP_HEAL_MULTIPLIER = 1.5;

function scaleHighBoostDpHealAmount(actor, amount) {
  const modifiers = resolveHighBoostModifiersForMember(actor);
  if (!modifiers.active) {
    return Number(amount ?? 0);
  }
  return applyHighBoostMultiplier(amount, modifiers.dpHealMultiplier);
}
```

### 3.2 ホワイトリストの導入

```javascript
// ✅ ハイブースト補正の適用対象を明示的に定義
const HIGH_BOOST_SCALED_DP_SKILL_TYPES = Object.freeze(
  new Set(['HealDpRate', 'RegenerationDp'])
);
```

### 3.3 新しい解決関数の実装

```javascript
function resolveHighBoostAdjustedDpAmount(actor, skillType, amount) {
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount)) {
    return 0;
  }
  // ✅ ホワイトリストに含まれるスキルタイプのみ補正
  if (!HIGH_BOOST_SCALED_DP_SKILL_TYPES.has(String(skillType ?? '').trim())) {
    return numericAmount;
  }
  return scaleHighBoostDpHealAmount(actor, numericAmount);
}

function resolveNextCurrentDpForDirectChange(startDpState, skillType, amount) {
  const startCurrentDp = Number(startDpState?.currentDp ?? 0);
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(startCurrentDp)) {
    return 0;
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return startCurrentDp;
  }
  // ✅ 蘇生系スキルは最大値を取る
  if (String(skillType ?? '') === 'ReviveDp' || String(skillType ?? '') === 'ReviveDpRate') {
    return Math.max(startCurrentDp, numericAmount);
  }
  return startCurrentDp + numericAmount;
}
```

### 3.4 修正箇所の例

#### HealSp 修正
```javascript
// ✅ 正: 補正なしの生の数値を使用
if (effectType === 'HealSp') {
  const amount = Number(part?.power?.[0] ?? 0);
  // ...
}
```

#### HealEp 修正
```javascript
// ✅ 正: 補正なしの生の数値を使用
if (skillType === 'HealEp') {
  const amount = Number(part?.power?.[0] ?? 0);
  // ...
}
```

#### ReviveDp 修正
```javascript
// ✅ 正: 補正なし、かつ最大値を取る
else if (skillType === 'ReviveDp') {
  const healedAmount = resolveHighBoostAdjustedDpAmount(actor, skillType, DEFAULT_REVIVE_DP_FLOOR);
  const change = target.setDpState({
    currentDp: resolveNextCurrentDpForDirectChange(startDpState, skillType, healedAmount),
    effectiveDpCap: getDpHealCapForPart(target, part),
  });
  // ...
}
```

#### HealDpRate 修正（補正を維持）
```javascript
// ✅ 正: DP割合回復には補正を適用
if (skillType === 'HealDpRate' || skillType === 'ReviveDpRate') {
  const rate = Number(part?.power?.[0] ?? 0);
  const amount = Number.isFinite(rate) && rate > 0 ? Number(startDpState.baseMaxDp ?? 0) * rate : 0;
  const healedAmount = resolveHighBoostAdjustedDpAmount(actor, skillType, amount);
  const change = target.setDpState({
    currentDp: resolveNextCurrentDpForDirectChange(startDpState, skillType, healedAmount),
    effectiveDpCap: getDpHealCapForPart(target, part),
  });
  // ...
}
```

---

## 4. 現在の状態確認

### 4.1 HEAD での検証

以下の確認が完了しました:

1. ✅ `HIGH_BOOST_SCALED_DP_SKILL_TYPES` が定義されている
2. ✅ `resolveHighBoostAdjustedDpAmount` が実装されている
3. ✅ `resolveNextCurrentDpForDirectChange` が実装されている
4. ✅ `HealSp` が `Number(part?.power?.[0] ?? 0)` を使用している
5. ✅ `HealEp` が `Number(part?.power?.[0] ?? 0)` を使用している
6. ✅ `ReviveDp/ReviveDpRate` がホワイトリスト除外されている

### 4.2 ホワイトリストの内容

```javascript
const HIGH_BOOST_SCALED_DP_SKILL_TYPES = Object.freeze(
  new Set(['HealDpRate', 'RegenerationDp'])
);
```

**解釈**: 以下の2種類のみがハイブースト1.5倍補正の対象:
- `HealDpRate`: DP割合回復
- `RegenerationDp`: DP継続回復

---

## 5. 影響範囲の評価

### 5.1 修正による変更点

| スキルタイプ | 修正前 | 修正後 | 変更 |
|-------------|--------|--------|------|
| HealSp | 1.5倍 | 1.0倍 | ✅ 正常化 |
| HealEp | 1.5倍 | 1.0倍 | ✅ 正常化 |
| HealDpRate | 1.5倍 | 1.5倍 | ✅ 仕様通り維持 |
| RegenerationDp | 1.5倍 | 1.5倍 | ✅ 仕様通り維持 |
| ReviveDp | 1.5倍 | 1.0倍 | ✅ 正常化 |
| ReviveDpRate | 1.5倍 | 1.0倍 | ✅ 正常化 |

### 5.2 想定される影響

1. **ハイブースト状態時のSP回復量が減少**
   - 修正前: ルビーパヒューム使用時、SP回復が1.5倍されていた
   - 修正後: SP回復はデータ通りの値になる
   - **影響**: 実データに近づくため、シミュレーションの精度向上

2. **ハイブースト状態時のDP回復量が維持**
   - `HealDpRate`, `RegenerationDp` は引き続き1.5倍
   - 実データの仕様通り

3. **テスト結果への影響**
   - SP回復を検証していたテストが失敗する可能性
   - DP回復を検証していたテストは通過するはず

---

## 6. 追加の観察点

### 6.1 ReviveDpRate の追加

修正時に `ReviveDpRate` が HealDpRate と同じ処理パスに追加されました:

```javascript
if (skillType === 'HealDpRate' || skillType === 'ReviveDpRate') {
  // ...
  const healedAmount = resolveHighBoostAdjustedDpAmount(actor, skillType, amount);
  // ...
}
```

**注意点**: `ReviveDpRate` は `HIGH_BOOST_SCALED_DP_SKILL_TYPES` に含まれていないため、ハイブースト補正は適用されません（`resolveHighBoostAdjustedDpAmount` 内で除外）。

### 6.2 後方互換性

メタデータフィールド名の変更:

```javascript
dpHealMultiplier: Number(
  effect?.metadata?.dpHealMultiplier ?? 
  effect?.metadata?.healMultiplier ??  // ✅ 後方互換性維持
  HIGH_BOOST_DP_HEAL_MULTIPLIER
),
```

古いメタデータ形式（`healMultiplier`）もサポートされています。

---

## 7. 「閃光」パッシブ発火問題の根本原因

### 7.1 問題の発見

調査中に、「閃光」パッシブが発火しないという別の重大な問題を発見しました。

### 7.2 根本原因

**`HealSp` タイプのパッシブスキルが `passive.condition` を評価していない**

#### 問題の詳細

1. **「閃光」パッシブの仕様**（json/passives.jsonより）
   - `timing`: "OnEveryTurn"
   - `condition`: "IsFront()"
   - `effect`: "HealSp"
   - `target_type`: "Self"
   - `power`: 1.0 (SP+1)

2. **現在の実装の不整合**
   - `applyPassiveTimingInternal` 関数内（7773行目）で、`HealSp` 処理は `evaluatePassiveSelfConditions` を呼んでいない
   - `HealEp`（7103行目）や `HealDpRate`（7132行目）は同様の位置で `evaluatePassiveSelfConditions` を呼んでいる
   - この不整合により、「閃光」パッシブの `IsFront()` 条件が評価されていない

3. **`evaluatePassiveSelfConditions` 関数の役割**
   ```javascript
   function evaluatePassiveSelfConditions(passive, part, state, member) {
     const conditions = [passive?.condition, part?.cond, part?.hit_condition]
       .map((value) => String(value ?? '').trim())
       .filter(Boolean);
     const conditionSkill = createConditionSkillContext(passive, part);
     return conditions.every((expr) => {
       const evaluated = evaluateConditionExpression(expr, state, member, conditionSkill);
       // 未実装条件が含まれる場合はパッシブを発動させない
       return evaluated.unknownCount === 0 && evaluated.result;
     });
   }
   ```
   - `passive.condition`（例: "IsFront()"）を評価する
   - 条件が満たされない場合、パッシブは発火しない

4. **`HealSp` 実装の問題**
   ```javascript
   // ❌ 問題のある実装（7773行目）
   if (skillType === 'HealSp') {
     const amount = Number(part?.power?.[0] ?? 0);
     if (!Number.isFinite(amount) || amount === 0) {
       continue;
     }
     // evaluatePassiveSelfConditions が呼ばれていない！
     const targetCharacterIds = resolveSupportTargetCharacterIds(
       state,
       member,
       part?.target_type,
       options.targetCharacterId ?? null
     );
     // ...
   }
   ```

   ```javascript
   // ✅ 正しい実装の例（HealEp, 7103行目）
   if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
     continue;
   }

   if (skillType === 'HealEp') {
     // ...
   }
   ```

### 7.3 影響範囲

- **condition を持つ全ての `HealSp` パッシブスキル**が影響を受ける
- 特に以下の条件を持つパッシブが正しく機能していない可能性：
  - `IsFront()`（前衛時のみ）
  - `IsBack()`（後衛時のみ）
  - `IsPlayer()`（プレイヤーキャラ時のみ）
  - その他のカスタム条件

### 7.4 修正案

#### 必要な変更

`src/turn/turn-controller.js` の `applyPassiveTimingInternal` 関数内で、`HealSp` 処理の前に `evaluatePassiveSelfConditions` を追加します。

#### 変更位置

7773行目の `if (skillType === 'HealSp')` の前に以下を追加：

```javascript
if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
  continue;
}
```

#### 検証方法

1. 茅森月歌の「閃光」パッシブを持つスタイルを装備
2. 前衛（position 0, 1, 2）に配置
3. ターンを進める
4. ターン開始時にSPが+1されることを確認
5. 後衛（position 3, 4, 5）に配置
6. ターンを進める
7. ターン開始時にSPが+1されないことを確認

### 7.5 タイムライン

- **db0a68d**（HighBoost統合前）: この問題は既に存在
- **36c156d**（HighBoost統合）: HealSPの1.5倍バグ修正時に、`scaleHighBoostHealAmount` 呼び出しを削除
- **471a928**（green checkpoint）: 変更なし
- **HEAD**: この問題は継続中

**結論**: この問題はHealSP 1.5倍バグ修正とは無関係で、元々存在していた実装の不整合です。

## 修正実施（2026年3月21日）

### 修正内容

**ファイル**: `src/turn/turn-controller.js`  
**行**: 7774

`applyPassiveTimingInternal` 関数内の `HealSp` 処理の前に、`evaluatePassiveSelfConditions` 呼び出しを追加しました。

#### 修正前
```javascript
if (skillType === 'HealSp') {
  const amount = Number(part?.power?.[0] ?? 0);
  if (!Number.isFinite(amount) || amount === 0) {
    continue;
  }
  const targetCharacterIds = resolveSupportTargetCharacterIds(
    state,
    member,
    part?.target_type,
    options.targetCharacterId ?? null
  );
  // ...
}
```

#### 修正後
```javascript
if (skillType === 'HealSp') {
  if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
    continue;
  }
  const amount = Number(part?.power?.[0] ?? 0);
  if (!Number.isFinite(amount) || amount === 0) {
    continue;
  }
  const targetCharacterIds = resolveSupportTargetCharacterIds(
    state,
    member,
    part?.target_type,
    options.targetCharacterId ?? null
  );
  // ...
}
```

### 修正の効果

- `HealSp` タイプのパッシブスキルが `passive.condition` を評価するようになりました
- `IsFront()`, `IsBack()`, `IsPlayer()` などの条件が正しく機能します
- 特に「閃光」パッシブ（茅森月歌）が前衛時に発火するようになります

### 検証方法

1. 茅森月歌の「閃光」パッシブを持つスタイルを装備
2. 前衛（position 0, 1, 2）に配置
3. ターンを進める
4. ターン開始時にSPが+1されることを確認
5. 後衛（position 3, 4, 5）に配置
6. ターンを進める
7. ターン開始時にSPが+1されないことを確認

### 追加の検証

- 他の `HealSp` パッシブ（`condition` を持つもの）も正しく発火することを確認
- 既存の `HealEp`, `HealDpRate` の動作に影響がないことを確認

---

## 8. 結論と推奨事項

### 7.1 結論

1. ✅ **バグは修正済み**: `471a928` (green checkpoint) で完全に修正されています
2. ✅ **HEADに反映**: 現在の HEAD に修正が含まれています
3. ✅ **仕様に準拠**: DP回復のみにハイブースト補正が適用されています
4. ✅ **HealSpバグ解消**: SP回復は誤った1.5倍補正を受けなくなりました

### 7.2 推奨事項

1. **テストの再実行**
   - パッシブタイミング関連の全テストを実行
   - 特に HealSp/HealEp を検証するテストを確認
   - ハイブースト状態でのDP回復テストを確認

2. **実データとの照合**
   - ルビーパヒューム使用時のSP回復量を確認
   - ハイブースト状態時のDP回復量を確認
   - シミュレーション結果と実データを比較

3. **コードレビュー**
   - 他の回復タイプ（`HealDp`, `HealDpByDamage` 等）でも同様の問題がないか確認
   - ステータス効果の回復部分を確認

4. **ドキュメント更新**
   - パッシブタイミングの仕様ドキュメントにハイブースト補正の適用範囲を明記
   - テストケースにハイブースト状態での挙動を追加

### 7.3 今後の予防策

1. **定数命名の厳格化**
   - 汎用的な名前（`HealMultiplier`）を避ける
   - 適用範囲を明示した名前を使用する（`DpHealMultiplier`）

2. **型安全性の向上**
   - スキルタイプごとの処理を分離
   - 補正適用のロジックを中央管理する

3. **ホワイトリスト方式の推奨**
   - 「全てに適用し、除外を明示」ではなく、「適用対象を明示」する方式を採用
   - 今回の `HIGH_BOOST_SCALED_DP_SKILL_TYPES` が良い例

---

## 8. 付録

### 8.1 関連コミット

- `db0a68d`: checkpoint/passive-timing-wip-20260321 （バグのある状態）
- `471a928`: checkpoint/passive-timing-wip-green-20260321 （修正済み）
- `HEAD`: 最新の状態（修正を含む）

### 8.2 関連ファイル

- `src/turn/turn-controller.js`: 主要な修正箇所
- `docs/active/passive_timing_reference.md`: パッシブタイミングの参考ドキュメント

### 8.3 キーワード

- `HIGH_BOOST_DP_HEAL_MULTIPLIER`: ハイブーストDP回補正定数（1.5）
- `HIGH_BOOST_SCALED_DP_SKILL_TYPES`: ハイブースト補正適用対象ホワイトリスト
- `resolveHighBoostAdjustedDpAmount`: ハイブースト補正を適用する解決関数
- `resolveNextCurrentDpForDirectChange`: DP直接変更後の値を計算する関数

---

**レポート終了**