//这个issue在chrome和node.js引擎测试下均出错.会把第二个匿名函数定义当成第一个匿名函数执行后的结果的参数进行调用
var noFreeCakes = 1
var FreeCake = function(){}
(function () {
  var cake
  if (noFreeCakes) return /* I would
                              insert something
                              there, but I'm sort
                              of lazy so whatever.
  */ cake = new FreeCake()
  return cake
})()

(function () {
  var cake
  if (noFreeCakes) return /* I would insert something there, */ /*
                             but I'm sort of lazy so
  */ /*                      whatever. */ cake = new FreeCake()
  return cake
})()

(function () {
  var cake
  if (noFreeCakes) return // I would insert something there, but I'm sort of lazy so whatever.
  cake = new FreeCake()
  return cake
})()

FreeCake
()

