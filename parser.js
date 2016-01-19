var tokenizer_module = require('./tokenizer.js');
var util_module = require('./util.js');

var tokenizer = tokenizer_module.tokenizer;
var array_to_hash = util_module.array_to_hash;
var parse_error = util_module.parse_error;

var PUNCTUATION = {
	BANG         :"!",
  	BANG_EQ      :"!=",
    BANG_EQ_EQ   :"!==",
    PCT          :"%",
    PCT_EQ       :"%=",
    AMP          :"&",
    AMP_AMP      :"&&",
    AMP_AMP_EQ   :"&&=",
    AMP_EQ       :"&=",
    LPAREN       :"(",
    RPAREN       :")",
    AST          :"*",
    AST_EQ       :"*=",
    PLUS         :"+",
    PLUS_PLUS    :"++",
    PLUS_EQ      :"+=",
    COMMA        :",",
    MINUS        :"-",
    MINUS_MINUS  :"--",
    MINUS_EQ     :"-=",
    DOT          :".",
    DOT_DOT      :"..",
    ELIPSIS      :"...",
    COLON        :":",
    COLON_COLON  :"::",
    SEMI         :";",
    LT           :"<",
    LT_LT        :"<<",
    LT_LT_EQ     :"<<=",
    LT_EQ        :"<=",
    EQ           :"=",
    EQ_EQ        :"==",
    EQ_EQ_EQ     :"===",
    GT           :">",
    GT_EQ        :">=",
    GT_GT        :">>",
    GT_GT_EQ     :">>=",
    GT_GT_GT     :">>>",
    GT_GT_GT_EQ  :">>>=",
    QMARK        :"?",
    LSQUARE      :"[",
    RSQUARE      :"]",
    CARET        :"^",
    CARET_EQ     :"^=",
    LCURLY       :"{",
    PIPE         :"|",
    PIPE_EQ      :"|=",
    PIPE_PIPE    :"||",
    PIPE_PIPE_EQ :"||=",
    RCURLY       :"}",
    TILDE        :"~",
    SLASH        :"/",
    SLASH_EQ     :"/="
}

var TOKEN_TYPE = {
	COMMENT     :"comment",  //分词器中貌似没有这种类型
	STRING      :"string",
	REGEXP      :"regexp",
	PUNCTUATION :"punc",
	NUM         :"num",      //能否将int, float分开
	NAME        :"name",
	KEYWORD     :"keyword",
    OPETATOR    :"operator",
    ATOM        :"atom",
    LINE_CONTINUATION : ""   //由于是nodejs写的, nodejjs会自动认出这个LINE_CONTINUATION, 而把它处理掉, 因此该分词器中没有这种类型
}

