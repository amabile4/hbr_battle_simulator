# SpecialStatusCountByType バフ状態 実装タスクリスト

> **ステータス**: ✅ 完了（T14除く低優先度） | 📅 開始: 2026-03-13 | 📅 完了: 2026-03-13 | 📅 PRI-011 吸収更新: 2026-03-14 | 📅 SP関連テスト追加: 2026-03-13

---

## 1. 調査結果サマリー

### 1.1 状態名マッピング（CSV確定版）

| statusType ID | 状態名 | skill_type | 評価方法 |
|--------------|--------|-----------|---------|
| 12 | 挑発 | Provoke | CountBC(敵側) |
| 25 | チャージ | BuffCharge | 自身 statusEffects |
| 57 | 注目 | Attention | CountBC(敵側) |
| 78 | 心眼 | MindEye | 自身 statusEffects |
| 79 | 拘束 | ImprisonRandom | CountBC(プレイヤー側) |
| 122 | 回避 | Dodge | 自身 statusEffects |
| 124 | 永遠なる誓い | EternalOath | CountBC(プレイヤー側) |
| 125 | 影分身 | ShadowClone | 自身 statusEffects |
| 144 | 歌姫の加護 | Diva | 自身 statusEffects |
| 155 | 山脇様のしもべ | BIYamawakiServant | CountBC(プレイヤー側) |
| 164 | メイクアップ | Makeup | 自身 statusEffects |

### 1.2 実装アーキテクチャ

- **格納**: `CharacterStyle.statusEffects[].metadata.specialStatusTypeId` に数値IDを保持
- **判定**: `hasSpecialStatus(member, typeId)` ヘルパー関数（`turn-controller.js`）
- **付与**: `applyBuffStatusEffectsFromActions()` で全バフ skill_type を一括処理
- **解除(Count型)**: スキル使用直後に `member.tickStatusEffectsByExitCond('Count')`
- **解除(PlayerTurnEnd型)**: 既存 `applyTurnBasedStatusExpiry` のフローで処理

### 1.3 exitCond の分類

| exitCond | 意味 | tick タイミング | 対象状態ID |
|---------|------|--------------|-----------|
| `Count` | スキル使用でデクリメント（チャージ消費型） | commitTurn の commitSkillPreview 直後 | 25, 78, 122, 164 |
| `PlayerTurnEnd` | ターン終了時にデクリメント（持続型） | 既存 applyTurnBasedStatusExpiry と同様 | 124, 125, 144, 155 |

> `exitVal` の実際の値は実装時に `json/skills.json` を検索して確定させること

### 1.4 優先度分類

- **優先度A（プレイヤーバフ自身チェック）**: 25, 78, 122, 125, 144, 164
- **優先度B（CountBCプレイヤー側）**: 79, 124, 155
- **優先度C（敵状態CountBC）**: 12, 57

---

## 2. タスクリスト

### フェーズ1: 基盤実装

- [x] **T01**: `CharacterStyle.applySpecialStatus()` メソッドを実装
  - **対象**: `src/domain/character-style.js`
  - 引数: `(typeId: number, remaining: number, exitCond: string, context: { skill? })`
  - `metadata.specialStatusTypeId: typeId` を持つ statusEffects エントリを追加
  - 既存エントリがあれば `remaining` を max 採用で更新（`applyShredding` と同方針）
  - `statusType` 文字列は定数マップ `SPECIAL_STATUS_TYPE_NAMES` で管理
  - テスト: `applySpecialStatus(25, 1, 'Count', {})` 後に `statusEffects` に追加されること

- [x] **T02**: `hasSpecialStatus(member, typeId)` ヘルパーを実装
  - **対象**: `src/turn/turn-controller.js`
  - `member.statusEffects.some(e => Number(e.metadata?.specialStatusTypeId) === typeId && isActiveStatusEffect(e))`
  - テスト: 付与済みメンバーで `true`、未付与/期限切れで `false`

- [x] **T03**: `resolveSingleArgConditionValue` の `SpecialStatusCountByType` を拡張
  - **対象**: `src/turn/turn-controller.js` (line ~786)
  - 実装済み type 20 はそのまま維持
  - `IMPLEMENTED_SPECIAL_STATUS_TYPES = new Set([25, 78, 79, 122, 124, 125, 144, 155, 164])` を定数化
  - セット内 typeId → `hasSpecialStatus(member, typeId) ? 1 : 0` で `known: true`
  - セット外 → 従来通り `known: false`
  - テスト: 各 typeId で `known: true` が返ること / 未実装 ID で `known: false` のままであること

