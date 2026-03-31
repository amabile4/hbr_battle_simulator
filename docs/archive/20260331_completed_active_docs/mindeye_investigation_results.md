# MindEye (SpecialStatusCountByType 78) 調査最終報告

> **ステータス**: 📦 スナップショット | 📅 調査日: 2026-03-30

**調査日**: 2026年3月30日  
**対象**: SpecialStatusCountByType(78) の Condition 評価と Passive Modifier 適用

## 質問の要点

1. `MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS = Set([78])` の役割が不明
2. `SpecialStatusCountByType(78)>0` の Condition 判定が実装者として心配
3. 心眼パッシブのスキル攻撃力 +15% が正しく処理されているか

##  調査結果

### ✅ MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS の役割

**ファイル**: `src/domain/character-style.js` line 28-29

MindEye は `exitCond='Count'` タイプの特殊状態で、2つの消費メカニズムを持つ：

1. **自動デクリメント**: 通常の Count statuseffect は turn end ごとに `remaining -= 1`
2. **手動消費**: MindEye は action 時に特定ロジックで選別して消費される

**除外理由**:
```javascript
tickSpecialStatusCountEffects() {
  // ...
  if (MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS.has(specialStatusTypeId)) continue;
  // → MindEye と Funnel は自動デクリメントから除外される
}
```

MindEye の消費は、ダメージアクション時に `resolveMindEyeCompetitionForAction()` と
`consumeSelectedCountStatusEffects()` で手動管理される（Only vs Count の競合判定含む）。

### ✅ SpecialStatusCountByType(78) Condition 実装状況

**実装済み**: `src/turn/turn-controller.js` line 1461-1494  

**フロー**:
```
evaluateConditionClause("SpecialStatusCountByType(78)>0")
  ↓
evaluateSingleConditionClause() → FUNCTION_COMPARISON_CONDITION_RE マッチ
  ↓
resolveConditionFunctionValue('SpecialStatusCountByType', '78')
  ↓
resolveSingleArgConditionValue()
  ↓
if (IMPLEMENTED_SPECIAL_STATUS_TYPES.has(78)) → TRUE
  → hasSpecialStatus(member, 78)
    → statusEffects 検索: specialStatusTypeId===78 && remaining>0
    → 見つかれば value=1, 見つからなければ value=0
```

**IMPLEMENTED_SPECIAL_STATUS_TYPES** (line 6502):
```javascript
const IMPLEMENTED_SPECIAL_STATUS_TYPES = new Set([25, 78, 79, 122, 124, 125, 144, 146, 155, 164]);
```

### 🔴 AttackUp Passive 適用の問題

**テスト結果**: T07-diagnostic 失敗  
**症状**: AttackUp の specialPassiveModifiers が undefined

**コード実装**:
- Condition 評価ロジック: ✅ 実装済み
- AttackUp (skill_type='AttackUp') の parsing: ✅ 実装済み
- `applyPassiveTimingInternal` での AttackUp 処理: ✅ 実装済み (line 8474-8502)

**問題の可能性**:

1. **Composite Condition の評価エラー**  
   テスト condition: `"SpecialStatusCountByType(78)>0&&IsFront()"`
   - Part A: SpecialStatusCountByType(78)>0 → evaluated
   - Part B: IsFront() → evaluated
   - But AND combination が True を返さないか、unknown を返す

2. **evaluatePassiveSelfConditions の Unknown カウント**  
   ```javascript
   evaluate.unknownCount === 0 && evaluated.result === true
   ```
   Complex condition で unknownCount が 0 でない可能性

3. **State の statusEffects が正しく伝播されない**  
   commitTurn() 後に statusEffects が new member instance へコピーされていない

## テスト実装状況

### 既存テスト (T07)
- ✅ MindEye 付与テスト
- ✅ パッシブ発動テスト（ただし HealSp = SP回復）
- 🔴 AttackUp (スキル攻撃力 +15%) の有効性テスト **未実装**

### 新規テスト (T07b, T07-diagnostic)
- 🔴 **Condition 評価と AttackUp 適用の検証失敗**

## 推奨アクション

### 1. 緊急調査 (優先度 HIGH)
- `applyPassiveTimingInternal()` line 8350 で例外が発生していないか確認
- `evaluatePassiveSelfConditions()` で複合 AND 条件の unknownCount を確認
- attachPassiveModifiers が実際に member に適用されているか (mutation の有無)

### 2. テスト追加の推奨
複合条件 Passive のテストを実装すること：
```javascript
test('composite condition passive: SpecialStatusCountByType(78)>0&&IsFront()', () => {
  // 心眼状態 + 前衛配置のみ条件成立
  // 後衛配置時は非発動を確認
});
```

### 3. ドキュメント化
- MANUAL_CONSUMPTION_SPECIAL_STATUS_TYPE_IDS の役割を comments に追記
- MindEye vs Funnel の消費競合ルールを docs/active に記載

### 4. 検証すべき実装仕様
実データ（passives.json 100110800）の心眼の境地パッシブ：
```json
{
  "condition": "SpecialStatusCountByType(78)>0 && IsFront()",
  "parts": [{
    "skill_type": "AttackUp",
    "power": [0.15, 0]
  }]
}
```

- 心眼状態が存在する → Condition TRUE の確認
- 前衛配置 (position <= 2) → IsFront() TRUE の確認
- AttackUp 15%修飾が実際のダメージ計算に反映されるか

## 結論

✅ **SpecialStatusCountByType(78) の Condition 判定は実装済み**  
🔴 **Passive Modifier 適用に未検出の問題がある**

問題の正体は、source code level では実装済みに見えるが、runtime で condition evaluation or modifier application が failure している。詳細な runtime エラーハンドリングと stack trace 確認が必要。
