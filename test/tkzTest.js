var rf = require("fs");
var tkz = require("../tokenizer.js");
var data = rf.readFileSync("./unit/uglify-js.js","utf-8");

var tokenizer = tkz.tokenizer;
var input = tokenizer(data, true);

while((curr = input()).type !== 'eof') {
	console.log(JSON.stringify(curr));
}
