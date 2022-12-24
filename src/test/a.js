const b = require('./b.js')
console.log('a.js loading')
console.log('a中打印', b)
module.exports = 'a message'