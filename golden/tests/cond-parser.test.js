import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tokenize,
  parseCondition,
  parseConditionOrThrow,
  extractFunctionNames,
  stringifyAst,
} from '../src/cond-parser.js';

test('tokenize: 空白をスキップし基本トークンに分割する', () => {
  const tokens = tokenize('Sp() > 19');
  assert.equal(tokens[0].value, 'Sp');
  assert.equal(tokens[0].type, 'WORD');
  assert.equal(tokens[1].type, 'LPAREN');
  assert.equal(tokens[2].type, 'RPAREN');
  assert.equal(tokens[3].type, 'OP');
  assert.equal(tokens[3].value, '>');
  assert.equal(tokens[4].value, '19');
  assert.equal(tokens[5].type, 'EOF');
});

test('tokenize: 2文字演算子 ==, !=, >=, <= を認識する', () => {
  for (const op of ['==', '!=', '>=', '<=']) {
    const tokens = tokenize(`Sp()${op}5`);
    assert.equal(tokens[3].value, op, `should parse ${op}`);
    assert.equal(tokens[3].type, 'OP');
  }
});

test('tokenize: && と || を区別する', () => {
  const tokens = tokenize('IsFront() && IsAttacker()');
  const andTok = tokens.find((t) => t.type === 'AND');
  assert.ok(andTok);
  assert.equal(andTok.value, '&&');

  const orTokens = tokenize('IsZone(Fire)==1 || IsZone(Ice)==1');
  const orTok = orTokens.find((t) => t.type === 'OR');
  assert.ok(orTok);
  assert.equal(orTok.value, '||');
});

test('tokenize: 先頭数字の識別子 31A を単一 WORD として扱う', () => {
  const tokens = tokenize('IsTeam(31A)==1');
  const wordTokens = tokens.filter((t) => t.type === 'WORD');
  assert.ok(wordTokens.some((t) => t.value === '31A'));
  assert.ok(wordTokens.some((t) => t.value === 'IsTeam'));
});

test('tokenize: 小数 と 負数 を認識する', () => {
  assert.equal(tokenize('1.495')[0].value, '1.495');
  assert.equal(tokenize('>-0')[1].value, '-0');
  assert.equal(tokenize('0.0')[0].value, '0.0');
});

test('tokenize: 不正文字で SyntaxError', () => {
  assert.throws(() => tokenize('Sp() @ 5'), SyntaxError);
});

test('parseCondition: 空式 は literal true を返す', () => {
  const r = parseCondition('');
  assert.equal(r.ok, true);
  assert.equal(r.ast.type, 'literal');
  assert.equal(r.ast.value, true);
});

test('parseCondition: bare call は call ノード', () => {
  const r = parseCondition('IsOverDrive()');
  assert.equal(r.ok, true);
  assert.equal(r.ast.type, 'call');
  assert.equal(r.ast.name, 'IsOverDrive');
  assert.deepEqual(r.ast.args, []);
});

test('parseCondition: 比較式 は compare ノード', () => {
  const r = parseCondition('Sp()>19');
  assert.equal(r.ok, true);
  assert.equal(r.ast.type, 'compare');
  assert.equal(r.ast.op, '>');
  assert.equal(r.ast.left.type, 'call');
  assert.equal(r.ast.right.type, 'number');
  assert.equal(r.ast.right.value, 19);
});

test('parseCondition: 逆順比較 0.0<DpRate() は left=number, right=call', () => {
  const r = parseCondition('0.0<DpRate()');
  assert.equal(r.ast.type, 'compare');
  assert.equal(r.ast.left.type, 'number');
  assert.equal(r.ast.left.value, 0.0);
  assert.equal(r.ast.right.type, 'call');
  assert.equal(r.ast.right.name, 'DpRate');
});

test('parseCondition: && は and ノード（フラット化）', () => {
  const r = parseCondition('IsFront() && IsAttacker() && IsPlayer()==1');
  assert.equal(r.ast.type, 'and');
  assert.equal(r.ast.children.length, 3);
});

