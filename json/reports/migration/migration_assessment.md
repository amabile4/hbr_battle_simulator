# skillDatabase.json 廃止検証レポート

## 1) 現状分析

### 1-1. 現行 `skillDatabase.json` 実スキーマ

- ルートキー: `metadata`, `characters`
- `metadata`
  - `version: string`
  - `createdAt: string(date-time)`
  - `characterCount: number`
  - `totalSkills: number`
  - `description: string`
- `characters`
  - キー: キャラ名（文字列）
  - 値: スキル配列
    - `name: string` (必須)
    - `cost: number` (必須)
    - `type: "damage" | "non_damage"` (必須)

### 1-2. 現行データの実測

- キャラ数: 57
- スキル行数: 586
- ユニークスキル名: 559
- 型分布: `damage=407`, `non_damage=179`
- コスト範囲: `0..18`
- 欠損: `name/cost/type` いずれも 0
- 制約上の弱点:
  - `skillId` / `styleId` が無く参照整合性を検証不能
  - 同名異ID（raw側に多数）の識別不可

## 2) 生データ分析

対象: `field_tree.md`, `relation_map.md`, `adoption_candidates.csv`, `summary.md`

### 2-1. 概念モデル（relation_map.mdベース）

- 主結合:
  - `characters.cards[].id -> styles.id` (100%)
  - `styles.skills[].id -> skills.id` (98.03%, orphan 25件 / unique 18件)
  - `skills.style -> styles.name` (100%)
- 主体エンティティ規模:
  - characters=59
  - styles=339
  - skills=689
  - passives=734 (ID uniqueは711)

### 2-2. `adoption_candidates.csv` の列定義と採用方針

- 列: `file, field_path, type, presence_rate, null_rate, relation_relevance, simulator_relevance, initial_label, reason`
- 行数: 1260
- 初期ラベル内訳:
  - adopt=577
  - hold=634
  - drop=49
- 方針:
  - `adopt`: 新スキーマ必須または準必須
  - `hold`: optionalとして保持（将来拡張）
  - `drop`: 正規DB本体からは除外（表示系は別管理）

### 2-3. 業務意味補完（summary.md）

- 戦闘計算寄与の高い項目は `base_param`, `skills.parts.*`, `styles.limit_break.*` 系
- `image`, `profile`, `desc` 系は表示情報として分離可能
- 「保留項目」が多いため、DB本体と表示付帯情報を層分離する方が運用安全

## 3) マッピング表

| 生データ | 新スキーマ | 互換形式(`legacyCompatible`) | Cardinality | 変換/規則 |
|---|---|---|---|---|
| `skills.id` | `canonicalSkills[].skillId` | `sourceSkillIds[]` | 1:1 / 1:N | 必須。主キー。 |
| `skills.name` | `canonicalSkills[].name` | `characters[].name` | 1:1 | 必須。 |
| `skills.chara` | `canonicalSkills[].rawChara` + `chara`(正規化) | charactersキー | 1:1 | `" — "` 区切り先頭を正規化名に採用。 |
| `skills.style` | `canonicalSkills[].styleName` | なし | N:1 | `styles.name` 参照。 |
| `styles.id`(name join) | `canonicalSkills[].styleId` | なし | N:1 | styleName->styleId で解決。解決不能はエラー。 |
| `skills.sp_cost` | `canonicalSkills[].spCost` | `cost` | 1:1 | number化、欠損はエラー。 |
| `skills.parts[]` | `canonicalSkills[].type`(推定) | `type` | N:1 | 攻撃系要素あり=damage、無ければnon_damage。※推定 |
| `skills.label/in_date` | `canonicalSkills[].source` | なし | 1:1 | 追跡用メタ。 |

推定項目:
- `type` 判定は `skills.parts` からのヒューリスティック（仕様確定前）
- 根拠: `field_tree.md` の `skills.parts.*` 構造 + `summary.md` の戦闘寄与説明

## 4) 新スキーマ提案

- 定義ファイル: `json/new_skill_database.schema.json`
- 生成例: `json/reports/migration/new_skill_database.draft.json`

### 4-1. 設計要点

- 二層構造
  - `canonicalSkills`: raw準拠の正規形（主データ）
  - `legacyCompatible`: 旧利用者向け互換ビュー
- 参照整合ルール
  - `canonicalSkills[].styleId` は `styles.id` に必ず解決
  - `skillId` はユニーク
  - `type` は enum制約
