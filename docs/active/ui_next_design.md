# UI Next 設計メモ

> **ステータス**: 🟢 進行中 | 📅 開始: 2026-03-15 | 🔄 最終更新: 2026-06-30

## 目的

- 既存ページを流用せず、新しい UI を独立した導線として構築する
- 既存 battle engine は再利用しつつ、UI 層は新規に設計する
- `styles.json` に記述された style 画像を使い、視覚的に party / position / turn を編集しやすくする

## 前提

- 旧 `ui/` surface は廃止済みとし、UI 実装の正本は `ui-next/` のみとする
- top-level `ui/` ディレクトリは hard cutover 時点で作業ツリーから削除済みであり、archive への追加移動対象は残っていない
- 新 UI は別ルートで構築し、既存 UI と直接結合しない
- 共通で使う asset / resolver / contract は `main` に戻せる形で設計する
- `src/ui/` に残る `adapter-core.js` / `lightweight-replay-script.js` / `style-asset-url.js` は `ui-next/` が利用する shared module であり、legacy archive 扱いにはしない
- style 画像の正本は [assets/styles](../../assets/styles) に置く
- style 画像の参照は [src/ui/style-asset-url.js](../../src/ui/style-asset-url.js) を通す
- 過去に作成した GUI モックとレイアウト資料は [ui_next_gui_design_spec.md](ui_next_gui_design_spec.md) と [ui_next_mockup_light.png](ui_next_mockup_light.png) を参照資料として引き継ぐ

## 現時点の画面責務

初回実装では、setup 系 UI を次の 2 層で整理する。

1. `Initial Setup`
2. `Style Picker`

`Initial Setup` は battle start 時点の条件をまとめて編集する上位 block であり、`Style Picker` は `Initial Setup` 配下の party slot に対して 1 style を選ぶための全画面 picker とする。

## Screen 1: Initial Setup

### 上位概念

`Initial Setup` は、シミュレーター開始前に battle start 条件をまとめて入力するための block 群である。

含める block は次を想定する。

1. `Party Setup`
2. `Enemy Setup`
3. `Stage Setup`
4. `Simulator Settings`

このうち、初回実装で最優先なのは `Party Setup` である。`Enemy Setup` と `Stage Setup` は battle start 条件、`Simulator Settings` は UI / セッション動作設定として別責務で置く。

### Initial Setup の役割

- battle start 時点の条件を 1 箇所で編集できること
- シミュレーター開始前の大きな setup UI として使えること
- シミュレーター開始後は邪魔にならない形で退避できること
- 必要時に再表示し、初期条件を変えて turn 1 から再計算できること
- desktop では Setup を隠した瞬間に TurnPlanner が全幅を使えること
- Setup header は最小限の tab shell に留め、説明面や常時 visible block を増やしすぎないこと
- Top toolbar 背景は `assets/ui/workspace-toolbar-bg.png` の淡色生成画像を、白水色 overlay と半透明 button surface 越しに薄く見せる。公式キャラクターや公式ロゴの直接利用・模写は避け、抽象的な空 / 光跡 / 汎用シルエットの背景模様として扱う

## Block 1: Party Setup (`Character Selection`)

### 役割

- 6 slot の party 全体を狭い横幅で一覧できること
- `front 3 + back 3` の並びを常時見えること
- slot 単位で `main style` と `support style` を選び直せること
- slot の順番を D&D で入れ替えられること
- style 選択以外の基本設定を同じ slot panel 内で編集できること

### レイアウト

- 画面中央に、縦長の slot panel を 6 本横並びで配置する
- 並び順は `front 3 + back 3`
- 各 panel は「main icon」「縦積み listbox 群」「support icon」の順に構成する
- 6 本は詰めて並べ、party 全体を 1 画面で俯瞰できることを優先する

### Slot Panel 構成

各 slot panel は次の構造を持つ。

1. `main style icon`
2. 設定 listbox 群
3. `support style icon`

設定 listbox 群は、初回マイルストーンでは次を対象にする。

- `LB`
- `ドライブピアス`
- `SP装備`
- `属性ベルト`
- `やる気`
- `スキル設定` button

補足:

- listbox は icon と同じ幅に揃える
- `SP装備` の初期既定値は `SP +3` とする
- `属性ベルト` は実アクセサリ個体選択ではなく、属性ブレスレット種別の代表設定として扱う
- `属性ベルト` の選択値は `setup.normalAttackElementsByPartyIndex` に保存し、通常攻撃の属性参照と Eシールド判定へ同じ runtime state を渡す
- 未選択時は略称を placeholder として表示する
- `main style icon` / `support style icon` は未選択でもクリック可能な明確な empty state を持つ
- Party preset UI は `Party Setup` 本体ではなく header 配下の 2 段目 toolbar strip に置く
- Party preset は `①` 〜 `⑳` の 20 枠固定とし、横スクロールで全枠へ到達できるようにする
- Party preset は既存スロットへ保存するときだけ上書き確認を出し、消去時も確認を出す
- Party preset 名は任意入力とし、空欄保存時は name を保持しない
- Party preset storage は現行 schema 固定とし、`equippedSkillIds` を持たない旧形式は後方互換で救わず、読込時に `null` へ潰して 20 枠配列へ書き戻す
- `スキル設定` パネルは `listEquipableSkillsByStyleId(styleId)` を正本にし、通常攻撃 / 指揮行動は checked + disabled、追撃は出さない
- 各行の checked は `装備＝表示` を意味し、選択結果は `skillSetsByPartyIndex` として session save/load、party preset、battle 初期化へ通す
- passive / master / orb はタグ付きで見分けられるようにする
- シミュレーター開始後の skill 追加は 1 ターン目から自動再計算し、committed record がある間の skill 解除は UI 上で禁止する

