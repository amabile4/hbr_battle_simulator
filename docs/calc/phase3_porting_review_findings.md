# フェーズ3移植設計レビュー 指摘事項と修正方針

**レビュー実施日**: 2026-06-02  
**レビュー実施者**: claude-code + codex（独立レビュー）  
**対象ドキュメント群**:
- `docs/calc/porting_design_guideline.md`
- `docs/calc/phase2_design_specification.md`
- `docs/calc/phase3_go_decision.md`
- `docs/calc/phase3_wbs.md`

---

## 指摘サマリー

| ID | 重要度 | 分類 | 対象ドキュメント | 状況 |
|---|---|---|---|---|
| [F-H1](#f-h1) | 🔴 High | インターフェース欠落 | porting_design_guideline.md | 修正済み |
| [F-H2](#f-h2) | 🔴 High | 必須/任意の不一致 | porting_design_guideline.md | 修正済み |
| [F-H3](#f-h3) | 🔴 High | 必須/任意の不一致 | porting_design_guideline.md | 修正済み |
| [F-H4](#f-h4) | 🔴 High | 仕様未定義 | porting_design_guideline.md, phase3_wbs.md | 修正済み |
| [F-H5](#f-h5) | 🔴 High | 仕様抜け漏れ | phase3_go_decision.md | 修正済み |
| [F-H6](#f-h6) | 🔴 High | 数式未記載 | damage_calculation_model.md | 修正済み |
| [F-M1](#f-m1) | 🟡 Medium | union型の不一致 | phase2_design_specification.md | 修正済み |
| [F-M2](#f-m2) | 🟡 Medium | ファイルパス不一致 | porting_design_guideline.md, phase3_wbs.md | 修正済み |
| [F-M3](#f-m3) | 🟡 Medium | alias未定義 | porting_design_guideline.md | 修正済み |
| [F-M4](#f-m4) | 🟡 Medium | 加算ルール曖昧 | phase3_go_decision.md | 修正済み |
| [F-M5](#f-m5) | 🟡 Medium | fallback方針未定義 | phase3_wbs.md | 修正済み |
| [F-M6](#f-m6) | 🟡 Medium | multiplier仕様不足 | phase2_design_specification.md | 修正済み |
| [F-L1](#f-l1) | 🟢 Low | 境界条件表記漏れ | phase2_design_specification.md | 修正済み |
| [F-L2](#f-l2) | 🟢 Low | 診断出力差分リスク | porting_design_guideline.md | 修正済み |
| [R-1](#r-1) | 🔴 High | 仕様整合性 | porting_design_guideline.md, phase2_design_specification.md | 修正済み |
| [R-2](#r-2) | 🔴 High | 追撃仕様追加 | porting_design_guideline.md, phase3_wbs.md | 修正済み |
| [R-3](#r-3) | 🟡 Medium | 仕様陳腐化 | phase2_design_specification.md | 修正済み |
| [R-4](#r-4) | 🟢 Low | リンク無効 | phase3_go_decision.md | 修正済み |

---

## 🔴 High — 実装開始前に必ず解消すること

### F-H1

**タイトル**: `defender.passiveDefenseDown` が `porting_design_guideline.md` のインターフェース定義に未記載

**内容**:  
`phase3_go_decision.md` の C1 で `defender.passiveDefenseDown?: number` の追加が確定済みだが、`porting_design_guideline.md` セクション4の `DamageInputContext` 型定義にこのプロパティが存在しない。実装者が guideline を参照した場合、C1 の決定を見落とす。

**修正方針**:  
`porting_design_guideline.md` の `DamageInputContext.defender` に以下を追記する:

```typescript
defender: {
  // ... 既存プロパティ ...
  passiveDefenseDown?: number;  // アビリティ等による常時パッシブデバフ (デフォルト: 0.0)
}
```

**対象ファイル**: `docs/calc/porting_design_guideline.md` セクション4

---

### F-H2

**タイトル**: `defender.statusEffects[].category` の必須/任意がドキュメント間で矛盾

**内容**:  
`porting_design_guideline.md` の型定義では `category?`（任意）、`phase2_design_specification.md` および `phase3_go_decision.md` C3 では必須（`?` なし）。C3 で Python の `classify_debuff()` 廃止が確定済みであるため、任意のままでは実装者が「分類関数を残すか否か」を判断できない。

**修正方針**:  
`porting_design_guideline.md` の型定義を phase3 確定に合わせて更新:

```typescript
// 変更前
category?: 'NormalDefense' | 'PermDefense' | 'ElementDefense' | 'PermElementDefense' | 'DPDefense';

// 変更後
category: 'NormalDefense' | 'PermDefense' | 'ElementDefense' | 'PermElementDefense' | 'DPDefense';
```

**対象ファイル**: `docs/calc/porting_design_guideline.md` セクション4

---

### F-H3

**タイトル**: `skill.skillId` の必須/任意がドキュメント間で矛盾

**内容**:  
`porting_design_guideline.md` では `skillId?`（任意）、`phase2_design_specification.md` では必須（`skillId: number`）。`skills.json.parts` からの動的解決を前提とする場合、`skillId` なしではスキル特定の信頼性が下がる。

**修正方針**:  
`porting_design_guideline.md` の型定義を更新:

```typescript
// 変更前
skill: {
  skillId?: number;
  name: string;
  level?: number;
}

// 変更後
skill: {
  skillId: number;      // skills.json参照のため必須
  name: string;
  level?: number;
}
```

`skillId` なしでスキル名のみ解決するケースが実在する場合は、その条件とフォールバック動作を明記すること。

**対象ファイル**: `docs/calc/porting_design_guideline.md` セクション4

---

### F-H4

**タイトル**: `skills.json.parts` から `e59/l59/m59` およびスキルフラグを導出する手順が完全未定義

**内容**:  
`porting_design_guideline.md` セクション3「設計改善」では「ハードコーディングを一切行わず、すべてのスキルに対して `skills.json` からデータを動的に引き当て」と宣言しているが、具体的な導出ルールが存在しない。

Python 実装では以下を `sp_mapping.json` から取得していた:
- `e_mapped`（閾値）
- `is_aoe`（全体攻撃フラグ）
- `is_normal_attack`（通常攻撃フラグ）
- `is_pursuit`（追撃フラグ）

また、通常攻撃・追撃のハードコード値（`e59=100/114`, `l59=237.5/645`, `m59=475/1290`）が `skills.json` のどのフィールドに対応するかが未記載。

**修正方針**:  
`phase3_wbs.md` の T3.2.2 に「part selection algorithm 仕様化」タスクを追加し、以下を明文化すること:

1. 攻撃 part の識別条件（`skill_type` 許可リスト — Python の `ALLOWED_ATTACK_TYPES` と対応）
2. `diff_for_max`（= `e59`）、`power[0]`/`power[1]`（= `l59`/`m59`）のフィールドマッピング
3. `target_type == "All"` → `is_aoe` の判定ルール
4. `skills.json` 上の通常攻撃・追撃の skill ID と `parts` 内での識別方法
5. 解決失敗時のフォールバック（エラーにするか、`e59 = 105 + sp * 3` を残すか）

**対象ファイル**: `docs/calc/phase3_wbs.md` T3.2.2、`docs/calc/porting_design_guideline.md` セクション3

---

### F-H5

**タイトル**: `Fragile` デバフの `category` 必須化が C3 の対象外になっている

**内容**:  
`phase3_go_decision.md` C3 は `DefenseDown` と `ElementResistDown` の `category` 必須化と `classify_debuff()` 廃止を定めているが、`Fragile` については言及がない。Python の `classify_fragile()` もスキル名文字列マッチング（「永続」「まだまだ行くで」）に依存しており、TS 版での扱いが未定。

**修正方針**:  
C3 の対象を `Fragile` にも拡大する。`porting_design_guideline.md` セクション2 の命名規則に `NormalFragile`/`PermFragile` カテゴリが既に定義されているため、`DamageInputContext.defender.statusEffects` の型定義を以下のように統合:

```typescript
statusEffects: Array<{
  statusType: 'DefenseDown' | 'ElementResistDown';
  category: 'NormalDefense' | 'PermDefense' | 'ElementDefense' | 'PermElementDefense' | 'DPDefense';
  // ...
} | {
  statusType: 'Fragile';
  category: 'NormalFragile' | 'PermFragile';  // 必須
  // ...
}>;
```

または `category` を全ステータスタイプ横断のユニオンとし、`statusType` との組み合わせ有効性をランタイム検証する。

**対象ファイル**: `docs/calc/phase3_go_decision.md` C3、`docs/calc/porting_design_guideline.md` セクション4

---

### F-H6

**タイトル**: クリティカル基礎ダメージの `border_crit` 計算式が設計文書に記載されていない

**内容**:  
`damage_calculation_model.md` の数式モデルには通常・クリティカルのダメージ式が示されているが、クリティカル時の「敵防御ステータスを減少させた状態」の具体的な算出式が記載されていない。

Python 実装:
```python
border_crit = param_border - 50.0 - max(0.0, -50.0 - ability_spr_correction)
```

この式は `abilitySprCorrection` の値によって挙動が変わる（補正が -50 を下回る場合に追加クランプが発生）。

**修正方針**:  
`damage_calculation_model.md` セクション3（クリティカルダメージ計算モデル）に以下を追記:

$$border\_crit = param\_border - 50 - \max(0, -50 - abilitySprCorrection)$$

- `param_border`: 敵の防御境界値
- `abilitySprCorrection`: アビリティ等による精神補正（デフォルト: 0、マイナス値も許容）
- 補正が -50 を下回る場合、追加のクランプが発生する（例: -80 指定時 → `border_crit = param_border - 50 - 30`）

**対象ファイル**: `docs/calc/damage_calculation_model.md` セクション3

---

## 🟡 Medium — 実装開始後でも支障が出るため早めに解消すること

### F-M1

**タイトル**: `DamageResult.breakdown.ignoredEffects[].side` の union 型が不一致

**内容**:  
- `porting_design_guideline.md`: `'attacker' | 'defender' | 'context'`（Python 実装と一致）
- `phase2_design_specification.md`: `'attacker' | 'defender'`（`'context'` なし）

Python 実装では未知のゾーン文字列も `ignoredEffects` に `side: 'context'` で記録している。

**修正方針**:  
`phase2_design_specification.md` の `DamageResult` 型定義を更新:

```typescript
// 変更後
side: 'attacker' | 'defender' | 'context';
```

`'context'` は `activeZone` の未知値や入力全体由来の警告に使用することを明記する。

**対象ファイル**: `docs/calc/phase2_design_specification.md` セクション3

---

### F-M2

**タイトル**: テストファイルのパスが2ドキュメント間で異なる

**内容**:  
- `porting_design_guideline.md` セクション5: `tests/damage-calculator.test.ts`
- `phase3_wbs.md` T3.3.1: `calc/tests/run_fixed_fixtures.test.ts`

**修正方針**:  
実際のリポジトリ構成に合わせてどちらかへ統一する。`calc/tests/` は Python コードと同居するため、プロジェクトのテスト規約（`tests/` 配下統一）がある場合は guideline 版のパスが適切。統一した上で両ドキュメントを更新すること。

**対象ファイル**: `docs/calc/porting_design_guideline.md` セクション5、`docs/calc/phase3_wbs.md` T3.3.1

---

### F-M3

**タイトル**: `abilitySprCorrection` / `as48` 両エイリアスの対応方針が contract に未記載

**内容**:  
Python 実装は両方を受け付けている（`as48` は旧 Excel セル番号由来の後方互換エイリアス）。TS 版の `DamageInputContext` に `abilitySprCorrection` のみ定義すると、既存 fixture に `as48` が含まれる場合に差分が発生する。

**修正方針**:  
`porting_design_guideline.md` セクション4 に注記を追加:

> `abilitySprCorrection` を正式プロパティとする。`as48`（旧エイリアス）の入力は入力正規化レイヤーで `abilitySprCorrection ?? as48 ?? 0` として吸収し、両方指定時は `abilitySprCorrection` を優先する。TS 版の公開 API では `as48` を型定義に含めない。

**対象ファイル**: `docs/calc/porting_design_guideline.md` セクション4

---

### F-M4

**タイトル**: `passiveDefenseDown` が重複上限ルールの外側かどうかが未定義

**内容**:  
`phase3_go_decision.md` C1 の計算式は `aggregateDebuffs(statusEffects) + passiveDefenseDown` の単純加算だが、`aggregateDebuffs` 内部の上位2枠制限（NormalDefense 等）の対象外として扱うのか否かが明記されていない。

**修正方針**:  
C1 に以下の注釈を追記:

> `passiveDefenseDown` はアクティブデバフの集約（上位2枠制限あり）とは独立した固定加算値であり、カテゴリ制限の対象外とする。

**対象ファイル**: `docs/calc/phase3_go_decision.md` C1

---

### F-M5

**タイトル**: `_find_skill()` の fallback 挙動（攻撃 part 未発見時の `candidates[0]` 返却）の移植方針が未定義

**内容**:  
Python 実装では攻撃 part が見つからない場合でも `candidates[0]` を返し、呼び出し元で `part is None` → `base_damage = 0.0` にクランプする。TS 版でこの挙動を削除すると一部 fixture が計算不能になるリスクがある。

**修正方針**:  
`phase3_wbs.md` T3.2.2 に以下の方針を追記:

> 初期移植では Python 互換 fallback（攻撃 part 未発見 → `candidates[0]` を使用し `base_damage = 0` でクランプ）を維持する。ただし発生時は `ignoredEffects` に `{statusType: "no_attack_part", skillName: ..., side: "context"}` を記録し警告とする。データ修正が完了次第、fallback を削除してエラーに切り替える（T3.2.2 の後続タスクとして管理）。

**対象ファイル**: `docs/calc/phase3_wbs.md` T3.2.2

---

### F-M6

**タイトル**: 最終ダメージ式のうち `token/funnel/special/destruction/resistance` の詳細仕様が不足

**内容**:  
`phase2_design_specification.md` はバフ/デバフ/脆弱/クリティカルに特化しており、以下の multiplier については定義が薄い:
- `tokenMultiplier`: 計算式（`1.0 + tokenRatio`）と `tokenCount → tokenRatio` 変換（`× 0.10`）
- `funnelMultiplier`: 計算式（`1.0 + Funnel%`）と上限の有無
- `specialEffect`（対HP/DP特効）: どの `multipliers` フィールドを参照するか
- `destructionRate`: 入力値の単位（倍率表記 2.5 = 250%）
- `resistMultiplier` / `affinityMultiplier`: ゾーン倍率と武器属性相性の合算方法

**修正方針**:  
`damage_calculation_model.md` のセクション3（数式モデル）に各 multiplier の定義表を追加する。少なくとも以下を含めること:
- 入力ソース（DamageInputContext のどのフィールドか）
- 計算式
- デフォルト値
- 上限・下限

**対象ファイル**: `docs/calc/damage_calculation_model.md` セクション3

---

## 🟢 Low — 品質改善

### F-L1

**タイトル**: スケーリング式の境界条件 `X == T_final` が省略されている

**内容**:  
`phase2_design_specification.md` の補間式は `X > T_final` と `X <= T_final` で場合分けしているが、`X == T_final` 時に線形補間が `V_max_L` になることが式から自明でないため誤解を招く可能性がある。

**修正方針**:  
注記として「`X == T_final` のとき補間式は `V_max_L` に収束する」と明記するか、完全な区間を示す:

$$Effect = \begin{cases} V_{max,L} & (X \geq T_{final}) \\ \frac{V_{max,L} - V_{min,L}}{T_{final}} \times X + V_{min,L} & (0 \leq X < T_{final}) \\ V_{min,L} & (X < 0) \end{cases}$$

**対象ファイル**: `docs/calc/phase2_design_specification.md` セクション1

---

### F-L2

**タイトル**: `ignoredEffects.side` 型変更によるテスト差分リスク

**内容**:  
`side` に `'context'` を追加することで、`DamageResult` オブジェクト全体比較テスト（スナップショットテスト）が失敗する可能性がある。計算値には無影響だが、CI でのノイズになる。

**修正方針**:  
Vitest テスト実装時に `ignoredEffects` の検証は型の構造チェックとし、`side` の具体値は `expect.stringMatching(/^(attacker|defender|context)$/)` 等でパターン検証する。スナップショット全体比較は避ける。

**対象ファイル**: 実装時の `tests/damage-calculator.test.ts` 設計方針として記録

---

## ドキュメント修正の優先順位

以下の順序で各ドキュメントを修正することを推奨する。

### ステップ1（T3.2.1〜T3.2.2 着手前）
1. `porting_design_guideline.md` の `DamageInputContext` を phase3 確定ベースに一本化（F-H1/H2/H3/M3 を同時対応）
2. `phase2_design_specification.md` の `ignoredEffects.side` を `'context'` 追加（F-M1）
3. `phase3_go_decision.md` C1 に `passiveDefenseDown` の上限除外方針を追記（F-M4）
4. `phase3_go_decision.md` C3 の対象を `Fragile` へ拡大（F-H5）

### ステップ2（T3.2.2〜T3.2.4 着手前）
5. `phase3_wbs.md` T3.2.2 に part selection algorithm 仕様化タスクを追加（F-H4）
6. `phase3_wbs.md` T3.2.2 に fallback 方針を追記（F-M5）
7. テストファイルパスを統一（F-M2）

### ステップ3（T3.3.1 着手前）
8. `damage_calculation_model.md` に `border_crit` 式を追記（F-H6）
9. `damage_calculation_model.md` に multiplier 定義表を追加（F-M6）
10. スケーリング式の境界条件を補完（F-L1）

---

## 👥 合同レビュー残存指摘 (2026-06-02 追加)

### R-1

**タイトル**: `skillId` の null 許容条件を明確化

**内容**: 
通常攻撃・追撃も `skills.json.parts` から動的解決するとしているため、`skillId` が null になる条件が矛盾していた。

**対応内容**: 
`porting_design_guideline.md` および `phase2_design_specification.md` の `skillId` の型定義コメントを修正し、実IDがある通常攻撃・追撃は必須であること、null はカスタムスキルや name のみでの解決など例外的なケースに限ることを明記。

---

### R-2

**タイトル**: 追撃の `skillId` と parts 識別ルールの定義

**内容**: 
通常攻撃の ID 例はあるが、追撃の具体 ID と識別方法が未記載だった。

**対応内容**: 
`porting_design_guideline.md` に「通常攻撃・追撃の識別」ルールを追加し、通常攻撃は末尾 `01` シリーズ（name == 「通常攻撃」）、追撃は末尾 `91` シリーズ（name == 「追撃」）として `skills.json` から動的解決する仕様を明記。`phase3_wbs.md` の T3.2.2 タスク定義にも追記。

---

### R-3

**タイトル**: `classify_debuff()` 注記の陳腐化修正

**内容**: 
C3 で category 必須化・`classify_debuff()` 廃止が決定したため、`phase2_design_specification.md` の注記が矛盾していた。

**対応内容**: 
`phase2_design_specification.md` の注記を差し替え、TS 版では category が必須であること、自動分類処理が廃止されたことを明記。

---

### R-4

**タイトル**: `phase3_go_decision.md` の参照ドキュメントパス修正

**内容**: 
`phase3_go_decision.md` 末尾の参照パスが移動前の旧パスになっていた。

**対応内容**: 
`docs/calc/` に移動済みのファイルのパスを更新し、`hbr_calc` リポジトリに残っているものは注記を追加。
