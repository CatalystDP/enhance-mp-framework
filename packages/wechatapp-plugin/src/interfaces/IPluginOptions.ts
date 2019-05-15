import { Source } from "webpack-sources";
import webpack = require("webpack");
export default interface IPluginOptions {
    devMode?: string;
    ext?: string[];
    appCommonName?: string;
    jsonpFuncName?: string;
    pluginCommonName?: string;
    customCommonName?: string;
    pluginExportName?: string;
    customFiles?: string[];
    minChunks?: number | ((mod: webpack.Module, c: number) => boolean);
    componentsPath?: string[];
    fileLoaderExt?: string[];
    useDefaultLoader?: boolean;
    onAdditionalAssets?: () => string[];
    onAdditionalEntry?: () => {
        [key: string]: string;
    };
    onEmitAssets?: <T extends Source>() => void;
    projectRoot?: string;
    assetsExt?: string[];
}