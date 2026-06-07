# 破壊率（destructionRate）実装プラン — 検討 & WBS

> **ステータス**: 🟢 仕様確定・D-1〜D-3部分完了・D-4〜D-7未着手 | **ブランチ**: `feature/destruction-rate-popup` | **更新日**: 2026-06-07
>
> ダメージ計算機統合（[damage_calculator_integration_plan.md](damage_calculator_integration_plan.md)）の **Phase B** に属する単独タスク。HP ダメージの正確化に必須。
> エンジン単体（calculateDestruction）は実装済み。2026-06-07 に turn engine から `destructionRateByEnemy` を攻撃ごとに更新する最小接続を追加。**HP ダメージ接合は未着手**。
> 右クリックポップアップへの破壊率手動入力（暫定）は 2026-06-07 完了。
> 残タスクの横断サマリーは [damage_calculator_remaining_wbs.md](damage_calculator_remaining_wbs.md) §大分類D を参照。

## 1. 背景・なぜ単独タスクか

- HP ダメージは破壊率係数が乗る。この係数は **100%（=1.0x 基準）から非常に大きな倍率（ユーザー実測で最大 1299% 級 = 約13x）** までダメージを変える支配的因子。
- Phase A（DP ダメージ MVP）では破壊率不要のため `destructionRate=1` 固定・HP 非表示とした。HP ダメージを正確化するには破壊率の「**記録・上昇計算・表示・ダメージ式接合**」の4要素が必要。
- 上昇計算（攻撃進行に伴う破壊率の動的変化）はゲーム機構として重く、単独タスクに値する。

## 2. 現状調査（2026-06-04・file:line 根拠）

### 2.1 既に存在するもの ✅

| 区分 | 実体 | 場所 |
|---|---|---|
| 敵データ | `ini_d_rate` / `d_rate` / `max_d_rate` / `od_rate` / `break_down_turn` | `json/enemies.json` `base_param` |
| エンジン状態 | `destructionRateByEnemy`(%) / `destructionRateCapByEnemy`(%) / `breakStateByEnemy` / `odRateByEnemy` | `src/turn/turn-controller.js` getEnemyState (L2438-2491) |
| getter/setter | `getEnemyDestructionRatePercent` / `getEnemyDestructionRateCapPercent` / `setEnemyDestructionRatePercent` / break state 管理 | turn-controller L3322-3470 |
| break 遷移 | 強制ブレイク(`applyEnemyStrongBreakState`) / 超ダウン(`applyEnemySuperDownState`/`removeEnemySuperDownState`) / HP破壊リセット(`resetEnemyHpBreakPhaseState`) / cap 計算(`computeEnemySpecialBreakCapPercent`) | turn-controller L3576-3705 |
| 定数 | `DEFAULT_DESTRUCTION_RATE_PERCENT=100` / `DEFAULT_DESTRUCTION_RATE_CAP_PERCENT=300` / `SPECIAL_BREAK_CAP_BONUS_PERCENT=300` | `src/config/battle-defaults.js` L12-14 |
| snapshot 保持 | override / clone / status tick で destruction 状態を保持 | turn-controller L2526-2585, 6173 |
| ダメージ式スロット | `calculateDamage` が `defender.destructionRate`(既定1) を全倍率に乗算 | `src/domain/damage-calculator.js` L500, 506, 517 |
| 破壊率上昇計算コア | `calculateDestruction` が 1.0 ベースで破壊率を算出し、`spMapping`、`destructionMultiplier`、手動 `isBreakHit` / 任意 `autoBreak` に対応 | `src/domain/damage-calculator.js` |
| 初期表示 | Enemy Setup の各 enemy slot snapshot に `destructionRate=1` を保持し、セットアップタブで現在破壊率を `%` 表示 | `ui-next/components/enemy-setup.js` |

### 2.2 欠落・WIP ⚠️❌

| # | 不足 | 根拠 |
|---|---|---|
| a | **攻撃ごとの破壊率上昇モデルの turn engine 接続**（DP ダメージ／OD 進行で rate が増える動的計算）は最小接続済み | 2026-06-07: `applyCommittedActionSideEffects` から break 状態反映後に `calculateDestruction` を呼び、`setEnemyDestructionRatePercent` へ反映。攻撃前 E-shield active は対象外。敵 `d_rate` 実値配線は未実装 |
| b | **破壊率の詳細表示**（威力詳細／計算機ペイン）は未実装。Enemy Setup の初期現在値表示のみ追加済み | `markDestructionRateGainBonusRate` 表示未実装（L104-105）。`damage_breakdown/unimplemented_elements_wbs.md` でも `isDestructionRateGainSkill` を将来対応扱い |
| c | **ダメージ式への接合** | `damage-calculator-input-builder.js` は `destructionRate: DEFAULT_DESTRUCTION_RATE(=1)` 固定。`damageContext` に per-enemy 破壊率フィールドなし（A-7 の `enemyParamBorderByEnemy` のような配線が未整備） |
| d | **HP ダメージ表示の解禁** | Phase A で HP 行を非表示にした。破壊率実装後に HP ダメージ（破壊率適用後）を表示する必要 |