var parser = function($TEXT, exigent_mode) {

    var tq = {
    	input         : typeof $TEXT == "string" ? tokenizer($TEXT, true) : $TEXT,
        token         : null,
        prev          : null,
        peeked        : null,
        in_function   : 0,
        in_directives : true,
        in_loop       : 0,              //标记第几层嵌套
        labels        : [],
        tokline       : 0,
        tokcol        : 0,
        tokpos        : 0,

    	isEmpty       : function() {
    		return tq.peek().type == 'eof';
    	},
    	expectEmpty   : function() {
        	if (!tq.isEmpty()) {
		      parse_error("Unexpected end of file");
		    }
        },
        next          : function() {
	        tq.token = tq.input();
	        return tq.token;
        },
        pop          : function() {
        	var t = tq.token;
        	tq.advance();
        	return t;
        },
        peek         : function() {
        	//起始状态
        	if (tq.token == null) {
        		tq.advance();
        	}
        	return tq.token;
        },
        /** Advance to the next token. */
        advance      : function() {
        	tq.prev = tq.token;
        	if (tq.peeked) {
        		tq.token = tq.peeked;
        		tq.peeked = null;
        	} else {
        		tq.next();
        	}
        },
        rewind       : function() {
        	tq.peeked = tq.token;
        	tq.token = tq.prev;
        },
        /**
		 * Pops the current token if it matches the given text, but
		 * raises a ParseException otherwise.
		 */
        expectToken   : function(text) {
        	//next();
        	if (tq.token.value == text) {
        		tq.advance();
        		return true;
        	}
        	parse_error("Unexpected token");
        	return false;
        },

        checkToken   : function(text) {
        	if (tq.isEmpty()) { 
        		return false;
        	}
        	if (tq.peek().value == text) {
		        tq.advance();
		        return true;
		    }
		    return false;
        }, 
        lookaheadToken:function(text) {
        	return !tq.isEmpty() && tq.peek().value == text;
        }
    }

    var parse = function () {
    	var program = parseProgram();
    	tq.expectEmpty();
    	return program;
    }

    var parseProgram = function() {
    	var stmts = parseProgramOrFunctionBody(false);
    	var programStmt = new programStatement(stmts);
    	return programStmt;
  	}
	
	var parseProgramOrFunctionBody = function (requireBrackets) {
		if (requireBrackets) {
			tq.expectToken(PUNCTUATION.LCURLY); 
		}
		var stmts = [];
		var prologue = parseDirectivePrologue();
		if (prologue != null) {
			stmts.push(prologue);
		}
		while (!tq.isEmpty() && !tq.lookaheadToken(PUNCTUATION.RCURLY)) {
	        stmts.push(parseTerminatedStatement());
	    }
	    if (requireBrackets) {
	    	tq.expectToken(PUNCTUATION.RCURLY);
	    }
	    return stmts;
	}

	var parseTerminatedStatement = function() {
		var s = parseStatement();
    	if (!isTerminal(s)) { checkSemicolon(); }
    	return s;
	}

	var parseStatement = function() {
		var currToken = tq.peek();
		// look for any labels preceding statement
		if (TOKEN_TYPE.NAME == currToken.type) {
			var label = parseIdentifier(false);
			if (tq.checkToken(PUNCTUATION.COLON)) {
				var t = tq.peek();
			    var s; //statement
				if (TOKEN_TYPE.KEYWORD == t.type) {
		            switch (t.value) {
			            case "for": case "do": case "while": case "switch":
			                s = parseLoopOrSwitch();
			                break;
			            default:
			                break;
			        }
			    }
			    if (null == s) {
		            s = parseStatementWithoutLabel();
		        }
		        //将statement放到labeledstatement中
		        var labeledstmt = new labeledStatement(label, s); //labeledStmtWrapper(posFrom(m), label, labelless);
		        return labeledstmt;
	        }
	        tq.rewind();
		}
		return parseStatementWithoutLabel();
	}

	var parseStatementWithoutLabel = function() {
		var token = tq.peek();
		if (TOKEN_TYPE.KEYWORD == token.type) {
			var s;
			switch (token.value) {
				case 'for': case 'do': case 'while': case 'switch':
	          		s = parseLoopOrSwitch();
	          		break;
	          	case 'if': {
	          		tq.advance();
	          		var clauses = [];
	          		var sawElse;
	          		var elseClause = null;
	          		do {
	          			tq.expectToken(PUNCTUATION.LPAREN);
	          			var cond = parseExpression(false);
	          			tq.expectToken(PUNCTUATION.RPAREN);
	          			var body = parseBody();
	          			sawElse = tq.checkToken('else');
	          			var ifClause = new ifClauseStatement(cond, body);
	          			clauses.push(ifClause);
	          		} while(sawElse && tq.checkToken('if'));
	          		if (sawElse) {
	          			elseClause = parseBody();
	          		}
	          		var s = new conditionalStmt(clauses, elseClause);
	          		break;
	          	}
	          	case 'var':
	          	case 'const':
	          		return parseDeclarationsOrExpression(true);
	          	case 'function': {
	          		tq.advance();
	          		if (tq.lookaheadToken(PUNCTUATION.LPAREN)) {
	          			// If no name, then treat it as an expression, probably a lambda
	          			return parseExpressionStmt(true);
	          		} else {
	          			var idfNode = parseIdentifierNode(false);
	          			tq.expectToken(PUNCTUATION.LPAREN);
	          			var params = parseFormalParams();
	          			tq.expectToken(PUNCTUATION.RPAREN);
	          			var body = parseFunctionBody();
	          			//var fc = new functionConstructor(idfNode.name, params, body);
	          			s = new functionDeclaration(idfNode.name, params, body);
	          		}
	          		break;
	          	}
	          	case 'return': {
	          		tq.advance();
	          		var value;
	          		// Check for semicolon insertion without lookahead since return is a
	          		// restricted production. See the grammar above and ES3 or ES5 S7.9.1
	          		if (semicolonInserted() || tq.lookaheadToken(PUNCTUATION.SEMI)) {
	          			value = null;
	          		} else {
	          			value = parseExpression(true);
	          		}
	          		s = new returnStatement(value);
	          		break;
	          	}
	          	case 'break': {
	          		tq.advance();
	          		var targetLabel = "";
	          		if (!semicolonInserted() && TOKEN_TYPE.NAME == tq.peek().type) {
	            		targetLabel = parseIdentifier(false);
	          		}
	          		s = new breakStatement(targetLabel);
	          		break;
	          	}
	          	case 'continue': {
	          		tq.advance();
	          		var targetLabel = "";
	          		if (!semicolonInserted() && TOKEN_TYPE.NAME == tq.peek().type) {
	            		targetLabel = parseIdentifier(false);
			        }
			        s = new continueStatement(targetLabel);
			        break;
	          	}
	          	case 'debugger': {
	          		tq.advance();
	          		s = new debuggerStmt();
	          		break;
	          	}
	          	case 'throw': {
	          		tq.advance();
	          		if (semicolonInserted()) {
	          			parse_error('parse throw error!');
	          		}
	          		var ex = parseExpression(true);
	          		s = new throwStatement(ex);
	          		break;
	          	}
	          	case 'try': {
	          		tq.advance();
	          		var body = parseBody();
	          		var handler;
	          		var finallyBlock;
	          		var sawFinally = tq.checkToken('finally');
	          		if (sawFinally) {
	            		handler = null;
	          		} else {
	          			tq.expectToken('catch');
	            		tq.expectToken(PUNCTUATION.LPAREN);
	            		var idfName = parseIdentifier(false);
	            		var exvar = new declaration(idfName, null);
	            		tq.expectToken(PUNCTUATION.RPAREN);
	            		var catchBody = parseBody();
	            		handler = new catchStatement(exvar, catchBody);
	            		sawFinally = tq.checkToken('finally');
	          		}
	          		var finallyBlock = null;
	          		if (sawFinally) {
	          			var st = parseBody();
	          			finallyBlock = new finallyStatement(st);
	          		}
	          		s = new tryStatement(body, handler, finallyBlock);
	          		break;
	          	}
	          	case 'with': {
	          		tq.advance();
	          		tq.expectToken(PUNCTUATION.LPAREN);
	          		var scopeObject = parseExpression(false);
	          		tq.expectToken(PUNCTUATION.RPAREN);
	          		var body = parseBody();
	          		s = new withStatement(scopeObject, body);
	          		break;
	          	}
	          	default:
	          		return parseExpressionStmt(true);
          	}
          	return s;
		} else {
			if (tq.checkToken(PUNCTUATION.LCURLY)) {
				var stmts = [];
				while (!tq.checkToken(PUNCTUATION.RCURLY)) {
        			stmts.push(parseTerminatedStatement());
      			}
      			var block = new blockStatement(stmts);
      			return block;
			} else if (tq.checkToken(PUNCTUATION.SEMI)) {
				return new noopStatement();
			} else {
				return parseExpressionStmt(true);
			}
		}
	}

	var parseLoopOrSwitch = function() {
		var token = tq.peek();

		var stmt;

		switch (token.value) {
			case "for":
				tq.advance();
				stmt = parseForStatement();
				break;
			case "while":
				tq.advance();
        		stmt = parseWhileStmt();
        		break;
			case "do":
				tq.advance();
				stmt = parseDoWhileStmt();
				break;
			case "switch":
				tq.advance();
				stmt = parseSwitchStmt();
				break;
			default:
				parse_error('parse loop or switch error');
		}
		return stmt;
	}

	var parseSwitchStmt = function() {
		tq.expectToken(PUNCTUATION.LPAREN);
		var switchValue = parseExpression(false);
		tq.expectToken(PUNCTUATION.RPAREN);
        tq.expectToken(PUNCTUATION.LCURLY);
        var cases = [];
        while (!tq.checkToken(PUNCTUATION.RCURLY)) {
        	var caseValue = null;
        	if (tq.checkToken('default')) {
	            caseValue = null;
	        } else {
	        	tq.expectToken('case');
	        	caseValue = parseExpression(false);
	        }
	        tq.expectToken(PUNCTUATION.COLON);
	        var caseBodyContents = [];
	        while (!(tq.lookaheadToken('default')
                   || tq.lookaheadToken('case')
                   || tq.lookaheadToken(PUNCTUATION.RCURLY))) {
            	caseBodyContents.push(parseTerminatedStatement());
          	}
          	var cs = new caseStatement(caseValue, caseBodyContents);
          	cases.push(cs);
        }
        //测试一下给case加上{}的情况
        var stmt = new switchStatement(switchValue, cases);
        return stmt;
	}

	var parseDoWhileStmt = function() {
		var body = parseBody();
		tq.expectToken('while');
        tq.expectToken(PUNCTUATION.LPAREN);
        var cond = parseExpression(false);
        tq.expectToken(PUNCTUATION.RPAREN);
        var s = new doWhileStmt(body, cond);
        return s;
	}

	var parseWhileStmt = function() {
		tq.expectToken(PUNCTUATION.LPAREN);
		var cond = parseExpression(false);
		tq.expectToken(PUNCTUATION.RPAREN);
		var body = parseBody();
		var s = new whileStatement(cond, body);
		return s;
	}

	var parseForStatement = function() {
		tq.expectToken(PUNCTUATION.LPAREN);
		var e;
		if (tq.checkToken(PUNCTUATION.SEMI)) {
			var initializer = new noopStatement();
			var condition = parseExpressionOrNoop(false);
			var increment;
			if (!tq.checkToken(PUNCTUATION.RPAREN)) {
				increment = parseExpression(false);
				tq.expectToken(PUNCTUATION.RPAREN);
			} else {
				increment = new noopStatement();
			}
			var body = parseBody();
			e = new forStatement(initializer, condition, increment, body);
		} else {
			var initializer = parseDeclarationsOrExpression(false);
			if (tq.checkToken('in')) {
				var iterable = parseExpression(false);
				tq.expectToken(PUNCTUATION.RPAREN);
				var body = parseBody();
				e = new forInStatement(initializer, iterable, body);
			} else if(tq.checkToken('of')){
				var iterable = parseExpression(false);
				tq.expectToken(PUNCTUATION.RPAREN);
				var body = parseBody();
				e = new forOfStatement(initializer, iterable, body);
			} else {
				tq.expectToken(PUNCTUATION.SEMI);
				var condition = parseExpressionOrNoop(false);
				var increment;
				if (!tq.checkToken(PUNCTUATION.RPAREN)) {
					increment = parseExpressionStmt(true);
              		tq.expectToken(PUNCTUATION.RPAREN);
				} else {
					increment = new  noopStatement();
				}
				var body = parseBody();
				e = new forStatement(initializer, condition, increment, body);
			}
		}
		return e;
	}

	var parseDeclarationsOrExpression = function(insertCommaAllowed) {
		var isDeclaration;
		if (tq.checkToken('var')) {
			isDeclaration = true;
		} else if (tq.checkToken('const')) {
			isDeclaration = true;
		} else {
			isDeclaration = false;
		}
		if (isDeclaration) {
			var idNode = parseIdentifierNode(false);
			var initializer = null;
			if (tq.checkToken(PUNCTUATION.EQ)) {
	            initializer = parseExpression(insertCommaAllowed);
	        }
	        var d = new declaration(idNode, initializer);
	        var st;
	        if (tq.checkToken(PUNCTUATION.COMMA)) {
	        	var decls = [];
	        	decls.push(d);
	        	do {
	        		idNode = parseIdentifierNode(false);
	        		initializer = null;
	        		if (tq.checkToken(PUNCTUATION.EQ)) {
			            initializer = parseExpression(insertCommaAllowed);
			        }
			        d = new declaration(idNode, initializer);
			        decls.push(d);
	        	} while (tq.checkToken(PUNCTUATION.COMMA));
	        	st = new multiDeclarations(decls);
	        } else {
	        	st = d;
	        }
	        return st;
		} else {
			return parseExpressionStmt(insertCommaAllowed);
		}
	}

	var parseExpressionStmt = function(insertCommaAllowed) {
		var e = parseExpression(insertCommaAllowed);
		var es = new expressionStmt(e);
		return es;
	}

	var parseBody = function() {
		var s;
		var stmts = [];
		var requireBrackets = tq.lookaheadToken(PUNCTUATION.LCURLY);
		//存在花括号
		if (requireBrackets) {
			tq.expectToken(PUNCTUATION.LCURLY);
			while (!tq.isEmpty() && !tq.lookaheadToken(PUNCTUATION.RCURLY)) {
				stmts.push(parseTerminatedStatement());
			}
			s = new blockStatement(stmts);
			tq.expectToken(PUNCTUATION.RCURLY);
			return s;
		} else {
			if (!tq.isEmpty()) {
				stmts.push(parseTerminatedStatement());
			}
			s = new blockStatement(stmts);
			return s;
		}
	}

	var parseExpressionOrNoop = function(insertCommaAllowed) {
		//若直接; 条件表达式该是true
		if (tq.checkToken(PUNCTUATION.SEMI)) {
	        //finish(def, m);
	        var literal = new booleanLiteral(true);
	        return literal;
	    } else {
	    	var e = parseExpression(insertCommaAllowed);
    		tq.expectToken(PUNCTUATION.SEMI);
    		return e;
	    }
	}

	var parseExpression = function(insertCommaAllowed) {
		var exp = parseOp(-1, insertCommaAllowed);

		if (tq.checkToken(PUNCTUATION.COMMA)) {
			var exps = [];
			exps.push(exp);
			do {
				var right = parseExpression(insertCommaAllowed);
				exps.push(right);
			} while (tq.checkToken(PUNCTUATION.COMMA));
			var sequence = new sequenceExpression(exps);
			return sequence;
		}

		return exp;
	}

	var parseOp = function(precedence, insertCommaAllowed) {
		var left = null;
		var token = tq.peek();
		var opprec;
		debugger;
		if (OPERATOR_TYPE.PREFIX[token.value] !== undefined) {
			var op = token;
			//handl prefix operator
			tq.advance();
			opprec = (PRECEDENCE.PREFIX)[token.value];
			if (opprec > precedence) {
				left = parseOp(opprec - 1, insertCommaAllowed);
			} else {
				parse_error('parse prefix operator error!');
			}
			if (op.value == 'new' && tq.checkToken(PUNCTUATION.LPAREN)) {
				var operands = [];
				var currCallee = left;
				if (!tq.checkToken(PUNCTUATION.RPAREN)) {
					do {
              			operands.push(parseExpression(false));
            		} while (tq.checkToken(PUNCTUATION.COMMA));
            		tq.expectToken(PUNCTUATION.RPAREN);
				}
				left = new newExpression(currCallee, operands);
			} else {
		        left = new prefixExpression(op.value, left); ///Operation.create(posFrom(m), op, left);
			}
		}
		if (left == null) {
			left = parseExpressionAtom();
			//console.log(left);
			//console.log(tq.peek());
			//tq.advance();
		}
		
		//Parse binary operators, except comma
		var op = null;
		while (!tq.isEmpty()) {
			token = tq.peek();
			
			// If it is a binary op then we should consider using it
			//操作符优先级
			if (PUNCTUATION.COMMA == token.value) {
				break;
			} else if ((OPERATOR_TYPE.INFIX)[token.value]) {
				opprec = (PRECEDENCE.INFIX)[token.value];
			} else if ((OPERATOR_TYPE.BRACKET)[token.value]) {
				opprec = (PRECEDENCE.BRACKET)[token.value];
			} else if ((OPERATOR_TYPE.TERNARY)[token.value]) {
				opprec = (PRECEDENCE.TERNARY)[token.value];
			} else if ((OPERATOR_TYPE.POSTFIX)[token.value]) {
				opprec = (PRECEDENCE.POSTFIX)[token.value];
			} else {
				break;
			}
			
			//如果opprec == precedence, 按照从左至右处理
			if (!(opprec > precedence)) {
				break;
			}
			
			op = token;
			tq.advance();  // Consume the operator token

			var right;
			try {
				// Recurse to parse operator arguments.
				if ((OPERATOR_TYPE.BRACKET)[op.value]) {
					//函数调用
					if (PUNCTUATION.LPAREN == op.value) {
						var params = [];
						if (!tq.checkToken(PUNCTUATION.RPAREN)) {
							do {
								params.push(parseExpression(false));
							} while (tq.checkToken(PUNCTUATION.COMMA));
							tq.expectToken(PUNCTUATION.RPAREN);
						}
						//关于函数的调用操作符再思考一下
						right = new actualList(params);
					} else {
						right = parseExpression(false);
						//其实这边不一定是中括号,也有可能是小括号
						tq.expectToken(PUNCTUATION.RSQUARE);
					}
				} else if ((OPERATOR_TYPE.POSTFIX)[op.value]) {
					right = null;
				} else if ((OPERATOR_TYPE.TERNARY)[op.value]) {
					right = parseExpression(false);
				} else if (op.value == '.') {
					right = parseReference(true);
				} else {
					right = parseOp(opprec, insertCommaAllowed);
				}
			} catch(e) {
				parse_error('parse_error!');
			}

			if ((OPERATOR_TYPE.TERNARY)[op.value]) {
				tq.expectToken(":");
				var farRight = parseExpression(false);
				left = new conditionalExpression(left, right, farRight);
			} else if ((OPERATOR_TYPE.BRACKET)[op.value]) {
				//函数调用的情况,需要解析
				if (op.value == PUNCTUATION.LPAREN) {
					left = new callExpression(left, right);
				} else {
					//左方括号
					left = new memberExpression('[]', left, right);
				}
			} else if ((OPERATOR_TYPE.POSTFIX)[op.value]) {
				left = new postfixExpression(op.value, left);
			} else if ((OPERATOR_TYPE.INFIX)[op.value]) {
				if(op.value == PUNCTUATION.COMMA) {
					if (left.type == 'sequenceExpression') {
						left.append(right);
					} else {
						var se = new sequenceExpression();
						se.append(left);
						se.append(right);
						left = se;
					}
				} else if(op.value == PUNCTUATION.EQ) {
					left = new assignmentExpression(op.value, left, right);
				} else if (op.value === PUNCTUATION.DOT){
					left = new memberExpression(PUNCTUATION.DOT, left, right);
				} else {
					left = new binaryExpression(op.value, left, right);
				}
			} else {
				parse_error('parse_error!');
			}
		}
		return left;
	}


	var parseExpressionAtom = function() {
		var e;
		var token = tq.peek();
		typeswitch: switch (token.type) {
			case TOKEN_TYPE.STRING:
				e = new stringLiteral(token.value);
				tq.advance();
				break;
			case TOKEN_TYPE.NUM:
				e = new numberLiteral(token.value);
				tq.advance();
				break;
			case TOKEN_TYPE.REGEXP:
				e = new regexpLiteral(token.value);
				tq.advance();
				break;
			case TOKEN_TYPE.KEYWORD: {
				var kword = token.value;
				switch (kword) {
					case "null":
						e = new nullLiteral();
						tq.advance();
              			break typeswitch;
              		case "true":
              			e = new booleanLiteral(true);
              			tq.advance();
              			break typeswitch;
              		case "false":
              			e = new booleanLiteral(false);
              			tq.advance();
              			break typeswitch;

              		case "function": {
              			tq.advance();
              			var idf;
              			if (!tq.isEmpty() && TOKEN_TYPE.NAME == tq.peek().type) {
              				idf = parseIdentifierNode(false);
              			} else {
              				idf = new identifier(null);
              			}
              			
              			tq.expectToken(PUNCTUATION.LPAREN);
              			var params = parseFormalParams();
              			tq.expectToken(PUNCTUATION.RPAREN);
              			var body = parseFunctionBody();
              			e = new functionConstructor(idf.name, params, body);
              			break typeswitch;
              		}
              		default:
              			break;   // Will be handled by the word handler below
				}
			}
			case TOKEN_TYPE.NAME: {
				var idfName;
				if ("this" == token.value) {
					idfName = "this";
					tq.advance();
				} else {
					idfName = parseIdentifier(false);
				}
				var idf = new identifier(idfName);
				e = new reference(idf);
				break;
			}
			case TOKEN_TYPE.PUNCTUATION: {
				switch (token.value) {
					case PUNCTUATION.LPAREN:
						tq.expectToken(PUNCTUATION.LPAREN);
						e = parseExpression(false);
						tq.expectToken(PUNCTUATION.RPAREN);
						return e;
					case PUNCTUATION.LSQUARE: {
						var elements = [];
						tq.advance();
						if (!tq.checkToken(PUNCTUATION.RSQUARE)) {
							do {
								// Handle adjacent commas that specify undefined values.
                				// E.g. [1,,2]
                				while (tq.checkToken(PUNCTUATION.COMMA)) {
                					var v1 = new elision();
                					elements.push(v1);
                				}
                				if (tq.lookaheadToken(PUNCTUATION.RSQUARE)) { break; }
                				elements.push(parseExpressionPart(false));
							} while (tq.checkToken(PUNCTUATION.COMMA));
							tq.expectToken(PUNCTUATION.RSQUARE);
						}
						e = new arrayConstructor(elements);
						break;
					}
					case PUNCTUATION.LCURLY: {
						var properties = [];
						tq.advance();
						if (!tq.checkToken(PUNCTUATION.RCURLY)) {
							var sawComma;
							do {
								var prop = null;
								token = tq.peek();
								if (token.type == TOKEN_TYPE.NAME) {
									if ("get" == token.value ||
										"set" == token.value) {
										tq.advance();
										if (!tq.checkToken(PUNCTUATION.COLON)) {
											//处理gretter 和 setter
											if ("get" == token.value) {
												prop = new getterProperty();
											} else {
												prop = new setterProperty();
											}
										} else {
											tq.rewind();
										}
									}
								}
								var key;
								switch (token.type) {
									case TOKEN_TYPE.STRING:
										tq.advance();
										key = new stringLiteral(token.value);
										break;
									case TOKEN_TYPE.NUM:
										tq.advance();
										key = stringLiteral(token.value);
										break;
									default:
										var ident = parseIdentifier(true);
										key = new stringLiteral(ident);
										break;
								}
								if (prop == null) {
									tq.expectToken(PUNCTUATION.COLON);
									var value = parseExpressionPart(false);
									prop = new objectProperty(key, value);
								} else {

									//处理getter和setter的情况
									tq.expectToken(PUNCTUATION.LPAREN);
									var params = parseFormalParams();
									tq.expectToken(PUNCTUATION.RPAREN);
									var body = parseFunctionBody();
									var fn = new functionConstructor(key.value, params, body);
									prop.setKey(key.value);
									prop.setValue(fn);
								}
								properties.push(prop);
								sawComma = tq.checkToken(PUNCTUATION.COMMA);
								debugger;
								if (sawComma && tq.lookaheadToken(PUNCTUATION.RCURLY)) {
									break;
								}
							} while (sawComma);
							tq.expectToken(PUNCTUATION.RCURLY);
						}
						e = new objectConstructor(properties);
            			break;
					}
					default :
						e = null;
						break;
				}
				break;
			}
			default:
	        	e = null;
	        	break;
		}

		if (null == e) {
			parse_error('parse error, expression is null;');
		}
		return e;
	}

	//定义对象时会遇到a = {rr: function(){}, pp...}, 若使用parseExpression会将逗号后面的表达式解析成rr的值,因此必须中断,只解析逗号之前的部分
	var parseExpressionPart = function(insertCommaAllowed) {
    	return parseOp(-1, insertCommaAllowed);
  	}

	var parseFormalParams = function() {
		var params = [];
		if (!tq.lookaheadToken(PUNCTUATION.RPAREN)) {
			do {
		        var param = new formalParam(parseIdentifier(false));
		        params.push(param);
		    } while (tq.checkToken(PUNCTUATION.COMMA));
		}
		return params;
	}

	var parseReference = function(allowReservedWords) {
		var idf = parseIdentifierNode(allowReservedWords);
		var refe = new reference(idf);
		return refe;
	}

	var parseIdentifierNode = function(allowReservedWords) {
		var identifierName = parseIdentifier(allowReservedWords);
		var ident = new identifier(identifierName);
		return ident;
	}

	var parseIdentifier = function(allowReservedWords) {
		var token = tq.peek();
		var s = token.value;
		switch (token.type) {
			case TOKEN_TYPE.NAME:
				if (!allowReservedWords) {
		            //do some message
		        }
		        //验证命名是否合法
		        //if (!isIdentifier(s)) {
		        //    parse_error("Invalid Identifier");
		        //}
		        break;
		    case TOKEN_TYPE.KEYWORD:
		    	if (!allowReservedWords) {
		            parse_error("Reserved Word used as Identifier");
		        }
		        break;
		    default:
		    	//do some message
		}
		tq.advance();
    	return decodeIdentifier(s);
	}

	var decodeIdentifier = function(idf) {
		//if (identifier.indexOf('\\') < 0) { return identifier; }
		//如果不是用nodejs的话此处需要解析转移字符\\uXXXX
		return idf;
	}

	var checkSemicolon = function() {
		// Look for a semicolon
    	if (tq.checkToken(PUNCTUATION.SEMI)) { return; }

    	// None found, so maybe do insertion.
    	if (tq.isEmpty()) { return; }
    	if (semicolonInserted()) {
    		//do something
	    } else {
	        parse_error("Absent of semicolon");
	    }
	}

	var isTerminal = function(stmt) {
		if (stmt instanceof labeledStatement) {
			//label 语句是不需要{}来包裹的
	        return isTerminal((stmt.body)[0]);
	    }
	    return stmt instanceof forStatement  || stmt instanceof conditionalStmt
            || stmt instanceof forInStatement || stmt instanceof whileStatement
            || stmt instanceof forOfStatement || stmt instanceof tryStatement
            || stmt instanceof switchStatement
            || stmt instanceof noopStatement || stmt instanceof withStatement;
	}

	var continuesExpr = function(tokenText) {
		return operator.lookupOperation(tokenText, OPERATOR_TYPE.INFIX) != null
        || operator.lookupOperation(tokenText, OPERATOR_TYPE.BRACKET) != null
        || operator.lookupOperation(tokenText, OPERATOR_TYPE.TERNARY) != null;
	}

	var parseFunctionBody = function() {
		return parseProgramOrFunctionBody(true);
	}

	var parseDirectivePrologue = function() {
		// Quick return if we are sure we will not accumulate anything
    	if (tq.isEmpty() || tq.peek().type != TOKEN_TYPE.STRING) { return null; }
    	var directives = [];

    	//console.log(tq.peek());
    	while(!tq.isEmpty() && tq.peek().type == TOKEN_TYPE.STRING) {
	    	var quotedToken = tq.pop();
	    	if (!tq.checkToken(PUNCTUATION.SEMI)) {
	    		var t = !tq.isEmpty()? tq.peek() : null;
	    		if ((t == null || !continuesExpr(t.value)) && semicolonInserted()) {
	    			//do some message
	    		} else {
	    			parse_error("Unexpected token!");
	    		}
	    	}
	    	var unquoted = quotedToken.value.substring(
          		0, quotedToken.value.length);
	    	//TODO:增加解析directive prologue正确性
	    	var dstm = new directiveStatement(unquoted);
	    	directives.push(dstm);
    	}
    	if (directives.length == 0) {
    		return null; 
    	}

    	var prologue = new directivePrologue(directives);
    	return prologue;
	}

	var semicolonInserted = function() {
		//这种判断没有去掉两个statement在同一行的情形,
		//例如 var a = 1 + 1 var b = 1 + 1
		//关于exigent_mode的判断还有待处理
		return !exigent_mode && (
			//nlb means new_line_before
            tq.peek().nlb || tq.isEmpty() || tq.lookaheadToken(PUNCTUATION.RCURLY)
        );
	}

	this.parse = parse;
	//return parse();
}

