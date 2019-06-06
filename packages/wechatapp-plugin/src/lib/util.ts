import * as querystring from 'querystring';
export default {
  fileLoader(ext = '[ext]', asString = false): any {
    let obj = {
      loader: 'file-loader',
      options: {
        name: `[path][name].${ext}`
      }
    };
    if (asString) {
      return `!${obj.loader}?${querystring.stringify(obj.options)}!`;
    }
    return obj;
  },
  getPackageJson(): { [key: string]: any } {
    return require('../../package.json');
  },
  /**
   * @returns {string}
   */
  rndNumber(): string {
    return Math.random()
      .toString()
      .slice(2);
  }
};
