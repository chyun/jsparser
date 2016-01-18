var is_digit = function (ch) {
	ch = ch.charCodeAt(0);
	return ch >= 48 && ch <= 57;
};
var is_letter = function (ch) {
	return UNICODE.letter.test(ch);
};
var is_alphanumeric_char = function (ch) {
	return is_digit(ch) || is_letter(ch);
};

var util = {};
util.is_digit = is_digit;
util.is_letter = is_letter;
util.is_alphanumeric_char = is_alphanumeric_char;

exports.util = util;