var statement = function() {
	this.type = "statement";
}

var directiveStatement = function (directiveString) {
	//statement.apply(this, arguments);
	this.type = "directiveStatement";
	this.directive = directiveString || 'directiveString';
}

var programStatement = function(stmts) {
	this.type = "program";
	this.body = stmts || [];
}

var forStatement = function(initializer, condition, increment, body) {
	this.type = "forStatement";
	this.initializer = initializer;
	this.condition = condition;
	this.increment = increment;
	this.body = body;
	
}

var forInStatement = function(initializer, iterable, body) {
	this.type = 'forInStatement';
	this.left = initializer;
	this.right = iterable;
	this.body = body;
}

var forOfStatement = function(initializer, iterable, body) {
	this.type = 'forOfStatement';
	this.left = initializer;
	this.right = iterable;
	this.body = body;
}

var whileStatement = function(cond, body) {
	this.type = 'whileStatement';
	this.cond = cond;
	this.body = body;
}

var blockStatement = function(stmts) {
	this.type = 'blockStatement';
	this.body = stmts;
}

var conditionalStmt = function(clauses, elseClause) {
	this.type = 'conditionalStatement';
	this.clauses = clauses;
	this.elseClause = elseClause;
}

var breakStatement = function(label) {
	this.type = 'breakStatement';
	this.label = label;
}

