// const co = require("co");
import co from "co";
import * as babelParser from "@babel/parser";
import * as babelTypes from "@babel/types";
import path = require("path");
import webpack = require("webpack");
import IPluginOptions from "../interfaces/IPluginOptions";
import * as globToRegexp from "glob-to-regexp";
import { debugLog } from "../tools/debug";
import env from "../tools/env";
import { PLUGIN_NAME } from "../const";
const { ConcatSource, RawSource, Source } = require("webpack-sources");
const acorn = require("acorn");
const glob = require("glob");
const fs = require("fs-extra");
import * as _ from "lodash";
const unixfy = require("unixify");
import chalk from "chalk";
// const MultiEntryPlugin = require("webpack/lib/MultiEntryPlugin");
import MultiEntryPlugin = require("webpack/lib/MultiEntryPlugin");
import AstUtil from "../tools/astUtil";
import Helpers from "../tools/helpers";
const assetsName = "assets";
const LOG_TAG = "BaseDevModule";
class BaseDevModule {
  protected compiler: webpack.Compiler;
  protected pluginOption: IPluginOptions;
  protected distPath: string;
  protected globalVar: string;
  protected projectRoot: string;
  protected entryResource: string[];
  constructor(compiler: webpack.Compiler, pluginOption: IPluginOptions) {
    this.compiler = compiler;
    this.pluginOption = pluginOption;
    this.distPath = compiler.options.output.path;
    this.globalVar = "wx"; //微信小程序的全局变量
  }
  attachPoint() {
    let handleCompilation = (
      compilation: webpack.compilation.Compilation,
      params: any
    ) => {
      this.attachTemplatePlugin(compilation, params);
      this.onCompilation(compilation, params);
    };
    if (env.isHook) {
      this.compiler.hooks.compilation.tap(
        `${PLUGIN_NAME}_compilation`,
        handleCompilation
      );
    } else {
      this.compiler.plugin("compilation", handleCompilation);
    }

    let handleEmit = this.wrapGen(function*(compilation, cb) {
      //清除掉assets.js相关文件
      try {
        Object.keys(compilation.assets)
          .filter(key => {
            // return key.indexOf(`${assetsName}${this.pluginOption.ext}`) > -1
            return key.indexOf(`${assetsName}.js`) > -1;
          })
          .forEach(key => {
            delete compilation.assets[key];
          });
        Object.keys(compilation.assets)
          .filter(key => {
            return /^(\.\.\/)/.test(key); //匹配有相对路径开头的key
          })
          .forEach(key => {
            compilation.assets[key.replace(/\.\.\//g, "")] =
              compilation.assets[key];
            delete compilation.assets[key]; //去掉有相对路径开头的key保证key都是相对与输出目录的
          });
        _.isFunction(this.pluginOption.onEmitAssets) &&
          this.pluginOption.onEmitAssets.call(this, compilation.assets);
        yield this.emitAssets(compilation);
        cb();
      } catch (e) {
        console.error(
          chalk.red(`[Error] emit assets Error: ${e},trace: ${e.stack}`)
        );
      }
    });
    if (env.isHook) {
      this.compiler.hooks.emit.tapAsync(`${PLUGIN_NAME}_emit`, handleEmit);
    } else {
      this.compiler.plugin("emit", handleEmit);
    }
  }
  *emitAssets(compilation: webpack.compilation.Compilation) {}
  onCompilation(compilation: webpack.compilation.Compilation, params) {}
  getProjectRoot() {
    return "";
  }
  /**
   * @return {Object} 返回一个组件的map 记录了entryname 与组件位置的映射关系
   */
  getComponentEntry() {
    let entry = {};
    this.pluginOption.componentsPath.forEach(dir => {
      let component = glob.sync(`${dir}/**/*${this.pluginOption.ext}`, {
        cwd: this.getProjectRoot()
      });
      if (Array.isArray(component)) {
        component.forEach(c => {
          let fullPath = path.join(this.getProjectRoot(), c);
          let pathInfo = path.parse(c);
          if (pathInfo.dir.indexOf(pathInfo.name) == -1) return; //组件文件的文件名不和目录名字匹配，认为当前文件不是组件，不要加入到entry
          let jsonPath = fullPath.replace(path.extname(fullPath), ".json");
          if (!fs.existsSync(jsonPath)) return; //没有组件的json文件，认为不是组件
          entry[c.replace(path.extname(c), "")] = path.join(
            this.getProjectRoot(),
            c
          );
        });
      }
    });
    return entry;
  }
  //设置资源
  addAssetsEntry(assets = []) {
    let entry = {};
    let globStr = `**/*.*(${this.pluginOption.assetsExt.join("|")})`;
    let extraAssets = glob.sync(globStr, {
      // ignore: `**/*${this.pluginOption.ext}`,
      cwd: this.getProjectRoot(),
      realpath: true
    });
    if (Array.isArray(assets) && assets.length > 0) {
      extraAssets = extraAssets.concat(assets);
    }
    _.isFunction(this.pluginOption.onAdditionalAssets) &&
      (extraAssets = extraAssets.concat(
        this.pluginOption.onAdditionalAssets.call(this)
      ));
    // extraAssets = extraAssets.filter((file) => {
    //     return !new RegExp(`\\.${this.pluginOption.picLoaderExt.join('|')}$`).test(file);
    // });
    let multiEntryPlugin = new MultiEntryPlugin(
      this.getProjectRoot(),
      extraAssets,
      assetsName
    );
    if (env.isHook) {
      multiEntryPlugin.apply(this.compiler);
    } else {
      this.compiler.apply(multiEntryPlugin);
    }
  }
  *appendAsset(compilation) {
    //TODO:暂时没有用
    let { assets } = compilation;
    let extraAssets = glob.sync("**/*.!(js)", {
      cwd: this.getProjectRoot()
    });
    if (Array.isArray(extraAssets)) {
      yield extraAssets.map(name => {
        return function*() {
          try {
            assets[name] = new RawSource(
              yield fs.readFile(path.join(this.getProjectRoot(), name), "utf-8")
            );
          } catch (e) {}
        }.bind(this);
      });
    }
  }
  wrapGen(func) {
    if (typeof func !== "function")
      return function(...args) {
        return Promise.reject("not a function");
      };
    func = func.bind(this);
    if (func.constructor.name !== "GeneratorFunction")
      return function(...args) {
        return new Promise(resolve => {
          resolve(func(...args));
        }).catch(e => {
          console.error(chalk.red(`[Error] wrapGen ${e}`));
        });
      };
    return co.wrap(func);
  }
  /**
   * @param name
   */
  appendCommonPlugin(name: string) {
    //提取出common chunk
    if (env.isHook) {
      // console.warn(
      //     chalk.yellowBright(`[warn] - [appendCommonPlugin] is deprecated when webpack >=4`)
      // );
      //webpack4 处理为增加splitChunks配置

      this.compiler.options.optimization = _.merge(
        {
          runtimeChunk: {
            name: `${name}_runtime`
          } as webpack.Options.RuntimeChunkOptions,
          splitChunks: {
            cacheGroups: {
              [name]: {
                chunks: "initial",
                reuseExistingChunk: true,
                name,
                priority: -1,
                test: _.isFunction(this.pluginOption.minChunks)
                  ? this.pluginOption.minChunks
                  : (module, count) => {
                      if (module.resource) {
                        let ext = path.extname(module.resource);
                        if (ext) {
                          ext = ext.replace(/^\./, "");
                          if (
                            (<any>this.pluginOption).originExt.indexOf(ext) > -1
                          ) {
                            return (
                              this.getEntryResource().indexOf(
                                module.resource
                              ) == -1
                            );
                          }
                        }
                        // path.parse(module.resource).ext == this.pluginOption.ext
                      }
                      return count >= 2;
                    }
              } as webpack.Options.CacheGroupsOptions
            }
          }
        },
        this.compiler.options.optimization || {}
      );
      return;
    }
    //@ts-ignore
    const CommonsChunkPlugin = webpack.optimize.CommonsChunkPlugin;
    let regexp = globToRegexp(`*${this.pluginOption.ext}`, {
      extended: true,
      globstar: true
    });
    let minChunks = _.isFunction(this.pluginOption.minChunks)
      ? this.pluginOption.minChunks
      : (module, count) => {
          if (module.resource) {
            let ext = path.extname(module.resource);
            if (ext) {
              ext = ext.replace(/^\./, "");
              if ((<any>this.pluginOption).originExt.indexOf(ext) > -1) {
                return this.getEntryResource().indexOf(module.resource) == -1;
              }
            }
            // path.parse(module.resource).ext == this.pluginOption.ext
          }
          return count >= 2;
        };
    this.compiler.apply(
      new CommonsChunkPlugin({
        name,
        minChunks
      })
    );
  }
  getCommonRelativePath(commonName, targetFile) {
    let commonPath = path.join(this.distPath, `${commonName}.js`);
    let relativePath = unixfy(
      path.relative(path.dirname(targetFile), commonPath)
    );
    return relativePath;
  }
  getCommonName(): string {
    return "";
  }
  getRuntimeName(): string {
    if (env.isHook) {
      return `${this.getCommonName()}_runtime`;
    } else {
      this.getCommonName();
    }
  }
  /**
   * @description 获取真正的小程序的入口
   */
  getEntryResource() {
    return [];
  }
  attachTemplatePlugin(compilation: webpack.compilation.Compilation, params) {
    //修改生成的模版内容
    // return;
    let jsonpFuncName = JSON.stringify(this.pluginOption.jsonpFuncName);
    let handleWebpack3ChunkTemplateRender = (source, chunk) => {
      let { name } = chunk;
      let injectFunction = `
        function webpackJsonp(){
            require(${JSON.stringify(
              this.getCommonRelativePath(
                this.getRuntimeName(),
                path.join(this.distPath, `${name}.js`)
              )
            )});
            typeof ${this.globalVar}[${jsonpFuncName}] === 'function' && ${
        this.globalVar
      }[${jsonpFuncName}].apply(wx,arguments);
        }
        `;
      let concatSource = new ConcatSource(injectFunction);
      concatSource.add(source);
      // return source;
      return concatSource;
    };
    let handleWebpack4ChunkTemplateRender = (source, chunk) => {
      //webpack4 下面需要注入cache_groups产生的内容
      let _compilation = compilation;
      let { name } = chunk;

      let concatSource = new ConcatSource("");
      let idx = -1;
      let chunkGroup = _compilation.chunkGroups.find(item => {
        let hasChunk =
          Array.isArray(item.chunks) &&
          item.chunks.some((_chunk, index) => {
            if (_chunk.id === chunk.id) {
              idx = index;
              return true;
            }
            return false;
          });
        if (hasChunk) {
          return item;
        }
      });
      if (chunkGroup) {
        chunkGroup.chunks.slice(0, idx).forEach(_neededChunk => {
          //把当前chunk 所在组的js 注入到当前chunk内
          concatSource.add(
            Helpers.requireTemplate(
              JSON.stringify(
                this.getCommonRelativePath(
                  _neededChunk.name,
                  path.join(this.distPath, `${name}.js`)
                )
              )
            )
          );
        });
      }
      concatSource.add(source);
      return concatSource;
    };
    if (env.isHook) {
      (compilation.chunkTemplate as any).hooks.render.tap(
        `${PLUGIN_NAME}_render`,
        handleWebpack4ChunkTemplateRender
      );
    } else {
      compilation.chunkTemplate.plugin(
        "render",
        handleWebpack3ChunkTemplateRender
      );
    }

    let handleRuntimeRender = (source, chunk) => {
      let { name } = chunk;
      // if (name === this.getRuntimeName()) {
      let arr = [];
      if (_.isFunction(source.source)) source = source.source();
      let ast: babelTypes.File = babelParser.parse(source);
      let newSource = AstUtil.replaceRuntime(
        ast,
        this.globalVar,
        JSON.parse(jsonpFuncName)
      );
      return newSource;
    };
    if (env.isHook) {
      (compilation.mainTemplate as any).hooks.render.tap(
        `${PLUGIN_NAME}_bootstrap`,
        handleRuntimeRender
      );
    } else {
      compilation.mainTemplate.plugin("bootstrap", handleRuntimeRender);
    }
  }
}
export default BaseDevModule;
