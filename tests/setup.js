// テスト環境のセットアップ
import { beforeEach } from 'vitest';

// DOM要素のモック
beforeEach(() => {
  document.body.innerHTML = `
    <div id="resultsBody"></div>
    <div id="turnInfo">ターン 1 - 戦闘準備中</div>
    <button id="executeBtn">ターン実行</button>
    <div id="partyFormation"></div>
    <table class="results-table" id="resultsTable">
      <thead>
        <tr>
          <th>ターン</th>
          <th>敵行動など</th>
          <th>始</th><th>行動</th><th>終</th>
        </tr>
      </thead>
      <tbody id="resultsBody"></tbody>
    </table>
  `;
});

// グローバル変数のリセット関数
global.resetGlobals = () => {
  global.currentParty = [];
  global.turnActions = {};
  global.battleHistory = [];
  global.currentTurn = 1;
  global.savedSPState = [];
  global.positionMap = [0, 1, 2, 3, 4, 5];
};