var continueStatement = function(label) {
	this.type = 'continueStatement';
	this.label = label;
}

var throwStatement = function(ex) {
	this.type = 'throwStatement';
	this.expression = ex;
}

var directivePrologue = function(directives) {
	this.type = "directivePrologue";
	this.body = directives || [];
}

var labeledStatement = function(label, body) {
	this.type = "labeledStatement";
	this.label = label;
	this.body = body;
}

var noopStatement = function() {
	this.type = "noopStatement"; //noop -> ;
}

var doWhileStmt = function(body, cond) {
	this.type = 'doWhileSatement';
	this.body;
	this.cond = cond;
}

var expressionStmt = function(exp) {
	this.type = 'expressionStatement';
	this.expression = exp;
}

var caseStatement = function(cond, body) {
	this.type = 'caseStatement';
	this.cond = cond;
	this.body = body;
}

var switchStatement = function(switchValue, cases) {
	this.type = 'switchStatement';
	this.discriminant = switchValue;
	this.cases = cases;
}

var ifClauseStatement = function(cond, body) {
	this.type = 'ifClauseStatement';
	this.cond = cond;
	this.body = body;
}

var returnStatement = function(value) {
	this.type = 'returnStatement';
	this.value = value;
}

var debuggerStmt = function() {
	this.type = 'debuggerStatement';
}

