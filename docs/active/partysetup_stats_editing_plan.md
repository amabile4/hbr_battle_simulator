# PartySetup ステータス編集機能 — 検討 & WBS

> **ステータス**: 🟢 設計確定（P-0 完了・実装可能） | **ブランチ**: 未着手（実装時に feature ブランチを切る） | **作成日**: 2026-06-04 | **最終更新**: 2026-06-04
>
> ダメージ計算機統合（[damage_calculator_integration_plan.md](damage_calculator_integration_plan.md)）の後続。攻撃者ステータスの正本を PartySetup に持たせ、計算機へ供給する。

## 1. 背景・なぜ必要か

- Phase A で「ステータスは PartySetup が単一の正・計算機ペインは read-only 表示」と方針確定したが、**PartySetup にステータス欄が無い**ため、現状は `resolveDefaultStats(role, 凸)` の **role 標準値プレースホルダ**しか使えない。
- そのため**実キャラの実ステータスを入力する手段が一切無い**。受け入れ基準の「3点一致（Excel／実機／本シミュレータ）」を取るには、まず実機と同じステータスを入力できる必要がある。
- 本機能は **Excel 非依存で着手可能**、かつ**検証のクリティカルパス**（実 stats 無しでは Excel/実機の数字に合わせられない）。

## 2. 現状調査（2026-06-04・file:line 根拠）

### 2.1 凸数（lb）の既存フロー = stats が辿るべきテンプレート

| 段階 | 実体 | 場所 |
|---|---|---|
| スロット状態 | `lb: 0`（他に drivePierce/belt/morale 等） | `ui-next/components/party-setup.js` `createEmptySlotState` L43-57 |
| snapshot 化 | `limitBreakLevelsByPartyIndex: {i: s.lb}` | party-setup.js `getSnapshot` L283-291 |
| snapshot 復元 | `lb = snapshot.limitBreakLevelsByPartyIndex[index]` | `applySnapshot` L339-351 |
| UI | スロットごとの `lb` select | party-setup.js L1052/L1322 |
| CharacterStyle | `member.role`(L337) / `member.limitBreakLevel` / `member.partyIndex`(L328) | `src/domain/character-style.js` |
| 計算機供給 | char-detail-popup が `member.role`/`member.limitBreakLevel` + `resolveDefaultStats` を attackerInput に | `ui-next/utils/char-detail-popup.js` `buildDamageBreakdownTabHtml` |

### 2.2 欠落

- `createEmptySlotState` に **stats フィールドが無い**（str/dex/wis/spr/luk/con）。
- snapshot / session schema に **statsByPartyIndex が無い**。
- CharacterStyle に `member.stats` が無い。
- 計算機は `resolveDefaultStats` プレースホルダ固定（実 stats を読む経路が無い）。

## 3. 設計方針

- **データ保持（スロット単位）**: `createEmptySlotState` に `stats`（6値の override オブジェクト・メイン枠）と `supportStats`（サポート枠）を追加。`lb` と同様にスロットフィールドとして move/swap/clear。各値 null/未入力なら `resolveDefaultStats(role, lb)` へ fallback。
- **永続化**: ステータスは戦闘中不変の正本 → **session save/load に必ず含める**（Phase A の textarea のような非永続枠とは異なる）。snapshot は **`statsByPartyIndex`**（lb と同パターン）。後方互換: 欠落時は role 標準 fallback。
- **UI（別パネル）**: スロット詳細に詰めず、style-picker のような **overlay/別ウィンドウ**で 6 ステータスを編集。role 標準値をプリフィルし自由入力。スロットのキャラ変更で stats はリセット→再プリフィル。
- **計算機接合**: char-detail-popup attackerInput は スロットの `stats`（partyIndex で解決した override）が有れば優先、無ければ `resolveDefaultStats(role, lb)` fallback。Phase A の DP ダメージが実 stats で再計算される。サポート枠由来のステータス加算の寄与は実装時に整理。
- **stat delta レーンとの関係**: 本機能は **base（元値）の正本化**。バフ適用後の delta（「STR 650 (+25)」）は別タスク（実効ステータス算出経路）。本機能後は base=実値・delta=0・resolved=base になる。

## 4. 確定した設計判断（ユーザー回答 2026-06-04）

