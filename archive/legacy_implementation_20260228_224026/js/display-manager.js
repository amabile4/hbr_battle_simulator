// 表示管理クラス
class DisplayManager {
    // パーティー表示の生成
    static generatePartyDisplay() {
        const container = document.getElementById('partyFormation');
        container.innerHTML = '';
        
        if (currentParty.length === 0) {
            container.innerHTML = '<div class="loading">パーティーが設定されていません。上部で編成を確定してください。</div>';
            return;
        }
        
        for (let i = 0; i < CONFIG.MAX_CHARACTERS; i++) {
            const playerIndex = positionMap[i];
            const character = currentParty[playerIndex];
            
            // キャラクターコンテナ
            const characterContainer = document.createElement('div');
            characterContainer.className = 'character-container';
            
            // キャラクターカード
            const card = document.createElement('div');
            card.className = `character-card ${i < CONFIG.FRONT_POSITIONS ? 'front' : 'back'}`;
            card.id = `char_card_${i}`;
            card.onclick = () => EventHandler.handleCharacterClick(i);
            card.textContent = character ? character.name : '未設定';
            
            // SP表示
            const spDisplay = document.createElement('div');
            spDisplay.className = 'sp-display';
            spDisplay.textContent = character ? character.currentSP : '0';
            card.appendChild(spDisplay);
            
            // スキル表示
            const skillDisplay = document.createElement('div');
            skillDisplay.className = 'skill-display inactive';
            skillDisplay.id = `skill_display_${i}`;
            
            if (character && i < CONFIG.FRONT_POSITIONS) {
                // 前衛のデフォルトスキル選択
                if (!turnActions[i]) {
                    const defaultSkill = character.skills.find(skill => skill.cost === 0);
                    if (defaultSkill) {
                        turnActions[i] = {
                            character: character.name,
                            skill: defaultSkill,
                            position: i
                        };
                    }
                }
                this.updateSkillDisplayElement(skillDisplay, i);
            } else if (i >= CONFIG.FRONT_POSITIONS) {
                skillDisplay.textContent = '—';
                skillDisplay.className = 'skill-display inactive';
            } else {
                skillDisplay.textContent = '未設定';
                skillDisplay.className = 'skill-display inactive';
            }
            
            characterContainer.appendChild(card);
            characterContainer.appendChild(skillDisplay);
            container.appendChild(characterContainer);
        }
        
        ControlManager.updateExecuteButton();
        
        // デバッグ情報を更新
        setTimeout(() => {
            if (typeof ResultsManager !== 'undefined' && ResultsManager.updateDebugInfo) {
                ResultsManager.updateDebugInfo();
            }
        }, 100);
        
        console.log('パーティー表示更新完了');
    }
    
    // スキル表示要素の更新
    static updateSkillDisplayElement(skillElement, position) {
        if (turnActions[position]) {
            const action = turnActions[position];
            const skillName = action.skill.name;
            const skillCost = action.skill.cost;
            
            // スキル名が長い場合は短縮
            let displayName = skillName;
            if (skillName.length > 10) {
                displayName = skillName.substring(0, 8) + '...';
            }
            
            skillElement.textContent = `${displayName} (${skillCost})`;
            skillElement.className = skillCost === 0 ? 'skill-display default' : 'skill-display special';
        } else {
            skillElement.textContent = 'スキル未選択';
            skillElement.className = 'skill-display inactive';
        }
    }
    
    // スキル表示の更新（既存のIDベース関数）
    static updateSkillDisplay(position) {
        const skillDisplay = document.getElementById(`skill_display_${position}`);
        if (skillDisplay) {
            this.updateSkillDisplayElement(skillDisplay, position);
        }
    }
}

// UI操作管理クラス
class UIManager {
    // パーティー編成セクションの折りたたみ切り替え
    static togglePartySetup() {
        const partySetup = document.getElementById('partySetup');
        partySetup.classList.toggle('collapsed');
        console.log('パーティー編成セクション切り替え');
    }
}