var catchStatement = function(varexp, catchClause) {
	this.type = 'catchStatement';
	this.exceptionName = varexp;
	this.clause = catchClause;
}

var finallyStatement = function(finallyClause) {
	this.type = 'finallyStatement';
	this.clause = finallyClause;
}

var tryStatement = function(body, handler, finallyBlock) {
	this.type = 'tryStatement';
	this.body = body;
	this.handler = handler;
	this.finallyBlock = finallyBlock;
}

var withStatement = function(scopeObject, body) {
	this.type = 'withStatement';
	this.scope = scopeObject;
	this.body = body;
}

var booleanLiteral = function(value) {
	this.type = "booleanLiteral";
	this.value = true;
}

var stringLiteral = function(value){
	this.type = "stringLiteral";
	this.value = value;
}

var regexpLiteral = function(value) {
	this.type = "regexpLiteral";
	this.value = value;
}

var nullLiteral = function() {
	this.type = "nullLiteral";
	this.value = null;
}

var numberLiteral = function(value) {
	this.type = 'numberLiteral';
	this.value = value;
}

var elision = function() {
	this.type = 'elision';
	this.value = undefined;
}

var formalParam = function(name) {
	this.type = "formalParam";
	this.name = name;
}

var getterProperty = function(key, fn) {
	this.type = 'getterProperty';
	this.key = key;
	this.value = fn;
	this.setKey = function(key) {
		this.key = key;
	}
	this.setValue = function(fn) {
		this.function = fn;
	}
}

