/**
 * 条件式（cond / overwrite_cond / target_condition / hit_condition）の
 * 字句解析 + 再帰下降パーサー。
 *
 * 従来 src/turn/turn-controller.js の場当たり的正規表現リストではなく、
 * マスターデータから抽出した全表現をエラー無く構文解析できる正式パーサー。
 *
 * ## 文法（BNF）
 * case 文・if(true/false) リテラル・三項演算子は存在しない。構成要素は以下のみ:
 *
 *   orExpr     := andExpr ('||' andExpr)*
 *   andExpr    := comparison ('&&' comparison)*
 *   comparison := operand (compareOp operand)?      // 演算子無し = truthy 判定
 *   operand    := call | number
 *   call       := CountBC '(' orExpr ')' (compareOp number)?
 *               | identifier '(' argList? ')'
 *   number     := [-]?[0-9]+('.'[0-9]+)?
 *   compareOp  := '==' | '!=' | '>=' | '<=' | '>' | '<'
 *   argList    := arg (',' arg)*
 *   arg        := identifier | number               // Fire, 31A, RKayamori, 20 等
 *
 * CountBC は唯一のネスト構造: 引数として完全な boolean 式(orExpr)を取り、
 * 条件を満たすユニット数を数値で返す。
 *
 * ## AST ノード型
 *   {type:'or'/'and',  children:[node,...]}
 *   {type:'compare',   op:string, left:node, right:node}
 *   {type:'call',      name:string, args:ArgNode[]}
 *   {type:'countBc',   inner:node, op:string, rhs:node}
 *   {type:'number',    value:number}
 *   {type:'ident',     value:string}
 *   {type:'literal',   value:boolean}   // 空式 = 常に真
 */

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const TOKEN_TYPE = Object.freeze({
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  AND: 'AND',
  OR: 'OR',
  OP: 'OP',
  WORD: 'WORD',
  EOF: 'EOF',
});

const WORD_CHAR_RE = /[A-Za-z0-9_.\-]/;

/**
 * 条件式をトークン列に分割する。
 * WORD は [-A-Za-z0-9_.]+ にマッチし、パーサー側で number / ident に分類する。
 * これにより "31A"(チーム名) と "200"(数値) を同一フェーズで扱う。
 *
 * @param {string} source
 * @returns {{type:string,value:string,pos:number}[]}
 * @throws {SyntaxError} 不正文字
 */
export function tokenize(source) {
  const text = String(source ?? '');
  const tokens = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\u00a0') {
      i += 1;
      continue;
    }

    const pos = i;

    if (ch === '(') { tokens.push({ type: TOKEN_TYPE.LPAREN, value: '(', pos }); i += 1; continue; }
    if (ch === ')') { tokens.push({ type: TOKEN_TYPE.RPAREN, value: ')', pos }); i += 1; continue; }
    if (ch === ',') { tokens.push({ type: TOKEN_TYPE.COMMA, value: ',', pos }); i += 1; continue; }

    if (ch === '&' && text[i + 1] === '&') { tokens.push({ type: TOKEN_TYPE.AND, value: '&&', pos }); i += 2; continue; }
    if (ch === '|' && text[i + 1] === '|') { tokens.push({ type: TOKEN_TYPE.OR, value: '||', pos }); i += 2; continue; }

    if ((ch === '=' || ch === '!' || ch === '>' || ch === '<') && text[i + 1] === '=') {
      tokens.push({ type: TOKEN_TYPE.OP, value: ch + '=', pos }); i += 2; continue;
    }
    if (ch === '>' || ch === '<') {
      tokens.push({ type: TOKEN_TYPE.OP, value: ch, pos }); i += 1; continue;
    }
    if (ch === '=' || ch === '!') {
      throw new SyntaxError(`Unexpected '${ch}' at position ${pos} in condition: ${text}`);
    }

    if (WORD_CHAR_RE.test(ch)) {
      let j = i + 1;
      while (j < len && WORD_CHAR_RE.test(text[j])) j += 1;
      tokens.push({ type: TOKEN_TYPE.WORD, value: text.slice(i, j), pos });
      i = j;
      continue;
    }

    throw new SyntaxError(`Unexpected character '${ch}' at position ${pos} in condition: ${text}`);
  }

  tokens.push({ type: TOKEN_TYPE.EOF, value: '', pos: len });
  return tokens;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

