# Support Skills（サポート枠・共鳴アビリティ）実装タスクリスト

> **ステータス**: 🟢 進行中 | 📅 最終更新: 2026-03-11（Phase 2 タスク追加）

## 方針

- メインスタイルのパッシブとしてサポートパッシブを **コンストラクタ呼び出し前** に注入する（`this.passives = Object.freeze(...)` で固定済みのため）
- 10% ステータス加算はシミュレーター対象外のため **実装しない**
- E2E テストは Gemini (Antigravity) 担当のため **本タスクに含めない**
- サポート候補フィルタリングは「同属性 + SS/SSR」で絞り込む（仕様書通り）
- LB レベルはユーザーがセレクトボックスで手動選択

## コミット戦略

以下の3つのマイルストーンでコミットを作成する：

| タイミング | 対象 Step | コミットメッセージ |
|-----------|-----------|-----------------|
| **Commit 1** | Step 1-4 完了後 | `feat: add support skills data layer and domain model` |
| **Commit 2** | Step 5 完了後 | `feat: add support slot UI to party selection` |
| **Commit 3** | Step 6-7 完了後（全テスト PASS 確認後） | `test: add support skills unit tests` |

## 参照ドキュメント

- [`docs/specs/support_skills_spec.md`](../specs/support_skills_spec.md) — 技術仕様
- [`help/HEAVEN_BURNS_RED/バトル/サポート枠.md`](../../help/HEAVEN_BURNS_RED/バトル/サポート枠.md)
- [`help/HEAVEN_BURNS_RED/バトル/共鳴アビリティ.md`](../../help/HEAVEN_BURNS_RED/バトル/共鳴アビリティ.md)
- `json/support_skills.json` — マスターデータ（21グループ × LB 0-4）
- `json/styles.json` — `resonance` フィールドで紐付け（SS/SSR の一部のみ持つ）

---

## Step 1: 純粋関数層（新規ファイル）

**ファイル**: `src/domain/support-skills-resolver.js`（新規作成）

- [x] `resolveSupportPassiveEntry(supportGroup, limitBreakLevel)` を実装
  - `supportGroup.list` を `lb_lv` 降順にソートし、`lb_lv <= limitBreakLevel` の最初のエントリを返す
  - `supportGroup` が null / list が空の場合は null を返す
  ```js
  export function resolveSupportPassiveEntry(supportGroup, limitBreakLevel) {
    if (!supportGroup || !Array.isArray(supportGroup.list)) return null;
    const sorted = [...supportGroup.list].sort((a, b) => b.lb_lv - a.lb_lv);
    return sorted.find((entry) => entry.lb_lv <= Number(limitBreakLevel ?? 0)) ?? null;
  }
  ```

- [x] `buildSupportPassive(passive, sourceMeta)` を実装
  - `sourceType: 'support'` を付与（既存 `'style'` / `'database'` と区別）
  - `sourceMeta: { supportGroupLabel, supportStyleId, limitBreakLevel }` を付与
  - `tier: ''` を設定（既存の `clonePassiveWithSource` 互換）
  ```js
  export function buildSupportPassive(passive, sourceMeta) {
    return {
      ...structuredClone(passive),
      sourceType: 'support',
      sourceMeta: structuredClone(sourceMeta ?? {}),
      tier: '',
    };
  }
  ```

---

## Step 2: データストア拡張

**ファイル**: `src/data/hbr-data-store.js`

### 2-a. support_skills.json のロード

- [x] ファイル先頭の import に追加:
  ```js
  import { resolveSupportPassiveEntry, buildSupportPassive } from '../domain/support-skills-resolver.js';
  ```

- [x] `fromJsonDirectory()` の return オブジェクト（characters/styles/skills/... の並び）に追加:
  ```js
  supportSkills: readJsonOrFallback(resolve(dir, 'support_skills.json'), []),
  ```

- [x] `fromRawData()` の `new HbrDataStore({...})` 呼び出しに追加:
  ```js
  supportSkills: payload.supportSkills ?? [],
  ```

