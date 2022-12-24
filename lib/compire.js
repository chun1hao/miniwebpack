const path = require('path')
const fs = require('fs')
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;
const t = require("@babel/types");

class Compire{
  constructor(opt){
    this.opt = opt || {}
    // 所有的模块
    this.modules = []
    this.run()
  }
  run(){
    const entryModule = this.build(this.opt.entry)
    const entryChunk = this.buildChunk(entryModule, this.opt.output.filename || 'main.js')
    this.generateFile(entryChunk)
  }
  // 处理模块
  build(modulePath){
    const fullPath = path.resolve(process.cwd(), modulePath)
    // 读取文件
    let sourceCode = fs.readFileSync(fullPath).toString()
    // 处理loader
    sourceCode = this.dealwithLoaders(sourceCode, modulePath)
    // 处理依赖
    return this.dealWithDependices(sourceCode, modulePath)
  }
  dealwithLoaders(sourceCode, modulePath){
    // loader 处理从下向上 从右向左
    let rules = this.opt.module?.rules
    if(!rules) return sourceCode
    ;[...rules].reverse().forEach(rule=> {
      if(rule.test && rule.test(modulePath)){
        let loaders = [...rule.use].reverse()
        loaders.forEach(loader=> {
          sourceCode = loader(sourceCode)
        })         
      }
    })
    return sourceCode
  }
  dealWithDependices(sourceCode, modulePath){
    const fullPath = path.relative(process.cwd(), modulePath)
    const module = {
      id: this.transFormPath(fullPath),
      dependices: []
    }
    // 转化ast
    const ast = parser.parse(sourceCode, {
      sourceType: 'module'
    })
    // 遍历ast
    traverse(ast, {
      CallExpression: nodePath=> {
        const node = nodePath.node
        if(node.callee.name === 'require'){
          const requirePath = node.arguments[0].value
          const moduleDir = path.dirname(modulePath)
          // 修改路径以当前模块为基准
          const fullPath = path.relative(process.cwd(), path.resolve(moduleDir, requirePath))
          // 替换require为自己实现的require
          node.callee = t.identifier('__miniwebpack__require__')
          // 替换路径
          node.arguments = [t.stringLiteral(this.transFormPath(fullPath))]

          module.dependices.push(fullPath)
        }        
      }
    })
    // 重新生成代码
    const { code } = generator(ast)
    module._sourceCode = code
    // 遍历处理依赖
    module.dependices.forEach(depPath=> {
      const exitModule = this.modules.find(item=> item.id === depPath)
      if(!exitModule){
        const dep = this.build(depPath)
        this.modules.push(dep)
      }
    })

    return module
  }
  buildChunk(entryModule, entryname){
    return {
      name: entryname,
      entryModule,
      modules: [...this.modules, entryModule]
    }
  }
  // 生成最后的文件
  generateFile(entryChunk){
    const code = this.generateCode(entryChunk)
    // 不存在文件夹创建文件夹
    if(!fs.existsSync(this.opt.output.path)){
      fs.mkdirSync(this.opt.output.path)
    }
    // 写入文件
    fs.writeFileSync(path.join(this.opt.output.path, entryChunk.name), code)
  }
  // 生成打包后的文件
  generateCode(entryChunk){
    return `
      (()=> {
        var __miniwebpack__modules__ = {
          ${
            entryChunk.modules.map(module=> {
              return `'${module.id}': (module, __module__exports__, __miniwebpack__require__)=> {
                ${module._sourceCode}
              }`
            }).join(',')
          }
        }

        var __miniwebpack__cacheModule__ = {}

        function __miniwebpack__require__(moduleId){
          const cacheModule = __miniwebpack__cacheModule__[moduleId]
          if(cacheModule !== undefined){
            return cacheModule.exports
          }
          var module = __miniwebpack__cacheModule__[moduleId] = {
            exports: {}
          }
          __miniwebpack__modules__[moduleId](module, module.exports, __miniwebpack__require__)
          return module.exports
        }

        __miniwebpack__require__('${entryChunk.entryModule.id}')
      })()
    `
  }
  // 处理window上路径\
  transFormPath(path){
    if(path){
      return path.split('\\').join('/')
    }
  }
}

module.exports = Compire