### 操作モデル

- `main style icon` をクリックすると `Style Picker` を開く
- 1 style を選ぶと元の `Party Setup` に戻り、対象 slot の `main` が更新される
- `support style icon` も同じ導線で開く
- `support` 側は共鳴アビリティなど support 専用情報を追加表示できる構造にする
- `Style Picker` の `続けて選ぶ` は既定 `ON` とし、空き slot を順番に埋める導線を優先する
- `Style Picker` header と `Party Setup` 本体の両方に `PT解散` を置き、全 slot の選択状態を初期化できるようにする
- `Party Setup` header row は左に `並替 OFF/ON` toggle、中央に reorder help text、右に破壊系 action (`PT解散`, `全体初期化`) を置く
- Party preset button の通常 click/tap は読込、desktop 右クリックと touch 長押しは `保存 / 名前編集 / 消去` menu を開く
- mobile の preset 長押しは native text selection / callout を抑止し、custom menu 操作を優先する
- desktop hover preview と action menu preview は PartyPickup 左上と同じ 12 マス簡易 PT 表現を使う
- preset strip は utility row とは別の 2 段目とし、右側に余剰がある間だけ `…` overflow indicator を出す
- preset action menu / preview は viewport 基準の fixed popover とし、turn row 編集 UI より前面に出す
- 狭幅 mobile の slot target trigger / label は absolute overlay にせず、slot info column の通常フローへ置いて character icon に重ねない
- `Party Setup` の main style icon は通常モードでは picker を開き、`並替 ON` 時だけ D&D / tap-swap の操作面に切り替える
- `並替 ON` 時の help text は `ドラッグ / 2回タップで入替` とし、狭幅では header row の 2 行目へ折り返す
- touch 環境では `並替 ON` 中の main icon 2 回タップで「入れ替え元選択 → destination 確定」にできるようにし、iPhone Safari でも並び替え導線を失わない
- D&D は style だけでなく、その slot に紐づく listbox の設定値もまとめて移動する
- TurnPlanner の input row では slot 全体ではなく style icon を desktop drag handle とし、skill `select` と native D&D の競合を避ける
- browser 実挙動の確認は stale な旧 E2E を流用せず、`tests/e2e/party-setup-drag-and-drop.spec.js` と `tests/e2e/turn-row-drag-and-drop.spec.js` を正本の Playwright coverage とする

### シミュレーター開始後の扱い

- `Party Setup` は主にシミュレーター開始前の編成・初期設定に使う
- シミュレーター開始後は、`Initial Setup` 全体を非表示または最小化できることを優先する
- 最小化後も「再表示して初期設定を見直す」導線は残す
- 盤面操作中は `Party Setup` が常時大きく見えている必要はない

### 再表示と再計算

- シミュレーター開始後に `Initial Setup` を再表示し、初期設定を編集できる
- 例: `ドライブピアス 15%` を外した場合の差分確認
- `Initial Setup` の編集は「現在のシミュレーター盤面をその場で部分更新する」のではなく、「初期設定を更新して最初から再計算する」入口として扱う
- 編集中は現在のシミュレート結果を即破棄しない
- `Apply` 相当の明示操作を行った時点で、更新した初期設定を battle の初期条件へ反映し、既存の turn script / replay script を使って turn 1 から再計算する
- つまり `Initial Setup` は「初期設定 editor」であり、開始後は「折りたたみ可能な再計算入口」としても使う

## Block 2: Enemy Setup

### 役割

- enemy side の battle start 条件を入力する
- `Turn Control` に散在していた setup 系入力を、初期条件としてまとめ直す
- 開始後に必要な時だけ再表示して変更し、turn 1 から再計算する

### 将来含める対象

- 敵数
- 敵名
- 敵の属性耐性 / 耐久力
- 初期 HP / DP
- Turn0（先制攻撃）由来の初期条件

補足:

- `Enemy Setup` は `Initial Setup` 配下の別 block とし、`Party Setup` と混在させない
- 初回 UI Next マイルストーンでは full 実装を急がない
- ただし `Initial Setup` の上位構造は、あとから `Enemy Setup` を自然に差し込めるものにする

### 2026-03-20 時点で固定した最小仕様

- `Enemy Setup` は enemy side の初期条件専用 block とする
- `enemyCount` は `Enemy Setup` の固定値ではなく、各 turn 行に置く入力として扱う
- turn 行の `enemyCount` 初期値は直前の committed turn を継承し、replay / recalculate でも維持する
- target 選択の簡略化設定は `Enemy Setup` に置かず、`Simulator Settings` へ分離する
- battle start 時点で敵が `Down` / `Break` / `SuperBreak` / `SuperBreakDown` / `Dead` になっているケースは扱わない
- 戦闘中に敵数が増えるケースは `Enemy Setup` ではなく、敵行動 `Summon` による turn 中イベントとして扱う

### 2026-03-30 追記: Turn0（先制攻撃）開幕フィールド

- `Enemy Setup` タブに `Turn0(先制攻撃)` セクションを追加し、`開幕フィールド` を単一選択で設定できる
- 選択肢は `なし / 火 / 氷 / 雷 / 光 / 闇` の固定値とする
- 実行タイミングは `▽敵の先制行動` として扱い、`バトル開始時` パッシブ評価より前に `zoneState` へ反映する
- 反映値は `sourceSide='enemy'` とし、`none` 以外の選択時のみ初期 `zoneState` を構成する

