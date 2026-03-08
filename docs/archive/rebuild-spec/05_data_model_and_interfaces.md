# 05 Data Model And Interfaces

## 1. 事実（現行データ構造）
- `currentParty` 要素: `{name, initialSP, currentSP, spBonus, position, skills}`
  - 根拠: `js/party-manager.js:141`
- `turnActions[position]`: `{character, skill, position}`
  - 根拠: `js/display-manager.js:44`, `js/event-handlers.js:264`
- `battleHistory[]`: `{turn, enemyAction, characters:[{name,startSP,action,endSP}]}`
  - 根拠: `js/control-manager.js:36`, `js/control-manager.js:61`
- `skillDatabase.json`: `{metadata, characters}` + skill要素 `{name,cost,type}`
  - 根拠: `tests/skill-database.test.js:14`, `tests/skill-database.test.js:69`

## 2. 推奨データモデル（再開発）

### 2.1 モデル
- `Must` `BattleState`
  - `turnIndex`, `turnLabel`, `turnType`, `odLevel`, `extraTurnState`, `positionMap`, `party`, `history`
- `Must` `CharacterState`
  - `characterId`, `name`, `position`, `sp.current`, `sp.max`, `buffs[]`, `debuffs[]`
- `Must` `TurnRecord`
  - `turnId`, `turnType`, `actions[]`, `spChanges[]`, `swapEvents[]`, `snapshotBefore`, `snapshotAfter`
- `Should` `SPChangeEntry`
  - `source`, `targetCharacterId`, `amount`, `preSP`, `postSP`, `ruleId`

## 3. 推奨インターフェース
- `Must` `initializeBattle(partyConfig, skillCatalog): BattleState`
- `Must` `selectActions(state, actions): BattleState`
- `Must` `applyTurn(state): {state, record}`
- `Must` `applySwap(state, fromPos, toPos): {state, validation}`
- `Must` `exportCsv(state, formatSpec): string`
- `Should` `validateSkillDatabase(skillCatalog): ValidationResult[]`

## 4. 根拠
- 状態一元化必要性: `js/globals.js`, `js/control-manager.js`, `js/event-handlers.js`
- CSV IF必要性: `README.md:240`, `README.md:246`
- SP差分必要性: `README.md:152`, `README.md:156`
