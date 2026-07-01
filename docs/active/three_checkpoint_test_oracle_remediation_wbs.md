# 3基準点テスト oracle 復元・再現性修正 WBS

- ステータス: ✅ 完了
- 基点: `origin/main` (`9b126ededafcde3ae3c4f14e6e3945850e734cfa`)
- 作業 branch: `codex/restore-test-oracles`
- 開始日: 2026-07-01
- 監査記録: [3基準点テスト・fixture全件監査](../20260701_three_checkpoint_test_audit/README.md)

## 完了条件

| ID | 作業 | 状態 | 検証 |
|---|---|---|---|
| WBS-0 | 監査文書とWBSをrepoへ登録 | [x] | `docs/README.md`から到達可能 |
| WBS-1 | Node 22 / npm 10.9.7でlockfileとCIを修復 | [x] | clean `npm ci` |
| WBS-2 | 自動／手動stats境界を修正 | [x] | raw/effective snapshot、manual保持、support、LB・称号・転生回帰 |
| WBS-3 | 破壊率実測oracleを復元 | [x] | 72 stats、`132.63`、Break hit 7、`717.34` |
| WBS-4 | Downloads sessionをrepo内fixture化 | [x] | SHA-256一致、絶対パス・skipなし |
| WBS-5 | 大規模計算fixture生成を決定化 | [x] | seed固定、1000件、`--check`完全一致 |
| WBS-6 | 称号master依存をfixture内へ固定 | [x] | 対象testが`golden/master_json`非依存 |
| WBS-7 | 全体検証と文書更新 | [x] | unit/calc/lint/E2E結果を本書へ記録 |

## 変更しないもの

- 基準タグおよび過去履歴は移動・rewriteしない。
- 現在の `feature/engine-template1-character-validation` worktreeにあるユーザー変更を触らない。
- Python版calcは静的参照のままとし、欠落生データや第三者由来資料を再導入しない。
- operation-chip layout E2E flakeは別PRで扱う。

## 実行記録

### 生成fixture

- コマンド: `npm run generate:calc-fixtures`
- 検証: `npm run check:calc-fixtures`
- seed: `20260701`
- 件数: 1000
- fixture SHA-256: `b1fbafc87ce69e094dc5abf6b5c58dd946c261e3ca162b723e0f9b6e6ccb9f7b`
- metadata SHA-256: `2493c2206679aeb6cfeb667aee0186b358809523aeefb6cf76d5ef5cd817277b`
- 2回連続生成で両SHAが不変であることを確認した。

### 検証結果

| 検証 | 結果 |
|---|---|
| Node / npm | Node `22.23.1` / npm `10.9.7` |
| clean `npm ci` | 157 packages、成功 |
| `npm test` | 1564 pass |
| `npm run test:calc` | fixed 7 + deterministic 1000 = 1007 pass |
| `npm run lint` | pass |
| template1 actual fixture単体 | 5 pass、`golden/master_json`直接依存なし |
| 破壊率・multi-HP target E2E 3回反復 | 6/6 pass（2 test × 3） |
| session自動stats E2E 3回反復 | 3/3 pass |
| comparison-view E2E 3回反復 | 6/6 pass（2 test × 3） |
| full E2E | 114/114 pass |

### stats保存境界の確定事項

- top-level `setup.statsByPartyIndex` は手入力overrideだけを保持するraw状態とする。
- 戦闘開始・再計算では「手入力優先、未入力なら最新default」のeffective snapshotを使用する。
- sessionの再現用 `replayScript.setup.statsByPartyIndex` は戦闘開始時に解決済みの実効値を固定する。
- LB4・称号・転生込みで画面に表示された `str=550` をreplayにも保存する。旧期待値`533`は称号・転生加算前の値で、同一操作の表示値と矛盾していたため修正した。

### 既知flake（別PR）

`turn-row-operation-chip-layout.spec.js` は `--workers=1 --repeat-each=3` で2 pass / 1 failだった。失敗signatureは既知の `clientRectCount: expected 1, received 0` と一致し、同じ変更集合のfull E2Eではpassした。今回変更した破壊率、multi-HP、stats保存、comparison-viewの各specは反復実行で失敗していないため、本WBSの範囲外として分離する。
