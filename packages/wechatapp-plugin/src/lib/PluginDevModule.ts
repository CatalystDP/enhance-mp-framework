import BaseDevModule from './BaseDevModule';
import IPluginOptions from '../interfaces/IPluginOptions';
import { PLUGIN_NAME } from '../const';
import * as path from 'path';
import * as _ from 'lodash';
import * as fs from 'fs-extra';
import * as glob from 'glob';
import { ConcatSource } from 'webpack-sources';
class PluginDevModule extends BaseDevModule {
  public constructor(compiler, pluginOption: IPluginOptions) {
    super(compiler, pluginOption);
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
    let entry: any = this.compiler.options.entry;
    if (!_.isObject(entry)) throw new Error('entry config must an Object');
    if (!(entry as any).index) throw new Error('entry name must be "plugin"');
    this.entryResource = [(entry as any).index];
    this.projectRoot = path.dirname((entry as any).index);
    let componentEntry = this.getComponentEntry();
    _.extend(entry, componentEntry);
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
  public getEntryResource(): string[] {
    return this.entryResource;
  }
  public async resolveProjectConfigJson(): Promise<void> {
    let parentPathToPlugin = path.dirname(this.projectRoot);
    let projectConfig = fs.readJSONSync(
      path.join(parentPathToPlugin, 'project.config.json')
    );
    let { miniprogramRoot, pluginRoot } = projectConfig;
    // miniprogramRoot = miniprogramRoot.replace(//);
    let ignorePath = [
      path.parse(miniprogramRoot).name,
      path.parse(pluginRoot).name
    ];
    let parentAssets = glob.sync('**/*.*', {
      cwd: parentPathToPlugin,
      // ignore: `**/*${this.pluginOption.ext}`,
      ignore: [`+(${ignorePath.join('|')})/**/*.*`]
      // realpath: true
    });
    let {
      output: { path: outputPath }
    } = this.compiler.options;
    outputPath = path.dirname(outputPath);
    let promises = [];
    parentAssets.forEach(
      (asset): void => {
        promises.push(
          fs.copy(
            path.join(parentPathToPlugin, asset),
            path.join(outputPath, asset)
          )
        );
      }
    );
    await Promise.all(promises);
  }
  public async emitAssets(compilation): Promise<void> {
    await this.resolveProjectConfigJson();
    this.injectPluginEntry(compilation);
  }
  public injectPluginEntry(compilation): void {
    let { assets } = compilation;
    let key = 'index.js'; //插件入口的key
    let pluginMainFile = assets[key];
    if (!pluginMainFile) return;
    let concatSource = new ConcatSource(
      `var ${this.pluginOption.pluginExportName};`
    );
    concatSource.add(pluginMainFile);
    concatSource.add(
      `\nmodule.exports = ${this.pluginOption.pluginExportName};`
    );
    assets[key] = concatSource;
  }
  public getProjectRoot(): string {
    return this.projectRoot || '';
  }
  public getCommonName(): string {
    return this.pluginOption.pluginCommonName;
  }
}
export default PluginDevModule;
