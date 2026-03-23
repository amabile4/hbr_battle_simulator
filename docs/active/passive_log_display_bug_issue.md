# パッシブログ表示バグ Issue

**作成日**: 2026年3月22日  
**ステータス**: 📢 進行中  
**優先度**: 中

---

## 問題の概要

### 1.1 対象
戦闘開始時のパッシブログに、サポート枠のパッシブ（サポート共鳴アビリティ）の発動情報が表示されない。

### 1.2 影響範囲
- ユーザーがサポート枠のパッシブ発動状況を確認できない
- パッシブ監査機能の有用性が低下する
- 実際のゲーム挙動と表示が不一致する

### 1.3 再現手順
1. SSRスタイルのメインキャラクター（例：月が綺麗 1004107）をメインに選択
2. SSRスタイルのサポートキャラクター（例：夏宵色のガーネット 1004507）をサポート枠に選択
3. サポート共鳴アビリティ（30Gグループなど）が正しく設定されている
4. 戦闘を開始する
5. パッシブログを確認する
6. 期待される挙動：メインスタイルのパッシブとサポート枠のパッシブの両方が表示される
7. 実際の挙動：メインスタイルのパッシブのみ表示され、サポート枠のパッシブが表示されない

---

## 原因分析

### 2.1 技術的な根本原因

**ファイル**: `src/turn/turn-controller.js`  
**関数**: `createPassiveTriggerEvent`

現在の実装では、パッシブトリガーイベントを作成する際に以下の情報を含んでいます：

```javascript
function createPassiveTriggerEvent(turnState, member, passive, details = {}) {
  return {
    turnLabel: String(turnState?.turnLabel ?? ''),
    turnType: String(turnState?.turnType ?? ''),
    timing: String(passive?.timing ?? ''),
    characterId: String(member?.characterId ?? ''),
    characterName: String(member?.characterName ?? ''),
    shortCharacterName: String(member?.shortName ?? member?.characterName ?? ''),
    passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
    passiveName: String(passive?.name ?? ''),
    passiveDesc: String(passive?.desc ?? ''),
    ...details,
  };
}
```

問題点：
- イベントには `sourceType` や `sourceMeta` フィールドが含まれていない
- `details` オブジェクトからスプレッドされる情報は、呼び出し元によって異なる
- UI/レコード層でのイベント処理時に、パッシブの出典（スタイル、サポート、オーブなど）を区別するための情報が不足している

### 2.2 データフローの確認

**サポートパッシブの作成**（`HbrDataStore.buildSupportPassive`）：
```javascript
export function buildSupportPassive(passive, sourceMeta) {
  return {
    ...structuredClone(passive),
    sourceType: 'support',
    sourceMeta: structuredClone(sourceMeta ?? {}),
    tier: '',
  };
}
```
✅ サポートパッシブには `sourceType: 'support'` が正しく設定されている

**パッシブイベントの作成**（`applyPassiveTimingInternal` など）：
```javascript
passiveTriggerEvents.push(
  createPassiveTriggerEvent(turnState, member, passive, {
    source: 'passive',
    effectTypes: [...effectTypes],
    spDelta: totalDelta,
  })
);
```
⚠️ `source: 'passive'` で作成されており、パッシブ自体の `sourceType: 'support'` が上書きされている可能性

### 2.3 期待される挙動
- サポートパッシブの場合：`sourceType: 'support'`、`sourceMeta` にサポートスタイルIDなどの情報を含む
- 通常パッシブの場合：`sourceType: 'style'`、`sourceMeta` にスタイルIDなどの情報を含む
- オーブパッシブの場合：`sourceType: 'orb'`、`sourceMeta` にアクセサリー情報を含む
- UI側でこれらの情報に基づいて、パッシブの出典を区別して表示する

---

## 解決策の設計

### 3.1 修正方針

パッシブトリガーイベントを作成する際に、パッシブ自体の `sourceType` と `sourceMeta` を継承するように修正する。

### 3.2 修正コード