var setterProperty = function(key, fn) {
	this.type = 'setterProperty';
	this.key = key;
	this.value = fn;
	this.setKey = function(key) {
		this.key = key;
	}
	this.setValue = function(fn) {
		this.function = fn;
	}
}

var identifier = function(name) {
	this.type = "identifier";
	this.name = name;
}

var declaration = function(identifier, initializer) {
	this.type = 'declaration';
	this.identifier = identifier;
	this.initializer = initializer;
}

var multiDeclarations = function(decls) {
	this.type = 'multiDeclarations';
	this.decls = decls;
}

var functionConstructor = function(name, params, body) {
	this.type = "functionConstructor";
	this.name = name;
	this.params = params;
	this.body = body;

}

var functionDeclaration = function(name, params, body) {
	this.type = 'functionDeclaration';
	this.name = name;
	this.params = params;
	this.body = body;
}

var arrayConstructor = function(elements) {
	this.type = 'arrayConstructor';
	this.elements = elements;
}

var objectConstructor = function(props){
	this.type = "objectConstructor";
	this.properties = props;
}

var objectProperty = function(key, value) {
	this.type = 'objectProperty';
	this.key = key;
	this.value = value;
}

var actualList = function(params) {
	this.type = 'actualList';
	this.params = params;
}

var newExpression = function(currCallee, operands) {
	this.type = 'newExpression';
	this.left = currCallee;
	this.right = operands;
}

