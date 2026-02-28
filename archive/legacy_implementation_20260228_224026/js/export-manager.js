// エクスポート管理クラス - タブ区切りデータ出力機能
class ExportManager {
    
    // メインのタブ区切りデータ生成
    static generateTSV() {
        if (!currentParty || currentParty.length === 0) {
            console.warn('パーティーデータが存在しません');
            return '';
        }
        
        if (!battleHistory || battleHistory.length === 0) {
            console.warn('戦闘履歴データが存在しません');
            return '';
        }
        
        try {
            const headerLine1 = this.generateCharacterHeaderLine();
            const headerLine2 = this.generateColumnHeaderLine();
            const dataLines = this.generateDataLines();
            
            return [headerLine1, headerLine2, ...dataLines].join('\n');
        } catch (error) {
            console.error('TSV生成エラー:', error);
            return 'データ生成エラーが発生しました';
        }
    }
    
    // キャラクター名ヘッダー行の生成（1行目）
    static generateCharacterHeaderLine() {
        const characterNames = currentParty.map(char => char ? char.name : '未設定');
        
        // テンプレート形式: T列、敵行動列、各キャラ3列分のスペース
        let line = 'T\t敵行動';
        
        characterNames.forEach(name => {
            // 各キャラクターに3列分（始・行動・終）を割り当て
            line += `\t${name}\t\t`;
        });
        
        return line;
    }
    
    // 列ヘッダー行の生成（2行目）
    static generateColumnHeaderLine() {
        let line = '\t'; // T列は空白
        line += '\t'; // 敵行動列も空白
        
        // 各キャラクターに「始\t行動\t終」を追加
        for (let i = 0; i < currentParty.length; i++) {
            line += '始\t行動\t終';
            if (i < currentParty.length - 1) {
                line += '\t';
            }
        }
        
        return line;
    }
    
    // データ行の生成
    static generateDataLines() {
        if (!battleHistory || battleHistory.length === 0) {
            return [];
        }
        return battleHistory.map(turnData => this.formatTurnData(turnData));
    }
    
    // 個別ターンデータのフォーマット
    static formatTurnData(turnData) {
        const turnType = this.getTurnTypeLabel(turnData.turn, turnData.isSpecial);
        const enemyAction = turnData.enemyAction || '';
        
        let line = `${turnType}\t${enemyAction}`;
        
        // 各キャラクターのデータを追加
        for (let i = 0; i < currentParty.length; i++) {
            const charData = turnData.characters && turnData.characters[i];
            if (charData) {
                const startSP = charData.startSP || '';
                const action = charData.action || '';
                const endSP = charData.endSP || '';
                line += `\t${startSP}\t${action}\t${endSP}`;
            } else {
                line += '\t\t\t'; // 空のキャラクターデータ
            }
        }
        
        return line;
    }
    
    // ターン種別ラベルの取得
    static getTurnTypeLabel(turnNumber, isSpecial) {
        if (isSpecial) {
            // 特殊ターンの判定（将来のOD・追加ターン対応）
            if (isSpecial.type === 'overdrive') {
                return `OD${isSpecial.level}`;
            } else if (isSpecial.type === 'additional') {
                return '追加';
            }
        }
        
        // 通常ターンは数字
        return turnNumber.toString();
    }
    
    // 既存のbattleHistoryデータを直接使用（データ構造が一致している）
    static getBattleHistoryForExport() {
        if (!battleHistory || battleHistory.length === 0) {
            return [];
        }
        
        // 既存のbattleHistoryは既に適切な構造になっている
        // turn, enemyAction, characters[{startSP, action, endSP}]
        return battleHistory;
    }
    
    // プレビュー用のサンプルデータ生成
    static generateSampleTSV() {
        const sampleData = [
            'T\t敵行動\t柳\t\t\t吹雪\t\t\tユイナ\t\t\t四ツ葉\t\t\t神崎\t\t\t色葉\t\t',
            '\t\t始\t行動\t終\t始\t行動\t終\t始\t行動\t終\t始\t行動\t終\t始\t行動\t終\t始\t行動\t終',
            '1\t\t6\tコンペンセーション\t6\t8\t夜醒\t8\t12\t\t12\t6\t\t6\t10\tスペクタクルアート\t10\t8\tアクロマティックバレット+\t8',
            '追加\t\t6\tポイントケア\t6\t8\t蒼焔の螺旋\t8\t12\t（ネコジェット・通常）\t12\t6\t\t6\t10\t\t10\t8\t\t8',
            'OD1\t\tダークグラビトン\t\t\t夜醒\t\t\t\t\t\t心意活性\t\t\t\t\t\t\t',
            '追加\t\tガーデンオブエデン\t\t\t蒼焔の螺旋\t\t\t（ネコジェット）\t\t\t心意活性\t\t\t\t\t\t\t'
        ];
        
        return sampleData.join('\n');
    }
    