```javascript
function createPassiveTriggerEvent(turnState, member, passive, details = {}) {
  return {
    turnLabel: String(turnState?.turnLabel ?? ''),
    turnType: String(turnState?.turnType ?? ''),
    timing: String(passive?.timing ?? ''),
    characterId: String(member?.characterId ?? ''),
    characterName: String(member?.characterName ?? ''),
    shortCharacterName: String(member?.shortName ?? member?.characterName ?? ''),
    passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
    passiveName: String(passive?.name ?? ''),
    passiveDesc: String(passive?.desc ?? ''),
    sourceType: String(passive?.sourceType ?? details.sourceType ?? 'unknown'),  // 修正：パッシブ自体の sourceType を使用
    sourceMeta: passive?.sourceMeta && typeof passive.sourceMeta === 'object'
      ? structuredClone(passive.sourceMeta)
      : (details.sourceMeta && typeof details.sourceMeta === 'object' ? structuredClone(details.sourceMeta) : {}), // 修正：パッシブ自体の sourceMeta を使用
    ...details,
  };
}
```

修正点：
- `sourceType` に `details.sourceType` を上書きせず、`passive.sourceType` を使用
- `sourceMeta` に `details.sourceMeta` を上書きせず、`passive.sourceMeta` を使用
- これにより、サポートパッシブの `sourceType: 'support'` が維持される

### 3.3 期待される挙動
- サポートパッシブイベントに `sourceType: 'support'` が含まれる
- サポートパッシブイベントに `sourceMeta` が含まれ、サポートスタイルIDなどの情報を持つ
- UI側で `sourceType: 'support'` を検出して、サポート由来のパッシブを区別して表示できる

---

## WBS (Work Breakdown Structure)

### フェーズ1: 修正コードの実装
- [ ] `src/turn/turn-controller.js` の `createPassiveTriggerEvent` 関数を修正
- [ ] `sourceType` の継承ロジックを追加
- [ ] `sourceMeta` の継承ロジックを追加
- [ ] コードレビュー

### フェーズ2: テストの作成
- [ ] サポートパッシブが正しく表示されるテストケースを作成
- [ ] 通常パッシブとサポートパッシブが区別されるテストケースを作成
- [ ] 既存のパッシブ表示テストが影響を受けていないことを確認

### フェーズ3: UI表示の確認
- [ ] パッシブログでサポートパッシブが正しく表示されることを確認
- [ ] `sourceType` に基づくスタイルや色分けが正しく適用されることを確認
- [ ] 全タイミングで正しく表示されることを確認

### フェーズ4: ドキュメント更新
- [ ] このIssueドキュメントを完了としてマーク
- [ ] 関連するドキュメント（存在する場合）を更新

---

## 成功基準

### 5.1 機能要件
- ✅ サポートパッシブがパッシブログに正しく表示される
- ✅ `sourceType: 'support'` が正しく設定されている
- ✅ `sourceMeta` にサポートスタイルIDなどの情報が含まれている
- ✅ UI側でパッシブの出典を区別して表示できる

### 5.2 非機能要件
- ✅ 既存のパッシブ表示機能が破壊されていない
- ✅ 通常パッシブの表示に影響がない
- ✅ パフォーマンスへの悪影響がない

---

## 付録

### 6.1 関連ファイル
- `src/turn/turn-controller.js` - パッシブトリガーイベントの作成
- `src/data/hbr-data-store.js` - サポートパッシブの作成
- `src/domain/support-skills-resolver.js` - サポートスキルの解決ロジック

### 6.2 関連ドキュメント
- `docs/active/support_tier_check_bug_issue.md` - サポートティア制限チェックバグ

### 6.3 用語集
- **パッシブトリガーイベント**: パッシブ発火時に生成されるイベントオブジェクト
- **sourceType**: パッシブの出典を示すフィールド（'style', 'support', 'orb', 'master', 'triggeredSkill'など）
- **sourceMeta**: パッシブの詳細な出典情報を含むメタデータオブジェクト

---

**Issue完了待ち**
