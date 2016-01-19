var rf = require("fs");
var parser = require('../parser.js').parser;
var data = rf.readFileSync("./unit/uglify-js.js","utf-8");

var parser = new parser(data);

// for(var porp in parser) {
// 	if (parser.hasOwnProperty(porp)) {
// 		console.log(porp);
// 	}
// }
console.log(JSON.stringify(parser.parse()));