    // クリップボードにコピー（将来実装用）
    static async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // フォールバック: 古いブラウザ対応
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const result = document.execCommand('copy');
                textArea.remove();
                return result;
            }
        } catch (error) {
            console.error('クリップボードコピーエラー:', error);
            return false;
        }
    }
    
    // データ検証
    static validateExportData() {
        const issues = [];
        
        if (!currentParty || currentParty.length === 0) {
            issues.push('パーティーが設定されていません');
        }
        
        if (!battleHistory || battleHistory.length === 0) {
            issues.push('戦闘履歴がありません');
        }
        
        if (currentParty && currentParty.some(char => !char || !char.name)) {
            issues.push('未設定のキャラクターがあります');
        }
        
        return {
            isValid: issues.length === 0,
            issues: issues
        };
    }
    
    // UI操作用メソッド群
    
    // データ生成ボタンの処理
    static showExportData() {
        const textarea = document.getElementById('exportDataTextarea');
        const statusDiv = document.getElementById('exportStatus');
        const copyBtn = document.getElementById('copyBtn');
        
        try {
            statusDiv.textContent = 'データ生成中...';
            statusDiv.style.color = '#666';
            
            const validation = this.validateExportData();
            if (!validation.isValid) {
                statusDiv.innerHTML = `⚠️ <strong>警告:</strong> ${validation.issues.join(', ')}`;
                statusDiv.style.color = '#e67e22';
                textarea.value = '// データ生成できません: ' + validation.issues.join(', ');
                copyBtn.disabled = true;
                return;
            }
            
            const tsvData = this.generateTSV();
            textarea.value = tsvData;
            
            if (tsvData && tsvData.length > 0) {
                statusDiv.innerHTML = '✅ <strong>データ生成完了</strong> - テキストボックスからコピーしてスプレッドシートに貼り付けてください';
                statusDiv.style.color = '#27ae60';
                copyBtn.disabled = false;
            } else {
                statusDiv.innerHTML = '⚠️ <strong>データが空です</strong> - 戦闘を実行してから再試行してください';
                statusDiv.style.color = '#e67e22';
                copyBtn.disabled = true;
            }
            
        } catch (error) {
            console.error('データ生成エラー:', error);
            statusDiv.innerHTML = `❌ <strong>エラー:</strong> ${error.message}`;
            statusDiv.style.color = '#e74c3c';
            textarea.value = '// データ生成エラーが発生しました';
            copyBtn.disabled = true;
        }
    }
    
    // サンプルデータ表示ボタンの処理
    static showSampleData() {
        const textarea = document.getElementById('exportDataTextarea');
        const statusDiv = document.getElementById('exportStatus');
        const copyBtn = document.getElementById('copyBtn');
        
        try {
            const sampleData = this.generateSampleTSV();
            textarea.value = sampleData;
            
            statusDiv.innerHTML = '📝 <strong>サンプルデータ表示中</strong> - 実際のフォーマット例です';
            statusDiv.style.color = '#3498db';
            copyBtn.disabled = false;
            
        } catch (error) {
            console.error('サンプルデータ生成エラー:', error);
            statusDiv.innerHTML = `❌ <strong>エラー:</strong> サンプルデータの生成に失敗しました`;
            statusDiv.style.color = '#e74c3c';
            copyBtn.disabled = true;
        }
    }
    
    // クリップボードコピーボタンの処理
    static async copyExportData() {
        const textarea = document.getElementById('exportDataTextarea');
        const statusDiv = document.getElementById('exportStatus');
        
        if (!textarea.value || textarea.value.trim() === '') {
            statusDiv.innerHTML = '⚠️ <strong>コピーするデータがありません</strong> - 先にデータを生成してください';
            statusDiv.style.color = '#e67e22';
            return;
        }
        
        try {
            const success = await this.copyToClipboard(textarea.value);
            
            if (success) {
                statusDiv.innerHTML = '📋 <strong>クリップボードにコピー完了</strong> - スプレッドシートに貼り付け（Ctrl+V）してください';
                statusDiv.style.color = '#27ae60';
                
                // 3秒後に元の状態に戻す
                setTimeout(() => {
                    if (statusDiv.style.color === 'rgb(39, 174, 96)') { // 成功色の場合のみ
                        statusDiv.innerHTML = '✅ <strong>データ生成完了</strong> - テキストボックスからコピーしてスプレッドシートに貼り付けてください';
                        statusDiv.style.color = '#27ae60';
                    }
                }, 3000);
            } else {
                statusDiv.innerHTML = '❌ <strong>コピー失敗</strong> - 手動でテキストを選択してコピー（Ctrl+C）してください';
                statusDiv.style.color = '#e74c3c';
            }
            
        } catch (error) {
            console.error('クリップボードコピーエラー:', error);
            statusDiv.innerHTML = '❌ <strong>コピー失敗</strong> - 手動でテキストを選択してコピー（Ctrl+C）してください';
            statusDiv.style.color = '#e74c3c';
        }
    }
}