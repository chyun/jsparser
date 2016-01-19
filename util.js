function array_to_hash(a) {
    var ret = {};
    for (var i = 0; i < a.length; ++i)
        ret[a[i]] = true;
    return ret;
};

function HOP(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};

function JS_Parse_Error(message, line, col, pos) {
    this.message = message;
    this.line = line + 1;
    this.col = col + 1;
    this.pos = pos + 1;
    this.stack = new Error().stack;
};

JS_Parse_Error.prototype.toString = function() {
    return this.message + " (line: " + this.line + ", col: " + this.col + ", pos: " + this.pos + ")" + "\n\n" + this.stack;
};

function js_error(message, line, col, pos) {
    throw new JS_Parse_Error(message, line, col, pos);
};

function parse_error(err) {
    js_error(err, S.tokline, S.tokcol, S.tokpos);
};

function slice(a, start) {
    return Array.prototype.slice.call(a, start || 0);
};

function curry(f) {
    var args = slice(arguments, 1);
    return function() { return f.apply(this, args.concat(slice(arguments))); };
};

exports.array_to_hash = array_to_hash;
exports.HOP = HOP;
exports.parse_error = parse_error;
exports.slice = slice;
exports.curry = curry;



//exports.util = util;