# PartySetup ステータス編集機能 — 検討 & WBS

> **ステータス**: 🟡 検討中（WBSドラフト） | **ブランチ**: 未着手（実装時に feature ブランチを切る） | **作成日**: 2026-06-04
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

- **データ保持**: スロット状態に `stats`（override オブジェクト）を追加。各値 null/未入力なら `resolveDefaultStats(role, lb)` へ fallback。スロットの正本は **partyIndex 単位**（lb と同じ）。
- **永続化**: ステータスは戦闘中不変の正本 → **session save/load に必ず含める**（Phase A の textarea のような非永続枠とは異なる）。snapshot は `statsByPartyIndex`（lb と同パターン）。
- **計算機接合**: char-detail-popup の attackerInput は `member.stats` が有れば優先、無ければ `resolveDefaultStats(role, lb)` に fallback。Phase A の DP ダメージがそのまま実 stats で再計算される。
- **stat delta レーンとの関係**: 本機能は **base（元値）の正本化**。バフ適用後の delta（「STR 650 (+25)」）は別タスク（実効ステータス算出経路）。本機能後は base=実値・delta=0・resolved=base になる。

## 4. 未確定の設計判断（要・ユーザー確認）

- **Q-P1**: stats の保持単位。partyIndex 単位（スロット）か、キャラ/スタイル単位か。スロットのキャラを変更したとき stats をどうするか（クリアして role 標準へ戻す／保持）。
- **Q-P2**: UI 配置。PartySetup のスロット詳細（overlay/展開）内に 6 ステータス入力を置くか、別パネルか。
- **Q-P3**: 初期表示。空欄（プレースホルダに role 標準値）か、role 標準値をプリフィルして編集可にするか。
- **Q-P4**: サポート枠（supportStyle）にも stats を持たせるか（ダメージ計算は攻撃者=メイン枠中心のため、v1 はメイン枠のみで十分か）。
- **Q-P5**: 入力レンジ・バリデーション（上限/下限、整数）。

## 5. WBS（PartySetup ステータス編集）

> 依存: P-1（データモデル）→ P-2/P-3 → P-4 → P-5 → P-6。

| ID | 分類 | 内容 | 依存 | 状況 |
|---|---|---|---|---|
| P-0 | Spec | Q-P1〜P5 のユーザー確定 | — | 未着手 |
| P-1 | Data | `createEmptySlotState` に `stats` 追加。`getSnapshot`/`applySnapshot` に `statsByPartyIndex`（lb と同パターン）。null fallback ルール | P-0 | 未着手 |
| P-2 | UI | PartySetup スロットに 6 ステータス入力欄＋バリデーション＋（role 標準プリフィル or プレースホルダ）。change で snapshot 更新 | P-1 | 未着手 |
| P-3 | Wiring | `CharacterStyle` に `stats`、`BattleStateManager.buildCharacterStyle` が snapshot.statsByPartyIndex から供給 | P-1 | 未着手 |
| P-4 | Integration | char-detail-popup attackerInput が `member.stats` 優先、無ければ `resolveDefaultStats` fallback。DP ダメージが実 stats で再計算 | P-3 | 未着手 |
| P-5 | Persistence | session save/load schema に `statsByPartyIndex`。replay/snapshot 整合・回帰 | P-1 | 未着手 |
| P-6 | Test | unit（snapshot round-trip・fallback）／ E2E（stats 入力→計算反映→保存復元）／ lint | P-2〜P-5 | 未着手 |

## 6. リスク・留意点

- **session schema 拡張**は replay/保存データに波及。既存セッションとの後方互換（statsByPartyIndex 欠落時は role 標準 fallback）を担保する。
- スロットのキャラ変更時の stats リセット仕様（Q-P1）を決めないと UX が不安定になる。
- 本機能は **base の正本化のみ**。HP ダメージ正確化には別途 破壊率（[destruction_rate_implementation_plan.md](destruction_rate_implementation_plan.md)）と AttackBySp SP-scaling が必要。
- 完了後、実 stats で **3点一致検証（Excel 到着後）**が可能になる。

## 7. スコープ境界

- **本機能**: 攻撃者 base ステータスの PartySetup 正本化＋計算機供給＋永続化（P-0〜P-6）。
- **別タスク**: stat delta 実値（バフ適用後の実効ステータス表示）、破壊率、AttackBySp SP-scaling。
- **前提（完了済み）**: Phase A（DP ダメージ MVP・member role/凸 read-only・実敵 param_border）。
