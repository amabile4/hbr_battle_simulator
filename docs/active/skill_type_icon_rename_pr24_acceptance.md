# skill_type アイコン命名統一（PR #24）受け入れ記録

**ステータス**: 🟢 進行中
**最終更新**: 2026-07-03

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

問題1の初回対応として `AttackUp.webp`/`AttackDown.webp` 等（矢印込みの専用ファイル）への
マッピングに戻したが、これらは初期実装時に暫定用意された代替画像であり、ゲーム本来の仕様は
ベース画像（`BuffAttack.webp` 等）＋矢印パーツ（PR #24で追加済みの `assets/ui/ArrowBuff.webp` /
`ArrowDebuff.webp`）の動的合成である。この点を踏まえ、**レイヤー合成表示を実装**し、
最終的にベース画像＋矢印の重ね合わせで解決した（下記「レイヤー合成の実装」参照）。

合成の仕組みができたことで、既存の未接続4件（`GiveDefenseDebuffUp`/`HealDpByDamage`/
`RegenerationDp`/`ReviveDpRate`）も合成対象として解決した。`NegativeState` は付与元
スキルタイプ名（`NegativeMind`）への異名同義語マッピングで解決した。残る未解決は
`ResistUp`/`OverDriveRateUp`/`Attention`/`Zone` の4件（休眠中）のみ。

## マージ内容

- マージコミット: `a4ff6bd`（`Merge pull request #24 from amabile4/feature/align-status-icon-names`）
- 変更規模: 75ファイル追加 / 21ファイル削除 / 42ファイル中身変更（リネームなし） +
  `assets/ui/` へレイヤー合成用透過パーツ6点追加（`ArrowBuff.webp` / `ArrowDebuff.webp` /
  `MarkerAttributeDark/Fire/Ice/Light/Thunder.webp`）
- コード変更: `ui-next/utils/char-detail-popup.js` の `SKILL_TYPE_IMAGE_MAP` 新設のみ

## レイヤー合成の実装

`ui-next/utils/char-detail-popup.js` に `COMPOSITE_ICON_MAP`（statusType → ベース画像名 +
矢印方向）と `resolveSkillTypeIconCompositeHtml(statusType, altText)` を新設した。合成対象の
statusType は、ベース画像 `<img class="composite-base">` と矢印オーバーレイ
`<img class="composite-overlay arrow">`（バフ=`ArrowBuff.webp`、デバフ=`ArrowDebuff.webp`）を
重ねたHTMLを返す。`resolveSkillTypeIconUrl()` 単体は後方互換のためベース画像URL（矢印なし）を
返し続ける。

状態変化詳細タブ（`buildStatusBlockHtml`）で合成表示に切り替えた。`ui-next/styles.css` に
`.composite-base` / `.composite-overlay.arrow` / `.composite-overlay.marker` を追加し、
`.char-popup-buff-icon`（28px）に合わせて64px基準の矢印配置仕様（bottom:16px/right:16px,
20x24px）を比例縮小（scale=28/64）して適用した。ブラウザで実描画を確認済み: `AttackUp` は
上向き水色矢印、`AttackDown` は下向きピンク矢印で視覚的に判別できる。

合成対象（12 statusType）: `AttackUp` / `AttackDown` / `AttackUpIncludeNormal` /
`AttackUpPerToken` / `DefenseUp` / `DefenseDown` / `DefenseUpPerToken` /
`BorderRefPDownByAdmiral` / `GiveDefenseDebuffUp` / `HealDpByDamage` / `RegenerationDp` /
`ReviveDpRate`。属性マーク（`MarkerAttribute*.webp`）を使う属性付き合成（`DarkAttackUp` 等）は、
既存の個別完パケファイルが実在し動作しているため今回のスコープ外。

**スコープ外**: 敵状態表示（`ui-next/utils/enemy-status-display.js`）とターン行の小さい
バフアイコン列（`ui-next/utils/buff-display.js`、デフォルト13px）は今回のレイヤー合成の対象に
含めていない。前者は `resolveSkillTypeIconUrl()`（矢印なしベース画像）のまま、後者は矢印を
入れると視認性が悪化する懸念があるため保留。両者とも `AttackUp`/`AttackDown` 等で矢印による
判別ができない制約が残る。

## マージ直後に修正した既存テスト

- `tests/enemy-status-display.test.js` の `buildEnemyStatusTableHtml keeps base icon/label
  when elements is empty`: `DefenseDown` のマッピング変更に追従して期待値を複数回更新した
  （`DefenseDown.webp` → `BuffDefense.webp` → `DefenseDown.webp` → 最終的に `BuffDefense.webp`
  に確定。敵状態表示はレイヤー合成のスコープ外のため、矢印なしベース画像が正）。
- `tests/enemy-status-display.test.js` の `buildEnemyStatusTableHtml uses fallback icon and
  label for DownTurn`: `BreakDownTurnUp` の流用マッピング追加に伴い `Recoil.webp` へ更新。

## 判明した未接続ギャップと対応

### 解決したギャップ（単純マッピング修正）

以下9 statusTypeは、実際には対応するファイルが `assets/skill_type/` に存在するにもかかわらず、
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
| `NegativeState` | マッピングなし（`NegativeState.webp`は存在しない） | `NegativeMind.webp`（実在） | 付与元スキルタイプ名（`NegativeMind`）との異名同義語。`character-style.js` の `SPECIAL_STATUS_TYPE_NAMES[146]` 経由でライブデータの発火実績あり（1005505「生きててごめんなさい」） |

### 解決したギャップ（レイヤー合成）

以下12 statusTypeは、ベース画像＋矢印の動的合成（上記「レイヤー合成の実装」）で解決した。