function isNumericWord(word) {
  return NUMBER_RE.test(word);
}

function makeOperandFromWord(token) {
  if (isNumericWord(token.value)) {
    return { type: 'number', value: Number(token.value) };
  }
  return { type: 'ident', value: token.value };
}

// ---------------------------------------------------------------------------
// Recursive descent parser
// ---------------------------------------------------------------------------

class Parser {
  constructor(tokens, source) {
    this.tokens = tokens;
    this.source = source;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }

  expect(type, value = null) {
    const tok = this.peek();
    if (tok.type !== type || (value !== null && tok.value !== value)) {
      throw new SyntaxError(
        `Expected ${type}${value ? `('${value}')` : ''} but got ${tok.type}('${tok.value}') at position ${tok.pos} in condition: ${this.source}`
      );
    }
    return this.next();
  }

  /** orExpr := andExpr ('||' andExpr)* */
  parseOr() {
    let node = this.parseAnd();
    while (this.peek().type === TOKEN_TYPE.OR) {
      this.next();
      const right = this.parseAnd();
      node = this.mergeBinary('or', node, right);
    }
    return node;
  }

  /** andExpr := comparison ('&&' comparison)* */
  parseAnd() {
    let node = this.parseComparison();
    while (this.peek().type === TOKEN_TYPE.AND) {
      this.next();
      const right = this.parseComparison();
      node = this.mergeBinary('and', node, right);
    }
    return node;
  }

  /** 同種二項ノードをフラット化: {and,[a,b]} && c -> {and,[a,b,c]} */
  mergeBinary(type, left, right) {
    if (left.type === type && right.type === type) {
      return { type, children: [...left.children, ...right.children] };
    }
    if (left.type === type) {
      return { type, children: [...left.children, right] };
    }
    if (right.type === type) {
      return { type, children: [left, ...right.children] };
    }
    return { type, children: [left, right] };
  }

  /** comparison := operand (compareOp operand)? */
  parseComparison() {
    const left = this.parseOperand();
    if (this.peek().type === TOKEN_TYPE.OP) {
      const op = this.next().value;
      const right = this.parseOperand();
      return { type: 'compare', op, left, right };
    }
    return left;
  }

  /** operand := WORD -> call (if '(' follows) | literal */
  parseOperand() {
    const tok = this.peek();
    if (tok.type !== TOKEN_TYPE.WORD) {
      throw new SyntaxError(
        `Expected operand but got ${tok.type}('${tok.value}') at position ${tok.pos} in condition: ${this.source}`
      );
    }
    const nextTok = this.tokens[this.pos + 1];
    if (nextTok && nextTok.type === TOKEN_TYPE.LPAREN) {
      return this.parseCall();
    }
    this.next();
    return makeOperandFromWord(tok);
  }

  /** call := WORD '(' argList? ')' ; CountBC は特別扱い */
  parseCall() {
    const nameTok = this.expect(TOKEN_TYPE.WORD);
    const name = nameTok.value;
    this.expect(TOKEN_TYPE.LPAREN);

    if (name === 'CountBC') {
      return this.parseCountBc();
    }

    const args = this.parseArgList();
    this.expect(TOKEN_TYPE.RPAREN);
    return { type: 'call', name, args };
  }

  /** CountBC '(' orExpr ')' (compareOp number)? */
  parseCountBc() {
    const inner = this.parseOr();
    this.expect(TOKEN_TYPE.RPAREN);

    if (this.peek().type === TOKEN_TYPE.OP) {
      const op = this.next().value;
      const rhs = this.parseOperand();
      return { type: 'countBc', inner, op, rhs };
    }
    return { type: 'countBc', inner, op: '!=', rhs: { type: 'number', value: 0 } };
  }

