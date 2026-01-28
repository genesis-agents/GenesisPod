/**
 * Custom Error Page - Pages Router 错误处理
 *
 * 处理 404 和 500 错误的静态页面
 * 这个文件用于 Pages Router 的回退错误处理
 */

import { NextPageContext } from 'next';
import Link from 'next/link';

interface ErrorProps {
  statusCode?: number;
}

function Error({ statusCode }: ErrorProps) {
  const is404 = statusCode === 404;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f9fafb',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: '4rem',
            fontWeight: 'bold',
            color: '#111827',
            margin: 0,
          }}
        >
          {statusCode || 'Error'}
        </h1>
        <p
          style={{
            marginTop: '1rem',
            fontSize: '1.25rem',
            color: '#4b5563',
          }}
        >
          {is404 ? '页面未找到' : '服务器错误'}
        </p>
        <p
          style={{
            marginTop: '0.5rem',
            color: '#6b7280',
          }}
        >
          {is404 ? '您访问的页面不存在或已被移除' : '抱歉，发生了意外错误'}
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            marginTop: '2rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#2563eb',
            color: 'white',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            transition: 'background-color 0.2s',
          }}
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