### 2026-04-19 追記: Enemy preset selector のカテゴリ化

- `Enemy Setup` の enemy preset は単一 select ではなく `カテゴリ -> 敵` の2段 select とする
- `ui-next/utils/enemy-list.js` は flat list を維持しつつ `categoryKey/categoryLabel` を付与し、Enemy Setup 側はこの metadata を使ってカテゴリ select を描画する
- カテゴリの並びは `テンプレート`、通常 enemy 用カテゴリ定義（`異時層`、`異時層EX`、`恒星掃戦線`、`オーブボス`）、`直近3ヶ月` の月別カテゴリの順とする
- `テンプレート` category には `希望を喰むもの` に加え、Eシールド確認用の `Dimension_09_X_KaleidoOuroboros` を常時表示し、デフォルトのカテゴリのまま選択できるようにする
- `異時層` は `Hard_...` label の enemy をまとめる通常 enemy 用カテゴリとし、`スカルフェザー 最終形態` もテンプレートではなくこのカテゴリから選択する
- `異時層EX` は `Ex_...` label の enemy をまとめる通常 enemy 用カテゴリとし、`デススラッグEX 第一形態` / `デススラッグEX 第二形態`、`ロータリーモールEX`、`レッドクリムゾンEX` へ到達できるよう同名重複を保持する
- `異時層EX` のカテゴリ内並びは初出の年月日昇順とし、同日内は enemy id 昇順で安定化する
- `恒星掃戦線` は通常 enemy 用カテゴリ定義の 1 つとして扱い、`Dimension_09_X_KaleidoOuroboros` などへ専用 hardcode なしで到達できるようにする
- `オーブボス` は `battles.json` の Lv.4 実戦闘 enemy から `エグゾウォッチャーΩ : Lv.4` / `レクタス・ニールΩ : Lv.4` / `シニスター・ニールΩ : Lv.4` / `アモンΩ : Lv.4` の 4 件を合成し、Enemy Setup の通常カテゴリとして選択できるようにする
- 同名 enemy が難易度違いで複数あるカテゴリは、もっとも高いランクの 1 件だけを selector に残す
- `Enemy Setup` の `✎ 編集` では preset の Eシールドを `count/max/elements/def_up_rate/dmg_limit` 付きで手動編集できるようにし、未設定状態は `max=0` または属性未選択で表現する
- manual Eシールド編集結果は `enemy.enemySlots[*].manual.e_shield` と legacy flat `enemy.e_shield` の両方へ乗せ、session save/load でも保持する

### 2026-06-07 追記: 戦闘中 Enemy Setup 変更の反映

- 戦闘開始後に Enemy Setup の preset / 手動値を変更した場合は、保存用 snapshot だけでなく現在の BattleState も自動再計算する
- 再計算 snapshot には `enemy.enemySlots[*].selectedEnemyName` / `param_border` / 耐性を含め、威力詳細の target label と敵パラメータへ反映する

## Block 3: Stage Setup

### 役割

- stage 固有の battle start 条件を入力する
- party や enemy 個別状態ではない global な開始条件を集約する

### 将来含める対象

- 開始時 OD がマイナス値から始まる条件
- 属性 field / zone / territory が張られた状態での開始
- stage 固有の特殊ルール
- battle start 時点で有効な global modifier

補足:

- `Stage Setup` も `Initial Setup` 配下の別 block とする
- `Party Setup` / `Enemy Setup` と別 block にすることで、どの初期条件を触っているかを明確に保つ

## Block 4: Simulator Settings

### 役割

- battle start 条件ではなく、UI / セッション動作の切り替えをまとめる
- `Enemy Setup` や `Stage Setup` に入れると責務が混ざる設定を分離する
- `設定を反映` 後の turn 1 からの再描画・再計算に反映する

### 2026-03-20 時点で固定した最小仕様

- target 選択簡略化は `Enemy Setup` / `Stage Setup` ではなく `Simulator Settings` に置く
- 敵と味方の簡略化設定は分離し、別々のトグルで制御する
- 既定値は両方 `simple` とする
  - `targetSelection.enemyMode: 'simple' | 'manual'`
  - `targetSelection.allyMode: 'simple' | 'manual'`
