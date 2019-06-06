import { debugLog } from '../../tools/debug';
import { LOG_TAG } from './constants';
import * as loaderUtils from 'loader-utils';
import { loader } from 'webpack';
import * as _ from 'lodash';
import * as urlLoader from 'url-loader';
import * as fileLoader from 'file-loader';
import * as path from 'path';
import WechatappPlugin = require('../../index');
interface IAssetsLoaderOptions {
  /** @description 需要处理的样式文件后缀  */
  styleExt: string[];
  viewExt: string[];
  scriptExt: string[];
  outputPath: string;
  publicPath: (url: string) => string | string;
  name: string;
  limit?: number;
  relativeOutputPath?: (
    this: loader.LoaderContext,
    url: string,
    resourcePath: string,
    issuerResource: string
  ) => string;
  relativePublicPath?: (
    this: loader.LoaderContext,
    url: string,
    resourcePath: string,
    issuerResource: string
  ) => string;
  fallback?: (this: loader.LoaderContext, content, map) => any | string;
  fallbackOptions?: { [key: string]: any };
}
export type TLoaderOptions = loaderUtils.OptionObject & IAssetsLoaderOptions;
class AssetsProcessor {
  protected issuerResource: string;
  protected loaderOptions: TLoaderOptions;
  public constructor(
    protected loaderContext: loader.LoaderContext,
    protected content: Buffer,
    protected sourceMap?: any
  ) {
    let { issuer } = loaderContext._module,
      { resource } = issuer;
    this.issuerResource = resource;
    this.loaderOptions = (loaderUtils.getOptions(this.loaderContext as any) ||
      {}) as TLoaderOptions;
    let defaultExts = {
      styleExt: ['wxss'],
      viewExt: ['wxml'],
      scriptExt: ['js']
    };
    _.forIn(
      defaultExts,
      (arr, key): void => {
        if (
          Array.isArray(this.loaderOptions[key]) &&
          (this.loaderOptions[key] as string[]).length > 0
        ) {
          defaultExts[key] = arr.concat(this.loaderOptions[key]);
        }
      }
    ); //merge 可处理的资源后缀
    this.loaderOptions = _.defaults(this.loaderOptions, {
      ...defaultExts,
      limit: 4 * 1024, //默认4k大小
      outputPath: 'assets/',
      name: '[folder]/[name].[ext]',
      publicPath: (url: string): string => '' + url
    });
    if (!this.issuerResource) {
      //没有引用这个资源的文件，回退到fallback
      let fallback = this.loaderOptions.fallback;
      if (typeof fallback === 'function') {
        this.loaderContext.callback(
          null,
          fallback.call(this.loaderContext, this.content, this.sourceMap),
          this.sourceMap
        );
        return;
      } else if (
        typeof fallback === 'string' &&
        (fallback as string).indexOf('file-loader') > -1
      ) {
        let fileLoaderContext = Object.assign({}, this.loaderContext, {
          query: this.loaderOptions.fallbackOptions || {}
        });
        this.loaderContext.callback(
          null,
          fileLoader.call(fileLoaderContext, this.content, this.sourceMap),
          this.sourceMap
        );
        return;
      }
      this.loaderContext.callback(null, this.content, this.sourceMap);
      return;
    }
    this.process();
  }
  protected process(): void {
    let issuerResource = this.issuerResource;
    debugLog(LOG_TAG, 'issuerResource', `processing issuer ${issuerResource}`);
    let resourceQuery =
      this.loaderContext.resourceQuery.indexOf('?') > -1
        ? loaderUtils.parseQuery(this.loaderContext.resourceQuery)
        : {};
    debugLog(
      LOG_TAG,
      'issuerResourceQuery',
      `issuer ${issuerResource} query object ${JSON.stringify(resourceQuery)}`
    );
    let isNetworkUrl = !!resourceQuery.network;
    let issuerExt: string = path.extname(issuerResource);
    if (!issuerExt) {
      return this.loaderContext.callback(
        new Error('文件无后缀名，无法处理该文件')
      );
    }
    issuerExt = issuerExt.replace(/^\./, '');
    if (!isNetworkUrl) {
      let flag = true;
      if (
        this.loaderOptions.styleExt.indexOf(issuerExt) > -1 ||
        this.loaderOptions.viewExt.indexOf(issuerExt) > -1
      ) {
        //view 和 样式内允许有base64 编码的资源
        if (this.loaderOptions.styleExt.indexOf(issuerExt) > -1) {
          //处理样式为base64超过limit，转成网络url
          if (this.content.byteLength > this.loaderOptions.limit) {
            flag = false;
            isNetworkUrl = true;
            // return this.loaderContext.callback(
            //     new Error(`文件 ${this.loaderContext.resourcePath} 大小超过了限制${this.loaderOptions.limit} bytes`)
            // )
          }
        }
      }
      if (flag) {
        let urlLoaderContext = Object.assign({}, this.loaderContext, {
          query: {
            limit: this.loaderOptions.limit,
            ...WechatappPlugin.util.fileLoader().options,
            //放入file-loader 的选项
            name: this.loaderOptions.name,
            // context: issuerResource,
            outputPath:
              typeof this.loaderOptions.relativeOutputPath !== 'function'
                ? this.loaderOptions.outputPath
                : (url: string): string => {
                    return this.loaderOptions.relativeOutputPath.call(
                      this.loaderContext,
                      url,
                      this.loaderContext.resourcePath,
                      issuerResource
                    );
                  },
            publicPath:
              typeof this.loaderOptions.relativePublicPath !== 'function'
                ? ''//需要解析成相对于当前issuerResource 在output.path 下的路径
                : (url: string): string => {
                    return this.loaderOptions.relativePublicPath.call(
                      this.loaderContext,
                      url,
                      this.loaderContext.resourcePath,
                      issuerResource
                    );
                  }
          }
        });
        let src = urlLoader.call(urlLoaderContext, this.content);
        this.loaderContext.callback(null, src, this.sourceMap);
      }
    }
    if (isNetworkUrl) {
      //网络图片
      let fileLoaderContext = Object.assign({}, this.loaderContext, {
        query: {
          ...WechatappPlugin.util.fileLoader().options,
          name: this.loaderOptions.name,
          outputPath: this.loaderOptions.outputPath,
          publicPath: this.loaderOptions.publicPath
        }
      });
      let src = fileLoader.call(fileLoaderContext, this.content);
      this.loaderContext.callback(null, src, this.sourceMap);
    }
  }
}
export default AssetsProcessor;
