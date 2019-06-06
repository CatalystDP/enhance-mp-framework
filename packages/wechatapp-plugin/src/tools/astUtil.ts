import * as t from '@babel/types';
import babelTraverse from '@babel/traverse';
import babelGenerator from '@babel/generator';
export default class AstUtil {
  /**
   * @description 替换一些ast 树的内容并重新生成
   * @param replacement
   */
  // public static replaceAst(replacement: { [key: string]: string }): string {
  //   return "";
  // }
  public static replaceRuntime(
    astTree: t.File,
    globalVar: string,
    jsonpName: string
  ): string {
    babelTraverse(astTree, {
      MemberExpression: (path): void => {
        if (
          t.isIdentifier(path.node.object) &&
          path.node.object.name === 'window' &&
          t.isStringLiteral(path.node.property) &&
          path.node.property.value === 'webpackJsonp'
        ) {
          path.node.object = t.identifier(globalVar);
          path.node.property = t.stringLiteral(jsonpName);
        }
      }
    });
    let result = babelGenerator(astTree, {
      retainLines: true
    });
    return result.code;
  }
}
