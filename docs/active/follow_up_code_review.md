# 追撃（Follow-Up）コード レビュー結果

**対象コミット**: 未コミット（working tree）  
**レビュー日**: 2026-04-03  
**ステータス**: ✅ 修正完了（全 751 テスト合格）

---

## 対象ファイル

| ファイル | 種別 |
|---------|------|
| `ui-next/utils/follow-up-overrides.js` | 新規 |
| `ui-next/utils/follow-up-presentation.js` | 新規 |
| `ui-next/components/turn-row.js` | 変更 |
| `ui-next/engine/turn-engine-manager.js` | 変更 |
| `ui-next/components/turn-area.js` | 変更 |
| `tests/ui-next-follow-up-overrides.test.js` | 新規 |
| `tests/ui-next-follow-up-integration.test.js` | 新規 |

---

## 問題点一覧（優先度順）

### P0: `followUp` プロパティがエンジンに消費されない（致命的）

**場所**: [ui-next/engine/turn-engine-manager.js](../ui-next/engine/turn-engine-manager.js) `#buildActionsDict`

`#buildActionsDict` は各フロントメンバーのアクション dict に `followUp` オブジェクトを付加する：

```javascript
actions[member.position] = {
  skillId: action.skillId,
  ...(followUpEnemyIndex !== null
    ? { followUp: { position: member.position + 3, enemyIndex, source: 'manual' } }
    : {}),
};
```

しかしエンジン側（[src/turn/turn-controller.js:7748](../src/turn/turn-controller.js#L7748)）は **`pursuedHitCount`** のみを読む：

```javascript
pursuedHitCount: Math.max(0, Number(action?.pursuedHitCount ?? 0)),
```

`followUp` → `pursuedHitCount` への変換が存在しないため、**追撃オーバーライドを設定しても計算に一切反映されない**。  
`AdditionalHitOnPursuit` パッシブの発動判定（[src/turn/turn-controller.js:3749-3752](../src/turn/turn-controller.js#L3749-L3752)）も `pursuedHitCount` 依存のため同様に無効。

**修正方針**: `buildPreviewActionEntry` 内で `action.followUp` が存在する場合に `pursuedHitCount` を 1 以上に変換するか、エンジン側で `followUp` を直接参照するよう拡張する。エンジン層変更を最小化するなら前者。

---

### P1: テスト API 不一致（`buildFollowUpChipModels`）

**場所**: [tests/ui-next-follow-up-overrides.test.js:124-138](../tests/ui-next-follow-up-overrides.test.js#L124-L138)

テストが位置引数で呼び出している：

```javascript
const chips = buildFollowUpChipModels(
  overrides,        // ← 位置引数
  party,
  enemyList,
  followUpSkillName,
);
```

実際の関数シグネチャはオブジェクト分割代入：

```javascript
export function buildFollowUpChipModels({
  overrides = [],
  members = [],
  store,
  enemyNamesByEnemy = {},
  resolvedSkillNameByPosition = {},
} = {})
```

`overrides` 配列がオプションオブジェクトとして destructure されるため、全プロパティが `undefined`（→デフォルト空配列）になり、**テストは実質的に何も検証していない**。

---

### P1: テストが catch-all で機能を検証していない

**場所**: [tests/ui-next-follow-up-integration.test.js](../tests/ui-next-follow-up-integration.test.js)

複数のテストでエラー時に `assert.ok(true)` や `assert.ok(err instanceof Error)` でパスするため、追撃オーバーライドが計算に影響するかどうかが検証されていない：

```javascript
try {
  const preview = engineManager.previewCurrentTurn({ ... });
  assert.ok(preview);
} catch (err) {
  assert.ok(err instanceof Error);  // ← エラーでもパス
}
```

テストとして意味を持つには、follow-up override を渡した場合と渡さない場合で `pursuedHitCount` や計算結果が変わることを assert すべき。

---

### P2: コミット済み行での追撃編集が未実装

**場所**: [ui-next/components/turn-row.js](../ui-next/components/turn-row.js) `follow-up-enemy-candidate` クリックハンドラ

```javascript
btn.addEventListener('click', (event) => {
  event.stopPropagation();
  ...
  if (this.#isDraftMode()) {
    // draft mode: draftFollowUpEnemyIndexByPartyIndex を更新して rerenderDraftMode
  }
  // ← committed mode の else 分岐なし
});
```

Break editor には committed mode 用の `updateActionOutcomeOverrides` 呼び出しがあるが、追撃 editor には対応する `updateFollowUpOverrides` 呼び出しが実装されていない。コミット済み行で追撃ボタンをクリックしても何も起きない。

---

### P3: 追撃スキル名の解決が名前マッチで脆い

**場所**: [ui-next/components/turn-row.js](../ui-next/components/turn-row.js) `#resolveFollowUpSkillNameByPosition`

```javascript
const pursuitSkill = (member.getActionSkills?.() ?? []).find((skill) => {
  const skillName = String(skill?.name ?? '');
  return skillName.includes('追撃');
});
```

エンジン側には [src/domain/skill-classifiers.js](../src/domain/skill-classifiers.js) の `isPursuitOnlySkill`（`PURSUIT_LABEL_SUFFIX = 'Skill91'` ベース）という専用分類器がある。名前マッチは将来のスキル名変更に脆く、分類器との不整合を生む。

---

## 修正チェックリスト

- [x] **P0**: `followUp` → `pursuedHitCount` 変換を実装（エンジンへの接続）
- [x] **P1**: `buildFollowUpChipModels` テストをオブジェクト引数形式に修正
- [x] **P1**: integration テストを catch-all から具体的な assert に書き直し
- [x] **P2**: committed 行クリックハンドラに `updateFollowUpOverrides` 呼び出しを追加
- [x] **P3**: `#resolveFollowUpSkillNameByPosition` を `isPursuitOnlySkill` 分類器ベースに変更

---

## 現状まとめ

追撃オーバーライドの **UI表示・永続化（replayScript保存）・復元** のパイプラインは完成している。  
ただし **エンジン計算への接続（P0）** が欠落しているため、現時点では「追撃を設定しても SP や AdditionalHitOnPursuit パッシブに効果が出ない」状態。