- [x] コンストラクタの Map 構築群の末尾に追加:
  ```js
  this.supportSkills = payload.supportSkills ?? [];
  this.supportSkillsByLabel = new Map(
    this.supportSkills.map((g) => [String(g.label ?? ''), g])
  );
  ```

### 2-b. 新規メソッドを追加（`listPassivesByStyleId` の後あたりに追加）

- [x] `getSupportGroupByLabel(resonanceLabel)` を追加:
  ```js
  getSupportGroupByLabel(resonanceLabel) {
    return this.supportSkillsByLabel.get(String(resonanceLabel ?? '')) ?? null;
  }
  ```

- [x] `listSupportStyleCandidates(mainStyleId)` を追加:
  ```js
  listSupportStyleCandidates(mainStyleId) {
    const mainStyle = this.getStyleById(mainStyleId);
    if (!mainStyle) return [];
    const mainTier = String(mainStyle.tier ?? '').toUpperCase();
    if (!['SS', 'SSR'].includes(mainTier)) return [];
    const mainElements = new Set(Array.isArray(mainStyle.elements) ? mainStyle.elements : []);
    if (mainElements.size === 0) return [];
    return this.styles.filter((s) => {
      if (Number(s.id) === Number(mainStyleId)) return false;
      const tier = String(s.tier ?? '').toUpperCase();
      if (!['SS', 'SSR'].includes(tier)) return false;
      const sElements = Array.isArray(s.elements) ? s.elements : [];
      return sElements.some((el) => mainElements.has(el));
    });
  }
  ```

- [x] `resolveSupportSkillPassive(supportStyleId, limitBreakLevel)` を追加:
  ```js
  resolveSupportSkillPassive(supportStyleId, limitBreakLevel) {
    const supportStyle = this.getStyleById(supportStyleId);
    if (!supportStyle) return null;
    const resonance = supportStyle.resonance;
    if (!resonance) return null;
    const group = this.getSupportGroupByLabel(resonance);
    if (!group) return null;
    const entry = resolveSupportPassiveEntry(group, Number(limitBreakLevel ?? 0));
    if (!entry?.passive) return null;
    return buildSupportPassive(entry.passive, {
      supportGroupLabel: String(resonance),
      supportStyleId: Number(supportStyleId),
      limitBreakLevel: Number(limitBreakLevel ?? 0),
    });
  }
  ```

### 2-c. `buildCharacterStyle()` の変更（行 ~1058）

- [x] 引数の末尾に追加:
  ```js
  supportStyleId = null,
  supportStyleLimitBreakLevel = 0,
  ```

- [x] `const passives = this.listPassivesByStyleId(style.id, ...)` の行を以下に置き換え:
  ```js
  const mainPassives = this.listPassivesByStyleId(style.id, { limitBreakLevel: normalizedLimitBreak });
  const supportPassive =
    supportStyleId != null
      ? this.resolveSupportSkillPassive(Number(supportStyleId), Number(supportStyleLimitBreakLevel))
      : null;
  const passives = supportPassive ? [...mainPassives, supportPassive] : mainPassives;
  ```

- [x] `new CharacterStyle({...})` 呼び出し（行 ~1123）に追加:
  ```js
  supportStyleId: supportStyleId != null ? Number(supportStyleId) : null,
  supportStyleLimitBreakLevel: Number(supportStyleLimitBreakLevel ?? 0),
  ```
  ※ `passives,` の行はすでに変数名が合っているので変更不要

### 2-d. `buildPartyFromStyleIds()` の変更（行 ~1157）

- [x] `limitBreakLevelsByPartyIndex` の行の直後に追加:
  ```js
  const supportStyleIdsByPartyIndex = options.supportStyleIdsByPartyIndex ?? {};
  const supportLimitBreakLevelsByPartyIndex = options.supportLimitBreakLevelsByPartyIndex ?? {};
  ```

