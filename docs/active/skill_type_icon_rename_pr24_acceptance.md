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

マージ直後の監査で12件の未接続ギャップを検出し、実ファイル確認により8件は
`SKILL_TYPE_IMAGE_MAP` 側のマッピング誤り・漏れと判明して修正した。その後、実データ上に
存在しうる全 statusType（214件）を対象にした網羅監査を行い、追加で2種類の問題を発見した。

1. **バフ/デバフの区別が視覚的に消えていた問題**: `AttackUp`/`AttackDown`、
   `DefenseUp`/`DefenseDown` が、矢印込みの専用ファイルが個別に存在するにもかかわらず、
   矢印なしの共通ベース素材（`BuffAttack.webp`/`BuffDefense.webp`）へ丸めてマッピングされ、
   バフとデバフが同一アイコンになっていた（404にはならないためテストで検出されずにいた）。
2. **休眠中の未接続**: `NegativeState`（付与元スキルタイプ名との異名同義語、ライブデータで
   発火実績あり）、`ResistUp`/`OverDriveRateUp`/`Attention`/`Zone`（生成経路は完成しているが
   現行データでは使用実績がなく、将来のデータ追加で顕在化しうる）。

`NegativeState` は付与元スキルタイプ名（`NegativeMind`）への異名同義語マッピングで解決した。
残り4件は専用アセット未提供のまま `tests/skill-type-icon-asset-gaps.test.js` で可視化している。

## マージ内容

- マージコミット: `a4ff6bd`（`Merge pull request #24 from amabile4/feature/align-status-icon-names`）
- 変更規模: 75ファイル追加 / 21ファイル削除 / 42ファイル中身変更（リネームなし） +
  `assets/ui/` へレイヤー合成用透過パーツ6点追加（`ArrowBuff.webp` / `ArrowDebuff.webp` /
  `MarkerAttributeDark/Fire/Ice/Light/Thunder.webp`）
- コード変更: `ui-next/utils/char-detail-popup.js` の `SKILL_TYPE_IMAGE_MAP` 新設のみ

## マージ直後に修正した既存テスト

- `tests/enemy-status-display.test.js` の `buildEnemyStatusTableHtml keeps base icon/label
  when elements is empty`: `DefenseDown` のマッピング変更に追従して期待値を2回更新した
  （`DefenseDown.webp` → 一時的に `BuffDefense.webp` → 最終的に `DefenseDown.webp` へ回帰。
  詳細は下記「解決したギャップ」参照）。
- `tests/enemy-status-display.test.js` の `buildEnemyStatusTableHtml uses fallback icon and
  label for DownTurn`: `BreakDownTurnUp` の流用マッピング追加に伴い `Recoil.webp` へ更新。

## 判明した未接続ギャップと対応

### 解決したギャップ（`SKILL_TYPE_IMAGE_MAP` を修正）

以下13 statusTypeは、実際には対応するファイルが `assets/skill_type/` に存在するにもかかわらず、
`SKILL_TYPE_IMAGE_MAP` の誤り・漏れにより解決できていなかった。

| statusType | 修正前の解決先 | 修正後の解決先 | 内容 |
|---|---|---|---|
| `HealSp` | `BuffSP.webp`（存在しない） | `HealSp.webp`（実在） | 誤ったマッピングを削除。元のファイル名で解決 |
| `SpecifySp` | `BuffSP.webp`（存在しない） | `SpecifySp.webp`（実在） | 同上 |
| `HealEp` | `BuffEP.webp`（存在しない） | `HealSp.webp`（実在） | 専用アセットがないため近縁の `HealSp.webp` へマッピングし直し |
| `OverDrivePointUp` | `BuffOverdrive.webp`（存在しない） | `OverDrivePointUp.webp`（実在） | 誤ったマッピングを削除 |
| `OverDrivePointDown` | `BuffOverdrive.webp`（存在しない） | `OverDrivePointDown.webp`（実在） | 誤ったマッピングを削除 |
| `ResistDown` | `BuffResist.webp`（存在しない） | `ResistDown.webp`（実在） | 誤ったマッピングを削除 |
| `BreakDownTurnUp` | マッピングなし（`BreakDownTurnUp.webp`は削除済み） | `Recoil.webp`（実在） | 専用アセットがないため流用マッピングを追加。敵の「ダウンターン」表示（頻出）で使用される |
| `Provoke` | マッピングなし（`Provoke.webp`は削除済み） | `Target.webp`（実在） | 専用アセットがないため流用マッピングを追加 |
| `AttackUp` | `BuffAttack.webp`（矢印なしベース素材） | `AttackUp.webp`（矢印込み専用ファイル、実在） | **バフ/デバフ区別問題**。`BuffAttack.webp` へ丸めると `AttackDown` と同一画像になっていた |
| `AttackDown` | `BuffAttack.webp`（矢印なしベース素材） | `AttackDown.webp`（矢印込み専用ファイル、実在） | 同上。ハッシュ比較で `AttackUp.webp` と別ファイルであることを確認済み |
| `DefenseUp` | `BuffDefense.webp`（矢印なしベース素材） | `DefenseUp.webp`（矢印込み専用ファイル、実在） | 同上（防御力版） |
| `DefenseDown` | `BuffDefense.webp`（矢印なしベース素材） | `DefenseDown.webp`（矢印込み専用ファイル、実在） | 同上 |
| `AttackUpIncludeNormal` / `AttackUpPerToken` | `BuffAttack.webp` | `AttackUp.webp` | 矢印込みファイルへ寄せ直し |
| `DefenseUpPerToken` | `BuffDefense.webp` | `DefenseUp.webp` | 同上 |
| `NegativeState` | マッピングなし（`NegativeState.webp`は存在しない） | `NegativeMind.webp`（実在） | 付与元スキルタイプ名（`NegativeMind`）との異名同義語。`character-style.js` の `SPECIAL_STATUS_TYPE_NAMES[146]` 経由でライブデータの発火実績あり（1005505「生きててごめんなさい」） |