- この設定は replay や stage 状態ではなく、session-level の UI 設定として扱う
- save/load の正本は `SessionSnapshotV1` とし、`setup / simulatorSettings / validationPolicy / replayScript` を保存する
- 保存JSONには人間向け補助情報（`styleNames` / `skillNames` / `turn.info.spAt*` など）を同居させてよい。読み込み側はこれらを必須にせず、既知フィールド以外は無視する
- `ReduceSp` は消費SP計算専用として扱い、`applyInitialPassiveState` を含む passive timing 適用で `current SP` を直接増減させない
- `validationPolicy` は当面 permissive input を維持する箱としてのみ使い、既定値はすべて `true` とする
- `captureUntilBattleEnd` は session-level option とし、既定値は `ON`、有効時は PNG 保存を最初の `battle end` 行までで打ち切る
- PNG 保存対象は committed turn rows のみとし、未コミット入力行 / edit 行は含めない
- PNG 保存時は右側の操作列を描画対象から外し、note / chip 列を詰めた capture 専用レイアウトを使う
- turn row の自己状態バフアイコンは固定3種ではなく、状態変化ページの statusType 定義順に準拠したバフ系表示へ拡張する（デバフ系は除外）
- 同一 statusType 内で `Only` / `Count` が競合する場合、`Only=最強1件` と `Count=上位2件合算` を比較して採用側のみアイコン表示する（同値は `Count` 側優先、非採用側は詳細テキスト側で確認）
- turn row バフアイコンは視認性確保のため全体表示上限を設ける（現在値: 10）
- 敵詳細ポップアップ / turn row の敵状態アイコンは debuff 優先順で表示し、`Hacking` は `Fragile` 直後の高優先 debuff として `assets/skill_type/Hacking.webp` を表示する
- turn row の OD ゲージ badge は正値帯を `0 / 1 / 2 / 3`、負値帯を debt bucket として `-99..0 => 0`、`-199..-100 => 1`、`-299..-200 => 2`、`<= -300 => 3` で表示し、負値時の赤系 track / badge tone は維持する
- キャラクター詳細ポップアップの `フィールド` タブは `Zone / Territory / Talisman` の属性・倍率・継続を併記し、`remainingTurns=null` は `永続` として表示する
- turn row の note 列上部には active なフィールド状態チップを表示し、`talismanState` は `active=true` または `level>0`（もしくは明示名/説明あり）の場合のみ表示する
- current session の JSON 保存 / 読込は `Simulator Settings` 内ではなく上部 utility bar に置く
- session JSON の replay UI / E2E は `battle end` 行の存在を前提にしない。fixture では `battle end` あり/なしの両方を固定し、ある場合は chip / truncate 経路、ない場合は最終 committed row まで崩れず描画されることを確認する
- 上部 utility bar は desktop では icon + label、smartphone では icon-only に切り替える
- `レイアウト` toggle は desktop 専用とし、smartphone では表示しない
- utility bar の free icon は Heroicons（MIT）を採用する
- PNG export は offscreen clone を正規ルートとし、live DOM を一時改変する in-place capture は採用しない
- capture 専用の layout context は clone root に集約する
  - `container-type` / `container-name`
  - `data-turn-slot-layout`
  - note 幅 / hidden button 幅などの capture 用 custom property
- 今後 TurnRow の横幅配分や layout mode を増やす場合は、まず clone root に転写すべき metadata を追加し、live DOM 側へ一時的な hidden/class 変更を入れない
- clone 側へ root metadata を少数足す程度では直らない browser-specific 崩れが繰り返す場合に限り、capture 方式自体を再検討する

## Block 5: Passive Log

### 役割

- current session で実際に発火した passive event を、人間が追える監査ログとして表示する
- battle engine の timing 判定は変更せず、表示層で `initialState.turnState.passiveEventsLastApplied` と `committedRecord.passiveEvents` を再構成する
- `Initial Setup` 配下には置かず、TurnPlanner 側の独立 pane として扱う

### 表示ルール

- row 種別は `marker` と `passive` の 2 種だけにする
- `戦闘開始`、`Tn開始`、`Tn実行`、`EX開始`、`OD開始` など、直後に passive row がある境界だけ marker 行を出す
- timing は `--- OnBattleStart ---` のような 1 行 marker で区切り、個々の passive row には旧ログ準拠の 1 行フォーマットを使う
- 1 passive 効果 1 行を維持するため、accordion は使わず `nowrap + 横スクロール` の単一コンテナに出す
- 既定配置は TurnPlanner 下段の collapsible pane とし、hidden 時は TurnPlanner が高さを全使用する
- desktop では pane 上端の splitter から縦サイズを可変にし、同一 session 内では close/open をまたいで最後の高さを保持する
- mobile 幅では resize handle を出さず、既定の固定高さ pane として扱う
- 将来の別ウィンドウ化を見据え、log row builder と pane 描画は分離する

### Turn 行の selectable skill list

- `ui-next` の skill list 正本は `runtime/data-store` とし、UI 側で `SkillSwitch` 専用 widget は持たない
- top-level `SkillSwitch` 親 skill は selectable list に出さず、nested variant に `id` があるものを独立 option として展開する

### Warning / Error の人間向け表示

- `replayDiagnostics` 由来の Warning / Error は、表示時に `styleId` / `skillId` / `characterId` へ可能な範囲で日本語名を併記する
- 併記は UI 表示層の helper 関数で行い、engine の warning 文字列生成や replay contract 自体は変更しない
- 名前情報を解決できない ID はそのまま表示し、表示不能を理由に Warning 自体を欠落させない
  - distinct-name variant は個別 option 化する
  - same-name variant は `variants[0]` の 1 件だけを出し、旧 parent id は first variant alias として読む
- `skills.json` に無い `通常攻撃` / `指揮行動` / `追撃` は、`styles.json` の埋め込み skill を fallback として復元する
- `追撃` は internal triggered skill としてだけ復元し、command-selectable listbox には出さない
- `湯めぐり` のような自動追撃は turn row の committed action から action ごとの `自動追撃` chip として表示する。発火条件はパッシブ定義の `condition` を評価し、`ConsumeSp()<=8` のような SP 閾値を UI 側定数に固定しない。`ネコジェット・シャテキ` は追撃者の現在 SP が `ReduceSp` 反映後の実効コスト以上のときだけ chip / action entry 上も変換後スキル名にし、SP 不足時は通常追撃名を表示する
- 非 `Admiral` の selectable skill list は `通常攻撃` を先頭、`Admiral` は `指揮行動` を先頭に固定する