- [x] `buildCharacterStyle()` 呼び出し（行 ~1174）の末尾に追加:
  ```js
  supportStyleId: supportStyleIdsByPartyIndex[index] ?? null,
  supportStyleLimitBreakLevel: Number(supportLimitBreakLevelsByPartyIndex[index] ?? 0),
  ```

---

## Step 3: CharacterStyle フィールド追加

**ファイル**: `src/domain/character-style.js`

- [x] `this.limitBreakLevel = Number(...)` の直後（行 ~249）に追加:
  ```js
  this.supportStyleId = input.supportStyleId != null ? Number(input.supportStyleId) : null;
  this.supportStyleLimitBreakLevel = Number(input.supportStyleLimitBreakLevel ?? 0);
  ```

- [x] `snapshot()` の return オブジェクトに（`limitBreakLevel:` の近く）追加:
  ```js
  supportStyleId: this.supportStyleId,
  supportStyleLimitBreakLevel: this.supportStyleLimitBreakLevel,
  ```

---

## Step 4: adapter-core のオプション伝播

**ファイル**: `src/ui/adapter-core.js`

- [x] `createInitializedBattleSnapshot()` の options destructuring に追加:
  ```js
  supportStyleIdsByPartyIndex = {},
  supportLimitBreakLevelsByPartyIndex = {},
  ```

- [x] `dataStore.buildPartyFromStyleIds(styleIds, {...})` 呼び出しのオブジェクトに追加:
  ```js
  supportStyleIdsByPartyIndex,
  supportLimitBreakLevelsByPartyIndex,
  ```

### ✅ Commit 1 チェックポイント

Step 1-4 が全て完了したら以下でコミット：
```
git add src/domain/support-skills-resolver.js src/data/hbr-data-store.js src/domain/character-style.js src/ui/adapter-core.js
git commit -m "feat: add support skills data layer and domain model

- Add support-skills-resolver.js with resolveSupportPassiveEntry/buildSupportPassive
- Load support_skills.json in HbrDataStore with getSupportGroupByLabel/listSupportStyleCandidates/resolveSupportSkillPassive
- Extend buildCharacterStyle/buildPartyFromStyleIds with supportStyleId and supportStyleLimitBreakLevel
- Add supportStyleId/supportStyleLimitBreakLevel fields to CharacterStyle and snapshot()
- Wire supportStyleIdsByPartyIndex through adapter-core createInitializedBattleSnapshot"
```

---

## Step 5: UI 拡張

**ファイル**: `src/ui/dom-adapter.js`

### 5-a. HTML 要素の追加（`renderPartySelectionSlots()` 内）

対象: `wrapper.appendChild(motivationSelect)` の後（行 ~1535）、`wrapper.appendChild(initialBreakLabel)` の前に挿入。

- [x] `supportStyleSelect` 要素を作成して `wrapper` に追加:
  ```js
  const supportStyleSelect = this.doc.createElement('select');
  supportStyleSelect.setAttribute('data-role', 'support-style-select');
  supportStyleSelect.setAttribute('data-slot', String(i));
  supportStyleSelect.style.display = 'none'; // 初期非表示
  const supportStyleEmptyOpt = this.doc.createElement('option');
  supportStyleEmptyOpt.value = '';
  supportStyleEmptyOpt.textContent = '（サポートなし）';
  supportStyleSelect.appendChild(supportStyleEmptyOpt);
  wrapper.appendChild(supportStyleSelect);
  ```

- [x] `supportLbSelect` 要素を作成して `wrapper` に追加:
  ```js
  const supportLbSelect = this.doc.createElement('select');
  supportLbSelect.setAttribute('data-role', 'support-lb-select');
  supportLbSelect.setAttribute('data-slot', String(i));
  supportLbSelect.style.display = 'none'; // 初期非表示
  for (let lb = 0; lb <= 4; lb++) {
    const opt = this.doc.createElement('option');
    opt.value = String(lb);
    opt.textContent = `LB${lb}`;
    supportLbSelect.appendChild(opt);
  }
  wrapper.appendChild(supportLbSelect);
  ```

