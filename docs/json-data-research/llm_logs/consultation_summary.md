# LLM Consultation Summary

## Q1 Schema Design

### Prompt
旧586件/新689件、exact367, name一致584, 未一致2。`canonicalSkills + legacyCompatible` の妥当性を評価。

### Claude summary
- 二層構造は妥当
- 未一致2件は `orphaned/deprecated` として明示管理
- 判定: 条件付き採用

### Gemini summary
- 互換層付きの二層構造を支持
- 一括置換は既存互換を壊すため不採用
- 判定: Go（互換層前提）

## Q2 Ingestion Logic

### Prompt
`characters -> styles -> skills` join、正規化名統合、legacy生成の妥当性。

### Claude summary
- join方向は妥当
- 共有スキル前提でM:N対応が必要
- 互換層のスコープ明文化が必要

### Gemini summary
- 基本方針は妥当
- IDベース紐付けと共有スキル対応を追加推奨
- 判定: 概ね妥当（修正推奨）

## Q3 Diff Comparison Method

### Prompt
指標: exact367/name584/costMismatch3/typeMismatch215/unmatched2/new322 の妥当性。

### Claude summary
- name一致を主キーにした多段比較は妥当
- typeMismatch内訳分析を追加すべき

### Gemini summary
- 階層比較（キー一致→属性差分分解）が妥当
- exactのみ判定は不採用

## Q4 Deprecation Criteria

### Prompt
基準候補: name一致>=99%, unmatched<=0.5%, 互換ビュー, 段階移行/ロールバック。

### Claude summary
- 数値基準は妥当
- 未一致2件処理・互換実装確認・ロールバック整備完了まで廃止実行は保留

### Gemini summary
- 基準は妥当
- 重要スキルの定性チェックを追加推奨
- 判定: 条件付きで妥当