- バージョニング
  - `version` は semver
  - 後方互換は `legacyCompatible` で吸収

### 4-2. 拡張方針

- `type` 推定ロジックは将来 `classificationVersion` を追加して差し替え可能に
- `legacyCompatible` は段階廃止可能な独立レイヤーとして維持

## 5) 取り込みロジック

- 実装: `json/scripts/build_skill_migration_artifacts.mjs`
- 出力:
  - `json/reports/migration/migration_artifacts.json`
  - `json/reports/migration/new_skill_database.draft.json`
  - `json/reports/migration/migration_metrics.json`

### 5-1. 処理フロー

1. raw JSON と旧DBを読み込み
2. `skills` を正規化 (`chara` 正規化、`styleId` 解決、`type` 推定)
3. `character+skillName` 単位で互換ビュー行を集約
4. 旧DBと比較し指標算出
5. 差分サンプルと分類を出力

### 5-2. 疑似コード

```text
load oldDb, characters, styles, skills
for skill in skills:
  chara = normalize(skill.chara)
  styleId = findStyleId(skill.style)
  type = inferType(skill.parts)
  emit canonicalSkill

group canonical by (chara, name)
for group:
  choose representative cost/type
  emit legacyCompatible row + sourceSkillIds

compare old rows with candidate rows:
  exact / nameOnly / unmatched / mismatches
write artifacts + metrics
```

### 5-3. エラーハンドリング

- style解決不能 -> 変換失敗（停止）
- 数値変換不能（cost等） -> 変換失敗
- unmatched legacy row -> 警告として保持（廃止判定ゲートに利用）

### 5-4. 検証手順

- `node json/scripts/build_skill_migration_artifacts.mjs`
- `json/reports/migration/migration_metrics.json` の閾値確認
- サンプル差分（未一致/新規）をレビュー

## 6) 比較結果（定量）

出典: `json/reports/migration/migration_metrics.json`

- 旧行数: 586
- 新候補行数（distinct name集約）: 689
- exact一致: 367 (62.63%)
- name一致: 584 (99.66%)
- 不一致: 2 (0.34%)
- cost不一致: 3
- type不一致: 215
- 新規（旧に無い）: 322
- 欠損改善率（join必須項目: skillId/styleId）: 100%

意味差分（同名だが意味が違う）:
- `type`: 旧は由来不明2値、新は parts推定（定義差）
- `name`: 旧は実質キー、新は `skillId` 主キー（同名別ID許容）
- `chara`: 旧は表示名のみ、新は raw名+正規化名を併存

分類:
- 置換可能: 584
- 要追加実装: 219（name一致だが型/扱い差、または判定差）
- 廃止不可要因: 2（旧のみ存在。`誓いのしるし`, `無中生有`）

## 7) 廃止可否判定

**判定: Conditional Go（条件付きGo）**

Go条件:
1. 未一致2件の扱いを確定（deprecated保持 or 正式削除）
2. `type` 判定仕様を固定（現状は推定）
3. 互換ビュー経由で既存参照の回帰テスト通過

No-Go条件:
- 既存機能が `name/cost/type` 厳密一致に依存し、互換ビューで吸収できない場合

## 8) 移行計画

### Phase 0: 併存準備
- 新DB生成をCIジョブ化
- 旧DBと並行出力

### Phase 1: Dual Read
- アプリ側で `new->legacyCompatible` を参照
- 旧DBとの差分ログを継続収集

### Phase 2: Gate判定
- 連続リリース期間で
  - name一致>=99%
  - unmatched<=0.5%
  - 重大回帰0

### Phase 3: 切替
- 読み込み元を新DBへ切替
- 旧DBは read-only fallback として一定期間保持

### Phase 4: 廃止
- fallback不要を確認後 `skillDatabase.json` 生成停止

ロールバック:
- Feature flagで即時旧DB参照へ戻す
- 差分ログを再解析し再デプロイ

## 9) 未解決リスク

- `type` 判定仕様未固定（215件差分に直結）
- `styles.skills` 参照に orphan 18 unique ID（raw側欠損の可能性）
- 旧のみ2件スキルの業務上必要性未確認
- `passives` は本件スコープ外だが将来統合時に同様の同名異ID問題が再発

## 10) チーム論点と再調査ログ

