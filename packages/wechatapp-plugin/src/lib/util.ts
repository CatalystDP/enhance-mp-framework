import * as path from "path";
import * as querystring from "querystring";
export default {
  fileLoader(ext = "[ext]", asString = false): any {
    let obj = {
      loader: "file-loader",
      options: {
        name: `[path][name].${ext}`
      }
    };
    if (asString) {
      return `!${obj.loader}?${querystring.stringify(obj.options)}!`;
    }
    return obj;
  },
  getPackageJson() {
    return require("../../package.json");
  },
  /**
   * @returns {string}
   */
  rndNumber() {
    return Math.random()
      .toString()
      .slice(2);
  }
};