- **Q-P1 → スロット単位（再確認で確定）**: stats は **partyIndex（スロット）単位**で保持する（lb と同じ持ち方）。`stats` を `createEmptySlotState` のスロットフィールドとして追加し、`lb` と同様にスロット操作（move/swap/clear）で移動・リセットされる。
  - 背景: stats は「最終的な6数値の手入力」だけを意図し、宝珠強化・転生・称号ボーナス等のシミュレータ非対応補正は入力しない。キャラ/スタイル/ロールを跨ぐ複雑な永続管理は不要、というユーザー意図。
  - 含意: snapshot キーは **`statsByPartyIndex`（lb と同パターン）**。スロットのキャラ（styleId）を入れ替えたら stats はリセットして role 標準へ再プリフィル。
- **Q-P2 → 別パネル**: スロット詳細に詰め込まず、**別パネル/別ウィンドウ**（キャラスロット選択（style-picker）のような overlay）で stats を編集する。
- **Q-P3 → role 標準プリフィル**: パネルは `resolveDefaultStats(role, lb)` の **role 標準値をプリフィル**し、そこから編集可能にする。
  - 注: styles.json の `base_param`（str:5 等）は成長方向/初期値であり最終ステータス（実数600〜700）ではないため、プリフィル源には使わない。role 標準値を採用。
- **Q-P4 → サポート枠も対応**: サポート枠はステータスを少しプラスする効果があるため、**サポート枠の stats も対応する**（slot state の supportStyle/supportLb と同様に support stats を持つ）。サポート由来のステータス加算がダメージ計算へどう寄与するかは実装時に整理。
- **Q-P5 → 完全自由入力（v1）**: まずは **数値の完全自由入力**。装備・レベル・ロール連動は v1 では作らない（装備枠/UI を作るのは過大）。将来、選択による role/レベル/装備連動は否定しないが別スコープ。

## 5. WBS（PartySetup ステータス編集）

> 依存: P-1（データモデル）→ P-2/P-3 → P-4 → P-5 → P-6。

| ID | 分類 | 内容 | 依存 | 状況 |
|---|---|---|---|---|
| P-0 | Spec | Q-P1〜P5 のユーザー確定（✅完了・本書 §4） | — | ✅ 完了 |
| P-1 | Data | `createEmptySlotState` に `stats`/`supportStats` 追加。`getSnapshot`/`applySnapshot` に **`statsByPartyIndex`**（lb と同パターン）。move/swap/clear で lb 同様に追従。null fallback（→ role 標準） | P-0 | 未着手 |
| P-2 | UI | **別パネル/overlay**（style-picker 流用）で 6 ステータス編集。role 標準値プリフィル＋完全自由入力。スロットから起動。キャラ変更で reset→再プリフィル | P-1 | 未着手 |
| P-3 | Wiring | `CharacterStyle` に `stats`、`BattleStateManager.buildCharacterStyle` が snapshot.`statsByPartyIndex` から partyIndex で解決して供給（メイン＋サポート） | P-1 | 未着手 |
| P-4 | Integration | char-detail-popup attackerInput が スロット `stats` 優先、無ければ `resolveDefaultStats` fallback。サポート枠由来加算の寄与を整理。DP ダメージが実 stats で再計算 | P-3 | 未着手 |
| P-5 | Persistence | session save/load schema に `statsByPartyIndex`。後方互換（欠落時 role 標準）・replay/snapshot 整合・回帰 | P-1 | 未着手 |
| P-6 | Test | unit（snapshot round-trip・fallback・slot move/clear）／ E2E（stats 入力→計算反映→保存復元）／ lint | P-2〜P-5 | 未着手 |

## 6. リスク・留意点

- **session schema 拡張**は replay/保存データに波及。既存セッションとの後方互換（statsByPartyIndex 欠落時は role 標準 fallback）を担保する。
- スロットのキャラ変更時の stats リセット仕様（Q-P1）を決めないと UX が不安定になる。
- 本機能は **base の正本化のみ**。HP ダメージ正確化には別途 破壊率（[destruction_rate_implementation_plan.md](destruction_rate_implementation_plan.md)）と AttackBySp SP-scaling が必要。
- 完了後、実 stats で **3点一致検証（Excel 到着後）**が可能になる。

## 7. スコープ境界

- **本機能**: 攻撃者 base ステータスの PartySetup 正本化＋計算機供給＋永続化（P-0〜P-6）。
- **別タスク**: stat delta 実値（バフ適用後の実効ステータス表示）、破壊率、AttackBySp SP-scaling。
- **前提（完了済み）**: Phase A（DP ダメージ MVP・member role/凸 read-only・実敵 param_border）。