- [x] スロット初期化処理（行 ~1553 の `this.populateStyleSelect(...)` 群）の末尾に追加:
  ```js
  this.updateSupportSlotVisibility(i, initial.styleId);
  this.populateSupportStyleSelect(i, initial.styleId);
  ```

### 5-b. 新規メソッドの追加

`populateLimitBreakSelect` などの populate 系メソッドの近くに追加。

- [x] `updateSupportSlotVisibility(slotIndex, mainStyleId)` を追加:
  ```js
  updateSupportSlotVisibility(slotIndex, mainStyleId) {
    const styleSelect = this.root.querySelector(`[data-role="support-style-select"][data-slot="${slotIndex}"]`);
    const lbSelect = this.root.querySelector(`[data-role="support-lb-select"][data-slot="${slotIndex}"]`);
    if (!styleSelect) return;
    const style = this.dataStore?.getStyleById(Number(mainStyleId));
    const tier = String(style?.tier ?? '').toUpperCase();
    const visible = ['SS', 'SSR'].includes(tier);
    styleSelect.style.display = visible ? '' : 'none';
    if (lbSelect) lbSelect.style.display = visible ? '' : 'none';
    if (!visible) {
      styleSelect.value = '';
      if (lbSelect) lbSelect.value = '0';
    }
  }
  ```

- [x] `populateSupportStyleSelect(slotIndex, mainStyleId)` を追加:
  ```js
  populateSupportStyleSelect(slotIndex, mainStyleId) {
    const select = this.root.querySelector(`[data-role="support-style-select"][data-slot="${slotIndex}"]`);
    if (!select) return;
    const candidates = this.dataStore?.listSupportStyleCandidates(Number(mainStyleId)) ?? [];
    select.innerHTML = '';
    const emptyOpt = this.doc.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '（サポートなし）';
    select.appendChild(emptyOpt);
    for (const s of candidates) {
      const opt = this.doc.createElement('option');
      opt.value = String(s.id);
      opt.textContent = `[${s.tier}] ${s.name}`;
      select.appendChild(opt);
    }
  }
  ```

- [x] `populateSupportLimitBreakSelect(slotIndex, supportStyleId)` を追加:
  ```js
  populateSupportLimitBreakSelect(slotIndex, supportStyleId) {
    const select = this.root.querySelector(`[data-role="support-lb-select"][data-slot="${slotIndex}"]`);
    if (!select) return;
    const style = supportStyleId ? this.dataStore?.getStyleById(Number(supportStyleId)) : null;
    const maxLb = style ? (this.dataStore?.getStyleLimitBreakMax(style) ?? 4) : 4;
    const currentValue = Number(select.value ?? 0);
    select.innerHTML = '';
    for (let lb = 0; lb <= maxLb; lb++) {
      const opt = this.doc.createElement('option');
      opt.value = String(lb);
      opt.textContent = `LB${lb}`;
      select.appendChild(opt);
    }
    select.value = String(Math.min(currentValue, maxLb));
  }
  ```

- [x] `readSupportStyleMapFromDom()` を追加（`readLimitBreakMapFromDom` の近くに）:
  ```js
  readSupportStyleMapFromDom() {
    const map = {};
    for (let i = 0; i < 6; i++) {
      const select = this.root.querySelector(`[data-role="support-style-select"][data-slot="${i}"]`);
      if (select?.value) map[i] = Number(select.value);
    }
    return map;
  }
  ```

- [x] `readSupportLbMapFromDom()` を追加:
  ```js
  readSupportLbMapFromDom() {
    const map = {};
    for (let i = 0; i < 6; i++) {
      const select = this.root.querySelector(`[data-role="support-lb-select"][data-slot="${i}"]`);
      if (select) map[i] = Number(select.value ?? 0);
    }
    return map;
  }
  ```

### 5-c. イベントハンドラへの追加

`style-select` の change ハンドラを探す（`data-role="style-select"` への反応部分）。