### Turn 行の manual target UI

- 敵 manual picker は `enemyMode === 'manual'` かつ敵単体指定が必要な skill のときだけ出す
- 味方 manual picker は `allyMode === 'manual'` かつ `AllySingle` / `AllySingleWithoutSelf` のときだけ出す
- 敵単体指定は skill select とは別領域に置き、style icon 行の右側 info-space に配置した trigger から開くフローティング popover で選ぶ
- 敵候補は `E1 / E2 / E3` 形式の chip とし、敵名がある場合は同じ chip 内に併記する
- 味方単体指定は 6 人分の style icon を並べたフローティング popover で選ぶ
- target trigger は skill select と同じ flex row に置かず、設定パネルの表示有無や横幅変動でも select 幅と style icon の縦位置が発振しない構造を優先する
- `AllySingleWithoutSelf` の self と `IsFront()==1` の後衛候補は非表示にせず disabled 表示にする
- 全体攻撃では manual target UI を出さない
- `enemyMode === 'simple'` でも、敵複数の単体攻撃に限っては `ブレイク` editor 内から row 単位の局所 target override を入れられるようにする
- simple 中に局所 target override が入っている input row は、通常の target trigger ではなく info-space に read-only summary label を出して current target を見せる
- committed 行の explicit target summary は現在設定が `simple` でも表示を保持する
- target の保存形式は replay target に統一し、engine 実行直前に `targetEnemyIndex` / `targetCharacterId` へ変換する
- mobile の manual target popover は turn row 内 absolute のまま閉じ込めず、viewport 基準へ再配置して `P1-P6` / `E1-E3` 候補が row 外でも欠けずに見えるようにする

### Turn 行の special operation UI

- 右端のメモ欄は `operation chips + free text note` の 2 層にする
- 自動生成される操作履歴は `note` 文字列へ追記せず、`LightweightReplayTurn.operations` を正本として chip 表示する
- chip は pending 行と committed 行の両方で `×` 削除でき、committed 行の削除時はその turn から再計算する
- 現在の chip 対象は `フォームチェンジ` / `鬼神化` / `騎兵起動` / `先制OD` / `割込OD`
- operation chip は OS のフォント差分があっても 1 行維持を優先し、`騎兵起動` / `先制OD1` のような中長ラベルでも折り返さない
- before-commit 系 operation の適用順は `special operation -> 先制OD -> 通常 action preview/commit` とする
- `フォームチェンジ` は draft 行の style icon 上に `CHANGE` button を重ねて操作し、button 押下だけでなくフォーム専用スキル選択時も対応フォームへ自動同期する
- `フォームチェンジ` はコミット前なら同一ターン内で何度でも切り替えられ、基準 state と同じフォームへ戻した場合は pending chip を自動で外す
- committed turn で確定したフォームは次の input row の icon / role / passive 判定へ引き継ぐ
- char detail popup は form-change style の現在フォームを header chip (`フォーム: カレン` など) で表示し、`アビリティ` タブでは system `[Overdrive]` を除く全 passive を並べ、非アクティブ側フォームの entries は dimmed 表示にする
- char detail popup の `パッシブ` タブは committed 行では発動履歴を維持し、draft/input/edit 行の form-change style では現在フォームで有効な passive 一覧を表示する
- `騎兵起動` は `SS<レゾナンス>[誇り高き魔王の凱旋] 山脇・ボン・イヴァール` が所属しているときだけ未コミット行に表示する
- `騎兵起動` は同一 turn 内に複数回積めるが、残回数 3 を超えて追加できない
- `騎兵起動` の残回数は battle state に持たず、committed replay turns と current pending operations の prefix から導出する
- `騎兵起動` Phase 1 は OD 上昇だけを正確に反映し、ダメージと `FearOfDevil` は後続フェーズで扱う

### Turn 行の manual summon UI