### フェーズ2: 付与ロジック

- [x] **T04**: `applyBuffStatusEffectsFromActions(state, previewRecord)` を実装
  - **対象**: `src/turn/turn-controller.js`（新関数）
  - `applyShreddingEffectsFromActions` と同じ構造
  - 処理対象 skill_type と statusTypeId のマッピング:
    - `BuffCharge` → 25, `MindEye` → 78, `Dodge` → 122
    - `ShadowClone` → 125, `Diva` → 144, `Makeup` → 164
    - `EternalOath` → 124, `BIYamawakiServant` → 155
  - `part.effect.exitCond` / `part.effect.exitVal[0]` から期間を取得
  - `resolveSupportTargetCharacterIds` でターゲットを解決
  - 各ターゲットに `target.applySpecialStatus(typeId, remaining, exitCond, { skill })` を呼び出し
  - `commitTurn` 内 `applyShreddingEffectsFromActions` 直後に挿入
  - テスト: 各 skill_type 使用後に対象メンバーの `statusEffects` に追加されること

- [x] **T05**: exitCond='Count' 状態の解除タイミングを実装
  - **対象**: `src/turn/turn-controller.js` の `commitTurn` 内
  - `member.commitSkillPreview(...)` 呼び出し直後に `member.tickStatusEffectsByExitCond('Count')` を追加
  - アクターのみに適用（スキルを使用したキャラクターのみ）
  - テスト: チャージ状態保持キャラがスキル使用後に状態が解除されること

### フェーズ3: 各状態の個別確認とテスト（優先度A）

- [x] **T06**: チャージ状態（ID: 25, skill_type: BuffCharge）
  - `json/skills.json` で `BuffCharge` 使用スキルの exitCond/exitVal/target_type を確認
  - 付与テスト: BuffCharge スキル使用 → `hasSpecialStatus(member, 25)` が true
  - 判定テスト: `SpecialStatusCountByType(25)>0` 条件のパッシブが発動
  - 解除テスト: スキル使用後（Count型）に状態が消えること
  - CountBC テスト: `CountBC(IsPlayer() && SpecialStatusCountByType(25) > 0)>0` が保持者いるとき true

- [x] **T07**: 心眼状態（ID: 78, skill_type: MindEye）
  - `json/skills.json` で MindEye の exitCond/exitVal を確認
  - 付与・判定・解除の3テスト
  - パッシブ発動テスト: `SpecialStatusCountByType(78)>0 && IsFront()` 条件

- [x] **T08**: 回避状態（ID: 122, skill_type: Dodge）
  - exitCond='Count', limitType='Once' の挙動確認（同一キャラへの重複付与が上書きされるか）
  - 付与・判定・解除の3テスト
  - 前衛条件テスト: `SpecialStatusCountByType(122)>0 && IsFront()` 条件

- [x] **T09**: 影分身状態（ID: 125, skill_type: ShadowClone）
  - `json/skills.json` で ShadowClone の exitCond/exitVal を確認（PlayerTurnEnd 想定）
  - 付与・判定・解除の3テスト

- [x] **T10**: 歌姫の加護状態（ID: 144, skill_type: Diva）
  - `json/skills.json` で Diva の exitCond/exitVal を確認
  - 付与・判定・解除の3テスト
  - パッシブ発動テスト: 「レゾナンス」(SP+2) が歌姫の加護中のみ発動すること

- [x] **T11**: メイクアップ状態（ID: 164, skill_type: Makeup）
  - `json/skills.json` で Makeup の exitCond/exitVal を確認
  - 付与・判定・解除の3テスト
  - パッシブ発動テスト: `SpecialStatusCountByType(164)>0 && IsFront()` 条件

### フェーズ4: CountBC対象状態（優先度B）

- [x] **T12**: 永遠なる誓い状態（ID: 124, skill_type: EternalOath）
  - `json/skills.json` で EternalOath の target_type/exitCond を確認
  - 複数メンバーへの付与テスト
  - CountBC テスト: `CountBC(IsPlayer() && SpecialStatusCountByType(124)>0)>0`

- [x] **T13**: 山脇様のしもべ状態（ID: 155, skill_type: BIYamawakiServant）
  - `json/skills.json` で BIYamawakiServant の target_type/exitCond を確認
  - 複数メンバーへの付与テスト
  - CountBC テスト: `CountBC(IsPlayer() && SpecialStatusCountByType(155) >= 1)>=6`（6人以上条件）

