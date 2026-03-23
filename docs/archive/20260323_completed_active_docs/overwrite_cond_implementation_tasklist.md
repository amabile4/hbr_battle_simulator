# overwrite_cond 実装タスクリスト（PRI-010）

> **ステータス**: ✅ 完了 | 📅 最終更新: 2026-03-14

## 目的

- skill-level `overwrite_cond` を `resolveEffectiveSkillForAction()` に接続する
- `overwrite` 値を「条件成立時の実効 SP コスト」として反映する
- 既存の `SkillCondition` 分岐と競合させず、no-op に近い既存挙動を壊さない
- `SP厳密モード` でも実効コストを使うように揃える

## スコープ

### 今回やること

- プレイヤー側条件で完結する `overwrite_cond`
  - `PlayedSkillCount(...)`
  - `Sp()`
  - `DpRate()`
  - `Token()`
  - `MotivationLevel()`
  - `MoraleLevel()`
  - `IsTeam(...)`
  - `IsZone(...)`
  - `SpecialStatusCountByType(...)`
  - `IsCharging()`
- `overwrite` による SP コスト上書き
- UI 上のコスト表示と `SP厳密モード` の整合

### 今回やらないこと

- 敵状態異常依存の `overwrite_cond`
  - `SpecialStatusCountByType(12/57/3/22/172)`
  - `BreakDownTurn()>0`
  - 敵 `IsDead()==0` / `IsBroken()==1` と組み合わせたもの
- top-level `effect` の接続
- 実ダメージ計算・敵AI・勝敗判定

## 事前確認メモ

- `json/skills.json` 上で `overwrite_cond` を持つ skill は `50` 件
- うち `SkillCondition` part を併用するものは `14` 件、持たないものは `36` 件
- `overwrite` 値は全 `50` 件で `sp_cost` と異なる
  - `14 -> 7`, `10 -> 5`, `7 -> 0` のような「条件成立時コスト減少」が主用途
- 現在のコードは `overwriteCond` を effective skill に保持するが、`overwrite` 自体は参照していない
- `SkillCondition` 分岐は既存の `resolveEffectiveSkillVariant()` でかなり吸収できている
- `SP厳密モード` は現状 `skill.spCost` の base 値でチェックしている

## 対象ファイル

- `src/domain/character-style.js`
- `src/data/hbr-data-store.js`
- `src/turn/turn-controller.js`
- `src/ui/dom-adapter.js`
- `tests/dom-adapter-ui-selection.test.js`
- `tests/turn-state-transitions.test.js`
- `docs/active/implementation_priority_tasklist.md`
- `docs/active/sp_strict_mode_tasklist.md`
- `docs/README.md`

## タスクリスト

### フェーズ1: effective skill への接続

- [x] **T01**: effective skill に `overwrite` scalar を保持する
- [x] **T02**: `overwrite_cond` を `resolveEffectiveSkillForAction()` で評価する
- [x] **T03**: 条件成立時だけ `spCost = overwrite` を適用する
- [x] **T04**: 条件 `false` / `unknown` では base `spCost` を維持する
- [x] **T05**: `consumeType !== Sp` や `spCost <= 0` のケースで誤適用しない

### フェーズ2: 条件対応の最小追加

- [x] **T06**: `IsCharging()` を条件パーサに追加する
  - `BuffCharge` / 特殊状態 `25` を見て判定する
- [x] **T07**: `overwrite_cond` 評価に既存 `CountBC` / `PlayedSkillCount` / `IsZone` / `Sp` / `DpRate` / `IsTeam` をそのまま流せることを確認する

### フェーズ3: UI / Strict mode 整合

- [x] **T08**: `commitCurrentTurn()` の SP厳密モードチェックで effective skill のコストを使う
- [x] **T09**: 既存の UI コスト表示と commit 判定が同じ値を見ることを確認する

### フェーズ4: テスト

- [x] **T10**: team count 条件で半減
  - `リミット・インパクト+` 相当
- [x] **T11**: 初回使用時だけ半減
  - `ロココ・デストラクション` 相当
- [x] **T12**: 回避状態で半減
  - `ヘイルストーム` 相当
- [x] **T13**: 非 Fire zone 中は `SP0`
  - `スペクタクルアート` 相当
- [x] **T14**: チャージ中は `SP0`
  - `スターダムロード` 相当
- [x] **T15**: 既存 `SkillCondition` 分岐が壊れていないことを確認
  - `邪眼・マリンスラッシュ`
  - `燃やせ青春！マリンボール！`

## 完了メモ

- `resolveEffectiveSkillForAction()` が skill-level `overwrite_cond` を評価し、成立時のみ `overwrite` を実効 SP コストへ反映する
- `unknown` 条件は base `spCost` に安全側 fallback する
- `SkillCondition` 分岐では、親 `overwrite_cond` を維持しつつ nested branch 自身の `overwrite_cond` がある場合のみ上書きを許可する
- `IsCharging()` と `IsTeam()` を条件評価へ追加した
- `SP厳密モード` は effective skill の `consumeType` / `spCost` を参照するように揃えた
- 実データ回帰として `ロココ・デストラクション` / `ヘイルストーム` / `スペクタクルアート` / `スターダムロード` / `リミット・インパクト+` / `燃やせ青春！マリンボール！` を追加した
- 検証結果:
  - `node --test tests/turn-state-transitions.test.js tests/dom-adapter-ui-selection.test.js` — 312 PASS
  - `npm run test:quick` — 328 PASS

## テストメモ

- 他メンバーを「行動なし」に近い状態にしたいときは `プロテクション` を優先する
- `overwrite_cond` が敵側条件に依存するケースは PRI-011 の対象として、この tasklist では未対応のまま許容する

## 完了条件

- skill-level `overwrite_cond` が代表的なプレイヤー側条件で動作する
- `overwrite` による実効 SP コストが preview / commit / strict mode で一致する
- 既存 `SkillCondition` 分岐のテストが壊れない
- 本ファイル、[`implementation_priority_tasklist.md`](implementation_priority_tasklist.md)、[`../README.md`](../README.md) が同期される