- 戦闘中 summon は `Enemy Setup` ではなく turn row の `敵情報確認` trigger から投入する
- row 上の `enemy tools box` は `敵情報確認` trigger だけを持ち、`召喚 / ブレイク / 討伐` の入口は `enemy-detail-popup-container` 内へ移す
- `敵情報確認` trigger の `敵情報確認 / 敵情報 / 敵` 切替は pseudo-element `content` に依存せず、実 DOM text を container 幅で切り替える。PNG export と一部 browser/font 環境での二重描画を避けるため
- turn row 左パネルでは `敵情報確認` trigger の直下、OD ゲージの直上に Eシールド strip を置き、`MAX_ENEMY_COUNT=3` 前提で 2列・最大2段の compact layout に固定する
- row/popup の Eシールドは同一 renderer を使い、row では `盾 + 色分割 + 現在値`、popup では同じ badge に `current/max + 属性名` を添える
- Eシールド badge は binary icon を増やさず、CSS の shield shape + 1色/2色/3色 gradient fill で表現する。`current=0` の depleted state は灰色 badge を残して BREAK 表示と併存させる
- enemy detail popup は `E1 / E2 / E3` の 3 tab を常設し、wide では tab 直下を 3 等分カラム、narrow では選択中 enemy の 1 カラム表示へ切り替える
- popup header 直下に `3表示 / 1表示` toggle を置き、manual layout は popup を閉じるまで保持する
- 初期 layout は occupied enemy slot 数で決め、`occupied <= 1` は `1表示`、`occupied >= 2` は `3表示` を既定にする
- `3表示` は raw viewport breakpoint ではなく popup content 幅の最小列幅ルールで許可し、耐性3行化や action row 縦積みが出る前に `1表示` を強制する
- wide 時は 3 カラムすべてに `名称` fold / `プレビュー（コミット見込み）` / `状態異常 / バフ` を表示し、`召喚 / ブレイク / 討伐` action row は選択中 tab のカラム先頭にだけ出す
- action row は上から `召喚 / ブレイク / 討伐`、その下に `名称` fold、`プレビュー（コミット見込み）`、`状態異常 / バフ` の順で表示する
- popup 左上の `敵詳細` タイトルは置かず、`E1 / E2 / E3` tab と close `×` を同じ高さの header row に並べる
- `名称` header は click で開閉でき、右端の `▼ / ▲` で展開状態を示す
- `Summon.webp` は popup action row の `召喚` ボタンに使い、button 押下で listbox popover を開いて敵 preset を 1 体選んで `SummonEnemy` before-commit operation として積む
- summon popover を開いても `enemy-detail-popup-container` は閉じず、そのまま背面に維持する
- summon popover は popup 本体より前面に重ね、位置決めは popup 内の `召喚` action を優先 anchor にする
- summon popover は viewport 補正で `position: fixed` に再配置された後も popup 本体より高い z-index を維持し、submit button が背面 popup に遮られないようにする
- summon popover の配色は popup 本体に寄せ、`bg-slate-800` / `border-slate-600` / `text-slate-100` 系で統一する
- `Break.webp` と `defeat.webp` を popup action row の `ブレイク` / `討伐` icon に使う
- `Break.webp` はラベルなしの画像ボタンとして扱い、縦寸は下部の状態異常 icon と同じ 28px、横はアスペクト比維持とする。`Summon.webp` / `defeat.webp` も icon 高さを同じ 28px に揃える
- popup の `ブレイク` / `討伐` は `ActionOutcomeOverrides` ベースの actor attribution を正本とし、単体攻撃で一意なら即時 attribution、曖昧または全体攻撃なら popup 内 sub-panel editor を開く
- `Summon` は空き slot または dead slot 再利用可能時だけ enabled とし、不可能時は icon ごとグレーアウトする
- preset 選択時に `名前 / OD率 / 最大破壊率 / 属性耐性 / 吸収属性` を payload 化し、commit 時に summon slot へ初期 metadata として反映する
- summon 候補は `buildEnemyList(...)` を正本にしつつ、手動 summon 検証用の sample enemy 3 体を常時 pin する
- sample enemy は次の 3 体で固定する
  - `13450251` `Dimension_03_C_DeathSlugWhite` `終焉を告げる邂逅`
  - `13450256` `Dimension_03_C1_DeathSlugWhiteBit` `エネルギーピットε`
  - `13450259` `Dimension_03_C1_EnergyPit_Pink_e` `エネルギーピットδ`
- summon 後の enemy detail popup は occupied slot を維持したまま、`Dead` badge、属性耐性、吸収属性を表示できることを前提にする

### Turn 行の manual break attribution UI

- `DownTurn` は direct 入力させず、「この行動で break した敵」を action ごとに複数選択できる UI とする
- 常設 picker は置かず、actor 別の manual break attribution は別 editor に残すが、enemy detail popup からは起動しない
- committed 行では `ブレイク` editor を常設表示せず、保存済み chip のみを見せる
- `討伐` は `ブレイク` editor 内のサブ操作にせず、enemy detail popup 内の独立 `討伐` action から actor attribution を付与する
- 敵単体攻撃では `break` を attack target と独立に選ばせない
  - `enemyMode === 'manual'` の単体攻撃では、通常の target trigger で選ばれている current target に対して `ブレイクする / しない` だけを切り替える
  - `enemyMode === 'simple'` かつ敵複数の単体攻撃では、`ブレイク` editor 内に `自動(E1)` + `E1/E2/E3` target chips を出し、target override と `ブレイクする / しない` をまとめて編集する
  - これにより `攻撃は E2 / break は E3` のような不整合状態は作れない
- 敵全体攻撃では、現在どおり前衛 actor ごとに敵 chip (`E1 / E2 / E3`) を複数選択できる
  - 例: `E1, E3 は break / E2 は not break`
- 同一ターンの manual `Break` は同一敵へ複数 actor が重複成立しないようにする
  - 勝者は action 実行順（`非ダメージ先 / ダメージ後`、同 phase 内は front position 昇順）で決める
  - 先行 actor が取った敵は後続 actor の break editor / popup editor では disabled 表示にし、saved replay や stale draft から重複が来ても engine 側で first-wins に正規化する
- 後続 actor の本物の `SuperBreak` / `SuperBreakDown` は manual `Break` 重複禁止の対象に含めない
  - 先行 actor の manual `Break` 後に後続 skill が `SuperBreak` を行う upgrade は許可する
  - `SuperBreakDown` は既に `DownTurn` 済みなら `SuperBreakDown` へ進み、same-action manual `Break` target でも runtime 側で `Break + DownTurn` を先行反映して `SuperBreakDown` まで上げる
