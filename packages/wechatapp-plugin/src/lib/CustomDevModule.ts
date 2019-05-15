import BaseDevModule from "./BaseDevModule";
import IPluginOptions from "../interfaces/IPluginOptions";
import path = require("path");
import env from "../tools/env";
import { PLUGIN_NAME } from "../const";
const _ = require("lodash");
const fs = require("fs-extra");
const glob = require("glob");
const acorn = require("acorn");
const { ConcatSource } = require("webpack-sources");
class CustomDevModule extends BaseDevModule {
    constructor(compiler, pluginOptions: IPluginOptions) {
        super(compiler, pluginOptions);
        this.attachPoint();
    }
    attachPoint() {
        super.attachPoint();
        let handleEnviroment = () => {
            this.resolveEntry();
            this.appendCommonPlugin(this.getCommonName());
        };
        if (env.isHook) {
            this.compiler.hooks.environment.tap(
                `${PLUGIN_NAME}_enviroment`,
                handleEnviroment
            );
        } else {
            this.compiler.plugin("environment", handleEnviroment);
        }
    }
    resolveEntry() {
        if (!_.isObject(this.compiler.options.entry))
            throw new Error("entry must be an Object");
        let entry = this.compiler.options.entry;
        Object.keys(entry).forEach(key => {
            delete entry[key];
        });
        this.entryResource = [];
        this.projectRoot = this.pluginOption.projectRoot;
        let customEntry = this.getCustomEntry();
        _.extend(entry, customEntry);
        this.addAssetsEntry();
        _.isFunction(this.pluginOption.onAdditionalEntry) &&
            _.extend(entry, this.pluginOption.onAdditionalEntry.call(this));
        _.forIn(entry, val => {
            this.entryResource.push(val);
        });
    }
    getEntryResource() {
        return this.entryResource;
    }
    getCustomEntry() {
        let entry = {};
        let customEntrys = glob.sync(`**/*${this.pluginOption.ext}`, {
            cwd: this.getProjectRoot()
        });
        if (Array.isArray(customEntrys)) {
            customEntrys
                .filter(file => {
                    return this.pluginOption.customFiles.some(f => {
                        return file.indexOf(f) > -1;
                    });
                })
                .forEach(e => {
                    let fullPath = path.join(this.getProjectRoot(), e);
                    entry[e.replace(path.extname(fullPath), "")] = fullPath;
                });
        }
        return entry;
    }
    *emitAssets(compilation) {}
    getProjectRoot() {
        return this.projectRoot || "";
    }
    getCommonName() {
        return this.pluginOption.customCommonName;
    }
}
export default CustomDevModule;