### 10-1. 論点A: 結合モデルは 1:N か M:N か
- 仮説A: `style -> skill` は1:Nで十分
- 仮説B: 共有スキルがあるためM:N
- 再調査:
  - `styles.skills` unique=707
  - `skills` rows=689
  - 共有ID(複数style参照)=103
  - 最大共有回数=11
- 結論: **仮説B採用（M:N前提）**
- 不採用理由(仮説A): 共有スキルで重複/欠落が発生

### 10-2. 論点B: `type` は rawのみで確定できるか
- 仮説A: `parts` 推定だけで十分
- 仮説B: 互換運用では別ルールが必要
- 再調査:
  - exact一致62.63%
  - typeMismatch215（主要差分）
- 結論: **仮説B採用**
- 不採用理由(仮説A): 実運用互換として差分が大きすぎる

### 10-3. 論点C: 未一致2件は raw欠損か旧ノイズか
- 仮説A: raw欠損
- 仮説B: 旧由来の補完情報
- 再調査:
  - `skills.json` 内に名称該当なし
  - `characters.cards[].skills` 参照にも該当なし
- 結論: **仮説B採用（旧由来補完候補）**
- 補完候補:
  - 大島 一千子 / 誓いのしるし / cost16 / damage
  - 李 映夏 / 無中生有 / cost11 / non_damage

## 11) Claude/Gemini照会ログ（照会文、回答要約、一致点/相違点、最終反映）

### 11-1. 論点1 スキーマ設計妥当性
- 照会文（要約）:
  - 旧586件 vs 新689件、`canonicalSkills + legacyCompatible` の妥当性確認
- Claude要約:
  - 二層構造は妥当、未一致2件は `orphaned/deprecated` 管理を推奨
- Gemini要約:
  - 二層構造を支持。互換層なしの一括置換は不採用
- 一致点:
  - 二層構造採用
  - 未一致2件は明示管理
- 相違点:
  - Claudeは差分追跡フィールド追加を強調
  - Geminiは移行安全性（既存破壊回避）を強調
- 最終反映:
  - 二層構造 + 未一致2件の補完候補扱いを採用

### 11-2. 論点2 取り込みロジック妥当性
- 照会文（要約）:
  - `characters->styles->skills` join + 正規化名 + legacy生成
- Claude要約:
  - join方向は妥当だがM:Nと互換範囲明文化が必要
- Gemini要約:
  - 概ね妥当。ID基準と共有スキルの扱いを追加推奨
- 一致点:
  - 基本フローは妥当
  - 共有スキル（M:N）対応が必要
- 相違点:
  - Claudeは「読み取り互換のみ」を強く推奨
  - Geminiは「正規化辞書分離」を強調
- 最終反映:
  - M:N前提、互換層はread互換中心で設計

### 11-3. 論点3 差分比較方法妥当性
- 照会文（要約）:
  - 指標群（exact/name/cost/type/unmatched/new）の妥当性
- Claude要約:
  - nameベース比較は妥当。type差分の内訳分析が必要
- Gemini要約:
  - 階層比較（キー一致後の属性比較）が妥当
- 一致点:
  - exact単独判定は不十分
  - nameキー + 属性差分が必要
- 相違点:
  - Claudeはtype差分パターン分析を強調
  - Geminiは移行判定に向けた分類可視化を強調
- 最終反映:
  - `coverage + mismatch内訳 + 意味差分` の3層比較を採用

### 11-4. 論点4 廃止判定基準妥当性
- 照会文（要約）:
  - `name一致>=99%`, `unmatched<=0.5%`, 互換層, 段階移行/ロールバック
- Claude要約:
  - 数値基準は妥当。実行前に未一致2件/互換実装/ロールバック整備必須
- Gemini要約:
  - 妥当。加えて重要スキルの定性チェックを推奨
- 一致点:
  - 現在値は閾値クリア
  - ただしプロセスゲート完了まで即廃止は不可
- 相違点:
  - Geminiは重要カテゴリの個別100%チェックを追加提案
- 最終反映:
  - 判定は Conditional Go（段階ゲート制）

---

## 付録: 実装TODO（優先度付き）

1. P0: `type` 判定仕様を明文化し、`classificationVersion` を導入
2. P0: 未一致2件の扱い方針（deprecated保持/削除）を確定
3. P1: 互換レイヤー利用の回帰テスト追加
4. P1: `styles.skills` orphan 18 unique ID の原因調査
5. P2: 正規化辞書（名前揺れ）を外部定義化