`BorderRefPDownByAdmiral` は専用アセットが存在しないため `AttackDown.webp`（実在）への
流用マッピングとして維持している。

### 未解決のギャップ

以下8 statusTypeは専用アセットが未提供のまま残る。

| statusType | 状態 |
|---|---|
| `GiveDefenseDebuffUp` / `HealDpByDamage` / `RegenerationDp` / `ReviveDpRate` | ベース画像＋矢印/属性マークのレイヤー合成（PR #24で追加された `assets/ui/ArrowBuff.webp` 等のパーツを使う想定）が必要だが、合成表示の仕組み自体が未実装 |
| `ResistUp` / `OverDriveRateUp` / `Attention` / `Zone` | 専用アセット未提供。現行データでは使用実績なし（休眠）だが、対応する状態付与ロジック（`turn-controller.js` 等）自体は完成しており、対応する `skill_type` を持つスキル/パッシブがデータに追加された時点で表示され404になりうる |

`GiveDefenseDebuffUp` は `active/new_style_audit_workflow.md` /
`active/resonance_ability_connection_tasklist.md` で言及済みの「防御力ダウン**効果量**の
計算未接続」と同一statusTypeだが、本件はアイコン**表示**側の未接続であり別問題。両方が
解消されて初めて `GiveDefenseDebuffUp` は完全対応となる。

`Zone` は通常の属性ゾーン（`FireZone`/`IceZone` 等）では発生せず、非属性の田んぼフィールド等
（`RiceFieldZone`、現行データ使用実績なし）でダメージ内訳タブの `iconStatusType: 'Zone'`
ハードコード経由でのみ発生しうる。

## 対応方針（確定）

- 解決した13 statusTypeは `SKILL_TYPE_IMAGE_MAP`（`ui-next/utils/char-detail-popup.js`）を
  修正済み。新規画像の追加は不要だった。
- 未解決の8 statusTypeについて、レイヤー合成の仕組み自体の新規実装、および休眠中4件への
  専用アセット追加は今回は見送る。`tests/skill-type-icon-asset-gaps.test.js` で
  「解決先ファイルが存在しないこと」を検出するに留める。
- 画像アセットの追加・提供待ちの連絡は本リポジトリの作業スコープ外（連絡自体は別途行う）。

## 検証テスト

- `tests/skill-type-icon-asset-gaps.test.js`: 解決済み13 statusTypeについて
  `resolveSkillTypeIconUrl()` の解決先が実在することを固定する回帰テスト、未解決8
  statusTypeについて解決先が実在しないことを固定するギャップ検出テストを、それぞれ管理する。
  さらに `AttackUp`/`AttackDown`、`DefenseUp`/`DefenseDown` が同一ファイルに解決されないことを
  固定する回帰テストも追加した（同種の事故の再発防止）。アセットが提供され解決先ファイルが
  実在するようになった場合、該当のギャップ検出テストが失敗するので気づける設計
  （詳細はテストファイル冒頭コメント参照）。
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

計8 statusType。
- レイヤー合成待ち4件: `GiveDefenseDebuffUp` / `HealDpByDamage` / `RegenerationDp` / `ReviveDpRate`
- 専用アセット未提供・現行データでは休眠中4件: `ResistUp` / `OverDriveRateUp` / `Attention` / `Zone`

詳細は上表参照。