- Playwright E2E では `[演習機]ヘフティーガーディアン` に対する `月歌: クロス斬り（manual Break）` → `ユキ: 光輝の夜明け` の next-turn / same-turn 両ケースを固定し、committed row popup と次 input row popup の `強ブレイク` 表示、`LightSuperBreak` アイコン、`最大D率 600` を確認する
- `SuperBreak` / `SuperBreakDown` は engine の専用処理で破壊率上限と breakState を更新するが、外部へ見せる status 名は canonical な `SuperBreak` / `SuperBreakDown` に統一する
- `SuperBreak` は skill part の `hits` を見る
  - `Before`: 行動開始時に既に `Break` の敵だけを強ブレイク化する
  - `After`: この行動の攻撃で同一行動内に `Break` した敵も強ブレイク化できる
  - `光輝の夜明け` は個別例外ではなく、この `Before/After` 規則で扱う
- `SuperBreakDown` は実データ上 `hits: Before` のままでも、same-action manual `Break` target を runtime で吸収して実機どおり `SuperBreakDown` を成立させる
- enemy detail popup の `Break` 表示は役割を分離する
  - 基本情報の状態バッジ: `Alive / BREAK / Dead`
  - `状態異常 / バフ` 一覧: `DownTurn` / `SuperBreak` / `SuperBreakDown` などを表示し、bare `Break` は出さない
  - action row の `Break.webp`: manual break 編集用の `ブレイク付与` ボタンとして扱う
  - draft / replay override で break / kill が pending の enemy slot は action row 文言を `ブレイク予定` / `討伐予定` に切り替え、現在ターンの未確定操作であることを示す
- enemy detail popup から break / kill editor を開いたときは popup を閉じず、選択中 enemy slot を requested context として sub-panel 内に editor を共存表示する
- popup から開いた sub-panel editor では requested enemy を初期選択状態として見せ、single-target の local target override と all-target の複数選択を従来どおり使える
- 行上の常設表示は要約 1 件ではなく、`actor→enemy ブレイク` の chip 群とする
  - 例: `ワッキー→E1 ブレイク`
  - 敵名がある場合は `ワッキー→ワイバーン ブレイク` のように enemy label を使う
- actor 表示名は `名 / 愛称 / フルネーム` の候補から最短のものを使う
  - `characters.json.name` の 3 セグメント目にある日本語愛称を候補に含める
  - `姓 名` の場合は名を候補に含める
  - 同一長の場合は `名 → 愛称 → フルネーム` の順で採る
- 保存値は `ReplayTurn.actionOutcomeOverrides` とし、payload は `{ position, outcome: 'Break', enemyIndexes }[]` に固定する
- 単体攻撃では payload を boolean 相当として扱い、非空なら current target 1 件へ正規化する
- committed 行では `ブレイク` editor を再表示せず、保存済み chip のみを見せる
- `DownTurn` は保存しない
  - replay 時に manual break を action context へ注入する
  - shared runtime が `Break + DownTurn + breakHitCount` を派生させる
  - break 起点 passive や `BreakDownTurnUp` はその派生結果を見る

## 2026-03-20 時点の責務境界

### Shared runtime (`src/`)

- `src/turn/turn-operations.js` を special operation の shared runtime 正本とする
- 鬼神化 / 騎兵起動 / 先制OD の before-commit 適用順、state capability 判定、`enemyCount` を受けた state 変換はここで扱う
- `LightweightReplayScript` の contract は machine-readable な `type / timing / allowMultiple` のみを持ち、表示文言を持たない
- manual break の最終反映は `turn-controller` 側で行い、`ActionOutcomeOverrides` から注入された `manualBreakEnemyIndexes` と `breakHitCount` を見て `Break + DownTurn` を派生させる

### UI Next engine (`ui-next/engine`)

- `TurnEngineManager` は replay script、pending queue、commit / preview / recalculate orchestration を担当する
- special operation のゲームルール自体は shared runtime を呼ぶだけにし、manager 側へ閉じ込めない
- 未コミット input row 用には `buildInputRowSnapshot()` を正本 API とし、`stateBefore` / OD preview / operation status をまとめて返す
- session save/load の入口では `SessionSnapshotV1` を受け取り、`validationPolicy` を保持したまま replay script の再生と committed row 復元を担当する

### UI components (`ui-next/components`)

- `TurnAreaController` は row lifecycle、commit bridge、error relay だけを担当し、preview の呼び順知識を持たない
- `TurnRowController` は未コミット row の draft state を保持する
  - `slotActions`
  - `enemyCount`
  - `actionOutcomeOverrides`
  - `targets`
  - `note`
  - `openTargetPickerPartyIndex`
- draft は DOM 再読で復元せず controller 内 state を正本とし、render 時だけ DOM へ投影する

### Presentation helper (`ui-next/utils`)

- operation chip の label / tone は `ui-next/utils/replay-operation-presentation.js` に置く
- `LightweightReplayScript` や shared runtime は日本語ラベルを知らない
- passive debug log の row 再構築は `ui-next/utils/passive-debug-log.js` に置き、UI 表示から分離する

### 転生・称号設定

- 未指定時のデフォルト値は転生5回・称号ランク12とする
- 入力およびCSVインポートで許容する上限値は、デフォルト値と分離して転生20回・称号ランク15とする

## Screen 2: Style Picker

### 役割

- 1 slot に設定する style を全画面から選ぶ
- team 別に style を一覧し、絵柄と filter で誤選択を減らす
- main / support の両方で再利用できる picker shell を提供する

### レイアウト

- 画面上部に filter bar を固定配置する
- 画面本体は team ごとの style icon grid にする
- grid は横方向に並べ、右端まで到達したら折り返す
- 横スクロールは使わない
- team label か team icon で group を識別できるようにする
- `スタイル所持状況` の team header は、部隊名を左、部隊長名を右の順で表示する

### 並び順

