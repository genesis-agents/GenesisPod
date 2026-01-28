import React from 'react';

type ProcessTextFn = (text: string) => React.ReactNode;

function processChildren(
  children: React.ReactNode,
  processText: ProcessTextFn
): React.ReactNode {
  if (typeof children === 'string') {
    return processText(children);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === 'string' ? (
        <span key={i}>{processText(child)}</span>
      ) : (
        child
      )
    );
  }
  return children;
}

function processChildrenSimple(
  children: React.ReactNode,
  processText: ProcessTextFn
): React.ReactNode {
  if (typeof children === 'string') {
    return processText(children);
  }
  return children;
}

export function createMarkdownComponents(processText: ProcessTextFn) {
  return {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 hover:underline"
      >
        {children}
      </a>
    ),
    p: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLParagraphElement> & {
      children?: React.ReactNode;
    }) => <p {...props}>{processChildren(children, processText)}</p>,
    li: ({
      children,
      ...props
    }: React.LiHTMLAttributes<HTMLLIElement> & {
      children?: React.ReactNode;
    }) => <li {...props}>{processChildren(children, processText)}</li>,
    strong: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => (
      <strong {...props}>{processChildrenSimple(children, processText)}</strong>
    ),
    em: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => (
      <em {...props}>{processChildrenSimple(children, processText)}</em>
    ),
    td: ({
      children,
      ...props
    }: React.TdHTMLAttributes<HTMLTableCellElement> & {
      children?: React.ReactNode;
    }) => <td {...props}>{processChildren(children, processText)}</td>,
    th: ({
      children,
      ...props
    }: React.ThHTMLAttributes<HTMLTableCellElement> & {
      children?: React.ReactNode;
    }) => <th {...props}>{processChildren(children, processText)}</th>,
    h1: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
    }) => <h1 {...props}>{processChildrenSimple(children, processText)}</h1>,
    h2: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
    }) => <h2 {...props}>{processChildrenSimple(children, processText)}</h2>,
    h3: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
    }) => <h3 {...props}>{processChildrenSimple(children, processText)}</h3>,
    h4: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
    }) => <h4 {...props}>{processChildrenSimple(children, processText)}</h4>,
    blockquote: ({
      children,
      ...props
    }: React.BlockquoteHTMLAttributes<HTMLQuoteElement> & {
      children?: React.ReactNode;
    }) => (
      <blockquote {...props}>
        {processChildrenSimple(children, processText)}
      </blockquote>
    ),
  };
}
