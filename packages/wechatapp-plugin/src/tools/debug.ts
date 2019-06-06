const log = require('debug')('wechatapp-plugin');
export const debugLog = (
  tag: string,
  context: string,
  ...args: string[]
): void => {
  log(`[${tag}] - [${context}]`, ...args);
};
