# T33 実データ基準の固有スキル/パッシブ監査 WBS

> **ステータス**: 🟢 進行中 | 📅 作成: 2026-04-10 | 🔄 最終更新: 2026-04-10
>
> **親管理**: `docs/active/ui_next_unimplemented_tasklist.md`
>
> **監査ハーネス**: `scripts/generate-t33-skill-passive-audit.mjs`

---

## 進捗チェック

- [x] `HbrDataStore.fromJsonDirectory('json')` を正本にした T33 監査ハーネスを追加した
- [x] `skill` / `skills[].passive` / `style.passives[]` を style 文脈付きで棚卸しした
- [x] `logicGaps` / `observabilityGaps` / `staleDocFalsePositives` / `outOfScope` の分類を JSON 出力で固定した
- [x] `tests/t33-skill-passive-audit.test.js` で第1波 baseline を固定し、`恐怖の叫び` は `test.todo` へ切り出した
- [x] `ui_next_unimplemented_tasklist.md` / `docs/README.md` / stale active docs を同じ変更集合で同期した
- [ ] `T33-FU1`: `AdditionalHitOnExtraSkill + Talisman` を runtime 実装し、`test.todo` を実挙動テストへ昇格する

## 監査メモ

### 2026-04-10 実行結果

- `node scripts/generate-t33-skill-passive-audit.mjs`
  - `styles=345`
  - `styleSkillEntries=1261`
  - `skillPassiveEntries=28`
  - `stylePassiveEntries=500`
  - `scannedEntries=1789`
  - `embeddedOnlyPassiveIds=116`
  - `structuralConditionGaps=0`
  - `structuralOverwriteGaps=0`
  - `structuralEnemyStatusGaps=0`
  - `silentSkipEnemyStatusCandidates=3`
  - `logicGapCount=1`
  - `observabilityGapCount=2`
  - `staleDocFalsePositiveCount=5`
  - `outOfScopeCount=3`
- 真の runtime gap は `stylePassive:57001275` / `恐怖の叫び` のみ
  - trigger: `AdditionalHitOnExtraSkill`
  - effect: `Talisman`
  - 対照ケース: `skillPassive:46401601` / `貼ったりましょう！`
- `silentSkipEnemyStatusCandidates=3` は `BorderRefPDownByAdmiral`（銀氷の加護 / 灼熱の加護 / 雷光の加護）
  - T33 の未実装ではなく、action-time Admiral mechanic の silent-skip として別扱い
- `node --test tests/condition-report-sync.test.js`、`node --test tests/real-data-mechanics-coverage.test.js`、`node --test tests/turn-state-transitions.test.js` は green を維持

### 判定ルール

- `OnEveryTurnIncludeSpecial` は preview-path 実装であり、runtime gap には数えない
  - ただし `passiveEventsLastApplied` に載らないため observability gap として残す
- style 埋め込み passive は `passives.json` 単体では取り切れない
  - T33 監査は raw file ではなく `HbrDataStore` を使う
- 既存 active 文書には stale claim が残っていた
  - `浄化の喝采`
  - `AdditionalHitOnBreaking + AttackUp` の旧 `破砕の喝采` 記載
  - `ライトプロテクション`
  - `役者魂`
  - `OnOverdriveStart` runtime gap

## 目的

- 実データ基準で「本当に未反映の固有スキル/パッシブ」を 1 波で切り分ける
- runtime gap と、観測不足・古い文書・既存 backlog 領域を分離する
- 次波の実装対象を `T33-FU1` へ縮約し、以後の effect 実装をテスト駆動で進められる状態にする

## スコープ

### In Scope

- `HbrDataStore.fromJsonDirectory('json')` で読んだ `store.styles[].skills`
- `store.styles[].skills[].passive`
- `store.styles[].passives`
- 既存 helper を使った `condition` / `overwrite_cond` / enemy-status structural gap の再監査
- 第1波の baseline test / doc sync

### Out Of Scope

- `PRI-018` の `use_count` / `HealSkillUsedCount`
- `ConquestBikeLevel` の UI override
- 印 / `Territory` の見える化拡張
- runtime 実装修正そのもの
  - 第1波では `test.todo` と backlog 化までで止める

## 実行順

1. 監査ハーネスを追加し、実データの全 entry を分類可能にする
2. `test.todo` を含む baseline test で第1波の現状を固定する
3. backlog と active docs の stale claim を同一変更集合で同期する
4. `T33-FU1` で `恐怖の叫び` の runtime 実装と dedicated test 昇格を行う

## 詳細WBS

### WBS-1: 監査ハーネス

- [x] `scripts/generate-t33-skill-passive-audit.mjs` を追加
- [x] `logicGaps` / `observabilityGaps` / `staleDocFalsePositives` / `outOfScope` / `counts` を stdout JSON で出力
- [x] `listUnsupportedConditionClausesByRuntimeSupport()` と `classifyEnemyStatusPartRuntimeSupport()` を再利用
- [x] `BorderRefPDownByAdmiral` は silent-skip candidate として structural gap から除外

### WBS-2: WBS / backlog / docs 同期

- [x] 本 WBS を作成
- [x] `ui_next_unimplemented_tasklist.md` の T33 節を「第1波完了 + T33-FU1 残」に更新
- [x] `docs/README.md` に active row を追加
- [x] `stateful_passive_wbs.md` / `passive_test_coverage_audit.md` / `passive_timing_reference.md` の stale claim を HEAD 基準へ更新

### WBS-3: 再現ケース固定

- [x] `tests/t33-skill-passive-audit.test.js` を追加
- [x] `恐怖の叫び` は `test.todo` で記録
- [x] 既存 green ケースは重複実装せず参照に寄せた
  - `浄化の喝采`
  - `AdditionalHitOnBreaking + AttackUp`
  - `ライトプロテクション`
  - `役者魂`
  - `OnOverdriveStart`

### WBS-4: 次波

- [ ] `T33-FU1`: `AdditionalHitOnExtraSkill + Talisman`
  - `恐怖の叫び` の EX 使用後に `Talisman` level-up / 付与が走るようにする
  - `tests/turn-state-transitions.test.js` に dedicated runtime test を追加する
  - `tests/t33-skill-passive-audit.test.js` の `test.todo` を通常テストへ昇格する

## 受け入れ条件

- 監査ハーネスが実データを読み、JSON summary を安定出力できる
- 第1波の summary が `logic gap 1 / structural gap 0 / observability 2 / stale doc 5 / out-of-scope 3` に固定されている
- `ui_next_unimplemented_tasklist.md` と `docs/README.md` に T33 第1波完了が反映されている
- 残課題が `T33-FU1` に限定されている