- team ごとにまとめて表示する
- team 内の順序は `characters.json` の出現順を character の正本とする
- 各 character 内の style 順序は `characters.json.cards[]` の出現順を正本とする
- `styles.json` は style 詳細参照用に使うが、初回表示順の正本にはしない

### Filter

初回 picker で使う filter は次の通り。

- rarity: `A / S / SS / SSR`
- weapon attribute: `斬 / 突 / 打`
- elemental attribute: `火 / 氷 / 雷 / 光 / 闇 / 無`
- role: `Attacker / Blaster / Breaker / Buffer / Debuffer / Defender / Healer / Admiral / Rider`

補足:

- filter 対象外の style は非表示にし、表示領域は左へ詰める
- `無` は literal 値ではなく「属性配列が空」で表す
- support picker はこの filter bar をベースに、必要な共鳴アビリティ情報を併記できる構造にする

### 操作モデル

- picker には `main` / `support` mode を持たせる
- `main` mode は 1 click で style を選択し、元の画面へ戻る
- `support` mode は inspect-first とする
- `support` mode では hover で共鳴アビリティの preview を一時表示する
- `support` mode では 1 click 目で共鳴アビリティ詳細を固定表示する
- `support` mode では同じ card への 2 click 目で選択を確定し、元の画面へ戻る
- 別 card を click した場合は選択確定ではなく、固定表示先の切り替えとして扱う
- 戻った際、対象 slot だけが更新される
- filter 状態と scroll 位置は picker を閉じても保持する

### Support Picker 詳細表示

support picker で固定表示する内容は、初回マイルストーンでは次を対象にする。

- 共鳴アビリティ名
- 共鳴アビリティの効果説明
- `LB MAX` 前提の性能値

補足:

- hover preview は desktop での比較を速くするための補助機能とする
- tablet など hover がない環境では、1 click 目の固定表示だけで選択判断できることを優先する

## 初回マイルストーンで固定すること

- `Initial Setup` を battle start 条件の上位 container とする
- 初回実装の中心は `Initial Setup > Party Setup` とする
- `Initial Setup` は開始後に非表示または最小化できる
- `Simulator Settings` は battle 条件ではなく UI / セッション動作設定 block とする
- `Style Picker` は「1 slot を差し替える全画面 picker」とする
- 6 slot 表示は `front 3 + back 3`
- slot panel は `main -> listbox 群 -> support` の縦構成とする
- D&D は slot 単位で行う
- main / support picker は同じ画面骨格を共有する
- `main picker` は single-click select とする
- `support picker` は hover preview + click-to-pin + same-card second click select とする
- `Initial Setup` 変更の適用は、現在結果を即破棄せず、明示 `Apply` 後に turn 1 から全再計算する

## 後続で詰めること

- `Enemy Setup` の最小入力セット
- `Stage Setup` の最小入力セット
- `Simulator Settings` に追加する session-level option の範囲
- support picker の詳細表示 panel の exact layout
- `Initial Setup` の最小化 UI を header bar / drawer / accordion のどれで表現するか
- slot panel の exact width と desktop 最小幅
- style icon 上に常時出す badge 情報の最小セット
- mobile 対応をいつ始めるか

## 設計原則

1. 新 UI は「既存 UI の大改修」ではなく「新規ページ」として扱う
2. engine 修正が必要でも、UI 専用の暫定ロジックを engine 本体へ混ぜない
3. D&D や配置編集などの操作系は UI Next 側へ閉じ込める
4. 共有化できるものは asset / resolver / helper / adapter contract に限定する
5. 既存 UI と新 UI の両方が存在しても運用できる期間を前提にする

## 想定ディレクトリ構成

```text
ui-next/
  index.html
  app.js
  styles.css

src/ui-next/
  page-controller.js
  drag-drop.js
  view-model.js
  renderers/
```

補足:

- `ui-next/` はブラウザ公開用の entry と静的ファイル
- `src/ui-next/` は新 UI 専用ロジック
- 既存の `src/ui/` は current UI 用として当面維持する

## 画面スコープ

初期段階で扱う対象:

- style 画像付きの 6 slot 表示
- position 入れ替え
- style 選択
- skill / target の編集導線
- turn 単位の編集と再計算トリガ

初期段階で後回しにしてよい対象:

- 既存 UI の全 controls の完全移植
- 旧ページと同じ DOM 構造の互換維持
- 旧 `dom-adapter.js` の表示ロジック再利用

## engine との境界

新 UI は以下を再利用対象とする。

- `HbrDataStore`
- battle state 初期化
- preview / commit / replay 系 API
- lightweight replay script 系の正本モデル

新 UI が直接持つもの:

- レイアウト
- stateful な画面操作
- D&D
- style 画像表示
- slot 編集体験

## branch 運用

- 新 UI の日常作業は `feature/ui-next-*` で進める
- engine bugfix は `main` へ入ってから `ui-next` へ取り込む
- `ui-next` と `engine` の feature branch 同士を直接 merge しない

## 未確定事項

- `ui-next/` を root 直下に置くか、`ui/pages/next/` 配下に置くか
- D&D の入力方式を pointer events 中心にするか、HTML5 drag and drop を使うか
- replay script 編集をどの段階から UI Next 側へ載せるか
- 旧ページから新ページへの導線をいつ張るか

## 現時点の共通土台

- [assets/styles](../../assets/styles): style 画像の正本
- [src/ui/style-asset-url.js](../../src/ui/style-asset-url.js): style 画像 URL resolver
