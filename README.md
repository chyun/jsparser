# jsparser
注意:
语句{a:1}存在歧义, 有可能是标签语句块, 也有可能是一个对象. 我在此处将其解析为标签语句块, 因为定义一个没有引用的对象是毫无意义的.