- [ ] **T14**: 拘束状態（ID: 79）の CountBC 判定実装
  - 拘束は「敵からプレイヤーへの付与」のため、シミュレータでは手動入力に相当
  - 最低限: `hasSpecialStatus(member, 79)` が動作することの確認テスト
  - UI フック（低優先度）: `applySpecialStatus(79, N, 'PlayerTurnEnd', {})` を呼ぶ手段の検討

### フェーズ5: 敵状態（優先度C）

- [x] **T15**: 挑発(12)・注目(57) 敵状態の CountBC 評価
  - `evaluateCountBCPredicate` の敵側評価を enemy 単位 clause 判定へ一般化
  - `CountBC(IsPlayer()==0 && SpecialStatusCountByType(12)>0)>0` / `57` をサポート
  - `turnState.enemyState.statuses` の一般 status 基盤へ `Provoke` / `Attention` として統合
  - 実装は `PRI-011`（敵状態異常基盤）で吸収

### フェーズ6: 完了処理

- [x] **T16**: 全テスト通過確認
  - `npm test` で全テスト PASS（リグレッションなし）
  - 追加テスト分も含めて PASS になること

- [x] **T17**: ドキュメント更新・コミット
  - 本ファイルのステータスを ✅ に更新
  - `docs/README.md` の更新（必要に応じて）

### フェーズ7: SP関連パッシブの追加テスト（2026-03-13）

> T12・T13 のテストは CountBC 判定のみで SP 回復の実際の値を検証していなかったため追加。

- [x] **T12b**: EternalOath(124) + エンゲージリンク相当 — AllyAll + target_condition
  - `target_condition: "SpecialStatusCountByType(124)>0"` で誓い状態のメンバーのみ SP+1 されることを確認
  - 誓い状態なし → CountBC=0 → passive 条件不成立 → SP 変化なし も確認
- [x] **T13b**: BIYamawakiServant(155) + 世界を滅ぼすお手伝い相当 — target_condition
  - `target_condition: "SpecialStatusCountByType(155)>0"` でしもべ状態のメンバーのみ SP+1 されることを確認
  - しもべ状態なし → passive 条件不成立 → SP 変化なし も確認
- [x] **T勇姿**: ReduceSp / OnEveryTurnIncludeSpecial — チャージ状態のメンバーのみ SP 消費-1
  - `previewTurn` の `spCost` でチャージ状態あり(4) / なし(5) の差を確認
  - `commitTurn` 後の SP 値で消費差が1であることを確認
  - 全 522 テスト PASS（archive 除く）

---

## 3. 完了条件

- `SpecialStatusCountByType(N)` を条件に持つ全43件のスキル/パッシブが正確に評価される
- バフ状態付与スキルを使用すると対象メンバーに状態が付与される
- 状態の期間（Count型/PlayerTurnEnd型）が正しく管理される
- チャージ状態パッシブ（充填・広域充填）がチャージ中のみ発動する
- 心眼状態パッシブ（心眼の境地・王の眼差し）が心眼中のみ発動する
- 歌姫の加護パッシブ（レゾナンス・絶唱）が加護中のみ発動する
- `npm test` 全 PASS（リグレッションなし）

---

## 4. 実装時の注意事項

1. `normalizeStatusEffect` は `metadata` をそのまま保持するため、`specialStatusTypeId` は自動的に保存される
2. `tickStatusEffectsByExitCond('Count')` は**アクターのみ**に適用すること（ターゲットには適用しない）
3. exitCond='Count' の状態: スキル使用 → tick → remaining=0 → 自動削除の順序を確認すること
4. limitType='Once' の Dodge などは重複付与防止を `normalizeStatusEffect` の既存 `limitType` フィールドで対応できるか確認すること
5. T14(拘束) は低優先度。T15(挑発/注目) は PRI-011 で完了

---

## 5. 参照

- `docs/20260225_help-research/11_special_status_count_by_type.csv` — 状態ID・条件式・キャラクター一覧
- `src/domain/character-style.js:103` — `normalizeStatusEffect`（statusEffects スキーマ）
- `src/domain/character-style.js:719` — `applyShredding`（付与メソッドのパターン参考）
- `src/domain/character-style.js:851` — `tickStatusEffectsByExitCond`（解除ロジック）
- `src/turn/turn-controller.js:786` — `resolveSingleArgConditionValue`（条件評価拡張箇所）
- `src/turn/turn-controller.js:4380` — `applyShreddingEffectsFromActions`（付与関数パターン参考）
- `src/turn/turn-controller.js:3028` — `evaluateCountBCPredicate`（CountBC評価）
- `json/skills.json` — 各 skill_type の exitCond/exitVal/target_type を確認すること
