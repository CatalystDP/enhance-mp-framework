import { debugLog } from '../../tools/debug';
import AssetsProcessor from './AssetsProcessor';
import { LOG_TAG } from './constants';
import { loader } from 'webpack';
let _loader = function(
  this: loader.LoaderContext,
  content: Buffer,
  map: any
): void {
  debugLog(LOG_TAG, 'main', 'run into loader');
  this.cacheable(false);
  // let { plugins } = (this.options as any);
  if (!this._module) {
    return this.callback(null, content, map);
  }
  new AssetsProcessor(this, content, map);
  return;
};
(_loader as any).raw = true;
export = _loader;
