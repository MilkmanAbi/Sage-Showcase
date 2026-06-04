/*!
 * Sage REPL — Browser Emulator
 * A self-contained JavaScript emulator of the Sage language REPL.
 *
 * Usage:
 *   1. Add <div id="sage-repl"></div> anywhere in your HTML.
 *   2. Include this script: <script src="sage-repl.js"></script>
 *   3. Done. The REPL initialises itself on DOMContentLoaded.
 *
 * The emulator implements: variables (let/var/typed), procs, closures,
 * classes, structs + impl, enums, ADT pattern matching, generators,
 * for/while loops, try/catch/raise, defer, null coalescing, arrays,
 * dicts, Python + C FFI stubs, LilyBox stubs, and Firefly-style errors.
 */
(function (global) {
  'use strict';

  const VERSION   = '0.2.0-alpha';
  const FIREFLY_G = '✦';
  const PROMPT    = 'sage❯ ';
  const CONT      = '    … ';

  // ── Token types ─────────────────────────────────────────────────────────────
  const TT = {
    NUMBER:'NUMBER', STRING:'STRING', BOOL:'BOOL', NONE:'NONE', IDENT:'IDENT',
    PLUS:'PLUS', MINUS:'MINUS', STAR:'STAR', SLASH:'SLASH',
    DOUBLESLASH:'DOUBLESLASH', PERCENT:'PERCENT', STARSTAR:'STARSTAR',
    EQ:'EQ', NEQ:'NEQ', LT:'LT', GT:'GT', LEQ:'LEQ', GEQ:'GEQ',
    ASSIGN:'ASSIGN', PLUSASSIGN:'PLUSASSIGN', MINUSASSIGN:'MINUSASSIGN',
    STARASSIGN:'STARASSIGN', SLASHASSIGN:'SLASHASSIGN',
    ARROW:'ARROW', NULLCOAL:'NULLCOAL', PROPAGATE:'PROPAGATE',
    LPAREN:'LPAREN', RPAREN:'RPAREN', LBRACKET:'LBRACKET', RBRACKET:'RBRACKET',
    LBRACE:'LBRACE', RBRACE:'RBRACE',
    COMMA:'COMMA', COLON:'COLON', DOT:'DOT', AT:'AT',
    NEWLINE:'NEWLINE', INDENT:'INDENT', DEDENT:'DEDENT', EOF:'EOF',
    LET:'LET', VAR:'VAR', PROC:'PROC', IF:'IF', ELIF:'ELIF', ELSE:'ELSE',
    WHILE:'WHILE', FOR:'FOR', IN:'IN', RETURN:'RETURN', IMPORT:'IMPORT',
    CLASS:'CLASS', STRUCT:'STRUCT', IMPL:'IMPL', ENUM:'ENUM',
    MATCH:'MATCH', CASE:'CASE', TRY:'TRY', CATCH:'CATCH',
    RAISE:'RAISE', DEFER:'DEFER', YIELD:'YIELD',
    AND:'AND', OR:'OR', NOT:'NOT',
    BREAK:'BREAK', CONTINUE:'CONTINUE', SUPER:'SUPER', PASS:'PASS',
    INT_T:'INT_T', STR_T:'STR_T', FLOAT_T:'FLOAT_T', BOOL_T:'BOOL_T',
  };

  const KEYWORDS = {
    'let':TT.LET,'var':TT.VAR,'proc':TT.PROC,'if':TT.IF,'elif':TT.ELIF,
    'else':TT.ELSE,'while':TT.WHILE,'for':TT.FOR,'in':TT.IN,
    'return':TT.RETURN,'import':TT.IMPORT,'class':TT.CLASS,
    'struct':TT.STRUCT,'impl':TT.IMPL,'enum':TT.ENUM,
    'match':TT.MATCH,'case':TT.CASE,'try':TT.TRY,'catch':TT.CATCH,
    'raise':TT.RAISE,'defer':TT.DEFER,'yield':TT.YIELD,
    'and':TT.AND,'or':TT.OR,'not':TT.NOT,
    'break':TT.BREAK,'continue':TT.CONTINUE,'super':TT.SUPER,'pass':TT.PASS,
    'true':TT.BOOL,'false':TT.BOOL,'None':TT.NONE,
    'int':TT.INT_T,'str':TT.STR_T,'float':TT.FLOAT_T,'bool':TT.BOOL_T,
  };

  const TYPE_KWS = new Set([TT.INT_T, TT.STR_T, TT.FLOAT_T, TT.BOOL_T]);

  // ── Token ────────────────────────────────────────────────────────────────────
  class Token {
    constructor(type, value, line, col) {
      this.type = type; this.value = value; this.line = line; this.col = col;
    }
  }

  // ── Lexer ────────────────────────────────────────────────────────────────────
  class Lexer {
    constructor(source) {
      this.source = source;
      this.pos = 0; this.line = 1; this.col = 1;
      this.indentStack = [0];
      this.tokens = [];
      this.atLineStart = true;
      this.parenDepth = 0;
      this._run();
    }

    _peek(n = 0) { return this.source[this.pos + n] || '\0'; }
    _adv() {
      const c = this.source[this.pos++];
      if (c === '\n') { this.line++; this.col = 1; } else { this.col++; }
      return c;
    }
    _push(type, value, line, col) { this.tokens.push(new Token(type, value, line, col)); }

    _skipComment() { while (this.pos < this.source.length && this._peek() !== '\n') this.pos++; }

    _readStr(q) {
      this._adv();
      let s = '';
      while (this.pos < this.source.length) {
        const c = this._peek();
        if (c === q) { this._adv(); break; }
        if (c === '\\') {
          this._adv();
          const e = this._adv();
          s += ({n:'\n',t:'\t',r:'\r','\\':'\\','"':'"',"'":"'"}[e] ?? ('\\'+e));
        } else { s += this._adv(); }
      }
      return s;
    }

    _readNum() {
      let s = '';
      // hex
      if (this._peek() === '0' && (this._peek(1) === 'x' || this._peek(1) === 'X')) {
        this._adv(); this._adv();
        while (/[0-9a-fA-F_]/.test(this._peek())) { const c=this._adv(); if(c!=='_') s+=c; }
        return parseInt(s||'0', 16);
      }
      // binary
      if (this._peek() === '0' && (this._peek(1) === 'b' || this._peek(1) === 'B')) {
        this._adv(); this._adv();
        while (/[01_]/.test(this._peek())) { const c=this._adv(); if(c!=='_') s+=c; }
        return parseInt(s||'0', 2);
      }
      while (/[0-9_]/.test(this._peek())) { const c=this._adv(); if(c!=='_') s+=c; }
      if (this._peek() === '.' && /[0-9]/.test(this._peek(1))) {
        s += this._adv();
        while (/[0-9_]/.test(this._peek())) { const c=this._adv(); if(c!=='_') s+=c; }
        return parseFloat(s);
      }
      return parseInt(s, 10);
    }

    _handleIndent() {
      let spaces = 0;
      while (this._peek() === ' ')  { spaces++;    this._adv(); }
      while (this._peek() === '\t') { spaces += 4; this._adv(); }
      const c = this._peek();
      if (c === '\n' || c === '\r' || c === '#' || c === '\0') return;
      const cur = this.indentStack[this.indentStack.length - 1];
      if (spaces > cur) {
        this.indentStack.push(spaces);
        this._push(TT.INDENT, spaces, this.line, 1);
      } else if (spaces < cur) {
        while (this.indentStack.length > 1 && this.indentStack[this.indentStack.length-1] > spaces) {
          this.indentStack.pop();
          this._push(TT.DEDENT, null, this.line, 1);
        }
      }
    }

    _run() {
      while (this.pos < this.source.length) {
        if (this.atLineStart && this.parenDepth === 0) {
          this.atLineStart = false;
          this._handleIndent();
        }
        const c = this._peek();
        if (!c || c === '\0') break;
        if (c === ' ' || c === '\t') { this._adv(); continue; }
        if (c === '\r') { this._adv(); continue; }
        if (c === '\n') {
          this._adv();
          if (this.parenDepth === 0) {
            this._push(TT.NEWLINE, null, this.line-1, this.col);
            this.atLineStart = true;
          }
          continue;
        }
        if (c === '#') { this._skipComment(); continue; }
        if (c === '"' || c === "'") {
          const l=this.line, col=this.col;
          this._push(TT.STRING, this._readStr(c), l, col); continue;
        }
        if (/[0-9]/.test(c)) {
          const l=this.line, col=this.col;
          this._push(TT.NUMBER, this._readNum(), l, col); continue;
        }
        if (/[a-zA-Z_]/.test(c)) {
          const l=this.line, col=this.col;
          let id = '';
          while (/[a-zA-Z0-9_]/.test(this._peek())) id += this._adv();
          if (id in KEYWORDS) {
            const ty = KEYWORDS[id];
            const val = ty === TT.BOOL ? id === 'true' : ty === TT.NONE ? null : id;
            this._push(ty, val, l, col);
          } else { this._push(TT.IDENT, id, l, col); }
          continue;
        }
        if (c === '@') {
          const l=this.line, col=this.col; this._adv();
          let id=''; while (/[a-zA-Z0-9_]/.test(this._peek())) id += this._adv();
          this._push(TT.AT, id, l, col); continue;
        }
        const l=this.line, col=this.col; this._adv();
        switch(c) {
          case '+': if(this._peek()==='='){this._adv();this._push(TT.PLUSASSIGN,null,l,col);}else this._push(TT.PLUS,null,l,col); break;
          case '-': if(this._peek()==='>'){this._adv();this._push(TT.ARROW,null,l,col);}else if(this._peek()==='='){this._adv();this._push(TT.MINUSASSIGN,null,l,col);}else this._push(TT.MINUS,null,l,col); break;
          case '*': if(this._peek()==='*'){this._adv();this._push(TT.STARSTAR,null,l,col);}else if(this._peek()==='='){this._adv();this._push(TT.STARASSIGN,null,l,col);}else this._push(TT.STAR,null,l,col); break;
          case '/': if(this._peek()==='/'){this._adv();this._push(TT.DOUBLESLASH,null,l,col);}else if(this._peek()==='='){this._adv();this._push(TT.SLASHASSIGN,null,l,col);}else this._push(TT.SLASH,null,l,col); break;
          case '%': this._push(TT.PERCENT,null,l,col); break;
          case '=': if(this._peek()==='='){this._adv();this._push(TT.EQ,null,l,col);}else this._push(TT.ASSIGN,null,l,col); break;
          case '!': if(this._peek()==='='){this._adv();this._push(TT.NEQ,null,l,col);} break;
          case '<': if(this._peek()==='='){this._adv();this._push(TT.LEQ,null,l,col);}else this._push(TT.LT,null,l,col); break;
          case '>': if(this._peek()==='='){this._adv();this._push(TT.GEQ,null,l,col);}else this._push(TT.GT,null,l,col); break;
          case '?': if(this._peek()==='?'){this._adv();this._push(TT.NULLCOAL,null,l,col);}else if(this._peek()==='!'){this._adv();this._push(TT.PROPAGATE,null,l,col);} break;
          case '(': this.parenDepth++; this._push(TT.LPAREN,null,l,col); break;
          case ')': this.parenDepth--; this._push(TT.RPAREN,null,l,col); break;
          case '[': this.parenDepth++; this._push(TT.LBRACKET,null,l,col); break;
          case ']': this.parenDepth--; this._push(TT.RBRACKET,null,l,col); break;
          case '{': this.parenDepth++; this._push(TT.LBRACE,null,l,col); break;
          case '}': this.parenDepth--; this._push(TT.RBRACE,null,l,col); break;
          case ',': this._push(TT.COMMA,null,l,col); break;
          case ':': this._push(TT.COLON,null,l,col); break;
          case '.': this._push(TT.DOT,null,l,col); break;
        }
      }
      while (this.indentStack.length > 1) {
        this.indentStack.pop();
        this._push(TT.DEDENT, null, this.line, 1);
      }
      this._push(TT.EOF, null, this.line, 1);
    }
  }

  // ── Parse error ──────────────────────────────────────────────────────────────
  class ParseError extends Error { constructor(msg, line, col) { super(msg); this.line=line; this.col=col; } }

  // ── Parser ───────────────────────────────────────────────────────────────────
  class Parser {
    constructor(tokens) {
      this.tokens = tokens;
      this.pos = 0;
    }

    _peek(n=0) { return this.tokens[Math.min(this.pos+n, this.tokens.length-1)]; }
    _cur()     { return this._peek(0); }
    _adv()     { const t=this._cur(); if(t.type!==TT.EOF) this.pos++; return t; }
    _check(type) { return this._cur().type === type; }
    _match(...types) { if(types.includes(this._cur().type)){return this._adv();} return null; }
    _eat(type, msg) {
      if(this._cur().type===type) return this._adv();
      const t=this._cur();
      throw new ParseError(msg||`expected ${type}, got ${t.type} ('${t.value}')`, t.line, t.col);
    }
    _skipNewlines() { while(this._check(TT.NEWLINE)) this._adv(); }

    parse() {
      this._skipNewlines();
      const stmts = [];
      while (!this._check(TT.EOF)) {
        if (this._check(TT.NEWLINE)) { this._adv(); continue; }
        stmts.push(this._stmt());
      }
      return { type:'Program', body: stmts };
    }

    _block() {
      // When inside parentheses the lexer suppresses NEWLINE/INDENT tokens.
      // Detect that case and fall back to a single-statement inline block.
      if (!this._check(TT.NEWLINE) && !this._check(TT.INDENT)) {
        const stmt = this._inlineStmt();
        return stmt ? [stmt] : [];
      }
      this._match(TT.NEWLINE);
      if (!this._check(TT.INDENT)) {
        // Still no INDENT — single statement follows (e.g. same-line block after NEWLINE absorbed)
        const stmt = this._inlineStmt();
        return stmt ? [stmt] : [];
      }
      this._eat(TT.INDENT, 'expected indent');
      const stmts = [];
      while (!this._check(TT.DEDENT) && !this._check(TT.EOF)) {
        if (this._check(TT.NEWLINE)) { this._adv(); continue; }
        stmts.push(this._stmt());
      }
      this._match(TT.DEDENT);
      return stmts;
    }

    // Parse a single statement for inline proc bodies (inside parens, no indent tokens).
    _inlineStmt() {
      const t = this._cur();
      if (t.type === TT.RETURN) {
        this._adv();
        const noVal = this._check(TT.RPAREN) || this._check(TT.COMMA) ||
                      this._check(TT.NEWLINE) || this._check(TT.EOF);
        const v = noVal ? null : this._expr();
        this._match(TT.NEWLINE);
        return { type:'Return', value:v, line:t.line };
      }
      if (t.type === TT.RAISE) {
        this._adv();
        const v = this._expr();
        this._match(TT.NEWLINE);
        return { type:'Raise', value:v, line:t.line };
      }
      if (t.type === TT.PASS) { this._adv(); this._match(TT.NEWLINE); return { type:'Pass', line:t.line }; }
      const expr = this._expr();
      const augOps = [TT.PLUSASSIGN,TT.MINUSASSIGN,TT.STARASSIGN,TT.SLASHASSIGN];
      const aug = augOps.find(op=>this._check(op));
      if (aug) {
        const op=this._adv(); const rhs=this._expr(); this._match(TT.NEWLINE);
        return { type:'AugAssign', op:op.type, target:expr, value:rhs, line:op.line };
      }
      if (this._check(TT.ASSIGN)) {
        const eq=this._adv(); const rhs=this._expr(); this._match(TT.NEWLINE);
        return { type:'Assign', target:expr, value:rhs, line:eq.line };
      }
      this._match(TT.NEWLINE);
      return { type:'ExprStmt', expr, line:expr.line||0 };
    }

    _stmt() {
      const t = this._cur();
      // Decorator: @manual:
      if (t.type === TT.AT) { this._adv(); return this._manualBlock(t.value); }
      if (t.type === TT.PROC)    return this._procDef();
      if (t.type === TT.CLASS)   return this._classDef();
      if (t.type === TT.STRUCT)  return this._structDef();
      if (t.type === TT.IMPL)    return this._implBlock();
      if (t.type === TT.ENUM)    return this._enumDef();
      if (t.type === TT.IF)      return this._ifStmt();
      if (t.type === TT.WHILE)   return this._whileStmt();
      if (t.type === TT.FOR)     return this._forStmt();
      if (t.type === TT.MATCH)   return this._matchStmt();
      if (t.type === TT.TRY)     return this._tryStmt();
      if (t.type === TT.DEFER)   return this._deferStmt();
      if (t.type === TT.RETURN)  { this._adv(); const v=this._check(TT.NEWLINE)||this._check(TT.EOF)?null:this._expr(); this._match(TT.NEWLINE); return {type:'Return',value:v,line:t.line}; }
      if (t.type === TT.RAISE)   { this._adv(); const v=this._expr(); this._match(TT.NEWLINE); return {type:'Raise',value:v,line:t.line}; }
      if (t.type === TT.YIELD)   { this._adv(); const v=this._expr(); this._match(TT.NEWLINE); return {type:'Yield',value:v,line:t.line}; }
      if (t.type === TT.BREAK)   { this._adv(); this._match(TT.NEWLINE); return {type:'Break',line:t.line}; }
      if (t.type === TT.CONTINUE){ this._adv(); this._match(TT.NEWLINE); return {type:'Continue',line:t.line}; }
      if (t.type === TT.PASS)    { this._adv(); this._match(TT.NEWLINE); return {type:'Pass',line:t.line}; }
      if (t.type === TT.IMPORT)  return this._importStmt();
      if (t.type === TT.LET || t.type === TT.VAR) return this._letVar();
      if (TYPE_KWS.has(t.type))  return this._typedDecl();
      // expression or assignment
      return this._exprOrAssign();
    }

    _letVar() {
      const kw = this._adv(); // let or var
      const isVar = kw.type === TT.VAR;
      let typeName = null;
      // Optional type annotation: let int x = ...
      if (TYPE_KWS.has(this._cur().type)) typeName = this._adv().value;
      const name = this._eat(TT.IDENT, 'expected variable name').value;
      let value = null;
      if (this._match(TT.ASSIGN)) value = this._expr();
      this._match(TT.NEWLINE);
      return { type:'Decl', mutable:isVar, typeName, name, value, line:kw.line };
    }

    _typedDecl() {
      // int x = 5  /  str name = "hello"
      const typeTok = this._adv();
      const name = this._eat(TT.IDENT, 'expected variable name after type').value;
      let value = null;
      if (this._match(TT.ASSIGN)) value = this._expr();
      this._match(TT.NEWLINE);
      return { type:'Decl', mutable:true, typeName:typeTok.value, name, value, line:typeTok.line };
    }

    _exprOrAssign() {
      const expr = this._expr();
      // augmented assignment
      const augOps = [TT.PLUSASSIGN,TT.MINUSASSIGN,TT.STARASSIGN,TT.SLASHASSIGN];
      const aug = augOps.find(op=>this._check(op));
      if (aug) {
        const op = this._adv();
        const rhs = this._expr();
        this._match(TT.NEWLINE);
        return { type:'AugAssign', op:op.type, target:expr, value:rhs, line:op.line };
      }
      if (this._check(TT.ASSIGN)) {
        const eq = this._adv();
        const rhs = this._expr();
        this._match(TT.NEWLINE);
        return { type:'Assign', target:expr, value:rhs, line:eq.line };
      }
      this._match(TT.NEWLINE);
      return { type:'ExprStmt', expr, line:expr.line||0 };
    }

    _procDef() {
      const kw = this._eat(TT.PROC);
      const name = this._eat(TT.IDENT, 'expected proc name').value;
      this._eat(TT.LPAREN);
      const params = [];
      while (!this._check(TT.RPAREN) && !this._check(TT.EOF)) {
        let pname, ptype=null, defaultVal=null;
        if (this._check(TT.STAR)) { this._adv(); pname='*'+this._eat(TT.IDENT).value; }
        else {
          pname = this._eat(TT.IDENT,'expected param name').value;
          if (this._match(TT.COLON)) {
            // consume optional type
            if (TYPE_KWS.has(this._cur().type)) ptype = this._adv().value;
            else if (this._check(TT.IDENT)) ptype = this._adv().value;
          }
          if (this._match(TT.ASSIGN)) defaultVal = this._expr();
        }
        params.push({name:pname, type:ptype, default:defaultVal});
        if (!this._match(TT.COMMA)) break;
      }
      this._eat(TT.RPAREN);
      let returnType = null;
      if (this._match(TT.ARROW)) {
        if (TYPE_KWS.has(this._cur().type)) returnType = this._adv().value;
        else if (this._check(TT.IDENT)) returnType = this._adv().value;
      }
      this._eat(TT.COLON, 'expected : after proc signature');
      const body = this._block();
      const isGen = this._hasYield(body);
      return { type:'ProcDef', name, params, returnType, body, isGenerator:isGen, line:kw.line };
    }

    _hasYield(stmts) {
      for (const s of stmts) {
        if (!s) continue;
        if (s.type === 'Yield') return true;
        if (s.body && this._hasYield(Array.isArray(s.body)?s.body:[s.body])) return true;
        if (s.then && this._hasYield(s.then)) return true;
        if (s.else_ && this._hasYield(s.else_)) return true;
        if (s.elifs) for(const e of s.elifs) if(this._hasYield(e.body)) return true;
        if (s.cases) for(const c of s.cases) if(this._hasYield(c.body)) return true;
      }
      return false;
    }

    _classDef() {
      const kw = this._eat(TT.CLASS);
      const name = this._eat(TT.IDENT).value;
      let parent = null;
      if (this._match(TT.LPAREN)) {
        if (!this._check(TT.RPAREN)) parent = this._eat(TT.IDENT).value;
        this._eat(TT.RPAREN);
      }
      this._eat(TT.COLON);
      const body = this._block();
      return { type:'ClassDef', name, parent, body, line:kw.line };
    }

    _structDef() {
      const kw = this._eat(TT.STRUCT);
      const name = this._eat(TT.IDENT).value;
      this._eat(TT.COLON);
      this._eat(TT.NEWLINE); this._eat(TT.INDENT, 'expected indent for struct body');
      const fields = [];
      while (!this._check(TT.DEDENT) && !this._check(TT.EOF)) {
        if (this._check(TT.NEWLINE)) { this._adv(); continue; }
        const fname = this._eat(TT.IDENT).value;
        this._eat(TT.COLON);
        let ftype = null;
        if (TYPE_KWS.has(this._cur().type)) ftype = this._adv().value;
        else if (this._check(TT.IDENT)) ftype = this._adv().value;
        fields.push({ name:fname, type:ftype });
        this._match(TT.NEWLINE);
      }
      this._match(TT.DEDENT);
      return { type:'StructDef', name, fields, line:kw.line };
    }

    _implBlock() {
      const kw = this._eat(TT.IMPL);
      const name = this._eat(TT.IDENT).value;
      this._eat(TT.COLON);
      const body = this._block();
      return { type:'ImplBlock', name, body, line:kw.line };
    }

    _enumDef() {
      const kw = this._eat(TT.ENUM);
      const name = this._eat(TT.IDENT).value;
      this._eat(TT.COLON);
      this._eat(TT.NEWLINE); this._eat(TT.INDENT, 'expected indent for enum body');
      const variants = [];
      while (!this._check(TT.DEDENT) && !this._check(TT.EOF)) {
        if (this._check(TT.NEWLINE)) { this._adv(); continue; }
        const vname = this._eat(TT.IDENT).value;
        const fields = [];
        if (this._match(TT.LPAREN)) {
          while (!this._check(TT.RPAREN) && !this._check(TT.EOF)) {
            const fn = this._eat(TT.IDENT).value;
            let ft = null;
            if (this._match(TT.COLON)) {
              if (TYPE_KWS.has(this._cur().type)) ft = this._adv().value;
              else if (this._check(TT.IDENT)) ft = this._adv().value;
            }
            fields.push({name:fn,type:ft});
            if (!this._match(TT.COMMA)) break;
          }
          this._eat(TT.RPAREN);
        }
        variants.push({name:vname, fields});
        this._match(TT.NEWLINE);
      }
      this._match(TT.DEDENT);
      return { type:'EnumDef', name, variants, line:kw.line };
    }

    _ifStmt() {
      const kw = this._eat(TT.IF);
      const condition = this._expr();
      this._eat(TT.COLON);
      const then = this._block();
      const elifs = [];
      let else_ = null;
      while (this._check(TT.ELIF)) {
        this._adv();
        const ec = this._expr(); this._eat(TT.COLON);
        elifs.push({ condition:ec, body:this._block() });
      }
      if (this._match(TT.ELSE)) { this._eat(TT.COLON); else_ = this._block(); }
      return { type:'If', condition, then, elifs, else_, line:kw.line };
    }

    _whileStmt() {
      const kw = this._eat(TT.WHILE);
      const condition = this._expr();
      this._eat(TT.COLON);
      const body = this._block();
      return { type:'While', condition, body, line:kw.line };
    }

    _forStmt() {
      const kw = this._eat(TT.FOR);
      const vars = [this._eat(TT.IDENT).value];
      while (this._match(TT.COMMA)) vars.push(this._eat(TT.IDENT).value);
      this._eat(TT.IN);
      const iterable = this._expr();
      this._eat(TT.COLON);
      const body = this._block();
      return { type:'For', vars, iterable, body, line:kw.line };
    }

    _matchStmt() {
      const kw = this._eat(TT.MATCH);
      const subject = this._expr();
      this._eat(TT.COLON);
      this._eat(TT.NEWLINE); this._eat(TT.INDENT, 'expected indent for match body');
      const cases = [];
      while (!this._check(TT.DEDENT) && !this._check(TT.EOF)) {
        if (this._check(TT.NEWLINE)) { this._adv(); continue; }
        this._eat(TT.CASE, 'expected case');
        const pattern = this._matchPattern();
        this._eat(TT.COLON);
        const body = this._block();
        cases.push({ pattern, body });
      }
      this._match(TT.DEDENT);
      return { type:'Match', subject, cases, line:kw.line };
    }

    _matchPattern() {
      // Wildcard: _
      if (this._check(TT.IDENT) && this._cur().value === '_') { this._adv(); return {type:'Wildcard'}; }
      // Literal
      if (this._check(TT.NUMBER)||this._check(TT.STRING)||this._check(TT.BOOL)||this._check(TT.NONE)) {
        const t=this._adv(); return {type:'LiteralPat',value:t.type===TT.NONE?null:t.value};
      }
      // Name or Name.Variant(fields)
      let name = this._eat(TT.IDENT).value;
      if (this._check(TT.DOT)) {
        this._adv();
        const variant = this._eat(TT.IDENT).value;
        const bindings = [];
        if (this._match(TT.LPAREN)) {
          while (!this._check(TT.RPAREN)&&!this._check(TT.EOF)) {
            bindings.push(this._eat(TT.IDENT).value);
            if (!this._match(TT.COMMA)) break;
          }
          this._eat(TT.RPAREN);
        }
        return { type:'VariantPat', enumName:name, variant, bindings };
      }
      // Plain binding
      return { type:'BindPat', name };
    }

    _tryStmt() {
      const kw = this._eat(TT.TRY);
      this._eat(TT.COLON);
      const body = this._block();
      this._eat(TT.CATCH);
      const catchVar = this._check(TT.IDENT) ? this._adv().value : 'e';
      this._eat(TT.COLON);
      const catchBody = this._block();
      return { type:'Try', body, catchVar, catchBody, line:kw.line };
    }

    _deferStmt() {
      const kw = this._eat(TT.DEFER);
      this._eat(TT.COLON);
      const body = this._block();
      return { type:'Defer', body, line:kw.line };
    }

    _manualBlock(tag) {
      this._eat(TT.COLON);
      const body = this._block();
      return { type:'ManualBlock', tag, body };
    }

    _importStmt() {
      const kw = this._eat(TT.IMPORT);
      let module = this._eat(TT.IDENT).value;
      while (this._match(TT.DOT)) module += '.' + this._eat(TT.IDENT).value;
      this._match(TT.NEWLINE);
      return { type:'Import', module, line:kw.line };
    }

    // ── Expressions ──────────────────────────────────────────────────────────
    _expr()        { return this._nullCoal(); }
    _nullCoal() {
      let left = this._or();
      while (this._check(TT.NULLCOAL)) {
        const op=this._adv(); left={type:'NullCoal',left,right:this._or(),line:op.line};
      }
      return left;
    }
    _or() {
      let left = this._and();
      while (this._check(TT.OR)) { const op=this._adv(); left={type:'BinOp',op:'or',left,right:this._and(),line:op.line}; }
      return left;
    }
    _and() {
      let left = this._not();
      while (this._check(TT.AND)) { const op=this._adv(); left={type:'BinOp',op:'and',left,right:this._not(),line:op.line}; }
      return left;
    }
    _not() {
      if (this._check(TT.NOT)) { const op=this._adv(); return {type:'UnaryOp',op:'not',operand:this._not(),line:op.line}; }
      return this._cmp();
    }
    _cmp() {
      let left = this._add();
      const CMP=[TT.EQ,TT.NEQ,TT.LT,TT.GT,TT.LEQ,TT.GEQ];
      while (CMP.includes(this._cur().type)) {
        const op=this._adv();
        left={type:'BinOp',op:op.type,left,right:this._add(),line:op.line};
      }
      return left;
    }
    _add() {
      let left = this._mul();
      while (this._check(TT.PLUS)||this._check(TT.MINUS)) {
        const op=this._adv(); left={type:'BinOp',op:op.type,left,right:this._mul(),line:op.line};
      }
      return left;
    }
    _mul() {
      let left = this._unary();
      while ([TT.STAR,TT.SLASH,TT.DOUBLESLASH,TT.PERCENT,TT.STARSTAR].includes(this._cur().type)) {
        const op=this._adv(); left={type:'BinOp',op:op.type,left,right:this._unary(),line:op.line};
      }
      return left;
    }
    _unary() {
      if (this._check(TT.MINUS)) { const op=this._adv(); return {type:'UnaryOp',op:'-',operand:this._unary(),line:op.line}; }
      if (this._check(TT.NOT))   { const op=this._adv(); return {type:'UnaryOp',op:'not',operand:this._unary(),line:op.line}; }
      return this._postfix();
    }
    _postfix() {
      let expr = this._primary();
      while (true) {
        if (this._check(TT.DOT)) {
          const op=this._adv();
          const name = this._eat(TT.IDENT,'expected attribute name').value;
          if (this._check(TT.LPAREN)) {
            const args = this._argList();
            expr = { type:'MethodCall', object:expr, method:name, args, line:op.line };
          } else {
            expr = { type:'Attribute', object:expr, name, line:op.line };
          }
        } else if (this._check(TT.LBRACKET)) {
          const op=this._adv();
          const index = this._expr();
          this._eat(TT.RBRACKET);
          expr = { type:'Index', object:expr, index, line:op.line };
        } else if (this._check(TT.LPAREN)) {
          const args = this._argList();
          expr = { type:'Call', callee:expr, args, line:expr.line };
        } else break;
      }
      return expr;
    }
    _argList() {
      this._eat(TT.LPAREN);
      const args = [];
      const kwargs = [];
      while (!this._check(TT.RPAREN)&&!this._check(TT.EOF)) {
        // keyword arg: name=value
        if (this._check(TT.IDENT)&&this._peek(1).type===TT.ASSIGN) {
          const k=this._adv().value; this._adv();
          kwargs.push({key:k,value:this._expr()});
        } else {
          args.push(this._expr());
        }
        if (!this._match(TT.COMMA)) break;
      }
      this._eat(TT.RPAREN);
      return { positional:args, keyword:kwargs };
    }
    _primary() {
      const t = this._cur();
      if (t.type===TT.NUMBER) { this._adv(); return {type:'Literal',value:t.value,line:t.line}; }
      if (t.type===TT.STRING) { this._adv(); return {type:'Literal',value:t.value,line:t.line}; }
      if (t.type===TT.BOOL)   { this._adv(); return {type:'Literal',value:t.value,line:t.line}; }
      if (t.type===TT.NONE)   { this._adv(); return {type:'Literal',value:null,line:t.line}; }
      if (t.type===TT.IDENT)  { this._adv(); return {type:'Identifier',name:t.value,line:t.line}; }
      // type keywords used as identifiers (str, int, etc. when called as functions)
      if (TYPE_KWS.has(t.type)) { this._adv(); return {type:'Identifier',name:t.value,line:t.line}; }
      if (t.type===TT.LPAREN) {
        this._adv();
        if (this._check(TT.RPAREN)) { this._adv(); return {type:'Literal',value:null,line:t.line}; }
        const e=this._expr();
        // tuple check
        if (this._match(TT.COMMA)) {
          const elems=[e];
          if (!this._check(TT.RPAREN)) { elems.push(this._expr()); while(this._match(TT.COMMA)&&!this._check(TT.RPAREN)) elems.push(this._expr()); }
          this._eat(TT.RPAREN); return {type:'Tuple',elements:elems,line:t.line};
        }
        this._eat(TT.RPAREN); return e;
      }
      if (t.type===TT.LBRACKET) {
        this._adv();
        const elems=[];
        while (!this._check(TT.RBRACKET)&&!this._check(TT.EOF)) {
          elems.push(this._expr()); if(!this._match(TT.COMMA)) break;
        }
        this._eat(TT.RBRACKET); return {type:'ArrayLit',elements:elems,line:t.line};
      }
      if (t.type===TT.LBRACE) {
        this._adv();
        const pairs=[];
        while (!this._check(TT.RBRACE)&&!this._check(TT.EOF)) {
          let k;
          if (this._check(TT.STRING)||this._check(TT.NUMBER)) k={type:'Literal',value:this._adv().value};
          else k={type:'Literal',value:this._eat(TT.IDENT).value};
          this._eat(TT.COLON);
          pairs.push({key:k,value:this._expr()});
          if(!this._match(TT.COMMA)) break;
        }
        this._eat(TT.RBRACE); return {type:'DictLit',pairs,line:t.line};
      }
      // inline proc expr (anonymous)
      if (t.type===TT.PROC) {
        this._adv();
        this._eat(TT.LPAREN);
        const params=[];
        while(!this._check(TT.RPAREN)&&!this._check(TT.EOF)){
          const pn=this._eat(TT.IDENT).value; let pt=null;
          if(this._match(TT.COLON)){if(TYPE_KWS.has(this._cur().type))pt=this._adv().value;else if(this._check(TT.IDENT))pt=this._adv().value;}
          params.push({name:pn,type:pt,default:null}); if(!this._match(TT.COMMA))break;
        }
        this._eat(TT.RPAREN); this._eat(TT.COLON);
        const body=this._block();
        return {type:'ProcExpr',params,body,isGenerator:this._hasYield(body),line:t.line};
      }
      if (t.type===TT.SUPER) {
        this._adv();
        const args = this._check(TT.LPAREN)?this._argList():{positional:[],keyword:[]};
        return {type:'Super',args,line:t.line};
      }
      throw new ParseError(`unexpected token: ${t.type} ('${t.value}')`, t.line, t.col);
    }
  }

  // ── Control flow exceptions ──────────────────────────────────────────────────
  class ReturnSignal  { constructor(v){ this.value=v; } }
  class BreakSignal   {}
  class ContinueSignal{}
  class RaiseSignal   { constructor(v){ this.value=v; } }
  class YieldSignal   { constructor(v){ this.value=v; } }

  // ── Environment ──────────────────────────────────────────────────────────────
  class Env {
    constructor(parent=null) { this.vars=Object.create(null); this.parent=parent; this.defers=[]; }
    define(n,v) { this.vars[n]=v; return v; }
    set(n,v) {
      if (n in this.vars) { this.vars[n]=v; return v; }
      if (this.parent) return this.parent.set(n,v);
      this.vars[n]=v; return v; // auto-define at global if not found
    }
    get(n) {
      if (n in this.vars) return this.vars[n];
      if (this.parent) return this.parent.get(n);
      return undefined;
    }
    has(n) { return n in this.vars || (this.parent?.has(n)??false); }
  }

  // ── Sage value helpers ───────────────────────────────────────────────────────
  function sageStr(v) {
    if (v === null || v === undefined) return 'None';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      return String(v);
    }
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return '[' + v.map(sageStr).join(', ') + ']';
    if (v && v.__type === 'dict') {
      const pairs = [...v.data.entries()].map(([k,val])=>k+': '+sageStr(val));
      return '{' + pairs.join(', ') + '}';
    }
    if (v && v.__type === 'tuple') return '(' + v.items.map(sageStr).join(', ') + ')';
    if (v && v.__type === 'proc') return `<proc ${v.name||'anonymous'}>`;
    if (v && v.__type === 'class') return `<class ${v.name}>`;
    if (v && v.__type === 'enum') return `<enum ${v.name}>`;
    if (v && v.__type === 'variant') {
      if (v.fields&&Object.keys(v.fields).length) {
        const fs=Object.entries(v.fields).map(([k,val])=>k+': '+sageStr(val)).join(', ');
        return `${v.enumName}.${v.variant}(${fs})`;
      }
      return `${v.enumName}.${v.variant}`;
    }
    if (v && v.__type === 'instance') {
      const name = v.__class?.__name||'object';
      if (typeof v.to_str === 'function') return v.to_str();
      if (v.__fields) {
        const fs=Object.entries(v.__fields).map(([k,val])=>k+': '+sageStr(val)).join(', ');
        return `${name}(${fs})`;
      }
      return `<${name} instance>`;
    }
    if (v && v.__type === 'generator') return '<generator>';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function sageBool(v) {
    if (v===null||v===undefined||v===false) return false;
    if (typeof v==='number') return v!==0;
    if (typeof v==='string') return v.length>0;
    if (Array.isArray(v)) return v.length>0;
    return true;
  }

  function sageEq(a,b) {
    if (a===b) return true;
    if (a===null||b===null) return a===b;
    if (Array.isArray(a)&&Array.isArray(b)) {
      if(a.length!==b.length) return false;
      return a.every((v,i)=>sageEq(v,b[i]));
    }
    if (a&&a.__type==='variant'&&b&&b.__type==='variant')
      return a.enumName===b.enumName&&a.variant===b.variant&&JSON.stringify(a.fields)===JSON.stringify(b.fields);
    return false;
  }

  // ── Evaluator ────────────────────────────────────────────────────────────────
  class Evaluator {
    constructor(outputFn) {
      this.output = outputFn;
      this.globalEnv = new Env();
      this._setupBuiltins(this.globalEnv);
      this.callDepth = 0;
      this.maxDepth  = 500;
    }

    _setupBuiltins(env) {
      const self = this;
      const bi = (fn) => ({__type:'builtin',fn});

      env.define('println', bi((...args)=>{ self.output(args.map(sageStr).join(' ')); return null; }));
      env.define('print',   bi((...args)=>{ self.output(args.map(sageStr).join(' '), false); return null; }));
      env.define('str',     bi((v)=>sageStr(v)));
      env.define('int',     bi((v)=>{ if(typeof v==='number') return Math.trunc(v); const n=parseInt(v,10); if(isNaN(n)) throw new RaiseSignal(`cannot convert '${sageStr(v)}' to int`); return n; }));
      env.define('float',   bi((v)=>{ const n=parseFloat(v); if(isNaN(n)) throw new RaiseSignal(`cannot convert '${sageStr(v)}' to float`); return n; }));
      env.define('bool',    bi((v)=>sageBool(v)));
      env.define('len',     bi((v)=>{ if(Array.isArray(v))return v.length; if(typeof v==='string')return v.length; if(v&&v.__type==='dict')return v.data.size; throw new RaiseSignal(`len() does not support ${typeof v}`); }));
      env.define('type',    bi((v)=>{ if(v===null)return 'None'; if(typeof v==='boolean')return 'bool'; if(typeof v==='number')return Number.isInteger(v)?'int':'float'; if(typeof v==='string')return 'str'; if(Array.isArray(v))return 'array'; if(v.__type)return v.__type; return typeof v; }));
      env.define('range',   bi((a,b,step=1)=>{ const arr=[]; if(b===undefined){b=a;a=0;} for(let i=a;step>0?i<b:i>b;i+=step) arr.push(i); return arr; }));
      env.define('abs',     bi((v)=>Math.abs(v)));
      env.define('max',     bi((...args)=>{ const flat=args.flat(); return flat.reduce((a,b)=>a>b?a:b); }));
      env.define('min',     bi((...args)=>{ const flat=args.flat(); return flat.reduce((a,b)=>a<b?a:b); }));
      env.define('round',   bi((v,n=0)=>{ const f=10**n; return Math.round(v*f)/f; }));
      env.define('floor',   bi((v)=>Math.floor(v)));
      env.define('ceil',    bi((v)=>Math.ceil(v)));
      env.define('sqrt',    bi((v)=>Math.sqrt(v)));
      env.define('pow',     bi((a,b)=>Math.pow(a,b)));
      env.define('sorted',  bi((arr,rev=false)=>{ const c=[...arr].sort((a,b)=>typeof a==='number'?a-b:String(a).localeCompare(String(b))); return rev?c.reverse():c; }));
      env.define('reversed',bi((arr)=>{ if(typeof arr==='string')return arr.split('').reverse().join(''); return [...arr].reverse(); }));
      env.define('enumerate',bi((arr)=>arr.map((v,i)=>[i,v])));
      env.define('zip',     bi((a,b)=>{ const n=Math.min(a.length,b.length); const r=[]; for(let i=0;i<n;i++)r.push([a[i],b[i]]); return r; }));
      env.define('map',     bi((fn,arr)=>arr.map(v=>self._callValue(fn,[v]))));
      env.define('filter',  bi((fn,arr)=>arr.filter(v=>sageBool(self._callValue(fn,[v])))));
      env.define('reduce',  bi((fn,arr,init=undefined)=>{ if(init!==undefined)return arr.reduce((a,b)=>self._callValue(fn,[a,b]),init); return arr.reduce((a,b)=>self._callValue(fn,[a,b])); }));
      env.define('any',     bi((arr)=>arr.some(sageBool)));
      env.define('all',     bi((arr)=>arr.every(sageBool)));
      env.define('sum',     bi((arr)=>arr.reduce((a,b)=>a+b,0)));
      env.define('input',   bi((prompt='')=>{ return global.prompt ? global.prompt(prompt)||'' : ''; }));
      env.define('next',    bi((gen)=>{ if(gen&&gen.__type==='generator')return gen.next(); throw new RaiseSignal('next() requires a generator'); }));

      // math module stub
      env.define('math', {
        __type:'module', name:'math',
        sqrt: bi((v)=>Math.sqrt(v)),
        abs:  bi((v)=>Math.abs(v)),
        floor:bi((v)=>Math.floor(v)),
        ceil: bi((v)=>Math.ceil(v)),
        pow:  bi((a,b)=>Math.pow(a,b)),
        pi:   Math.PI, e: Math.E,
        log:  bi((v,base=Math.E)=>Math.log(v)/Math.log(base)),
        sin:  bi((v)=>Math.sin(v)),
        cos:  bi((v)=>Math.cos(v)),
        tan:  bi((v)=>Math.tan(v)),
      });

      // gc stubs
      env.define('gc_disable', bi(()=>{ self.output('-- gc: GC paused (emulated)'); return null; }));
      env.define('gc_enable',  bi(()=>{ self.output('-- gc: GC resumed (emulated)'); return null; }));
      env.define('gc_collect', bi(()=>{ self.output('-- gc: collection triggered (emulated)'); return null; }));

      // memory stubs — just backed by a JS ArrayBuffer
      const memHeap = new Map();
      let memIdCtr = 1;
      env.define('mem_alloc', bi((size)=>{
        const id=memIdCtr++; const buf=new ArrayBuffer(size); memHeap.set(id,{buf,view:new DataView(buf)});
        return {__type:'ptr',id,size};
      }));
      env.define('mem_free', bi((ptr)=>{ if(ptr&&ptr.__type==='ptr')memHeap.delete(ptr.id); return null; }));
      env.define('mem_write',bi((ptr,offset,dtype,val)=>{
        if(!ptr||ptr.__type!=='ptr') throw new RaiseSignal('mem_write: invalid pointer');
        const h=memHeap.get(ptr.id); if(!h) throw new RaiseSignal('mem_write: freed pointer');
        if(dtype==='int') h.view.setInt32(offset,val,true);
        else if(dtype==='float') h.view.setFloat64(offset,val,true);
        else if(dtype==='double') h.view.setFloat64(offset,val,true);
        return null;
      }));
      env.define('mem_read', bi((ptr,offset,dtype)=>{
        if(!ptr||ptr.__type!=='ptr') throw new RaiseSignal('mem_read: invalid pointer');
        const h=memHeap.get(ptr.id); if(!h) throw new RaiseSignal('mem_read: freed pointer');
        if(dtype==='int') return h.view.getInt32(offset,true);
        if(dtype==='float'||dtype==='double') return h.view.getFloat64(offset,true);
        throw new RaiseSignal(`mem_read: unknown dtype '${dtype}'`);
      }));

      // sandbox / LilyBox stubs
      const sandbox = {
        __type:'module', name:'sandbox',
        create: bi((manifest)=>{ self.output(`  LilyBox ✦  sandbox created from '${manifest}' (emulated)`); return {__type:'box',manifest,_open:true}; }),
        run:    bi((box,file,...args)=>{ self.output(`  LilyBox ✦  running '${file}' inside sandbox (emulated)`); return {ok:true,stdout:'(emulated output)',error:null}; }),
        close:  bi((box)=>{ if(box) box._open=false; self.output('  LilyBox ✦  sandbox closed'); return null; }),
        enter:  bi((box)=>{ self.output('  LilyBox ✦  entered sandbox scope (emulated)'); return null; }),
        exit:   bi(()=>{  self.output('  LilyBox ✦  exited sandbox scope (emulated)');  return null; }),
      };
      env.define('sandbox', sandbox);

      // python FFI stub
      const python = {
        __type:'module', name:'python',
        import: bi((name)=>{
          self.output(`  Python FFI ✦  import '${name}' — (emulated, no real Python in browser)`);
          return new Proxy({}, { get(_, prop){return {__type:'builtin',fn:(...a)=>`${name}.${String(prop)}(${a.map(sageStr).join(', ')})`}; } });
        }),
        eval: bi((code)=>{ self.output(`  Python FFI ✦  eval: ${code} (emulated)`); return null; }),
      };
      env.define('python', python);

      // C FFI stub
      const c_ffi = {
        __type:'module', name:'c_ffi',
        load:   bi((lib)=>{ self.output(`  C FFI ✦  loaded '${lib}' (emulated)`); return {__type:'clib',name:lib}; }),
        bind:   bi((lib,sym,..._)=>{ self.output(`  C FFI ✦  bound '${sym}' from '${lib.name}' (emulated)`); return {__type:'builtin',fn:(...args)=>{ self.output(`  C FFI ✦  ${sym}(${args.map(sageStr).join(', ')}) = (emulated)`); return 0; }}; }),
        unload: bi((lib)=>{ self.output(`  C FFI ✦  unloaded '${lib.name}'`); return null; }),
      };
      env.define('c_ffi', c_ffi);
    }

    // ── Evaluate a full program ─────────────────────────────────────────────
    evalSource(source) {
      const lexer  = new Lexer(source);
      const parser = new Parser(lexer.tokens);
      const ast    = parser.parse();
      return this._execBlock(ast.body, this.globalEnv);
    }

    _execBlock(stmts, env) {
      let last = null;
      for (const stmt of stmts) {
        last = this._execStmt(stmt, env);
      }
      // run defers in LIFO order
      while (env.defers.length > 0) {
        const d = env.defers.pop();
        try { this._execBlock(d.body, d.env); } catch(_e){}
      }
      return last;
    }

    _execStmt(node, env) {
      if (!node) return null;
      switch(node.type) {
        case 'ExprStmt':   return this._evalExpr(node.expr, env);
        case 'Decl':       return this._execDecl(node, env);
        case 'Assign':     return this._execAssign(node, env);
        case 'AugAssign':  return this._execAugAssign(node, env);
        case 'ProcDef':    return this._execProcDef(node, env);
        case 'ProcExpr':   return this._makeProcValue(node, env);
        case 'ClassDef':   return this._execClassDef(node, env);
        case 'StructDef':  return this._execStructDef(node, env);
        case 'ImplBlock':  return this._execImpl(node, env);
        case 'EnumDef':    return this._execEnum(node, env);
        case 'If':         return this._execIf(node, env);
        case 'While':      return this._execWhile(node, env);
        case 'For':        return this._execFor(node, env);
        case 'Match':      return this._execMatch(node, env);
        case 'Try':        return this._execTry(node, env);
        case 'Defer':      env.defers.push({body:node.body, env}); return null;
        case 'Return':     { const v=node.value?this._evalExpr(node.value,env):null; throw new ReturnSignal(v); }
        case 'Raise':      throw new RaiseSignal(this._evalExpr(node.value, env));
        case 'Yield':      throw new YieldSignal(this._evalExpr(node.value, env));
        case 'Break':      throw new BreakSignal();
        case 'Continue':   throw new ContinueSignal();
        case 'Pass':       return null;
        case 'Import':     return this._execImport(node, env);
        case 'ManualBlock':return this._execManual(node, env);
        case 'Program':    return this._execBlock(node.body, env);
        default: return null;
      }
    }

    _execDecl(node, env) {
      const val = node.value ? this._evalExpr(node.value, env) : null;
      env.define(node.name, val);
      return val;
    }

    _execAssign(node, env) {
      const val = this._evalExpr(node.value, env);
      const t = node.target;
      if (t.type==='Identifier') { env.set(t.name, val); return val; }
      if (t.type==='Attribute') {
        const obj = this._evalExpr(t.object, env);
        if (obj&&obj.__type==='instance') { obj.__fields[t.name]=val; return val; }
        if (obj&&typeof obj==='object') { obj[t.name]=val; return val; }
      }
      if (t.type==='Index') {
        const obj = this._evalExpr(t.object, env);
        const idx = this._evalExpr(t.index, env);
        if (Array.isArray(obj)) { obj[idx]=val; return val; }
        if (obj&&obj.__type==='dict') { obj.data.set(idx,val); return val; }
      }
      return val;
    }

    _execAugAssign(node, env) {
      const cur = this._evalExpr(node.target, env);
      const rhs = this._evalExpr(node.value, env);
      let result;
      switch(node.op) {
        case TT.PLUSASSIGN:  result = (typeof cur==='string'||typeof rhs==='string') ? sageStr(cur)+sageStr(rhs) : cur+rhs; break;
        case TT.MINUSASSIGN: result = cur-rhs; break;
        case TT.STARASSIGN:  result = cur*rhs; break;
        case TT.SLASHASSIGN: result = cur/rhs; break;
        default: result = cur+rhs;
      }
      const assign = {type:'Assign',target:node.target,value:{type:'Literal',value:result},line:node.line};
      return this._execAssign(assign, env);
    }

    _execProcDef(node, env) {
      const proc = this._makeProcValue(node, env);
      env.define(node.name, proc);
      return proc;
    }

    _makeProcValue(node, env) {
      return { __type:'proc', name:node.name||null, params:node.params, body:node.body, closure:env, isGenerator:node.isGenerator };
    }

    _execClassDef(node, env) {
      const parent = node.parent ? env.get(node.parent) : null;
      const cls = { __type:'class', __name:node.name, __parent:parent, __methods:{}, __fields_template:[] };
      const bodyEnv = new Env(env);
      for (const stmt of node.body) {
        if (stmt.type==='ProcDef') {
          cls.__methods[stmt.name] = this._makeProcValue(stmt, env);
        }
      }
      env.define(node.name, cls);
      return cls;
    }

    _execStructDef(node, env) {
      const struct = { __type:'struct_type', __name:node.name, __fields:node.fields, __methods:{} };
      // Make struct callable as constructor
      const self = this;
      struct.__call = function(args) {
        const inst = { __type:'instance', __class:struct, __fields:{} };
        node.fields.forEach((f,i)=>{ inst.__fields[f.name]=args[i]!==undefined?args[i]:null; });
        // proxy __fields onto inst for dot-access
        Object.defineProperty(inst,'__proxy',{get(){return true;}});
        return new Proxy(inst, {
          get(target,prop) {
            if(prop in target) return target[prop];
            if(prop in target.__fields) return target.__fields[prop];
            if(prop in struct.__methods) {
              const m=struct.__methods[prop];
              return {__type:'bound_method',fn:m,receiver:target};
            }
            return undefined;
          },
          set(target,prop,val) {
            if(prop in target) { target[prop]=val; return true; }
            target.__fields[prop]=val; return true;
          }
        });
      };
      env.define(node.name, struct);
      return struct;
    }

    _execImpl(node, env) {
      const target = env.get(node.name);
      if (!target) return null;
      for (const stmt of node.body) {
        if (stmt.type==='ProcDef') {
          target.__methods[stmt.name] = this._makeProcValue(stmt, env);
        }
      }
      return null;
    }

    _execEnum(node, env) {
      const enumType = { __type:'enum', name:node.name, __variants:{} };
      for (const v of node.variants) {
        if (v.fields.length===0) {
          // plain variant: just the value
          enumType[v.name] = { __type:'variant', enumName:node.name, variant:v.name, fields:{} };
        } else {
          // variant constructor
          const vfields = v.fields;
          enumType[v.name] = {
            __type:'builtin',
            fn:(...args)=>({
              __type:'variant', enumName:node.name, variant:v.name,
              fields: Object.fromEntries(vfields.map((f,i)=>[f.name, args[i]!==undefined?args[i]:null]))
            })
          };
        }
      }
      env.define(node.name, enumType);
      return enumType;
    }

    _execIf(node, env) {
      if (sageBool(this._evalExpr(node.condition, env))) {
        return this._execBlock(node.then, new Env(env));
      }
      for (const elif of node.elifs) {
        if (sageBool(this._evalExpr(elif.condition, env))) {
          return this._execBlock(elif.body, new Env(env));
        }
      }
      if (node.else_) return this._execBlock(node.else_, new Env(env));
      return null;
    }

    _execWhile(node, env) {
      while (sageBool(this._evalExpr(node.condition, env))) {
        try { this._execBlock(node.body, new Env(env)); }
        catch(e) { if(e instanceof BreakSignal)break; if(e instanceof ContinueSignal)continue; throw e; }
      }
      return null;
    }

    _execFor(node, env) {
      let iter = this._evalExpr(node.iterable, env);
      if (iter && iter.__type==='generator') {
        let val;
        while ((val=iter.next()) !== null) {
          const loopEnv = new Env(env);
          this._bindForVars(node.vars, val, loopEnv);
          try { this._execBlock(node.body, loopEnv); }
          catch(e) { if(e instanceof BreakSignal)return null; if(e instanceof ContinueSignal)continue; throw e; }
        }
        return null;
      }
      if (!iter || (!Array.isArray(iter) && typeof iter!=='string')) iter=[];
      const items = typeof iter==='string' ? iter.split('') : iter;
      for (const item of items) {
        const loopEnv = new Env(env);
        this._bindForVars(node.vars, item, loopEnv);
        try { this._execBlock(node.body, loopEnv); }
        catch(e) { if(e instanceof BreakSignal)return null; if(e instanceof ContinueSignal)continue; throw e; }
      }
      return null;
    }

    _bindForVars(vars, val, env) {
      if (vars.length===1) { env.define(vars[0], val); return; }
      // tuple/array unpacking
      const items = Array.isArray(val) ? val : [val];
      vars.forEach((v,i)=>env.define(v, items[i]!==undefined?items[i]:null));
    }

    _execMatch(node, env) {
      const subject = this._evalExpr(node.subject, env);
      for (const c of node.cases) {
        const bound = this._matchPattern(c.pattern, subject, env);
        if (bound !== false) {
          const caseEnv = new Env(env);
          Object.entries(bound).forEach(([k,v])=>caseEnv.define(k,v));
          return this._execBlock(c.body, caseEnv);
        }
      }
      return null;
    }

    _matchPattern(pat, val, env) {
      if (pat.type==='Wildcard') return {};
      if (pat.type==='LiteralPat') return sageEq(val,pat.value)?{}:false;
      if (pat.type==='BindPat') return {[pat.name]:val};
      if (pat.type==='VariantPat') {
        if (!val||val.__type!=='variant') return false;
        if (val.enumName!==pat.enumName||val.variant!==pat.variant) return false;
        const bindings = {};
        pat.bindings.forEach((b,i)=>{ const key=Object.keys(val.fields)[i]; bindings[b]=val.fields[key]; });
        return bindings;
      }
      return false;
    }

    _execTry(node, env) {
      try { return this._execBlock(node.body, new Env(env)); }
      catch(e) {
        if (e instanceof RaiseSignal) {
          const catchEnv = new Env(env);
          catchEnv.define(node.catchVar, e.value);
          return this._execBlock(node.catchBody, catchEnv);
        }
        throw e;
      }
    }

    _execImport(node, env) {
      const mod = node.module;
      if (mod==='sandbox'||mod==='c_ffi'||mod==='python'||mod==='math') {
        // already defined in globals
        return env.get(mod)||null;
      }
      this.output(`  import ✦  '${mod}' — (module not available in REPL)`);
      env.define(mod.split('.')[0], {__type:'module',name:mod});
      return null;
    }

    _execManual(node, env) {
      this.output('@manual ✦  GC paused — manual memory region (emulated)');
      const manEnv = new Env(env);
      try { this._execBlock(node.body, manEnv); }
      catch(e) {
        if (e instanceof ReturnSignal||e instanceof RaiseSignal) throw e;
        // swallow break/continue inside @manual
      }
      this.output('@manual ✦  GC resumed');
      return null;
    }

    // ── Expression evaluator ──────────────────────────────────────────────────
    _evalExpr(node, env) {
      if (!node) return null;
      switch(node.type) {
        case 'Literal':     return node.value;
        case 'Identifier':  {
          const v = env.get(node.name);
          if (v===undefined) {
            // levenshtein suggestion
            const candidates = this._getAllNames(env);
            const sug = this._suggest(node.name, candidates);
            let msg = `undefined variable '${node.name}'`;
            if (sug) msg += `. Did you mean '${sug}'?`;
            throw new RaiseSignal(msg);
          }
          return v;
        }
        case 'Tuple':       return { __type:'tuple', items:node.elements.map(e=>this._evalExpr(e,env)) };
        case 'ArrayLit':    return node.elements.map(e=>this._evalExpr(e,env));
        case 'DictLit':     {
          const d={__type:'dict',data:new Map()};
          for(const p of node.pairs) d.data.set(this._evalExpr(p.key,env),this._evalExpr(p.value,env));
          return d;
        }
        case 'ProcExpr':    return this._makeProcValue(node, env);
        case 'BinOp':       return this._evalBinOp(node, env);
        case 'UnaryOp':     return this._evalUnary(node, env);
        case 'NullCoal':    { const l=this._evalExpr(node.left,env); return (l===null||l===undefined)?this._evalExpr(node.right,env):l; }
        case 'Attribute':   return this._evalAttr(node, env);
        case 'Index':       return this._evalIndex(node, env);
        case 'Call':        return this._evalCall(node, env);
        case 'MethodCall':  return this._evalMethodCall(node, env);
        case 'Super':       return this._evalSuper(node, env);
        default: return null;
      }
    }

    _evalBinOp(node, env) {
      const op = node.op;
      if (op==='or')  return sageBool(this._evalExpr(node.left,env)) || sageBool(this._evalExpr(node.right,env));
      if (op==='and') return sageBool(this._evalExpr(node.left,env)) && sageBool(this._evalExpr(node.right,env));
      const l = this._evalExpr(node.left, env);
      const r = this._evalExpr(node.right, env);
      switch(op) {
        case TT.PLUS: {
          if (typeof l==='string'||typeof r==='string') return sageStr(l)+sageStr(r);
          if (typeof l==='number'&&typeof r==='number') return l+r;
          if (typeof l==='boolean'&&typeof r==='number') return (l?1:0)+r;
          if (typeof l==='number'&&typeof r==='boolean') return l+(r?1:0);
          throw new RaiseSignal(`cannot add ${sageStr(l)} (${typeof l==='object'?l?.__type||'object':typeof l}) and ${sageStr(r)} (${typeof r==='object'?r?.__type||'object':typeof r})`);
        }
        case TT.MINUS: return l-r;
        case TT.STAR:  
          if (typeof l==='string'&&typeof r==='number') return l.repeat(Math.max(0,r));
          if (Array.isArray(l)&&typeof r==='number') { let a=[]; for(let i=0;i<r;i++) a=[...a,...l]; return a; }
          return l*r;
        case TT.SLASH: if(r===0) throw new RaiseSignal('division by zero'); return l/r;
        case TT.DOUBLESLASH: if(r===0) throw new RaiseSignal('division by zero'); return Math.floor(l/r);
        case TT.PERCENT: if(r===0) throw new RaiseSignal('modulo by zero'); return ((l%r)+r)%r;
        case TT.STARSTAR: return Math.pow(l,r);
        case TT.EQ:  return sageEq(l,r);
        case TT.NEQ: return !sageEq(l,r);
        case TT.LT:  return l<r;
        case TT.GT:  return l>r;
        case TT.LEQ: return l<=r;
        case TT.GEQ: return l>=r;
        default: return null;
      }
    }

    _evalUnary(node, env) {
      const v = this._evalExpr(node.operand, env);
      if (node.op==='-') return -v;
      if (node.op==='not') return !sageBool(v);
      return v;
    }

    _evalAttr(node, env) {
      const obj = this._evalExpr(node.object, env);
      if (obj===null||obj===undefined) throw new RaiseSignal(`attribute access on None: .${node.name}`);
      // instance
      if (obj.__type==='instance') {
        if (node.name in obj.__fields) return obj.__fields[node.name];
        const cls = obj.__class;
        if (cls&&node.name in cls.__methods) {
          const m = cls.__methods[node.name];
          return {__type:'bound_method',fn:m,receiver:obj};
        }
        // walk parent
        let parent = cls?.__parent;
        while (parent) {
          if (parent.__methods&&node.name in parent.__methods) {
            return {__type:'bound_method',fn:parent.__methods[node.name],receiver:obj};
          }
          parent = parent.__parent;
        }
        throw new RaiseSignal(`'${cls?.__name||'object'}' has no attribute '${node.name}'`);
      }
      // struct instance (Proxy)
      if (obj.__type==='instance'&&obj.__class?.__type==='struct_type') {
        return obj.__fields[node.name]??null;
      }
      // enum/class namespace
      if (obj.__type==='enum'||obj.__type==='class'||obj.__type==='struct_type') {
        if (node.name in obj) return obj[node.name];
        if (obj.__methods&&node.name in obj.__methods) return obj.__methods[node.name];
      }
      // module
      if (obj.__type==='module'||obj.__type==='clib') {
        if (node.name in obj) return obj[node.name];
        return {__type:'builtin',fn:(...a)=>{ this.output(`  ${obj.name}.${node.name}(${a.map(sageStr).join(', ')}) — (emulated)`); return null; }};
      }
      // string methods
      if (typeof obj==='string') return this._strMethod(obj, node.name);
      // array methods
      if (Array.isArray(obj)) return this._arrMethod(obj, node.name);
      // dict methods
      if (obj.__type==='dict') return this._dictMethod(obj, node.name);
      // plain JS objects
      if (typeof obj==='object'&&node.name in obj) return obj[node.name];
      return null;
    }

    _strMethod(s, name) {
      const bi = fn => ({__type:'builtin',fn});
      switch(name) {
        case 'len':     return s.length;
        case 'upper':   return bi(()=>s.toUpperCase());
        case 'lower':   return bi(()=>s.toLowerCase());
        case 'trim':    return bi(()=>s.trim());
        case 'strip':   return bi(()=>s.trim());
        case 'split':   return bi((sep=' ')=>s.split(sep));
        case 'join':    return bi((arr)=>arr.join(s));
        case 'replace': return bi((a,b)=>s.replaceAll(a,b));
        case 'contains':return bi((sub)=>s.includes(sub));
        case 'starts_with': return bi((p)=>s.startsWith(p));
        case 'ends_with':   return bi((p)=>s.endsWith(p));
        case 'find':    return bi((sub)=>s.indexOf(sub));
        case 'slice':   return bi((a,b)=>s.slice(a,b));
        case 'chars':   return bi(()=>s.split(''));
        case 'lines':   return bi(()=>s.split('\n'));
        case 'to_int':  return bi(()=>parseInt(s,10));
        case 'to_float':return bi(()=>parseFloat(s));
        case 'repeat':  return bi((n)=>s.repeat(n));
        case 'pad_left': return bi((n,c=' ')=>s.padStart(n,c));
        case 'pad_right':return bi((n,c=' ')=>s.padEnd(n,c));
        default: return null;
      }
    }

    _arrMethod(arr, name) {
      const bi = fn => ({__type:'builtin',fn});
      switch(name) {
        case 'push':    return bi((v)=>{ arr.push(v); return arr; });
        case 'pop':     return bi(()=>arr.length?arr.pop():null);
        case 'append':  return bi((v)=>{ arr.push(v); return arr; });
        case 'len':     return arr.length;
        case 'length':  return arr.length;
        case 'get':     return bi((i)=>arr[i]!==undefined?arr[i]:null);
        case 'set':     return bi((i,v)=>{ arr[i]=v; return null; });
        case 'contains':return bi((v)=>arr.some(x=>sageEq(x,v)));
        case 'index':   return bi((v)=>arr.findIndex(x=>sageEq(x,v)));
        case 'remove':  return bi((v)=>{ const i=arr.findIndex(x=>sageEq(x,v)); if(i>=0)arr.splice(i,1); return null; });
        case 'insert':  return bi((i,v)=>{ arr.splice(i,0,v); return arr; });
        case 'slice':   return bi((a,b)=>arr.slice(a,b));
        case 'reverse': return bi(()=>[...arr].reverse());
        case 'sort':    return bi((key=null)=>{ const c=[...arr]; key?c.sort((a,b)=>this._callValue(key,[a])<this._callValue(key,[b])?-1:1):c.sort((a,b)=>typeof a==='number'?a-b:String(a).localeCompare(String(b))); return c; });
        case 'map':     return bi((fn)=>arr.map(v=>this._callValue(fn,[v])));
        case 'filter':  return bi((fn)=>arr.filter(v=>sageBool(this._callValue(fn,[v]))));
        case 'reduce':  return bi((fn,init)=>init!==undefined?arr.reduce((a,b)=>this._callValue(fn,[a,b]),init):arr.reduce((a,b)=>this._callValue(fn,[a,b])));
        case 'first':   return bi(()=>arr[0]!==undefined?arr[0]:null);
        case 'last':    return bi(()=>arr.length?arr[arr.length-1]:null);
        case 'join':    return bi((sep=',')=>arr.map(sageStr).join(sep));
        case 'flat':    return bi(()=>arr.flat());
        case 'unique':  return bi(()=>[...new Set(arr)]);
        case 'zip':     return bi((b)=>arr.map((v,i)=>[v,b[i]!==undefined?b[i]:null]));
        case 'enumerate':return bi(()=>arr.map((v,i)=>[i,v]));
        case 'sum':     return bi(()=>arr.reduce((a,b)=>a+b,0));
        case 'min':     return bi(()=>arr.reduce((a,b)=>a<b?a:b));
        case 'max':     return bi(()=>arr.reduce((a,b)=>a>b?a:b));
        case 'count':   return bi((v)=>arr.filter(x=>sageEq(x,v)).length);
        case 'clear':   return bi(()=>{ arr.length=0; return null; });
        case 'copy':    return bi(()=>[...arr]);
        case 'extend':  return bi((b)=>{ arr.push(...b); return arr; });
        default: return null;
      }
    }

    _dictMethod(dict, name) {
      const bi = fn => ({__type:'builtin',fn});
      switch(name) {
        case 'get':     return bi((k,def=null)=>dict.data.has(k)?dict.data.get(k):def);
        case 'set':     return bi((k,v)=>{ dict.data.set(k,v); return null; });
        case 'delete':  return bi((k)=>dict.data.delete(k));
        case 'has':     return bi((k)=>dict.data.has(k));
        case 'keys':    return bi(()=>[...dict.data.keys()]);
        case 'values':  return bi(()=>[...dict.data.values()]);
        case 'items':   return bi(()=>[...dict.data.entries()].map(([k,v])=>[k,v]));
        case 'len':     return dict.data.size;
        case 'length':  return dict.data.size;
        case 'clear':   return bi(()=>{ dict.data.clear(); return null; });
        case 'copy':    return bi(()=>({__type:'dict',data:new Map(dict.data)}));
        case 'update':  return bi((other)=>{ if(other&&other.__type==='dict') other.data.forEach((v,k)=>dict.data.set(k,v)); return null; });
        default: return null;
      }
    }

    _evalIndex(node, env) {
      const obj = this._evalExpr(node.object, env);
      const idx = this._evalExpr(node.index, env);
      if (Array.isArray(obj)) {
        const i = idx < 0 ? obj.length+idx : idx;
        return obj[i]!==undefined?obj[i]:null;
      }
      if (typeof obj==='string') {
        const i = idx < 0 ? obj.length+idx : idx;
        return obj[i]||null;
      }
      if (obj&&obj.__type==='dict') return obj.data.has(idx)?obj.data.get(idx):null;
      if (obj&&typeof obj==='object') return obj[idx]!==undefined?obj[idx]:null;
      throw new RaiseSignal(`'${sageStr(obj)}' is not subscriptable`);
    }

    _evalCall(node, env) {
      const callee = this._evalExpr(node.callee, env);
      if (callee===undefined||callee===null) {
        const name = node.callee.name||sageStr(node.callee);
        throw new RaiseSignal(`'${name}' is not defined`);
      }
      const args = node.args.positional.map(a=>this._evalExpr(a,env));
      return this._callValue(callee, args, node.args.keyword, env);
    }

    _evalMethodCall(node, env) {
      const obj = this._evalExpr(node.object, env);
      if (obj===null||obj===undefined) throw new RaiseSignal(`method call on None: .${node.method}()`);
      const args = node.args.positional.map(a=>this._evalExpr(a,env));
      // Try method lookup
      const method = this._evalAttr({type:'Attribute',object:node.object,name:node.method}, env);
      if (method===null||method===undefined) throw new RaiseSignal(`'${sageStr(obj)}' has no method '${node.method}'`);
      if (method.__type==='bound_method') return this._callProc(method.fn, [method.receiver, ...args], {});
      return this._callValue(method, args, node.args.keyword, env);
    }

    _evalSuper(node, env) {
      // super() — call parent class init
      const self_ = env.get('self');
      if (!self_) return null;
      const cls = self_.__class;
      const parent = cls?.__parent;
      if (!parent) throw new RaiseSignal('super(): no parent class');
      const args = node.args.positional.map(a=>this._evalExpr(a,env));
      const initFn = parent.__methods?.['init'];
      if (initFn) this._callProc(initFn, [self_, ...args], {});
      return null;
    }

    _callValue(callee, args, kwargs={}, env=null) {
      if (!callee) throw new RaiseSignal(`called None`);
      if (callee.__type==='builtin') return callee.fn(...args);
      if (callee.__type==='bound_method') return this._callProc(callee.fn, [callee.receiver,...args], kwargs||{});
      if (callee.__type==='proc') {
        if (callee.isGenerator) return this._makeGenerator(callee, args);
        return this._callProc(callee, args, kwargs||{});
      }
      // struct/class instantiation
      if (callee.__type==='struct_type') return callee.__call(args);
      if (callee.__type==='class') {
        const inst = {__type:'instance',__class:callee,__fields:{}};
        const proxied = new Proxy(inst, {
          get(target,prop) {
            if(prop in target) return target[prop];
            if(prop in target.__fields) return target.__fields[prop];
            // look up method chain
            let c=callee;
            while(c){if(c.__methods&&prop in c.__methods)return{__type:'bound_method',fn:c.__methods[prop],receiver:target};c=c.__parent;}
            return undefined;
          },
          set(target,prop,val) {
            if(['__type','__class','__fields'].includes(prop)){target[prop]=val;return true;}
            target.__fields[prop]=val; return true;
          }
        });
        const initFn = this._findMethod(callee, 'init');
        if (initFn) this._callProc(initFn, [proxied, ...args], kwargs||{});
        return proxied;
      }
      // variant constructor
      if (callee.__type==='variant') return callee; // plain variant used as value
      if (typeof callee==='function') return callee(...args);
      throw new RaiseSignal(`'${sageStr(callee)}' is not callable`);
    }

    _findMethod(cls, name) {
      let c = cls;
      while (c) {
        if (c.__methods&&name in c.__methods) return c.__methods[name];
        c = c.__parent;
      }
      return null;
    }

    _callProc(proc, args, kwargs) {
      if (this.callDepth > this.maxDepth) throw new RaiseSignal(`maximum recursion depth exceeded (${this.maxDepth})`);
      this.callDepth++;
      const local = new Env(proc.closure);
      // bind params
      proc.params.forEach((p, i) => {
        if (p.name.startsWith('*')) {
          local.define(p.name.slice(1), args.slice(i));
        } else {
          const val = args[i] !== undefined ? args[i] : (p.default ? this._evalExpr(p.default, proc.closure) : null);
          local.define(p.name, val);
        }
      });
      // bind keyword args
      if (kwargs) for (const {key,value} of (Array.isArray(kwargs)?kwargs:Object.entries(kwargs))) {
        local.define(typeof key==='string'?key:key, value);
      }
      let result = null;
      try { this._execBlock(proc.body, local); }
      catch(e) {
        if (e instanceof ReturnSignal) { result=e.value; }
        else {
          // still flush defers before propagating
          this._flushDefers(local);
          this.callDepth--;
          throw e;
        }
      }
      // flush defers registered in the proc's own scope (covers explicit return)
      this._flushDefers(local);
      this.callDepth--;
      return result;
    }

    _flushDefers(env) {
      while (env.defers.length > 0) {
        const d = env.defers.pop();
        try { this._execBlock(d.body, d.env); } catch(_e) {}
      }
    }

    _makeGenerator(proc, args) {
      const self = this;
      function* genFn() {
        const local = new Env(proc.closure);
        proc.params.forEach((p,i)=>local.define(p.name, args[i]!==undefined?args[i]:null));
        yield* self._execBlockGen(proc.body, local);
      }
      const jsGen = genFn();
      return {
        __type:'generator',
        _done: false,
        next() {
          if (this._done) return null;
          const r = jsGen.next();
          if (r.done) { this._done=true; return null; }
          return r.value;
        }
      };
    }

    *_execBlockGen(stmts, env) {
      for (const stmt of stmts) {
        if (!stmt) continue;
        if (stmt.type==='Yield') { yield this._evalExpr(stmt.value, env); continue; }
        if (stmt.type==='If') {
          let branch = null;
          if (sageBool(this._evalExpr(stmt.condition,env))) branch=stmt.then;
          else { for(const el of stmt.elifs) if(sageBool(this._evalExpr(el.condition,env))){branch=el.body;break;} }
          if (!branch&&stmt.else_) branch=stmt.else_;
          if (branch) yield* this._execBlockGen(branch, new Env(env));
          continue;
        }
        if (stmt.type==='While') {
          while (sageBool(this._evalExpr(stmt.condition,env))) {
            try { yield* this._execBlockGen(stmt.body, new Env(env)); }
            catch(e){ if(e instanceof BreakSignal)break; if(e instanceof ContinueSignal)continue; throw e; }
          }
          continue;
        }
        if (stmt.type==='For') {
          let iter = this._evalExpr(stmt.iterable, env);
          if (iter&&iter.__type==='generator') {
            let val;
            while ((val=iter.next())!==null) {
              const le=new Env(env); this._bindForVars(stmt.vars,val,le);
              try{yield* this._execBlockGen(stmt.body,le);}
              catch(e){if(e instanceof BreakSignal)break;if(e instanceof ContinueSignal)continue;throw e;}
            }
          } else {
            const items=typeof iter==='string'?iter.split(''):Array.isArray(iter)?iter:[];
            for(const item of items){
              const le=new Env(env);this._bindForVars(stmt.vars,item,le);
              try{yield* this._execBlockGen(stmt.body,le);}
              catch(e){if(e instanceof BreakSignal)break;if(e instanceof ContinueSignal)continue;throw e;}
            }
          }
          continue;
        }
        if (stmt.type==='Return') { const v=stmt.value?this._evalExpr(stmt.value,env):null; throw new ReturnSignal(v); }
        // anything else: execute normally
        this._execStmt(stmt, env);
      }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    _getAllNames(env) {
      const names = new Set();
      let e = env;
      while (e) { Object.keys(e.vars).forEach(n=>names.add(n)); e=e.parent; }
      return [...names];
    }

    _suggest(name, candidates) {
      let best=null, bestDist=3; // max levenshtein distance for suggestion
      for (const c of candidates) {
        const d=this._levenshtein(name,c);
        if(d<bestDist){bestDist=d;best=c;}
      }
      return best;
    }

    _levenshtein(a, b) {
      const m=a.length,n=b.length;
      const dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
      for(let j=0;j<=n;j++) dp[0][j]=j;
      for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
        dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
      return dp[m][n];
    }
  }

  // ── REPL UI ──────────────────────────────────────────────────────────────────
  function injectCSS() {
    const css = `
    .sage-repl-wrap {
      font-family: 'JetBrains Mono', 'Fira Mono', 'Cascadia Code', 'Consolas', monospace;
      background: #1c1830;
      border: 1px solid #3a3158;
      border-radius: 12px;
      overflow: hidden;
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 40px rgba(0,0,0,0.45);
    }
    .sage-repl-chrome {
      background: #241f3a;
      padding: 11px 16px;
      display: flex;
      align-items: center;
      gap: 7px;
      border-bottom: 1px solid #3a3158;
      flex-shrink: 0;
      user-select: none;
    }
    .sage-repl-dot {
      width: 12px; height: 12px; border-radius: 50%;
    }
    .sage-repl-dot-r { background: #ff5f57; }
    .sage-repl-dot-y { background: #ffbd2e; }
    .sage-repl-dot-g { background: #28c840; }
    .sage-repl-chrome-title {
      margin-left: 8px;
      font-size: 11px;
      color: #6b6080;
      letter-spacing: 0.04em;
    }
    .sage-repl-chrome-hint {
      margin-left: auto;
      font-size: 10px;
      color: #3d3558;
    }
    .sage-repl-output {
      padding: 16px 20px 8px;
      overflow-y: auto;
      flex: 1;
      min-height: 260px;
      max-height: 520px;
      font-size: 13px;
      line-height: 1.7;
      color: #c8c0e0;
      scroll-behavior: smooth;
    }
    .sage-repl-output::-webkit-scrollbar { width: 5px; }
    .sage-repl-output::-webkit-scrollbar-track { background: transparent; }
    .sage-repl-output::-webkit-scrollbar-thumb { background: #3a3158; border-radius: 4px; }
    .sage-repl-line { white-space: pre-wrap; word-break: break-word; margin: 0; }
    .sage-repl-line-input  { color: #a8a0c8; }
    .sage-repl-line-cont   { color: #5a5070; }
    .sage-repl-line-output { color: #c8e6b0; }
    .sage-repl-line-info   { color: #8ab4d4; }
    .sage-repl-line-error  { color: #f0a0a0; }
    .sage-repl-line-firefly { color: #a8e0b8; }
    .sage-repl-line-dim    { color: #5a5070; }
    .sage-repl-line-gc     { color: #c0a8e0; font-style: italic; }
    .sage-repl-input-row {
      display: flex;
      align-items: flex-start;
      padding: 8px 20px 14px;
      border-top: 1px solid #2a2445;
      gap: 8px;
      flex-shrink: 0;
    }
    .sage-repl-prompt-label {
      color: #6ba3c8;
      font-size: 13px;
      padding-top: 2px;
      flex-shrink: 0;
      user-select: none;
      min-width: 68px;
    }
    .sage-repl-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #e0d8f8;
      font-size: 13px;
      font-family: inherit;
      resize: none;
      line-height: 1.7;
      caret-color: #8ab4d4;
      padding: 0;
    }
    .sage-repl-input::placeholder { color: #3d3558; }
    `;
    const tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  class SageREPL {
    constructor(container, opts) {
      opts = opts || {};
      this.container = container;
      this.noChrome     = !!opts.noChrome;
      this.skipWelcome  = !!opts.skipWelcome;
      this._fireflyHook = opts.onFirefly || null;
      this.buffer    = [];
      this.history   = [];
      this.histIdx   = -1;
      this.inBlock   = false;
      this._pendingOutput = '';
      this.evaluator = new Evaluator((text, newline=true) => this._printOutput(text, newline));
      this._build();
      if (!this.skipWelcome) this._welcome();
    }

    _build() {
      this.container.innerHTML = '';
      this.container.className = 'sage-repl-wrap';

      const chrome = document.createElement('div');
      chrome.className = 'sage-repl-chrome';
      chrome.innerHTML = `
        <span class="sage-repl-dot sage-repl-dot-r"></span>
        <span class="sage-repl-dot sage-repl-dot-y"></span>
        <span class="sage-repl-dot sage-repl-dot-g"></span>
        <span class="sage-repl-chrome-title">sage repl  ✦  ${VERSION}</span>
        <span class="sage-repl-chrome-hint">↑↓ history · .help · .clear</span>
      `;
      this.outputEl = document.createElement('div');
      this.outputEl.className = 'sage-repl-output';
      this.outputEl.setAttribute('aria-live', 'polite');
      this.outputEl.setAttribute('aria-label', 'REPL output');

      const inputRow = document.createElement('div');
      inputRow.className = 'sage-repl-input-row';

      this.promptEl = document.createElement('span');
      this.promptEl.className = 'sage-repl-prompt-label';
      this.promptEl.textContent = PROMPT;

      this.inputEl = document.createElement('textarea');
      this.inputEl.className = 'sage-repl-input';
      this.inputEl.setAttribute('rows', '1');
      this.inputEl.setAttribute('placeholder', 'type Sage code…');
      this.inputEl.setAttribute('autocomplete', 'off');
      this.inputEl.setAttribute('autocorrect', 'off');
      this.inputEl.setAttribute('autocapitalize', 'off');
      this.inputEl.setAttribute('spellcheck', 'false');
      this.inputEl.setAttribute('aria-label', 'Sage REPL input');

      inputRow.appendChild(this.promptEl);
      inputRow.appendChild(this.inputEl);
      if (!this.noChrome) this.container.appendChild(chrome);
      this.container.appendChild(this.outputEl);
      this.container.appendChild(inputRow);

      this.inputEl.addEventListener('keydown', e => this._onKey(e));
      this.inputEl.addEventListener('input',   () => this._autoResize());
    }

    _autoResize() {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = this.inputEl.scrollHeight + 'px';
    }

    _onKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit(this.inputEl.value);
        return;
      }
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        e.preventDefault();
        if (this.histIdx < this.history.length-1) {
          this.histIdx++;
          this.inputEl.value = this.history[this.history.length-1-this.histIdx];
          this._autoResize();
        }
        return;
      }
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        e.preventDefault();
        if (this.histIdx > 0) {
          this.histIdx--;
          this.inputEl.value = this.history[this.history.length-1-this.histIdx];
        } else {
          this.histIdx = -1;
          this.inputEl.value = '';
        }
        this._autoResize();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const pos = this.inputEl.selectionStart;
        const text = this.inputEl.value;
        this.inputEl.value = text.slice(0,pos) + '    ' + text.slice(pos);
        this.inputEl.selectionStart = this.inputEl.selectionEnd = pos+4;
        this._autoResize();
        return;
      }
      if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); this._handleCommand('.clear'); }
    }

    _submit(raw) {
      const line = raw;
      this.inputEl.value = '';
      this._autoResize();
      this.histIdx = -1;

      // echo input
      if (this.inBlock) {
        this._appendLine(CONT + line, 'cont');
      } else {
        this._appendLine(PROMPT + line, 'input');
      }

      if (line.trim()) this.history.push(line);

      // REPL commands
      if (!this.inBlock && line.trim().startsWith('.')) {
        this._handleCommand(line.trim());
        return;
      }

      this.buffer.push(line);

      // Decide: are we waiting for more input?
      const full = this.buffer.join('\n');
      if (this._needsMore(full, line)) {
        this.inBlock = true;
        this.promptEl.textContent = CONT;
        return;
      }

      // Execute
      this.inBlock = false;
      this.promptEl.textContent = PROMPT;
      const source = this.buffer.join('\n');
      this.buffer = [];
      if (source.trim()) this._run(source);
    }

    _needsMore(full, lastLine) {
      // empty continuation line ends a block
      if (this.inBlock && lastLine.trim() === '') return false;
      // check if last meaningful line opens a block
      const stripped = lastLine.trimEnd();
      if (stripped.endsWith(':')) return true;
      // check open brackets
      let depth = 0;
      for (const c of full) {
        if ('([{'.includes(c)) depth++;
        if (')]}'.includes(c)) depth--;
      }
      if (depth > 0) return true;
      // check if we are already in a block (indented content)
      if (this.inBlock && lastLine.match(/^\s+/)) return true;
      return false;
    }

    _run(source) {
      try {
        const lexer  = new Lexer(source);
        const parser = new Parser(lexer.tokens);
        const ast    = parser.parse();
        const result = this.evaluator._execBlock(ast.body, this.evaluator.globalEnv);
        // if the last statement was an expression with a non-null value, print it
        // (only if no explicit println was called for it)
        if (ast.body.length>0) {
          const last = ast.body[ast.body.length-1];
          if (last.type==='ExprStmt' && result!==null && result!==undefined) {
            // don't re-print if it's a proc/class/enum definition result
            if (typeof result!=='object'||!['proc','class','enum','struct_type','module'].includes(result.__type)) {
              this._appendLine(sageStr(result), 'output');
            }
          }
        }
      } catch(e) {
        this._displayError(source, e);
      }
    }

    _displayError(source, e) {
      if (e instanceof ParseError) {
        const lines = source.split('\n');
        const lineText = lines[Math.min((e.line||1)-1, lines.length-1)] || '';
        const col = e.col || 1;
        const caret = ' '.repeat(Math.max(0,col-1)) + '^^^';
        const shortSrc = source.trim().slice(0, 60);

        this._appendLine(``, 'dim');
        this._appendLine(`-- error[E000]: syntax error`, 'error');
        this._appendLine(`   → repl  line ${e.line||1}`, 'error');
        this._appendLine(``, 'dim');
        this._appendLine(` ${e.line||1} | ${lineText}`, 'error');
        this._appendLine(`   | ${caret}`, 'error');
        this._appendLine(``, 'dim');
        this._appendLine(` Firefly ✦  ${e.message}`, 'firefly');
        this._appendLine(``, 'dim');
        return;
      }
      if (e instanceof RaiseSignal) {
        const msg = sageStr(e.value);
        const lines = source.split('\n');
        const errCode = this._errorCode(msg);
        this._appendLine(``, 'dim');
        this._appendLine(`-- error[${errCode}]: ${msg}`, 'error');
        this._appendLine(`   → repl`, 'error');
        this._appendLine(``, 'dim');
        const suggestion = this._firефlyAdvice(msg);
        if (suggestion) this._appendLine(` Firefly ✦  ${suggestion}`, 'firefly');
        this._appendLine(``, 'dim');
        return;
      }
      // unknown JS error
      this._appendLine(`-- internal error: ${e.message}`, 'error');
    }

    _errorCode(msg) {
      if (msg.includes('undefined variable')||msg.includes('not defined')) return 'E001';
      if (msg.includes('not callable')) return 'E002';
      if (msg.includes('division by zero')||msg.includes('modulo by zero')) return 'E003';
      if (msg.includes('recursion')) return 'E004';
      if (msg.includes('attribute')) return 'E005';
      if (msg.includes('subscriptable')) return 'E006';
      if (msg.includes('convert')) return 'E007';
      if (msg.includes('pointer')) return 'E008';
      return 'E000';
    }

    _firефlyAdvice(msg) {
      if (msg.includes('undefined variable')&&msg.includes('Did you mean')) return msg.split('. ').slice(1).join('. ');
      if (msg.includes('undefined variable')) return `Check the spelling. Use the variable name exactly as it was declared.`;
      if (msg.includes('division by zero')) return `Guard with 'if divisor != 0' before dividing.`;
      if (msg.includes('not callable')) return `This value is not a proc. Check the type with type(value).`;
      if (msg.includes('recursion')) return `The call stack exceeded ${500} frames. Check for missing base case in recursion.`;
      if (msg.includes('attribute access on None')) return `The value is None. Check if your proc returned what you expected.`;
      if (msg.includes('has no attribute')||msg.includes('has no method')) return `Use .keys() on dicts or check the type with type(value).`;
      if (msg.includes('convert')) return `Use str() to safely convert any value to a string first.`;
      if (msg.includes('freed pointer')) return `mem_read/write on a freed pointer. Call mem_free only after all reads are done.`;
      return null;
    }

    _handleCommand(cmd) {
      const parts = cmd.slice(1).trim().split(/\s+/);
      switch(parts[0]) {
        case 'clear':
          this.outputEl.innerHTML = '';
          this._appendLine('-- cleared ✦', 'dim');
          break;
        case 'reset':
          this.outputEl.innerHTML = '';
          this.buffer = [];
          this.inBlock = false;
          this.promptEl.textContent = PROMPT;
          this.evaluator = new Evaluator((text,nl=true)=>this._printOutput(text,nl));
          this._appendLine('-- environment reset ✦', 'dim');
          break;
        case 'help':
          this._printHelp();
          break;
        case 'example':
        case 'examples':
          this._printExamples(parts[1]);
          break;
        case 'env':
          this._printEnv();
          break;
        default:
          this._appendLine(`unknown command '.${parts[0]}' — try .help`, 'error');
      }
    }

    _printOutput(text, newline=true) {
      if (!newline) { this._pendingOutput += text; return; }
      const full = this._pendingOutput + text;
      this._pendingOutput = '';
      this._appendLine(full, 'output');
    }

    _appendLine(text, kind='output') {
      const div = document.createElement('div');
      div.className = 'sage-repl-line sage-repl-line-' + kind;
      div.textContent = text;
      this.outputEl.appendChild(div);
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
      if (kind === 'firefly' && this._fireflyHook) { try { this._fireflyHook(); } catch (_e) {} }
    }

    // public: wipe output + start a fresh environment
    reset() {
      this.outputEl.innerHTML = '';
      this.buffer = [];
      this.inBlock = false;
      this.histIdx = -1;
      this.promptEl.textContent = PROMPT;
      this.evaluator = new Evaluator((text, nl=true) => this._printOutput(text, nl));
      if (!this.skipWelcome) this._welcome();
    }

    // public: focus the input
    focus() { if (this.inputEl) this.inputEl.focus(); }

    _printHelp() {
      const lines = [
        ``,
        ` Sage REPL  ✦  ${VERSION}  — browser emulator`,
        ` ──────────────────────────────────────────────`,
        ` Multi-line: end a line with : and press Enter.`,
        `             Finish block with a blank line.`,
        ` History:    ↑ / ↓ arrows`,
        ` Tab:        inserts 4 spaces`,
        ` Ctrl+L:     clear output`,
        ``,
        ` Commands:`,
        `   .clear          clear the output`,
        `   .reset          reset the environment`,
        `   .env            list defined names`,
        `   .examples       list all example topics`,
        `   .example hello  run the hello example`,
        `   .help           this message`,
        ``,
        ` Sage syntax quick-ref:`,
        `   let x = 42               variable (immutable)`,
        `   var y = "hello"          variable (mutable)`,
        `   int n = 10               typed declaration`,
        `   proc add(a, b): ...      function`,
        `   if cond: / elif: / else: conditionals`,
        `   for x in range(10): ...  loop`,
        `   try: ... catch e: ...    error handling`,
        `   raise "something"        raise an error`,
        `   x ?? "default"           null coalescing`,
        `   [1,2,3]  {a: 1}          array, dict`,
        ``,
      ];
      lines.forEach(l=>this._appendLine(l, 'info'));
    }

    _printExamples(topic) {
      const examples = {
        hello:     `println("hello, world")`,
        types:     `let x = 42\nint y = 10\nfloat z = 3.14\nprintln(str(x) + " " + str(y) + " " + str(z))`,
        proc:      `proc add(a, b):\n    return a + b\n\nprintln(add(3, 4))`,
        closure:   `proc make_adder(n):\n    proc add(x):\n        return x + n\n    return add\n\nlet add5 = make_adder(5)\nprintln(add5(10))`,
        loop:      `for i in range(0, 5):\n    println(str(i) + " * " + str(i) + " = " + str(i * i))`,
        array:     `let nums = [1, 2, 3, 4, 5]\nnums.push(6)\nprintln(nums)\nprintln(nums.filter(proc(x): return x % 2 == 0))`,
        dict:      `let d = {name: "sage", version: "0.2.0"}\nprintln(d.get("name"))\nd.set("stable", false)\nprintln(d.items())`,
        struct:    `struct Point:\n    x: float\n    y: float\n\nimpl Point:\n    proc to_str(self):\n        return "(" + str(self.x) + ", " + str(self.y) + ")"\n\nlet p = Point(3.0, 4.0)\nprintln(p.to_str())`,
        class:     `class Animal:\n    proc init(self, name):\n        self.name = name\n    proc speak(self):\n        return "..."\n\nclass Dog(Animal):\n    proc speak(self):\n        return "woof"\n\nlet d = Dog("Rex")\nprintln(d.name + " says " + d.speak())`,
        enum:      `enum Shape:\n    Circle(radius: float)\n    Rect(w: float, h: float)\n    Dot\n\nlet c = Shape.Circle(5.0)\nprintln(c)`,
        match:     `enum Color:\n    Red\n    Green\n    Blue\n\nlet c = Color.Green\nmatch c:\n    case Color.Red:\n        println("red")\n    case Color.Green:\n        println("green")\n    case _:\n        println("other")`,
        trycatch:  `proc safe_div(a, b):\n    try:\n        if b == 0:\n            raise "division by zero"\n        return a / b\n    catch e:\n        println("caught: " + e)\n        return None\n\nprintln(safe_div(10, 2))\nprintln(safe_div(10, 0))`,
        generator: `proc counter(start, end):\n    var n = start\n    while n <= end:\n        yield n\n        n = n + 1\n\nlet g = counter(1, 5)\nfor x in g:\n    print(str(x) + " ")`,
        fibonacci: `proc fibonacci():\n    var a = 0\n    var b = 1\n    while true:\n        yield a\n        let next = a + b\n        a = b\n        b = next\n\nlet fib = fibonacci()\nfor i in range(0, 10):\n    print(str(next(fib)) + " ")`,
        null_coal: `let name = None\nlet greeting = "hello, " + (name ?? "stranger")\nprintln(greeting)`,
        defer:     `proc with_cleanup():\n    println("start")\n    defer:\n        println("cleanup")\n    println("middle")\n    return\n\nwith_cleanup()`,
        memory:    `@manual:\n    var buf = mem_alloc(16)\n    mem_write(buf, 0, "int", 0xDEAD)\n    mem_write(buf, 4, "int", 0xBEEF)\n    println(mem_read(buf, 0, "int"))\n    println(mem_read(buf, 4, "int"))\n    mem_free(buf)`,
        ffi_c:     `import c_ffi\nlet lib = c_ffi.load("libm.so.6")\nlet sqrt_fn = c_ffi.bind(lib, "sqrt", "double")\nprintln(sqrt_fn(2.0))\nc_ffi.unload(lib)`,
        ffi_py:    `import python\nlet np = python.import("numpy")\nprint(np.mean([1.0, 2.0, 3.0, 4.0, 5.0]))`,
        sandbox:   `import sandbox\nlet box = sandbox.create("plugin.manifest")\nlet r = sandbox.run(box, "plugin.sage")\nprintln(r.ok)\nsandbox.close(box)`,
        map_filter:`let nums = [1,2,3,4,5,6,7,8,9,10]\nlet evens = nums.filter(proc(x): return x % 2 == 0)\nlet squared = evens.map(proc(x): return x * x)\nprintln(squared)`,
        recursion: `proc factorial(n: int) -> int:\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n\nfor i in range(0, 8):\n    println(str(i) + "! = " + str(factorial(i)))`,
        strings:   `let s = "hello, sage"\nprintln(s.upper())\nprintln(s.contains("sage"))\nprintln(s.replace("sage", "world"))\nprintln(s.split(", "))`,
      };

      if (!topic) {
        this._appendLine('', 'dim');
        this._appendLine(' Available examples:', 'info');
        const keys = Object.keys(examples);
        for (let i=0;i<keys.length;i+=4) {
          this._appendLine('   ' + keys.slice(i,i+4).join('  '), 'info');
        }
        this._appendLine(' Run: .example <name>', 'info');
        this._appendLine('', 'dim');
        return;
      }

      const code = examples[topic];
      if (!code) { this._appendLine(`unknown example '${topic}'. Try .examples`, 'error'); return; }
      this._appendLine('', 'dim');
      this._appendLine(' ' + topic + ':', 'info');
      code.split('\n').forEach(l=>this._appendLine((l.startsWith('    ')||l.startsWith('\t')?'  ':' ')+CONT+l, 'dim'));
      this._appendLine('', 'dim');
      // auto-run
      try {
        this.evaluator.evalSource(code);
      } catch(e) {
        this._displayError(code, e);
      }
    }

    _printEnv() {
      const names = Object.keys(this.evaluator.globalEnv.vars).filter(n=>{
        const v = this.evaluator.globalEnv.vars[n];
        return !v||v.__type!=='builtin';
      });
      if (names.length===0) { this._appendLine(' (no user-defined names yet)', 'dim'); return; }
      this._appendLine('', 'dim');
      names.forEach(n=>{
        const v = this.evaluator.globalEnv.vars[n];
        this._appendLine(` ${n}  =  ${sageStr(v)}`, 'info');
      });
      this._appendLine('', 'dim');
    }

    _welcome() {
      const lines = [
        ``,
        ` Sage  ✦  ${VERSION}  — REPL (browser emulator)`,
        ` ─────────────────────────────────────────────`,
        ` Type Sage code and press Enter.`,
        ` Multi-line: end with : and continue. Blank line to run.`,
        ` .help for commands  ·  .examples to browse samples`,
        ``,
        ` quick start:`,
        `   println("hello")`,
        `   let x = [1, 2, 3]`,
        `   println(x.map(proc(n): return n * n))`,
        ``,
      ];
      lines.forEach(l=>this._appendLine(l, 'info'));
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  global.SageREPL = SageREPL;
  global.SageEvaluator = Evaluator;
  global.sageInjectCSS = injectCSS;

  function init() {
    const target = document.getElementById('sage-repl');
    if (!target) return;          // no standalone mount — a host (delight.js) drives it
    injectCSS();
    new SageREPL(target);
  }

  if (!global.__SAGE_NO_AUTOINIT) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

})(window);