## 3. 確定済みのゲーム仕様

> `hbr_calc` 側での Excel 計算機解析および検証により、以下の仕様が確定し、実装されました。

- **Q-D1**: **基本破壊率と上昇モデル**: 基本破壊率は `BG_30` (スキル基本破壊倍率)、ブラスター補正 (スロープ補正含む)、アクセサリー/共鳴ボーナス、バフから決定。敵残りDPおよび `autoBreak`/`isBreakHit` 判定により、ヒット単位で加算。
- **Q-D2**: **HPダメージへの適用**: 最終破壊率はHPダメージに対して全倍率乗算される。DPが存在する間のヒットでは破壊率は蓄積しない（ブレイク発生ヒットおよびそれ以降で加算）。
- **Q-D3**: **破壊率上限の決定**: 最終上限は `敵固有破壊上限 (max_d_rate / 100)` + `上限超越補正` となる。これにより300%を超える上限値が再現可能。
- **Q-D4**: **break_down_turn の影響**: 破壊率の直接的な進行計算には影響を与えない（状態異常管理やシミュレーションのフェーズ遷移にのみ影響）。
- **Q-D5**: **DPブレイク判定のモデル化**: `calculateDestruction` に `dp` と `hits` 配列を渡し、累積ダメージでブレイク判定を行う（`autoBreak` 時）か、または `isBreakHit` フラグで判定。

## 4. WBS（破壊率タスク）

> 依存: **D-1（仕様確定）が D-3/D-4 の前提**。D-4 は D-2/D-3 に依存。D-5 は D-4 に依存。

| ID | 分類 | 内容 | 依存 | 状況 |
|---|---|---|---|---|
| D-1 | Spec | 破壊率上昇式・cap・適用条件の正本確定（Q-D1〜D5）。Excel/Python/実機を突き合わせて式を文書化 | — | 部分着手（`bg30 = dr × SP / 100`、`destructionMultiplier`、手動/自動break入力契約をコード化。ブラスタースロープ等の正確性検証は継続） |
| D-2 | Engine(記録) | 既存 `destructionRateByEnemy` が実戦闘進行を反映するか検証。攻撃進行による破壊率の現在値を「記録」する経路を確認・補完 | D-1 | ✅ 完了（調査時点では turn-controller から `calculateDestruction` 呼び出しなし。break/reset/superDown 系のみが更新していたため D-3 で補完） |
| D-3 | Engine(上昇計算) | D-1 の式を engine に実装（DP ダメージ／OD／break 連動で rate を上昇、cap でクランプ）。snapshot 保持・replay 整合 | D-1, D-2 | 🔶 turnState 接続完了（既BREAK / same-action Break・SuperBreak で上昇、cap clamp、E-shield active 除外）。敵 `d_rate` 実値配線と HP damage 接合は D-4 以降 |
| D-4 | Integration(接合) | `damageContext` に per-enemy 破壊率（と cap）を配線（A-7 の `enemyParamBorderByEnemy` と同パターン）。builder が `destructionRate` を渡す。`calculateDamage` が HP ダメージに適用。HP/DP 出し分け | D-2, D-3 | 未着手 |
| D-5 | UI(表示) | 威力詳細／計算機ペインに破壊率（現在値・cap）と適用後 HP ダメージを表示。Phase A で非表示にした HP 行を解禁 | D-4 | 部分着手（Enemy Setup に初期現在破壊率 100.00% を読み取り専用表示。威力詳細/HP表示は未着手） |
| D-6 | Test | unit（上昇式・cap・接合）／ E2E（破壊率表示・HP ダメージ・敵タブ連動）／ 実データ DP 検証（敵 DP 割れ判定） | D-3, D-4, D-5 | 部分着手（`calculateDestruction` 回帰、`spMapping` loader、manual/auto break、Enemy Setup 初期表示を unit で固定） |
| D-7 | 受け入れ | HP ダメージの 3点一致（Excel／実機／本シミュレータ）＋実データ DP 検証で OK | D-6 | 未着手 |

## 5. リスク・留意点

- **最大リスクは D-1（仕様未確定）**。上昇式が不明なまま D-3 に進むと手戻り。Excel フィックス版（ユーザー持ち込み予定）と Python 正本（`calc/`）の突き合わせを先行する。
- engine の破壊率は **replay/session snapshot** に波及する（override/clone/tick で既に保持実装あり）。上昇計算を足す際は snapshot 整合・回帰を必ず確認。
- 破壊率は **HP ダメージ専用**。DP ダメージ（Phase A）には乗らない。`isHpTarget` 連動を崩さないこと。
- AttackBySp 消費SP威力スケーリング（別タスク）とは独立だが、両方揃って初めて HP ダメージが完全正確化する。

## 6. スコープ境界

- **本タスク（破壊率）**: 記録・上昇計算・表示・ダメージ式接合（D-1〜D-7）。
- **別タスク**: AttackBySp 消費SP威力スケーリング（[damage_calculator_integration_plan.md](damage_calculator_integration_plan.md) スコープ外項目）。
- **前提（完了済み）**: Phase A（DP ダメージ MVP・実敵 param_border 配線）。
