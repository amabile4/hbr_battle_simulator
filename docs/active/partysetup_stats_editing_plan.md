# PartySetup ステータス編集機能 — 検討 & WBS

> **ステータス**: ✅ 完了（P-0〜P-9） | **ブランチ**: `feature/partysetup-stats-editing` | **作成日**: 2026-06-04 | **最終更新**: 2026-06-29
>
> ダメージ計算機統合（[damage_calculator_integration_plan.md](damage_calculator_integration_plan.md)）の後続。攻撃者ステータスの正本を PartySetup に持たせ、計算機へ供給する。
> 2026-06-07: `characters.json` の `base_param.<stat>[1]` と `styles.json` の `base_param.<stat>` から初期実 stats を生成し、旧 snapshot / preset の stats 欠落時にも PartySetup snapshot へ補完するよう更新。`0/null` stats は欠落扱いで既存 fallback を維持。
> 2026-06-07: ステータス手動入力パネルの表示を日本語ラベルに変更し、入力順を `力/器用さ`, `体力/精神`, `知性/運`（内部キー `str,dex,con,spr,wis,luk`）へ調整。

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

- **データ保持（スロット単位）**: `createEmptySlotState` に `stats`（6値の override オブジェクト・メイン枠）と `supportStats`（サポート枠）を追加。`lb` と同様にスロットフィールドとして move/swap/clear。各値 null/未入力ならテンプレート①（Lv200・転生5回・能力ボード最大・装備なし）を `characters.json` / `styles.json` から算出する。
- **永続化**: ステータスは戦闘中不変の正本 → **session save/load に必ず含める**（Phase A の textarea のような非永続枠とは異なる）。snapshot は **`statsByPartyIndex`**（lb と同パターン）。後方互換: 欠落時は role 標準（サポート stats があれば各値10%加算）fallback。
- **UI（別パネル）**: スロット詳細に詰めず、style-picker のような **overlay/別ウィンドウ**で 6 ステータスを編集。メイン未入力時はテンプレート① + サポート各値10%（各能力を切り上げ）、サポート未入力時はサポートスタイルのテンプレート①をプリフィルし自由入力。自動値は保存せず `null` を維持し、LB変更へ追従する。「デフォルトに戻す」は手入力を消去する。
- **計算機接合**: `HbrDataStore` が戦闘開始時に未入力値を具体化する。メインの **手入力 `stats` が有ればそのまま使用（最優先・support 10% を上乗せしない）**。未入力時のみテンプレート①へサポート10%を加算し、解決値を `turnPlanBaseSetup.statsByPartyIndex` に固定保存する。
  - **サポート 10% の位置づけ（ユーザー確定 2026-06-04）**: 手入力6値は「装備・強化等を全部足した最終ステータス」なので、手入力があるときは **手入力が勝ち、サポート 10% は上乗せしない**。サポート 10%（G-18・係数0.10）は **default/プリフィル値としてのみ採用**（処理は残すが手入力に負ける）。
- **stat delta レーンとの関係**: 本機能は **base（元値）の正本化**。バフ適用後の delta（「STR 650 (+25)」）は別タスク（実効ステータス算出経路）。本機能後は base=実値・delta=0・resolved=base になる。

## 4. 確定した設計判断（ユーザー回答 2026-06-04）

- **Q-P1 → スロット単位（再確認で確定）**: stats は **partyIndex（スロット）単位**で保持する（lb と同じ持ち方）。`stats` を `createEmptySlotState` のスロットフィールドとして追加し、`lb` と同様にスロット操作（move/swap/clear）で移動・リセットされる。
  - 背景: stats は「最終的な6数値の手入力」だけを意図し、宝珠強化・転生・称号ボーナス等のシミュレータ非対応補正は入力しない。キャラ/スタイル/ロールを跨ぐ複雑な永続管理は不要、というユーザー意図。
  - 含意: snapshot キーは **`statsByPartyIndex`（lb と同パターン）**。スロットのキャラ（styleId）を入れ替えたら stats はリセットし、パネル表示時にデフォルト値を再プリフィルする。
- **Q-P2 → 別パネル**: スロット詳細に詰め込まず、**別パネル/別ウィンドウ**（キャラスロット選択（style-picker）のような overlay）で stats を編集する。
- **Q-P3 → デフォルトプリフィル（2026-06-29更新）**: メインパネルはテンプレート① + サポート10%、サポートパネルは選択サポートのテンプレート①をプリフィルし、そこから編集可能にする。算出はキャラLv200基礎値、転生5回、選択スタイルの `base_param` / 専用能力、同キャラ全スタイルの共有能力、選択LB、他スタイル完凸時の `ParamAllOtherCard` を合成する。
- **Q-P4 → サポート枠も対応（ただしプリフィル専用）**: サポート枠の stats も保持する。サポート 10% 加算（G-18・`03_spec_gap_resolution.md`・係数0.10）は **default/プリフィル値としてのみ採用**し、**手入力6値があるときは手入力が勝つ（10% を上乗せしない）**。手入力は「装備・強化等を全部足した最終値」のため。処理自体は捨てない。
- **Q-P5 → 完全自由入力（v1）**: まずは **数値の完全自由入力**。装備・レベル・ロール連動は v1 では作らない（装備枠/UI を作るのは過大）。将来、選択による role/レベル/装備連動は否定しないが別スコープ。

