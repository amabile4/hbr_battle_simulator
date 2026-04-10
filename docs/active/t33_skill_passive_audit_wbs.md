# T33 実データ基準の固有スキル/パッシブ監査 WBS

> **ステータス**: ✅ 完了 | 📅 作成: 2026-04-10 | 🔄 最終更新: 2026-04-10
>
> **親管理**: `docs/active/ui_next_unimplemented_tasklist.md`
>
> **監査ハーネス**: `scripts/generate-t33-skill-passive-audit.mjs`
>
> **T33-FU1 完了記録**: `docs/active/talisman_completion_wbs.md`

---

## 進捗チェック

- [x] `HbrDataStore.fromJsonDirectory('json')` を正本にした T33 監査ハーネスを追加した
- [x] `skill` / `skills[].passive` / `style.passives[]` を style 文脈付きで棚卸しした
- [x] `logicGaps` / `observabilityGaps` / `staleDocFalsePositives` / `outOfScope` の分類を JSON 出力で固定した
- [x] `tests/t33-skill-passive-audit.test.js` で post-completion baseline を固定した
- [x] `ui_next_unimplemented_tasklist.md` / `docs/README.md` / stale active docs を同じ変更集合で同期した
- [x] `T33-FU1`: `AdditionalHitOnExtraSkill + Talisman` を runtime 実装し、dedicated test / UI 表示 / audit baseline を更新した

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
  - `logicGapCount=0`
  - `observabilityGapCount=2`
  - `staleDocFalsePositiveCount=0`
  - `outOfScopeCount=3`
- runtime gap は 0 件
  - `恐怖の叫び` は `AdditionalHitOnExtraSkill + Talisman` 実装後、audit から除外された
  - dedicated runtime test: `tests/turn-state-transitions.test.js:11769`
  - baseline test: `tests/t33-skill-passive-audit.test.js:6`
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
- `T33-FU1` を完了し、logic gap 0 の状態で監査を閉じる

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

## 実行順

1. 監査ハーネスを追加し、実データの全 entry を分類可能にする
2. baseline test で第1波の現状を固定する
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
- [x] `ui_next_unimplemented_tasklist.md` の T33 節を完了状態へ更新
- [x] `docs/README.md` に active row を追加
- [x] `stateful_passive_wbs.md` / `passive_test_coverage_audit.md` / `passive_timing_reference.md` の stale claim を HEAD 基準へ更新

### WBS-3: 再現ケース固定

- [x] `tests/t33-skill-passive-audit.test.js` を追加
- [x] `恐怖の叫び` は通常テストへ昇格済み
- [x] 既存 green ケースは重複実装せず参照に寄せた
  - `浄化の喝采`
  - `AdditionalHitOnBreaking + AttackUp`
  - `ライトプロテクション`
  - `役者魂`
  - `OnOverdriveStart`

### WBS-4: 次波

- [x] `T33-FU1`: `AdditionalHitOnExtraSkill + Talisman`
  - `恐怖の叫び` の EX 使用後に `Talisman` level-up / 付与が走るようにした
  - `tests/turn-state-transitions.test.js` に dedicated runtime test を追加した
  - `tests/t33-skill-passive-audit.test.js` の `test.todo` を通常テストへ昇格した
  - action-flow / enemy popup / `damageContext` の露出は `docs/active/talisman_completion_wbs.md` に集約した

## 受け入れ条件

- 監査ハーネスが実データを読み、JSON summary を安定出力できる
- post-completion summary が `logic gap 0 / structural gap 0 / observability 2 / stale doc 0 / out-of-scope 3` に固定されている
- `ui_next_unimplemented_tasklist.md` と `docs/README.md` に T33 第1波完了が反映されている
- `T33-FU1` が完了し、T33 の runtime gap が 0 件になっている
