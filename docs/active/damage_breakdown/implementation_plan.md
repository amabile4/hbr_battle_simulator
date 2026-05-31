# Damage Breakdown Panel Implementation Plan

> **ステータス**: ✅ 完了 | **最終更新**: 2026-05-31

## Goal

キャラクター詳細ポップアップへ「威力詳細」タブを追加し、現在の行動で採用されたバフ・デバフ・相性を7グループの2列テーブルで表示する。

## Scope

- 対象敵ごとのクリティカル時スキル威力倍率を表示する。
- 非クリティカル時の倍率は計算・表示しない。
- クリティカル発生率は欄外へ表示し、100%以上は「クリティカル確定」とする。
- アクセサリ補正は v1 では 0% 固定。`damageContext` の field と contribution interface だけを用意する。

## Data Flow

- `turn-controller.js` で damage action ごとに `damageContext.damageBreakdown` と `criticalRateBreakdown` を構築する。
- OD増減が0でも damage action なら `damageContext` を保持する。
- `action-flow-builder.js` が `damageContext` を preview / committed action flow に clone して渡す。
- `char-detail-popup.js` は action flow 内の `damageContext` を描画するだけにする。

## Calculation Groups

- `buff`: 攻撃バフ、チャージ、フィールド、アクセサリ
- `crit-mindeye`: クリティカル基礎倍率、クリティカル威力、心眼
- `funnel`: 連撃数アップ
- `token-passive`: トークン攻撃倍率、オギャり、歌姫、固有マークなど
- `debuff`: 防御ダウン、属性防御ダウン、脆弱
- `resist-down`: 属性耐性ダウン、属性耐性打ち消し
- `affinity`: 敵の基本武器・属性相性

## Verification

- `npm test`
- `npm run lint`
- `npm run test:e2e -- tests/e2e/damage-breakdown-popup.spec.js`
