# Implementation Priority Task List

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-13

## 目的

- `docs/active/` の再開起点を 1 本に絞る
- 完了済みプランは archive へ退避し、次の実装順だけをここで管理する
- 今後はこの文書を開けば、次に読むべきドキュメントと着手順が分かる状態を維持する

## 再開時の読書順

1. [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md)（残件: Zone/Territory関連）
2. [`token_implementation_plan.md`](token_implementation_plan.md)（完了確認）
3. [`passive_timing_reference.md`](passive_timing_reference.md)
4. [`ui_parallel_interface_spec.md`](ui_parallel_interface_spec.md)
5. 必要に応じて [`../archive/20260313_priority_history.md`](../archive/20260313_priority_history.md)（旧履歴: PRI-001〜006）

## 優先順位

| 優先 | ID | 状態 | テーマ | 主な出典 | 完了条件 |
|------|----|------|--------|----------|----------|
| P0 | `PRI-007` | `todo` | Zone / Territory 効果見える化 | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | Zone/Territory の種類・効果がUIやレコードに表示される |
| P1 | `PRI-008` | `todo` | ZoneUpEternal 効果量上昇反映 | [`passive_implementation_tasklist.md`](passive_implementation_tasklist.md) | ZoneUpEternalパッシブが効果量上昇として機能する |
| P2 | `PRI-009` | `todo` | ドキュメント整合性修正 | [`shredding_implementation_tasklist.md`](shredding_implementation_tasklist.md), [`token_implementation_plan.md`](token_implementation_plan.md), [`../README.md`](../README.md) | shredding ✅・token ✅ として README/docs を整合させる |

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

## メモ

- archive に移した完了 docs は履歴参照用であり、今後の更新対象ではない
- 実装が 1 つ完了したら、この文書の優先順位と `docs/README.md` を同じコミットで更新する