- [x] style-select 変更時の処理末尾（`this.populateLimitBreakSelect(...)` や `this.populateSkillChecklist(...)` の後）に追加:
  ```js
  this.updateSupportSlotVisibility(slot, target.value);
  this.populateSupportStyleSelect(slot, target.value);
  ```

- [x] `support-style-select` の change イベントハンドラを追加（他の select change イベントと同じ場所に）:
  ```js
  if (target.matches('[data-role="support-style-select"]')) {
    const slot = toInt(target.getAttribute('data-slot'), 0);
    this.populateSupportLimitBreakSelect(slot, target.value);
  }
  ```

### 5-d. captureSelectionState() の変更（行 ~1700）

- [x] 既存の `const motivationSelect = ...` の後に追加:
  ```js
  const supportStyleSelect = this.root.querySelector(
    `[data-role="support-style-select"][data-slot="${i}"]`
  );
  const supportLbSelect = this.root.querySelector(
    `[data-role="support-lb-select"][data-slot="${i}"]`
  );
  ```

- [x] `partySelections.push({...})` のオブジェクト（行 ~1738）に追加:
  ```js
  supportStyleId: Number(supportStyleSelect?.value) || null,
  supportStyleLimitBreakLevel: Number(supportLbSelect?.value) || 0,
  ```

### 5-e. applySelectionState() の変更（行 ~1761）

既存の `populateLimitBreakSelect` + value セットのパターンを踏まえ、サポートスタイルの選択肢を populate してから value をセットすること（選択肢がないと value がセットできない）。

- [x] `populateLimitBreakSelect` の後（行 ~1804 の後）に追加:
  ```js
  // サポートスタイル: 先に populateStyleSelect → value セット → populateLbSelect → value セット
  this.updateSupportSlotVisibility(i, styleSelect?.value ?? '');
  this.populateSupportStyleSelect(i, styleSelect?.value ?? '');
  const supportStyleSelect = this.root.querySelector(
    `[data-role="support-style-select"][data-slot="${i}"]`
  );
  if (supportStyleSelect && row.supportStyleId != null) {
    supportStyleSelect.value = String(row.supportStyleId);
    this.populateSupportLimitBreakSelect(i, supportStyleSelect.value);
    const supportLbSelect = this.root.querySelector(
      `[data-role="support-lb-select"][data-slot="${i}"]`
    );
    if (supportLbSelect) {
      supportLbSelect.value = String(row.supportStyleLimitBreakLevel ?? 0);
    }
  }
  ```

### 5-f. initializeBattle() への追加（行 ~2512）

`readLimitBreakMapFromDom` と同じパターンで以下を追加:

- [x] 既存の `limitBreakLevelsByPartyIndex` の行の後に追加:
  ```js
  const supportStyleIdsByPartyIndex =
    options.supportStyleIdsByPartyIndex ?? this.readSupportStyleMapFromDom();
  const supportLimitBreakLevelsByPartyIndex =
    options.supportLimitBreakLevelsByPartyIndex ?? this.readSupportLbMapFromDom();
  ```

- [x] `this.initializeBattleState({...})` の呼び出しオブジェクト（行 ~2568）に追加:
  ```js
  supportStyleIdsByPartyIndex,
  supportLimitBreakLevelsByPartyIndex,
  ```

### ✅ Commit 2 チェックポイント

Step 5 が全て完了したら以下でコミット：
```
git add src/ui/dom-adapter.js
git commit -m "feat: add support slot UI to party selection

- Add support-style-select and support-lb-select per party slot
- Add updateSupportSlotVisibility: show/hide based on SS/SSR main style
- Add populateSupportStyleSelect: filter candidates by same elements + SS/SSR
- Add populateSupportLimitBreakSelect: 0..maxLB range per support style
- Add readSupportStyleMapFromDom / readSupportLbMapFromDom
- Wire support selection into captureSelectionState / applySelectionState
- Pass support maps through initializeBattle"
```

---

## Step 6: ユニット・インテグレーションテスト

