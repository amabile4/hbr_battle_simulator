# skill_type アイコン命名統一（PR #24）受け入れ記録

**ステータス**: 🟢 進行中
**最終更新**: 2026-07-02

## 概要

PR #24（`refactor: 状態変化アイコン（SpecialStatus）の命名規則の見直し・重複ファイルの
整理、および合成用パーツの追加`）を `gh pr merge 24 --merge` で受け入れた記録。
`assets/skill_type/` のファイル名を統一命名規則へ整理し、`ui-next/utils/char-detail-popup.js`
の `resolveSkillTypeIconUrl` に `SKILL_TYPE_IMAGE_MAP` マッピング辞書を新設した。コード自体は
このマッピング1箇所のみの変更で、バトルロジック・データ定義上の `statusType`（ロジック上の
定義値）は不変。

マージによって新たに判明した「アイコン未接続（画像未提供）」ギャップを本ドキュメントで記録し、
`tests/skill-type-icon-asset-gaps.test.js` で可視化する。

## マージ内容

- マージコミット: `a4ff6bd`（`Merge pull request #24 from amabile4/feature/align-status-icon-names`）
- 変更規模: 75ファイル追加 / 21ファイル削除 / 42ファイル中身変更（リネームなし） +
  `assets/ui/` へレイヤー合成用透過パーツ6点追加（`ArrowBuff.webp` / `ArrowDebuff.webp` /
  `MarkerAttributeDark/Fire/Ice/Light/Thunder.webp`）
- コード変更: `ui-next/utils/char-detail-popup.js` の `SKILL_TYPE_IMAGE_MAP` 新設のみ

## マージ直後に修正した既存テスト

`tests/enemy-status-display.test.js` の `buildEnemyStatusTableHtml keeps base icon/label
when elements is empty` が、`DefenseDown` → `BuffDefense.webp` へのマッピング追加に伴い
旧ファイル名 `DefenseDown.webp` の文字列アサーションで失敗した（マージ前のPR CIで
`Unit Tests (22)` 1594件中1件failとして事前確認済み）。新ファイル名 `BuffDefense.webp` へ
更新して解消（コミット: `e548ae6`）。実装（`char-detail-popup.js`）は変更していない。

## 判明した未接続ギャップ

### 分類A: マッピング先ファイルが未提供（画像自体が存在しない）

| statusType | 解決先ファイル名 | 状態 |
|---|---|---|
| `HealSp` | `BuffSP.webp` | 画像未提供 |
| `SpecifySp` | `BuffSP.webp` | 画像未提供 |
| `HealEp` | `BuffEP.webp` | 画像未提供 |
| `OverDrivePointUp` | `BuffOverdrive.webp` | 画像未提供 |
| `OverDrivePointDown` | `BuffOverdrive.webp` | 画像未提供 |
| `ResistDown` | `BuffResist.webp` | 画像未提供 |

### 分類B: 旧ファイルが削除されたが代替マッピングがない

| statusType | 旧ファイル（削除済み） | 影響 |
|---|---|---|
| `BreakDownTurnUp` | `BreakDownTurnUp.webp` | 敵の「ダウンターン」表示で発生。頻出。`ui-next/utils/enemy-status-display.js` の `ENEMY_STATUS_ICON_FALLBACK.DownTurn` から参照される。既存テスト（`buildEnemyStatusTableHtml uses fallback icon and label for DownTurn`）は生成HTML内の文字列一致のみを見ておりファイル実在は検証しないため、この404は検出されない |
| `GiveDefenseDebuffUp` | `GiveDefenseDebuffUp.webp` | `active/new_style_audit_workflow.md` / `active/resonance_ability_connection_tasklist.md` で言及済みの「防御力ダウン**効果量**の計算未接続」と同一statusTypeだが、本件はアイコン**表示**側の未接続であり別問題。両方が解消されて初めて `GiveDefenseDebuffUp` は完全対応となる |
| `HealDpByDamage` | `HealDpByDamage.webp` | - |
| `Provoke` | `Provoke.webp` | - |
| `RegenerationDp` | `RegenerationDp.webp` | 類似名の新規ファイル `RegeneDP.webp`（PR #24で追加）があるが、意味統合はしない方針（下記「対応方針」参照）。誤って「対応済み」と誤認しないよう明記する |
| `ReviveDpRate` | `ReviveDpRate.webp` | - |

## 対応方針（確定）

- 分類Aの6 statusTypeについて、画像は追加しない。`tests/skill-type-icon-asset-gaps.test.js`
  で「解決先ファイルが存在しないこと」を検出するに留める。`SKILL_TYPE_IMAGE_MAP` 自体は変更しない。
- 分類Bの6 statusTypeについて、意味が近そうな既存ファイルへの統合的マッピング追加
  （例: `GiveDefenseDebuffUp` → `GiveDebuffUp.webp`、`RegenerationDp` → `RegeneDP.webp`）は
  **行わない**。全て「未接続」として `tests/skill-type-icon-asset-gaps.test.js` で検出し、
  指摘に留める。
- `BreakDownTurnUp` など統合先が明確でないものについて、暫定的な別画像流用はせず、
  404のままテストで検出する。
- 画像アセットの追加・提供待ちの連絡は本リポジトリの作業スコープ外（連絡自体は別途行う）。

## 検証テスト

- `tests/skill-type-icon-asset-gaps.test.js`: 分類A/B 全12 statusTypeについて、
  `resolveSkillTypeIconUrl()` の解決先が実在しないことを固定するテスト。画像が将来
  提供された場合、該当テストが失敗するので気づける設計（詳細はテストファイル冒頭コメント参照）。
- 既存 `tests/style-asset-url.test.js`: `SKILL_TYPE_IMAGE_MAP` を経由しない直接参照
  （`Talisman.webp` / `Disaster.webp` 等、`ui-next/components/enemy-detail-popup.js`）の
  実在確認は維持されており、影響なし。

## 関連ドキュメント

- [active/new_style_audit_workflow.md](new_style_audit_workflow.md): `GiveDefenseDebuffUp`
  について、本ドキュメントとは別問題（防御力ダウン**効果量**の計算未接続）を記録している。
  本ドキュメントは同じ statusType の**アイコン表示**未接続を扱っている。
- [active/resonance_ability_connection_tasklist.md](resonance_ability_connection_tasklist.md):
  同じく `GiveDefenseDebuffUp` の計算接続残タスクを管理。
- [active/effect_up_multiplier_connection_wbs.md](effect_up_multiplier_connection_wbs.md):
  効果量アップ系skill_typeの計算機未接続を扱うWBS（本ドキュメントとは無関係のアイコン以外の問題）。

## 画像提供待ち一覧（サマリ）

計12 statusType（分類A: 6、分類B: 6）。詳細は上表参照。