| statusType | ベース画像 | 矢印 |
|---|---|---|
| `AttackUp` / `AttackUpIncludeNormal` / `AttackUpPerToken` | `BuffAttack.webp` | バフ（上向き） |
| `AttackDown` / `BorderRefPDownByAdmiral` | `BuffAttack.webp` | デバフ（下向き） |
| `DefenseUp` / `DefenseUpPerToken` | `BuffDefense.webp` | バフ |
| `DefenseDown` / `GiveDefenseDebuffUp` | `BuffDefense.webp` | デバフ |
| `HealDpByDamage` | `BuffAttack.webp` | バフ |
| `RegenerationDp` / `ReviveDpRate` | `RegeneDP.webp` | バフ |

初回対応で `AttackUp.webp`/`AttackDown.webp`/`DefenseUp.webp`/`DefenseDown.webp`
（矢印込みの個別完パケファイル、ハッシュ比較で別ファイルと確認済み）への直接マッピングに
戻したが、これらは初期実装時（2026-03-25、`assets/skill_type/` 初回追加コミット）の
暫定代替画像であり、ゲーム本来の構成（ベース＋矢印合成）ではなかったため、最終的に
合成表示へ置き換えた。`AttackUp.webp` 等の代替画像ファイル自体はリポジトリに残しているが、
コードから参照されなくなっている。

### 未解決のギャップ

以下4 statusTypeは専用アセットが未提供のまま残る。

| statusType | 状態 |
|---|---|
| `ResistUp` / `OverDriveRateUp` / `Attention` / `Zone` | 専用アセット未提供。現行データでは使用実績なし（休眠）だが、対応する状態付与ロジック（`turn-controller.js` 等）自体は完成しており、対応する `skill_type` を持つスキル/パッシブがデータに追加された時点で表示され404になりうる |

`Zone` は通常の属性ゾーン（`FireZone`/`IceZone` 等）では発生せず、非属性の田んぼフィールド等
（`RiceFieldZone`、現行データ使用実績なし）でダメージ内訳タブの `iconStatusType: 'Zone'`
ハードコード経由でのみ発生しうる。

`GiveDefenseDebuffUp` は `active/new_style_audit_workflow.md` /
`active/resonance_ability_connection_tasklist.md` で言及済みの「防御力ダウン**効果量**の
計算未接続」と同一statusTypeだが、アイコン**表示**側は今回のレイヤー合成で解決済み。
効果量計算の未接続は別問題として両ドキュメントで引き続き管理する。

## 対応方針（確定）

- 単純マッピングで解決した9 statusType、レイヤー合成で解決した12 statusTypeは対応済み。
- 残る4 statusType（休眠中）は専用アセット追加を見送り、`tests/skill-type-icon-asset-gaps.test.js`
  で「解決先ファイルが存在しないこと」を検出するに留める。
- レイヤー合成の対象範囲は状態変化詳細タブのみ。敵状態表示・ターン行の小アイコン列への拡張、
  属性付き合成（`DarkAttackUp` 等）への統一は今回のスコープ外（後続タスク候補）。
- 画像アセットの追加・提供待ちの連絡は本リポジトリの作業スコープ外（連絡自体は別途行う）。

## 検証テスト

- `tests/skill-type-icon-asset-gaps.test.js`: 単純マッピング解決9件・レイヤー合成解決12件に
  ついて、`resolveSkillTypeIconUrl()`（ベース画像実在確認）と `resolveSkillTypeIconCompositeHtml()`
  （合成HTMLに矢印オーバーレイが含まれること）を検証する。`AttackUp`/`AttackDown`、
  `DefenseUp`/`DefenseDown` について、合成HTMLがバフ/デバフで異なる矢印を使うことを固定する
  回帰テストも追加した（`resolveSkillTypeIconUrl()` 単体の戻り値ではなく、実際に画面へ出力
  される合成結果で判定する）。未解決4件は解決先ファイルが実在しないことを固定するギャップ
  検出テストで管理する。アセットが提供され解決先ファイルが実在するようになった場合、該当の
  ギャップ検出テストが失敗するので気づける設計（詳細はテストファイル冒頭コメント参照）。
- 既存 `tests/style-asset-url.test.js`: `SKILL_TYPE_IMAGE_MAP` を経由しない直接参照
  （`Talisman.webp` / `Disaster.webp` 等、`ui-next/components/enemy-detail-popup.js`）の
  実在確認は維持されており、影響なし。
- ブラウザ実描画確認: Playwright経由で状態変化詳細タブのアイコンをレンダリングし、
  `AttackUp`（上向き水色矢印）/`AttackDown`（下向きピンク矢印）/`DefenseUp`/`DefenseDown`が
  視覚的に判別できることを確認済み。既存E2E（`tests/e2e/turn-row-preview-status-popup.spec.js`）
  も全件PASSを確認。

## 関連ドキュメント

- [active/new_style_audit_workflow.md](new_style_audit_workflow.md): `GiveDefenseDebuffUp`
  について、本ドキュメントとは別問題（防御力ダウン**効果量**の計算未接続）を記録している。
  本ドキュメントが扱っていた同 statusType の**アイコン表示**未接続は解決済み。
- [active/resonance_ability_connection_tasklist.md](resonance_ability_connection_tasklist.md):
  同じく `GiveDefenseDebuffUp` の計算接続残タスクを管理。
- [active/effect_up_multiplier_connection_wbs.md](effect_up_multiplier_connection_wbs.md):
  効果量アップ系skill_typeの計算機未接続を扱うWBS（本ドキュメントとは無関係のアイコン以外の問題）。

## 画像提供待ち一覧（サマリ）

計4 statusType（`ResistUp` / `OverDriveRateUp` / `Attention` / `Zone`、いずれも休眠中）。
詳細は上表参照。
