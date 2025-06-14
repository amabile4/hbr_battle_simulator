// 戦闘制御管理クラス
class ControlManager {
    // 実行ボタンの状態更新
    static updateExecuteButton() {
        const executeBtn = document.getElementById('executeBtn');
        
        let allActionsReady = true;
        
        CONFIG.FRONT_POSITIONS_ARRAY.forEach(pos => {
            const playerIndex = positionMap[pos];
            const character = currentParty[playerIndex];
            const hasAction = turnActions[pos];
            
            if (character && !hasAction) {
                allActionsReady = false;
            }
        });
        
        if (executeBtn) {
            executeBtn.disabled = !allActionsReady;
        }
    }
    
    // ターン実行
    static executeTurn() {
        // SP状態を保存（プレビュー用）
        this.saveSPState();
        
        const turnData = {
            turn: currentTurn,
            enemyAction: "敵行動",
            characters: []
        };
        
        // 行動処理（SP回復は次のターンで行う）
        currentParty.forEach((character, index) => {
            if (!character) return;
            
            const startSP = character.currentSP;
            
            // 行動処理
            const position = positionMap.indexOf(index);
            let action = "待機";
            let endSP = character.currentSP;
            
            if (position < CONFIG.FRONT_POSITIONS && turnActions[position]) {
                const skillData = turnActions[position].skill;
                action = skillData.name;
                endSP = character.currentSP - skillData.cost;
                character.currentSP = endSP;
            }
            
            turnData.characters.push({
                name: character.name,
                startSP: startSP,
                action: action,
                endSP: character.currentSP
            });
        });
        
        // 同じターンの結果が既に存在する場合は上書き
        const existingTurnIndex = battleHistory.findIndex(turn => turn.turn === currentTurn);
        if (existingTurnIndex >= 0) {
            battleHistory[existingTurnIndex] = turnData;
        } else {
            battleHistory.push(turnData);
        }
        
        ResultsManager.updateResultsTable();
        DisplayManager.generatePartyDisplay();
        
        // UI要素の選択状態のみリセット（スキル選択は保持）
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        this.updateExecuteButton();
    }
    
    // 次のターン
    static nextTurn() {
        // 現在のターンが未実行の場合、自動的にターン実行
        const currentTurnExists = battleHistory.some(turn => turn.turn === currentTurn);
        if (!currentTurnExists) {
            console.log('未実行のターンを自動実行中...');
            this.executeTurn();
        }
        
        // SP状態を確定（保存状態をクリア）
        savedSPState = [];
        
        currentTurn++;
        document.getElementById('turnInfo').textContent = `ターン ${currentTurn} - 戦闘中`;
        
        // SP回復処理
        currentParty.forEach((character) => {
            if (!character) return;
            
            // ターン開始時SP回復
            character.currentSP += CONFIG.BASE_SP_RECOVERY + character.spBonus;
            character.currentSP = Math.min(character.currentSP, CONFIG.MAX_SP);
        });
        
        // スキル選択をリセットし、デフォルトスキルを設定
        turnActions = {};
        document.querySelectorAll('.character-card').forEach(card => {
            card.style.border = '';
            card.classList.remove('selected');
        });
        
        // 前衛のデフォルトスキル設定
        for (let i = 0; i < CONFIG.FRONT_POSITIONS; i++) {
            const playerIndex = positionMap[i];
            const character = currentParty[playerIndex];
            if (character) {
                const defaultSkill = character.skills.find(skill => skill.cost === 0);
                if (defaultSkill) {
                    turnActions[i] = {
                        character: character.name,
                        skill: defaultSkill,
                        position: i
                    };
                }
            }
        }
        
        // 表示を更新
        DisplayManager.generatePartyDisplay();
        this.updateExecuteButton();
    }
    
    // SP状態の保存
    static saveSPState() {
        savedSPState = currentParty.map(character => 
            character ? character.currentSP : 0
        );
    }
    
    // SP状態の復元
    static restoreSPState() {
        if (savedSPState.length === currentParty.length) {
            currentParty.forEach((character, index) => {
                if (character && savedSPState[index] !== undefined) {
                    character.currentSP = savedSPState[index];
                }
            });
        }
    }
}
