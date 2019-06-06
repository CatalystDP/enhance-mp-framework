import BaseDevModule from './BaseDevModule';
import IPluginOptions from '../interfaces/IPluginOptions';
import path = require('path');
import { PLUGIN_NAME } from '../const';
import * as _ from 'lodash';
import * as glob from 'glob';
class CustomDevModule extends BaseDevModule {
  public constructor(compiler, pluginOptions: IPluginOptions) {
    super(compiler, pluginOptions);
    this.attachPoint();
  }
  public attachPoint(): void {
    super.attachPoint();
    let handleEnviroment = (): void => {
      this.resolveEntry();
      this.appendCommonPlugin(this.getCommonName());
    };
    this.compiler.hooks.environment.tap(
      `${PLUGIN_NAME}_enviroment`,
      handleEnviroment
    );
  }
  public resolveEntry(): void {
    if (!_.isObject(this.compiler.options.entry))
      throw new Error('entry must be an Object');
    let entry = this.compiler.options.entry;
    Object.keys(entry).forEach(
      (key): void => {
        delete entry[key];
      }
    );
    this.entryResource = [];
    this.projectRoot = this.pluginOption.projectRoot;
    let customEntry = this.getCustomEntry();
    _.extend(entry, customEntry);
    this.addAssetsEntry();
    _.isFunction(this.pluginOption.onAdditionalEntry) &&
      _.extend(entry, this.pluginOption.onAdditionalEntry.call(this));
    _.forIn(
      entry,
      (val): void => {
        this.entryResource.push(val);
      }
    );
    this.resolveExternal(entry);
  }
  public getEntryResource(): any {
    return this.entryResource;
  }
  public getCustomEntry(): { [key: string]: string } {
    let entry = {};
    let customEntrys = glob.sync(`**/*${this.pluginOption.ext}`, {
      cwd: this.getProjectRoot()
    });
    if (Array.isArray(customEntrys)) {
      customEntrys
        .filter(
          (file): boolean => {
            return this.pluginOption.customFiles.some(
              (f): boolean => {
                return file.indexOf(f) > -1;
              }
            );
          }
        )
        .forEach(
          (e): void => {
            let fullPath = path.join(this.getProjectRoot(), e);
            entry[e.replace(path.extname(fullPath), '')] = fullPath;
          }
        );
    }
    return entry;
  }
  public async emitAssets(compilation): Promise<void> {}
  public getProjectRoot(): string {
    return this.projectRoot || '';
  }
  public getCommonName(): string {
    return this.pluginOption.customCommonName;
  }
}
export default CustomDevModule;
