/**
 * Custom Document - Pages Router 错误页面支持
 *
 * Next.js 要求 Pages Router 的 _error 页面必须有对应的 _document
 * 这个文件仅用于支持 404/500 错误页面的静态生成
 */

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
