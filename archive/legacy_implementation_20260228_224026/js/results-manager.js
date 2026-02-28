// 結果管理クラス
class ResultsManager {
    // 結果テーブルのヘッダー更新
    static updateResultsTableHeaders() {
        const headerRow = document.querySelector('.results-table thead tr:first-child');
        const subHeaderRow = document.querySelector('.results-table thead tr:last-child');
        
        if (!headerRow || !subHeaderRow) return;
        
        // 1行目：キャラクター名
        headerRow.innerHTML = `
            <th rowspan="2">ターン</th>
            <th rowspan="2">敵行動など</th>
            ${currentParty.map(char => `<th colspan="3" class="char-header">${char.name}</th>`).join('')}
        `;
        
        // 2行目：始・行動・終（colgroupで列幅が制御されるのでクラス不要）
        subHeaderRow.innerHTML = `
            ${currentParty.map(() => '<th>始</th><th>行動</th><th>終</th>').join('')}
        `;
    }
    
    // 結果テーブルの更新
    static updateResultsTable() {
        const tbody = document.getElementById('resultsBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        battleHistory.forEach(turn => {
            const row = document.createElement('tr');
            
            // 基本セルを作成
            let cellsHTML = `<td>${turn.turn}</td><td>${turn.enemyAction}</td>`;
            
            // キャラクター情報を処理
            turn.characters.forEach(char => {
                const actionCell = this.formatActionCell(char.action);
                cellsHTML += `<td>${char.startSP}</td>${actionCell}<td>${char.endSP}</td>`;
            });
            
            row.innerHTML = cellsHTML;
            tbody.appendChild(row);
        });
        
        // デバッグ情報を更新
        this.updateDebugInfo();
    }
    
    // デバッグ情報を表示
    static updateDebugInfo() {
        const table = document.getElementById('resultsTable');
        const headerDebugElement = document.getElementById('headerDebugInfo');
        
        if (table && headerDebugElement) {
            // 1行ヘッダーをデバッグ
            const headerCells = table.querySelectorAll('thead tr:first-child th');
            let headerDebugText = '';
            
            headerCells.forEach((cell, index) => {
                const computedStyle = window.getComputedStyle(cell);
                const width = computedStyle.width;
                const text = cell.textContent.trim();
                
                // 期待値を表示
                let expected = '';
                if (index === 0) expected = ' (期待: 40px ターン列)';
                else if (index === 1) expected = ' (期待: 90px 敵行動列)';
                else {
                    const pos = (index - 2) % 3;
                    if (pos === 0) expected = ' (期待: 45px SP列)';
                    else if (pos === 1) expected = ' (期待: 100px 行動列)';
                    else expected = ' (期待: 45px SP列)';
                }
                
                headerDebugText += `列${index + 1}(${text}): ${width}${expected}\n`;
            });
            
            headerDebugElement.innerHTML = headerDebugText.replace(/\n/g, '<br>');
        }
    }
    
    // スキル名（行動）セルのフォーマット
    static formatActionCell(action) {
        if (!action || action === "—") {
            return `<td class="action-cell">${action}</td>`;
        }
        
        // スキル名を省略せずに表示（CSSでワードラップ処理）
        return `<td class="action-cell" title="${action}">${action}</td>`;
    }
}
