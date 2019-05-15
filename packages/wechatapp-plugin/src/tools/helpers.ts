export default class Helpers {
  public static requireTemplate(str: string) {
      return `require(${str});\n`;
  }
}