var postfixExpression = function(op, operand) {
	this.type = 'postfixExpression';
	this.operator = op;
	this.operand = operand;
}

var prefixExpression = function(op, operand) {
	this.type = 'prefixExpression';
	this.operator = op;
	this.operand = operand;
}

var assignmentExpression = function(op, left, right) {
	this.type = 'assignmentExpression';
	this.operator = op;
	this.left = left;
	this.right = right;
}

var binaryExpression = function(op, left, right) {
	this.type = 'binaryExpression';
	this.operator = op;
	this.left = left;
	this.right = right;
}

var callExpression = function(left, operands) {
	this.type = 'callExpression';
	this.left = left;
	this.operands = operands;
}

var reference = function(idf) {
	this.type = "reference";
	this.idf = idf;
}

var conditionalExpression = function(left, right, farRight) {
	this.type = "conditionalExpression";
	this.test = left;
	this.consequent = right;
	this.alternate = farRight;
}

var memberExpression = function(op, left, right) {
	this.type = 'memberExpression';
	this.op = op;
	this.object = left;
	this.property = right;
}



var sequenceExpression = function(exps) {
	this.type = 'sequenceExpression';
	this.expressions = exps || [];
	this.append = function(exp) {
		this.expressions.push(exp);
		return this.expressions;
	}
}

