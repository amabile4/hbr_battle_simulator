# サポート共鳴アビリティ制限チェックバグ Issue

**作成日**: 2026年3月22日
**ステータス**: ✅ 完了（2026-03-23）
**優先度**: 高

---

## 問題の概要

### 1.1 対象
サポート共鳴アビリティ（サポート枠のパッシブ）が、SSRではないメインスタイルに誤って適用されてしまう。

### 1.2 影響範囲
- SSスタイルのメインキャラクターで、SSRサポートスタイルを設定すると誤ってサポート共鳴が発動してしまう
- ユーザーが意図しない挙動に遭遇する可能性がある
- ゲームプレイの仕様と実装が不一致する

### 1.3 再現手順
1. SSスタイルのキャラクター（例：つかさ 1020603, "Stir Soul Song"）をメインに選択
2. SSRサポートスタイル（例：菅原 千枝 1004406, "ロリータ・ストイック"）をサポート枠に選択
3. 戦闘を開始する
4. 期待される挙動：サポート共鳴アビリティが発動しない（つかさはSSではなくSSRであるため）
5. 実際の挙動：サポート共鳴アビリティが誤って発動してしまう

---

## 原因分析

### 2.1 技術的な根本原因

**ファイル**: `src/data/hbr-data-store.js`  
**メソッド**: `buildCharacterStyle`

現在の実装：
```javascript
const supportPassive =
  supportStyleId != null
    ? this.resolveSupportSkillPassive(Number(supportStyleId), Number(supportStyleLimitBreakLevel))
    : null;
const passives = supportPassive ? [...mainPassives, supportPassive] : mainPassives;
```

問題点：
- `supportStyleId != null` のみチェック：サポート枠が選択されているかどうかのみ確認
- **メインスタイルのティアチェック不在**：SSRである必要があるにもかかわらず、サポート共鳴アビリティが適用されてしまう

### 2.2 期待される挙動
ゲーム仕様では、サポート共鳴アビリティは**SSRのメインスタイル**にのみ適用されるべきです。

### 2.3 関連箇所
- `HbrDataStore.resolveSupportSkillPassive()` メソッド：正しく動作 ✓
- `HbrDataStore.listSupportStyleCandidates()` メソッド：正しく動作 ✓
- `buildCharacterStyle()` メソッド：ティアチェックが不足 ✗

---

## 解決策の設計

### 3.1 修正方針

`buildCharacterStyle` メソッドで、サポートパッシブを追加する際にメインスタイルのティアチェックを追加する。

### 3.2 修正コード

```javascript
const supportPassive =
  supportStyleId != null && String(style.tier ?? '').toUpperCase() === 'SSR'
    ? this.resolveSupportSkillPassive(Number(supportStyleId), Number(supportStyleLimitBreakLevel))
    : null;
const passives = supportPassive ? [...mainPassives, supportPassive] : mainPassives;
```

### 3.3 期待される挙動

- **SSRメインスタイル + SSRサポートスタイル** → サポート共鳴アビリティ発動 ✓
- **SSRメインスタイル + SSサポートスタイル** → サポート共鳴アビリティ発動 ✓
- **SSメインスタイル + SSRサポートスタイル** → サポート共鳴アビリティ発動しない ✓
- **SSメインスタイル + SSサポートスタイル** → サポート共鳴アビリティ発動しない ✓

---

## WBS (Work Breakdown Structure)

### フェーズ1: 修正コードの実装 ✅ 完了
- [x] `src/data/hbr-data-store.js` の `buildCharacterStyle` メソッドを修正
  - [x] メインスタイルのティアチェックを追加（`String(style.tier ?? '').toUpperCase() === 'SSR'`）
  - [x] サポートパッシブ追加条件を更新
  - [x] コードレビュー

### フェーズ2: テストの作成 ✅ 完了
- [x] SSRメイン + SSRサポートの組み合わせで正しく発動することを確認するテストケース（既存テスト更新）
- [x] SSメイン + SSサポートの組み合わせで発動しないことを確認するテストケース追加
  - `tests/support-skills.test.js`: 「SSメインスタイルではサポートパッシブが付かないこと」
- [x] 既存のサポート関連テストが影響を受けていないことを確認
- [x] テストを更新（mainStyle選択条件に tier=SSR を追加）

### フェーズ3: 既存テストの確認 ✅ 完了
- [x] サポート共鳴アビリティのテストがパスすることを確認 → 712 PASS
- [x] サポート枠UIのテストがパスすることを確認
- [x] 関連するテストが影響を受けていないことを確認
- [x] テストを更新（SSメインを使っていたテストを SSR スタイル 1001108 に変更）

### フェーズ4: ドキュメント更新 ✅ 完了
- [x] このIssueドキュメントを完了としてマーク
- [x] 関連するドキュメント更新（restoration_wbs.md フェーズ4対応）

---

## 技術的な詳細

### 4.1 実装ファイル

- `src/data/hbr-data-store.js`
  - メソッド: `buildCharacterStyle`
  - 変更行数: 1行追加

### 4.2 変更内容

```diff
- const supportPassive =
-   supportStyleId != null
-     ? this.resolveSupportSkillPassive(Number(supportStyleId), Number(supportStyleLimitBreakLevel))
-     : null;
+ const supportPassive =
+   supportStyleId != null && String(style.tier ?? '').toUpperCase() === 'SSR'
+     ? this.resolveSupportSkillPassive(Number(supportStyleId), Number(supportStyleLimitBreakLevel))
+     : null;
```

---

## 成功基準

### 5.1 機能要件
- ✅ SSRメインスタイルでのみサポート共鳴アビリティが発動する
- ✅ SSメインスタイルではサポート共鳴アビリティが発動しない
- ✅ ティアチェックのロジックが正しい

### 5.2 非機能要件
- ✅ 既存のテストを破壊しない
- ✅ パフォーマンスへの悪影響がない
- ✅ コードが保守可能（適切な抽象化とドキュメント）

---

## リスクと軽減策

| リスク | 影響 | 軽減策 |
|-------|------|--------|
| ティアチェックの誤り | 中 | 大文字小文字を正しく扱う（`toUpperCase()`を使用） |
| 既存テストへの影響 | 低 | テストを実行して確認する |
| ドキュメントの不整合 | 低 | 同じフォーマットを維持する |

---

## 付録

### 6.1 関連ファイル
- `src/data/hbr-data-store.js` - データストアの実装
- `src/domain/character-style.js` - キャラクタースタイルの定義
- `src/domain/support-skills-resolver.js` - サポートスキルの解決ロジック

### 6.2 関連コミット
- TBD（実装後に更新）

### 6.3 用語集
- **メインスタイル**: プレイヤーが選択する6キャラクターのスタイル
- **サポートスタイル**: サポート枠に配置するスタイル
- **サポート共鳴アビリティ**: サポート枠から適用されるパッシブ
- **ティア**: スタイルのレアリティ（SS, SSRなど）

---

**Issue完了（2026-03-23）**