test('parseCondition: || は or ノード（フラット化）', () => {
  const r = parseCondition('IsZone(Fire)==1 || IsZone(Ice)==1 || IsZone(Thunder)==1');
  assert.equal(r.ast.type, 'or');
  assert.equal(r.ast.children.length, 3);
});
test('parseCondition: || は or ノード（フラット化）', () => {
  const r = parseCondition('IsZone(Fire)==1 || IsZone(Ice)==1 || IsZone(Thunder)==1');
  assert.equal(r.ast.type, 'or');
  assert.equal(r.ast.children.length, 3);
});

test('parseCondition: CountBC ネスト構造 を countBc ノードで表す', () => {
  const r = parseCondition('CountBC(IsPlayer() == 1 && SpecialStatusCountByType(20)>0)>0');
  assert.equal(r.ast.type, 'countBc');
  assert.equal(r.ast.inner.type, 'and');
  assert.equal(r.ast.op, '>');
  assert.equal(r.ast.rhs.type, 'number');
  assert.equal(r.ast.rhs.value, 0);
});

test('parseCondition: CountBC 単独（比較無し）は != 0 truthy 判定', () => {
  const r = parseCondition('CountBC(IsPlayer()&&IsTeam(31A)==1)');
  assert.equal(r.ast.type, 'countBc');
  assert.equal(r.ast.op, '!=');
  assert.equal(r.ast.rhs.value, 0);
});

test('parseCondition: 多引数関数 IsCharacter(X)==1 をパース', () => {
  const r = parseCondition('IsCharacter(RKayamori)==1');
  assert.equal(r.ast.left.type, 'call');
  assert.equal(r.ast.left.name, 'IsCharacter');
  assert.equal(r.ast.left.args[0].type, 'ident');
  assert.equal(r.ast.left.args[0].value, 'RKayamori');
});

test('parseCondition: && || 混合（&& が || より強い結合）', () => {
  const r = parseCondition('IsFront() && IsAttacker() || IsZone(Fire)==1');
  assert.equal(r.ast.type, 'or');
  assert.equal(r.ast.children.length, 2);
  assert.equal(r.ast.children[0].type, 'and');
});

test('parseCondition: played skill count の数値引数比較', () => {
  const r = parseCondition('PlayedSkillCount(SSakurabaSkill54)  == 2');
  assert.equal(r.ok, true);
  assert.equal(r.ast.op, '==');
  assert.equal(r.ast.left.args[0].value, 'SSakurabaSkill54');
  assert.equal(r.ast.right.value, 2);
});

test('parseCondition: 末尾余分トークンは ok:false', () => {
  const r = parseCondition('IsOverDrive() extra');
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('Trailing'));
});

test('parseCondition: 括弧不一致は ok:false', () => {
  const r = parseCondition('CountBC(IsPlayer()==1');
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
});

test('parseConditionOrThrow: 正常時は AST を返す', () => {
  const ast = parseConditionOrThrow('IsFront()');
  assert.equal(ast.type, 'call');
});

test('parseConditionOrThrow: 構文エラー時は throw', () => {
  assert.throws(() => parseConditionOrThrow('@invalid'));
});

test('extractFunctionNames: 全参照述語を抽出', () => {
  const ast = parseConditionOrThrow(
    'CountBC(IsPlayer() == 1 && IsCharacter(RKayamori) == 1 && MotivationLevel() == 5)>0'
  );
  const names = extractFunctionNames(ast);
  assert.ok(names.has('CountBC'));
  assert.ok(names.has('IsPlayer'));
  assert.ok(names.has('IsCharacter'));
  assert.ok(names.has('MotivationLevel'));
  assert.equal(names.size, 4);
});

test('stringifyAst: 空式', () => {
  assert.equal(stringifyAst(parseCondition('').ast), 'true');
});

test('stringifyAst: 比較式を再構築', () => {
  const ast = parseConditionOrThrow('Sp()>19');
  assert.equal(stringifyAst(ast), 'Sp() > 19');
});

test('stringifyAst: CountBC ネストを再構築', () => {
  const ast = parseConditionOrThrow('CountBC(IsPlayer()&&IsTeam(31A)==1)>=3');
  const s = stringifyAst(ast);
  assert.ok(s.startsWith('CountBC('));
  assert.ok(s.includes('>= 3'));
});