var OPERATOR_TYPE = {
	PREFIX  : array_to_hash(["new", "delete", "void", "typeof", "++", "--", "+", "-", "~", "!"]),
	POSTFIX : array_to_hash(["++", "--"]),
  	INFIX   : array_to_hash([".", "in", "*", "/", "%", "+", "-", "<<", ">>", ">>>", "<", ">", "<=", ">=", "instanceof", "==", "!=", "===", "!==",
  							 "&", "^", "|", "&&", "||", "=", "*=", "/=", "%=", "+=", "-=", "<<=", ">>=", ">>>=", "&=", "^=", "|=", ","]),
  	BRACKET : array_to_hash(["[]", "()", "[", "("]),   //是否需要补上[, ], (, )
  	TERNARY : array_to_hash(["?"])
};

var PRECEDENCE = {
	INFIX : {"," : 0,
			 "|=": 1,
			 "^=": 1,
			 "&=": 1,
			 ">>>=": 1,
			 ">>=": 1,
			 "<<=": 1,
			 "-=": 1,
			 "+=": 1,
			 "%=": 1,
			 "/=": 1,
			 "*=": 1,
			 "=": 1,
			 "||": 3,
			 "&&": 4,
			 "|": 5,
			 "^": 6,
			 "&":7,
			 "!==": 8,
			 "===": 8,
			 "!=": 8,
			 "==": 8,
			 "instanceof": 9,
			 ">=": 9,
			 "<=":9,
			 ">": 9,
			 "<": 9,
			 "in": 9,
			 ">>>": 10,
			 ">>": 10,
			 "<<": 10,
			 "-": 11,
			 "+": 11,
			 "%": 12,
			 "/": 12,
			 "*": 12,
			 ".": 16
			},
	POSTFIX:{"++": 14,
			 "--": 14
			},
	PREFIX :{"!" : 13,
			 "~" : 13,
			 "-" : 13,
			 "+" : 13,
			 "--": 13,
			 "++": 13,
			 "typeof": 13,
			 "void": 13,
			 "delete": 13,
			 "new": 16
			},
	BRACKET:{"[]": 16,
			 "[": 16,
			 "()": 15,
			 "(": 15
			},
	TERNARY:{
			 "?":2
			}
};

exports.parser = parser;