**ファイル**: `tests/support-skills.test.js`（新規作成）

テストデータは `HbrDataStore.fromJsonDirectory('json')` で実際のデータを使用。

### 純粋関数テスト（support-skills-resolver.js）

- [x] `resolveSupportPassiveEntry(group, 0)`: lb_lv=0 のエントリを返す
- [x] `resolveSupportPassiveEntry(group, 4)`: lb_lv=4 のエントリを返す
- [x] `resolveSupportPassiveEntry(group, 2)`: lb_lv=2 のエントリを返す（lb_lv=3,4 は除外）
- [x] `resolveSupportPassiveEntry(null, 0)`: null を返す
- [x] `buildSupportPassive(passive, meta)`: `sourceType: 'support'` が付与されること
- [x] `buildSupportPassive(passive, meta)`: `sourceMeta` が正しく付与されること

### HbrDataStore テスト

- [x] `dataStore.getSupportGroupByLabel('31A')`: オブジェクトを返す（label, list, styles を持つ）
- [x] `dataStore.getSupportGroupByLabel('nonexistent')`: null を返す
- [x] `dataStore.listSupportStyleCandidates(ssStyleId)`: SS/SSR のみ返すこと（A/S は除外）
- [x] `dataStore.listSupportStyleCandidates(ssStyleId)`: 自スタイルが除外されること
- [x] `dataStore.listSupportStyleCandidates(aStyleId)`: A/S メインは空配列を返すこと
- [x] `dataStore.resolveSupportSkillPassive(resonanceNullStyleId, 0)`: resonance なしは null
- [x] `dataStore.resolveSupportSkillPassive(ssStyleWithResonanceId, 2)`: passive オブジェクトを返す（sourceType:'support'）

### buildCharacterStyle 統合テスト

- [x] `buildCharacterStyle({ styleId, ..., supportStyleId: validId, supportStyleLimitBreakLevel: 2 })`: `passives` に `sourceType:'support'` のパッシブが含まれること
- [x] `buildCharacterStyle({ styleId, ..., supportStyleId: null })`: `passives` に `sourceType:'support'` が含まれないこと
- [x] LB 0 と LB 4 で異なる passive（name や desc）が注入されること

---

## Step 7: テスト全件確認

- [x] `npm test` を実行して **全既存テストが PASS** することを確認
- [x] Step 6 で追加したテストが全件 PASS することを確認

### ✅ Commit 3 チェックポイント

Step 6-7 が全て完了し、`npm test` が全件 PASS したら以下でコミット：
```
git add tests/support-skills.test.js docs/active/support_skills_implementation_tasklist.md docs/README.md
git commit -m "test: add support skills unit tests and mark implementation complete

- Add tests/support-skills.test.js covering resolver functions, HbrDataStore methods, and buildCharacterStyle integration
- All existing tests continue to pass
- Update support_skills_implementation_tasklist.md to completed status"
```

---

## 完了基準チェック

- [x] すべての実装チェックボックスにチェックが入っている
- [x] `npm test` が全件 PASS
- [x] ブラウザで SS/SSR スタイル選択時にサポートスタイル選択が表示される（手動確認）
- [x] A/S スタイルを選択するとサポートスタイル選択が非表示になる（手動確認）
- [x] サポートスタイル選択後に LB レベル選択が表示される（手動確認）
- [x] バトル開始後、共鳴アビリティ効果が OnBattleStart パッシブとして発動する（手動確認）
- [x] このファイルのステータスを `✅ 完了` に変更し、`docs/README.md` の該当行を更新する

---

## 追加タスク（Phase 2: 品質確認・未実装対応）

> **ステータス**: 🟢 進行中 | 📅 追加日: 2026-03-11

### Task A: パッシブログへの共鳴アビリティ表示確認

**目的**: `initializeBattle` 後に共鳴アビリティ（OnBattleStart 等）のパッシブが Passive Log に正しく表示されることをテストで保証する。

