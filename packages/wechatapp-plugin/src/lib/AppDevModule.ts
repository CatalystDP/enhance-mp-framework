import BaseDevModule from './BaseDevModule';
import IPluginOptions from '../interfaces/IPluginOptions';
import path = require('path');
import * as _ from 'lodash';
import * as fs from 'fs-extra';
import glob = require('glob');
import { PLUGIN_NAME } from '../const';
class AppDevModule extends BaseDevModule {
  protected pages: string[];
  protected appJson: {
    [key: string]: any;
  };
  public constructor(compiler, pluginOptions: IPluginOptions) {
    super(compiler, pluginOptions);
    this.attachPoint();
  }
  public attachPoint(): void {
    super.attachPoint();
    let handleEnviroment = (): void => {
      this.resolveEntry();
      this.appendCommonPlugin(this.pluginOption.appCommonName);
    };
    this.compiler.hooks.environment.tap(
      `${PLUGIN_NAME}_enviroment`,
      handleEnviroment
    );
  }
  public getProjectRoot(): string {
    return this.projectRoot || '';
  }
  public getCommonName(): string {
    return this.pluginOption.appCommonName;
  }
  public resolveEntry(): void {
    // let { entry } = this.compiler.options;
    let entry: any = this.compiler.options.entry;
    if (!_.isObject(entry)) return;
    if (!(entry as any).app) return;
    this.entryResource = [];
    if (!/app\..+/.test((entry as any).app)) return;
    this.entryResource.push((entry as any).app);
    this.projectRoot = path.dirname((entry as any).app);
    this._resolveAppJson();
    this.pages.forEach(
      (page): void => {
        let file = path.join(
          this.projectRoot,
          `${page}${this.pluginOption.ext}`
        );
        let matched = glob.sync(file);
        if (Array.isArray(matched) && matched.length > 0) {
          entry[page] = matched[0];
        }
      }
    );
    let componentEntry = this.getComponentEntry();
    _.extend(entry, componentEntry);
    _.isFunction(this.pluginOption.onAdditionalEntry) &&
      _.extend(entry, this.pluginOption.onAdditionalEntry.call(this));
    _.forIn(
      entry,
      (val): void => {
        this.entryResource.push(val);
      }
    );
    this.addAssetsEntry();
    this.resolveExternal(entry);
  }
  public getEntryResource(): string[] {
    return this.entryResource;
  }
  protected _resolveAppJson(): void {
    let file = path.join(this.projectRoot, 'app.json');
    try {
      this.appJson = fs.readJSONSync(file);
    } catch (e) {
      throw e;
    }
    this.pages = this.appJson['pages'];
    let subPackages = this.appJson['subPackages'];
    if (Array.isArray(subPackages)) {
      subPackages.forEach(
        (sub): void => {
          if (Array.isArray(sub.pages)) {
            sub.pages.forEach(
              (page): void => {
                this.pages.push(`${sub['root']}/${page}`);
              }
            );
          }
        }
      );
    }
  }
}
export default AppDevModule;
