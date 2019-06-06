// const co = require("co");
import * as babelParser from '@babel/parser';
import * as babelTypes from '@babel/types';
import path = require('path');
import webpack = require('webpack');
import IPluginOptions from '../interfaces/IPluginOptions';
import { PLUGIN_NAME } from '../const';
import { ConcatSource } from 'webpack-sources';
import * as glob from 'glob';
import * as fs from 'fs-extra';
import * as _ from 'lodash';
import * as unixfy from 'unixify';
import chalk from 'chalk';
// const MultiEntryPlugin = require("webpack/lib/MultiEntryPlugin");
import MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
import AstUtil from '../tools/astUtil';
import Helpers from '../tools/helpers';
const assetsName = 'assets';
class BaseDevModule {
  protected compiler: webpack.Compiler;
  protected pluginOption: IPluginOptions;
  protected distPath: string;
  protected globalVar: string;
  protected projectRoot: string;
  protected entryResource: string[];
  public constructor(compiler: webpack.Compiler, pluginOption: IPluginOptions) {
    this.compiler = compiler;
    this.pluginOption = pluginOption;
    this.distPath = compiler.options.output.path;
    this.globalVar = 'wx'; //微信小程序的全局变量
  }
  public attachPoint(): void {
    let handleCompilation = (
      compilation: webpack.compilation.Compilation,
      params: any
    ): void => {
      this.attachTemplatePlugin(compilation, params);
      this.onCompilation(compilation, params);
    };
    this.compiler.hooks.compilation.tap(
      `${PLUGIN_NAME}_compilation`,
      handleCompilation
    );

    let handleEmit = async (compilation, cb): Promise<void> => {
      //清除掉assets.js相关文件
      try {
        Object.keys(compilation.assets)
          .filter(
            (key): boolean => {
              // return key.indexOf(`${assetsName}${this.pluginOption.ext}`) > -1
              return key.indexOf(`${assetsName}.js`) > -1;
            }
          )
          .forEach(
            (key): void => {
              delete compilation.assets[key];
            }
          );
        Object.keys(compilation.assets)
          .filter(
            (key): boolean => {
              return /^(\.\.\/)/.test(key); //匹配有相对路径开头的key
            }
          )
          .forEach(
            (key): void => {
              compilation.assets[key.replace(/\.\.\//g, '')] =
                compilation.assets[key];
              delete compilation.assets[key]; //去掉有相对路径开头的key保证key都是相对与输出目录的
            }
          );
        _.isFunction(this.pluginOption.onEmitAssets) &&
          this.pluginOption.onEmitAssets.call(this, compilation.assets);
        await this.emitAssets(compilation);
        cb();
      } catch (e) {
        console.error(
          chalk.red(`[Error] emit assets Error: ${e},trace: ${e.stack}`)
        );
      }
    };
    this.compiler.hooks.emit.tapAsync(`${PLUGIN_NAME}_emit`, handleEmit);
  }
  /* eslint-disable-next-line */
  public async emitAssets(
    compilation: webpack.compilation.Compilation
  ): Promise<void> {}
  /* eslint-disable-next-line */
  public onCompilation(
    compilation: webpack.compilation.Compilation,
    params //eslint-disable-line
  ): void {}
  public getProjectRoot(): string {
    return '';
  }
  /**
   * @return {Object} 返回一个组件的map 记录了entryname 与组件位置的映射关系
   */
  public getComponentEntry(): { [key: string]: string } {
    let entry = {};
    this.pluginOption.componentsPath.forEach(
      (dir): void => {
        let component = glob.sync(`${dir}/**/*${this.pluginOption.ext}`, {
          cwd: this.getProjectRoot()
        });
        if (Array.isArray(component)) {
          component.forEach(
            (c): void => {
              let fullPath = path.join(this.getProjectRoot(), c);
              let pathInfo = path.parse(c);
              if (pathInfo.dir.indexOf(pathInfo.name) == -1) return; //组件文件的文件名不和目录名字匹配，认为当前文件不是组件，不要加入到entry
              let jsonPath = fullPath.replace(path.extname(fullPath), '.json');
              if (!fs.existsSync(jsonPath)) return; //没有组件的json文件，认为不是组件
              entry[c.replace(path.extname(c), '')] = path.join(
                this.getProjectRoot(),
                c
              );
            }
          );
        }
      }
    );
    return entry;
  }
  //设置资源
  public addAssetsEntry(assets = []): void {
    let globStr = `**/*.*(${this.pluginOption.assetsExt.join('|')})`;
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
    multiEntryPlugin.apply(this.compiler);
  }
  /**
   * @param name
   */
  public appendCommonPlugin(name: string): void {
    //提取出common chunk
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
              chunks: 'initial',
              reuseExistingChunk: true,
              name,
              priority: -1,
              test: _.isFunction(this.pluginOption.minChunks)
                ? this.pluginOption.minChunks
                : (module, count): boolean => {
                    if (module.resource) {
                      let ext = path.extname(module.resource);
                      if (ext) {
                        ext = ext.replace(/^\./, '');
                        if (
                          (this.pluginOption as any).originExt.indexOf(ext) > -1
                        ) {
                          return (
                            this.getEntryResource().indexOf(module.resource) ==
                            -1
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
    //@ts-ignore
  }
  public getCommonRelativePath(commonName, targetFile): string {
    let commonPath = path.join(this.distPath, `${commonName}.js`);
    let relativePath = unixfy(
      path.relative(path.dirname(targetFile), commonPath)
    );
    return relativePath;
  }
  public getCommonName(): string {
    return '';
  }
  public getRuntimeName(): string {
    return `${this.getCommonName()}_runtime`;
  }
  /**
   * @description 获取真正的小程序的入口
   */
  public getEntryResource(): any[] {
    return [];
  }
  public attachTemplatePlugin(
    compilation: webpack.compilation.Compilation,
    params: any
  ): void {
    //修改生成的模版内容
    // return;
    let jsonpFuncName = JSON.stringify(this.pluginOption.jsonpFuncName);
    let handleChunkTemplateRender = (source, chunk): ConcatSource => {
      //webpack4 下面需要注入cache_groups产生的内容
      let _compilation = compilation;
      let { name } = chunk;
      if (_.isFunction(source.source)) source = source.source();
      let ast: babelTypes.File = babelParser.parse(source);
      let newSource = AstUtil.replaceRuntime(
        ast,
        this.globalVar,
        JSON.parse(jsonpFuncName)
      );
      source = newSource;
      let concatSource = new ConcatSource('');
      let idx = -1;
      let chunkGroup = _compilation.chunkGroups.find(
        (item): any => {
          //找到chunkGroups下面包含当前chunk的chunkGroup
          let hasChunk =
            Array.isArray(item.chunks) &&
            item.chunks.some(
              (_chunk, index): boolean => {
                if (_chunk.id === chunk.id) {
                  idx = index;
                  return true;
                }
                return false;
              }
            );
          if (hasChunk) {
            return item;
          }
        }
      );
      if (chunkGroup) {
        chunkGroup.chunks.slice(0, idx).forEach(
          (_neededChunk): void => {
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
          }
        );
      }
      concatSource.add(source);
      return concatSource;
    };
    (compilation.chunkTemplate as any).hooks.render.tap(
      `${PLUGIN_NAME}_render`,
      handleChunkTemplateRender
    );

    let handleRuntimeRender = (source, chunk): string => {
      if (_.isFunction(source.source)) source = source.source();
      let ast: babelTypes.File = babelParser.parse(source);
      let newSource = AstUtil.replaceRuntime(
        ast,
        this.globalVar,
        JSON.parse(jsonpFuncName)
      );
      return newSource;
    };
    (compilation.mainTemplate as any).hooks.render.tap(
      `${PLUGIN_NAME}_bootstrap`,
      handleRuntimeRender
    );
  }

  /**
   *
   * @description 解析外部小程序组件或页面
   * @param {{ [key: string]: any }} entry 入口对象
   * @memberof BaseDevModule
   */
  public resolveExternal(entry: { [key: string]: any }): void {}
}
export default BaseDevModule;
