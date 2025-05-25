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
        const turnData = {
            turn: currentTurn,
            enemyAction: "敵行動",
            characters: []
        };
        
        // SP回復とターン処理
        currentParty.forEach((character, index) => {
            if (!character) return;
            
            const startSP = character.currentSP;
            
            // ターン開始時SP回復
            character.currentSP += CONFIG.BASE_SP_RECOVERY + character.spBonus;
            character.currentSP = Math.min(character.currentSP, CONFIG.MAX_SP);
            
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
                startSP: startSP + CONFIG.BASE_SP_RECOVERY + character.spBonus,
                action: action,
                endSP: character.currentSP
            });
        });
        
        battleHistory.push(turnData);
        ResultsManager.updateResultsTable();
        DisplayManager.generatePartyDisplay();
        
        // リセット
        turnActions = {};
        document.querySelectorAll('.character-card').forEach(card => {
            card.style.border = '';
            card.classList.remove('selected');
        });
        
        // 前衛のデフォルトスキル再設定
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
                DisplayManager.updateSkillDisplay(i);
            }
        }
        
        this.updateExecuteButton();
    }
    
    // 次のターン
    static nextTurn() {
        currentTurn++;
        document.getElementById('turnInfo').textContent = `ターン ${currentTurn} - 戦闘中`;
    }
}
