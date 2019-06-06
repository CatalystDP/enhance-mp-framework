export default class Helpers {
  public static requireTemplate(str: string): string {
    return `require(${str});\n`;
  }
}