**現状**: `dom-adapter.js` line 2749 で `appendPassiveLogEvents(passiveEventsLastApplied)` が呼ばれており、動作している可能性が高い。しかし、テストによる保証がない。

**作業**:
- [ ] `tests/dom-adapter-ui-selection.test.js` にインテグレーションテストを追加
  - supportStyleId 付きで `buildCharacterStyle` → `initializeBattle` → `adapter.passiveLogEntries` に共鳴アビリティ名が含まれること
  - OnBattleStart timing の passive が passiveLogEntries に記録されること

---

### Task A-0: 属性フィルタリング仕様の明示的テスト（完了）

**目的**: `listSupportStyleCandidates` が元素属性（elements）のみで絞り込み、武器種別（weapon）を条件に使わないことをテストで保証する。

**確定仕様**（`help/HEAVEN_BURNS_RED/バトル/サポート枠.md` に追記済み）:
- 絞り込み条件は「元素属性（elements）」のみ
- 武器種別（Slash/Stab/Strike 等）は条件に含まれない

**作業**:
- [x] `tests/support-skills.test.js` に3テスト追加（2026-03-11）:
  - `属性(elements)のみで絞り込む — すべての候補がメインと共通elements を持つこと`
  - `武器種別(weapon)が異なっても属性(elements)が一致すれば候補に含まれること`
  - `属性(elements)が一致しなければ武器種別(weapon)が同じでも候補に含まれないこと`
- [x] `help/HEAVEN_BURNS_RED/バトル/サポート枠.md` に武器種別除外の明記を追加
- [x] `npm test` 全 430 件 PASS 確認済み

---

### Task B: 共鳴アビリティ全タイミング・全 skill_type の動作確認

**目的**: `support_skills.json` の 6 timing × 14 skill_type が正しく評価されることを確認する。

**現状**:
- timing: OnBattleStart / OnEveryTurn / OnFirstBattleStart / OnPlayerTurnStart / OnBattleWin / OnOverdriveStart → すべて `SUPPORTED_PASSIVE_TIMINGS` 内
- skill_type: 14種（HealDpRate, AttackUp, DefenseUp, DamageRateUp, OverDrivePointUp, Morale, Mocktail, GiveAttackBuffUp, GiveDefenseDebuffUp, AdditionalHitOnBreaking, AdditionalHitOnHealedSpWithoutSelfHeal, BIYamawakiServant, HealSkillUsedCount, SkillLimitCountUp）→ すべて実装済みリストに存在

**作業**:
- [ ] 主要 timing × skill_type 組み合わせのユニットテスト追加
  - `OnBattleStart` + `HealDpRate` / `AttackUp` / `DefenseUp`
  - `OnEveryTurn` + `OverDrivePointUp` / `Morale`
  - `OnOverdriveStart` + `DamageRateUp`
  - `OnBattleWin` + `SkillLimitCountUp`
- [ ] `BIYamawakiServant` の挙動確認（特定キャラ固有処理のため要確認）
- [ ] 未発動の skill_type がある場合はバグとして修正

---

### Task C: GiveAttackBuffUp / GiveDefenseDebuffUp の状態変化付与対応

**目的**: バフ付与型共鳴アビリティが戦闘計算に正しく反映されているか確認・修正する。

**現状**: `GiveAttackBuffUp` / `GiveDefenseDebuffUp` は実装済みリストに存在するが、パッシブ発動時に「バフ状態」として継続管理されているか、戦闘計算（ダメージレート計算等）に反映されているかは未確認。

**作業**:
- [ ] `applyPassiveTimingInternal` 内の `GiveAttackBuffUp` / `GiveDefenseDebuffUp` 処理コードを確認
- [ ] バフが戦闘計算（`attackUpRate` / `defenseDownRate` 等）に反映されているか確認
- [ ] 未反映の場合、適切な状態管理（BuffState / passiveEventDetail 等）への追加を実装
- [ ] パッシブログにバフ付与のエントリが表示されること確認
- [ ] `npm test` で全テスト PASS を確認してコミット