  /** argList := arg (',' arg)* */
  parseArgList() {
    const args = [];
    if (this.peek().type === TOKEN_TYPE.RPAREN) return args;
    args.push(this.parseArg());
    while (this.peek().type === TOKEN_TYPE.COMMA) {
      this.next();
      args.push(this.parseArg());
    }
    return args;
  }

  parseArg() {
    const tok = this.peek();
    if (tok.type !== TOKEN_TYPE.WORD) {
      throw new SyntaxError(
        `Expected argument but got ${tok.type}('${tok.value}') at position ${tok.pos} in condition: ${this.source}`
      );
    }
    this.next();
    return makeOperandFromWord(tok);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 条件式を AST に構文解析する（安全版）。
 * @param {string} expression
 * @returns {{ok:true, ast:object} | {ok:false, error:string, position:number}}
 */
export function parseCondition(expression) {
  const source = String(expression ?? '').trim();
  if (!source) {
    return { ok: true, ast: { type: 'literal', value: true } };
  }
  try {
    const tokens = tokenize(source);
    const parser = new Parser(tokens, source);
    const ast = parser.parseOr();
    const tail = parser.peek();
    if (tail.type !== TOKEN_TYPE.EOF) {
      return {
        ok: false,
        error: `Trailing tokens after expression: '${tail.value}' at position ${tail.pos}`,
        position: tail.pos,
      };
    }
    return { ok: true, ast };
  } catch (e) {
    return { ok: false, error: e.message, position: -1 };
  }
}

/**
 * parseCondition の例外投げ版。
 * @param {string} expression
 * @returns {object} AST
 * @throws {Error} 構文エラー時
 */
export function parseConditionOrThrow(expression) {
  const result = parseCondition(expression);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.ast;
}

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  switch (node.type) {
    case 'or':
    case 'and':
      for (const child of node.children) walkAst(child, visit);
      break;
    case 'compare':
      walkAst(node.left, visit);
      walkAst(node.right, visit);
      break;
    case 'countBc':
      walkAst(node.inner, visit);
      walkAst(node.rhs, visit);
      break;
    default:
      break;
  }
}

/**
 * AST から、参照している全述語関数名の Set を抽出する。
 * @param {object} ast
 * @returns {Set<string>}
 */
export function extractFunctionNames(ast) {
  const names = new Set();
  walkAst(ast, (node) => {
    if (node.type === 'call' || node.type === 'countBc') {
      names.add(node.name ?? 'CountBC');
    }
  });
  return names;
}

/**
 * AST を人間可読な文字列に正規化する（デバッグ・スナップショット用）。
 * @param {object} ast
 * @returns {string}
 */
export function stringifyAst(ast) {
  if (!ast || typeof ast !== 'object') return String(ast ?? '');
  switch (ast.type) {
    case 'literal':
      return String(ast.value);
    case 'or':
      return ast.children.map(stringifyAst).join(' || ');
    case 'and':
      return ast.children.map(stringifyAst).join(' && ');
    case 'compare':
      return `${stringifyOperand(ast.left)} ${ast.op} ${stringifyOperand(ast.right)}`;
    case 'countBc':
      return `CountBC(${stringifyAst(ast.inner)}) ${ast.op} ${stringifyOperand(ast.rhs)}`;
    case 'call':
      return `${ast.name}(${ast.args.map(stringifyOperand).join(', ')})`;
    case 'number':
    case 'ident':
      return String(ast.value);
    default:
      return JSON.stringify(ast);
  }
}

function stringifyOperand(node) {
  if (!node) return '';
  if (node.type === 'call') {
    return `${node.name}(${node.args.map(stringifyOperand).join(', ')})`;
  }
  return String(node.value ?? '');
}
