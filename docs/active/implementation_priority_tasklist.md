# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-13

## 目的

- `docs/active/` の再開起点を 1 本に絞る
- 完了済みプランは archive へ退避し、次の実装順だけをここで管理する
- 今後はこの文書を開けば、次に読むべきドキュメントと着手順が分かる状態を維持する

## 再開時の読書順

1. [`token_implementation_plan.md`](token_implementation_plan.md)（docs整合確認）
2. [`shredding_implementation_tasklist.md`](shredding_implementation_tasklist.md)（README整合確認）
3. [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md)（Zone/Territory残件の再確認）
4. [`passive_timing_reference.md`](passive_timing_reference.md)
5. [`ui_parallel_interface_spec.md`](ui_parallel_interface_spec.md)
6. 必要に応じて [`../archive/20260313_priority_history.md`](../archive/20260313_priority_history.md)（旧履歴: PRI-001〜006）

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 完了条件 |
|------|----|------|--------|----------|----------|
| P0 | `PRI-009` | `todo` | ドキュメント整合性修正 | [`shredding_implementation_tasklist.md`](shredding_implementation_tasklist.md), [`token_implementation_plan.md`](token_implementation_plan.md), [`../README.md`](../README.md) | shredding ✅・token ✅ として README/docs を整合させる |
| P1 | `PRI-008` | `done` | ZoneUpEternal 二効果分離実装 | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md), [`../../help/HEAVEN_BURNS_RED/バトル/フィールド効果.md`](../../help/HEAVEN_BURNS_RED/バトル/フィールド効果.md) | ZoneUpEternal が「フィールド性能+15%」と「有限ターン Zone の永続化」を混同せず適用する |
| P2 | `PRI-007` | `done` | Zone / Territory 効果見える化 | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | Zone/Territory の種類・効果がUIやレコードに表示される |

## PRI-008 実装記録

### 背景

- `ZoneUpEternal` は 1 つのパッシブで次の **2 効果** を持つ
  - 展開する `Zone` の**効果量を `part.power[0]` 分だけ上乗せ**する
  - **ターン指定あり**の `Zone` を **永続** (`remainingTurns = null`) に変える
- 着手前の実装は `hasActiveZoneUpEternalModifier()` の boolean 判定を起点に、`+0.15` 固定加算と永続化を同時適用していた
- このため、`power[0]` と永続化条件が分離されておらず、仕様変更や別値データに追従しづらい

### 実装結果

1. `ZoneUpEternal` 判定を boolean ではなく **構造化 modifier** として解決する形に置き換えた
   - `resolveZoneUpEternalModifier()` が `{ active, powerBonusRate, makesFiniteZoneEternal, sourceParts }` を返す
2. **効果量上昇**は `part.power[0]` を使用するように変更した
   - `+0.15` の直書きを撤去し、複数 source があれば加算可能な形にした
3. **永続化**は「展開された Zone が有限ターンかどうか」で判定するように変更した
   - `remainingTurns !== null` のときのみ `null` に変換する
   - 既に永続の Zone には **効果量上昇だけ**を適用する
4. `part.effect.exitCond` は **ZoneUpEternal modifier 自体の有効期間**として扱う前提を docs / help に反映した
   - `武運長久` は `OnPlayerTurnStart` かつ `effect.exitCond: PlayerTurnEnd / 1T`
   - `天長地久` は `OnFirstBattleStart` かつ `effect.exitCond: Eternal`
5. テストは「有限 Zone で両効果」「既に永続 Zone で性能上昇のみ」「modifier 非成立時の無効」を分離して確認した

## PRI-008 実装チェックリスト

- [x] `ZoneUpEternal` を二効果として扱う前提を tasklist / help に反映する
- [x] `ZoneUpEternal` 解決器を boolean から構造化 modifier へ置き換える
- [x] 効果量上昇を `part.power[0]` ベースへ変更し、`+0.15` 直書きを撤去する
- [x] 永続化を「有限ターン Zone のみ」に限定する
- [x] 既に永続の Zone で「効果量上昇のみ」が効くテストを追加する
- [x] 有限ターン Zone で「効果量上昇 + 永続化」の両方が効くテストを追加する
- [x] modifier 非成立時に neither 効果が入らないテストを維持/追加する
- [x] 実装完了後に `PRI-008` / `passive_implementation_tasklist.md` / `docs/README.md` を同コミットで更新する

## 今回までで確定したこと

PRI-001〜006（P0〜P5）はすべて完了。詳細は [`../archive/20260313_priority_history.md`](../archive/20260313_priority_history.md) を参照。

主な完了内容（2026-03-09〜03-13）:

- **Phase 6-A/6-B 完了**: Morale / DamageRateUp / DefenseDown / DefenseUp / CriticalRateUp / CriticalDamageUp / GiveDefenseDebuffUp / DamageUpByOverDrive / GiveAttackBuffUp / GiveHealUp 実装
- **Support Skills Phase 2 完了（2026-03-11）**: 全446テストPASS
- **SpLimitOverwrite / ReduceSp 全timing対応完了（2026-03-12）**: 全482テストPASS
- **OnOverdriveStart 非EPパッシブ補強完了（2026-03-12）**: 全486テストPASS
- **AttackUpPerToken / DefenseUpPerToken 実装完了（2026-03-12）**: 全492テストPASS（高揚・激励・鉄壁）
- **SpecialStatusCountByType バフ状態完全実装（2026-03-13）**: T01-T16完了・519テストPASS
- **SP厳密モードトグル実装（2026-03-13）**: dom-adapterのみ変更・519テストPASS
- **SP関連特殊状態パッシブ テスト補強（2026-03-13）**: T12b（エンゲージリンク AllyAll+target_condition）・T13b（世界を滅ぼすお手伝い target_condition）・勇姿（ReduceSp SP消費-1）追加・522テストPASS
- **Zone / Territory 効果見える化完了（2026-03-13）**: turn status / record table に種類・source・継続・効果表示を追加
- **ZoneUpEternal 二効果分離実装完了（2026-03-13）**: `part.power[0]` ベースの性能加算と有限 Zone 限定の永続化へ整理・`tests/turn-state-transitions.test.js` 247テストPASS

## メモ

- archive に移した完了 docs は履歴参照用であり、今後の更新対象ではない
- 実装が 1 つ完了したら、この文書の優先順位と `docs/README.md` を同じコミットで更新する