## 5. WBS（PartySetup ステータス編集）

> 依存: P-1（データモデル）→ P-2/P-3 → P-4 → P-5 → P-6。

| ID | 分類 | 内容 | 依存 | 状況 |
|---|---|---|---|---|
| P-0 | Spec | Q-P1〜P5 のユーザー確定（✅完了・本書 §4） | — | ✅ 完了 |
| P-1 | Data | `createEmptySlotState` に `stats`/`supportStats` 追加。`getSnapshot`/`applySnapshot` に **`statsByPartyIndex`**（lb と同パターン）。move/swap/clear で lb 同様に追従。null fallback（→ デフォルト値） | P-0 | ✅ 完了 |
| P-2 | UI | **別パネル/overlay**で 6 ステータス編集。メインは role 標準 + support 10%、サポートは role 標準をプリフィル＋完全自由入力。スロットから起動。キャラ変更で reset→再プリフィル | P-1 | ✅ 完了 |
| P-3 | Wiring | `CharacterStyle` に `stats`/`supportStats`、`BattleStateManager` が snapshot.`statsByPartyIndex` から partyIndex で解決して供給 | P-1 | ✅ 完了 |
| P-4 | Integration | char-detail-popup attackerInput が手入力 `stats` を最優先し、無い場合のみ role 標準 + サポート stats 各値10%へ fallback。DP ダメージが実 stats で再計算 | P-3 | ✅ 完了 |
| P-5 | Persistence | session save/load schema と lightweight replay に `statsByPartyIndex`。後方互換（欠落時デフォルト値）・replay/snapshot 整合・回帰 | P-1 | ✅ 完了 |
| P-6 | Test | unit（snapshot round-trip・fallback・slot move/clear・サポート10%）／ E2E（stats 入力→計算反映→保存復元・計算機表示）／ lint | P-2〜P-5 | ✅ 完了 |
| P-7 | Fix | **サポート 10% を「手入力に負ける」挙動へ修正**（claude レビュー指摘・ユーザー確定 2026-06-04）。計算機は 手入力 stats をそのまま使用（10% 上乗せ無し）、無い時のみ role 標準 + 10%。パネル main プリフィルも default+10% に揃える。テスト/doc 更新 | P-4 | ✅ 完了 |
| P-8 | Follow-up | **テンプレート①の実データ自動算出**。role固定値を廃止し、Lv200・転生5回・全能力ボード最大・未選択同キャラスタイル完凸・装備なしで算出。選択中メイン/サポートのLBを共有計算にも反映し、10%加算は能力ごとに切り上げる。未入力はnull維持、戦闘開始時に具体化、replayへ解決値を保存 | P-7 | ✅ 完了 |
| P-9 | Validation | **実機キャラクター部分の全件検算**。2026-06-29実機入力58キャラとSS/SSR所持LB、A/S完凸（`こじらじNOW ON AIR！`のみLB6）をfixture化。Lv補間（四捨五入）・転生・称号累積・所持スタイル共有能力で6能力348値が全件一致。スタイル固有補正は次工程 | P-8 | ✅ 完了 |

## 6. 完了時検証

- unit: PartySetup / session / BattleStateManager / replay / CharacterStyle clone / stats helper / damage calculator input を含む `npm test` 1358件通過
- 実機fixture: `tests/fixtures/template1_actual_character_stats_20260629.json` の58キャラ×6能力が全件一致。全360スタイルについてSS/SSR入力値とA/S既定値の適用範囲も検証
- 実機入力のLvはDP/HPと称号DP累積から一意に確定し、Lv180=40人、Lv170=11人、Lv160=5人、Lv150=2人。テンプレート①のLv200固定とは別の実機取得条件としてfixtureに保持
- E2E: テンプレート①のLB追従、手入力保持、reset、戦闘開始後replay保存を確認。全体は95件通過、既知の時刻依存 `superbreak-hefty-guardian.spec.js` 4件のみ敵プリセット `13490231` 未検出で失敗
- lint / `git diff --check`: 通過

## 7. リスク・留意点

- **session schema 拡張**は replay/保存データに波及。既存セッションとの後方互換（statsByPartyIndex 欠落時はデフォルト値 fallback）を担保する。
- スロットのキャラ変更時の stats リセット仕様（Q-P1）を決めないと UX が不安定になる。
- 本機能は **base の正本化のみ**。HP ダメージ正確化には別途 破壊率（[destruction_rate_implementation_plan.md](destruction_rate_implementation_plan.md)）と AttackBySp SP-scaling が必要。
- 完了後、実 stats で **3点一致検証（Excel 到着後）**が可能になる。

## 8. スコープ境界

- **本機能**: 攻撃者 base ステータスの PartySetup 正本化＋テンプレート①自動算出＋計算機供給＋永続化（P-0〜P-8）。
- **別タスク**: stat delta 実値（バフ適用後の実効ステータス表示）、破壊率、AttackBySp SP-scaling。
- **前提（完了済み）**: Phase A（DP ダメージ MVP・member role/凸 read-only・実敵 param_border）。
