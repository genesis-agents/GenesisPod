import React from 'react';

type ProcessTextFn = (text: string) => React.ReactNode;

/** Generate GitHub-flavored heading slug (matches remark-slug / rehype-slug behavior) */
function headingSlug(children: React.ReactNode): string {
  // Extract plain text from children
  function extractText(node: React.ReactNode): string {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (React.isValidElement(node) && node.props?.children) {
      return extractText(node.props.children as React.ReactNode);
    }
    return '';
  }
  const text = extractText(children);
  return text
    .toLowerCase()
    .trim()
    .replace(/[#*`~^|\\[\]{}<>&=+!@$%;"'?,]/g, '') // strip markdown/special ASCII symbols
    .replace(/\./g, '-') // dots → dashes
    .replace(/\s/g, '-') // spaces → dashes
    .replace(/^-|-$/g, ''); // trim leading/trailing dashes
}

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

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [error, setError] = React.useState(false);
  if (error || !src) {
    return null; // Hide broken images
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ''}
      className="max-w-full rounded-lg"
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}

export function createMarkdownComponents(processText: ProcessTextFn) {
  return {
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <MarkdownImage src={src} alt={alt} />
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const isHash = href?.startsWith('#');
      const handleHashClick = isHash
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            const id = decodeURIComponent(href!.slice(1));
            const target = document.getElementById(id);
            if (target) {
              // Find the nearest scrollable ancestor
              let container: HTMLElement | null = target.parentElement;
              while (container) {
                const style = getComputedStyle(container);
                if (
                  (style.overflowY === 'auto' ||
                    style.overflowY === 'scroll') &&
                  container.scrollHeight > container.clientHeight
                ) {
                  break;
                }
                container = container.parentElement;
              }
              if (container) {
                const containerRect = container.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                container.scrollTo({
                  top: container.scrollTop + targetRect.top - containerRect.top,
                  behavior: 'smooth',
                });
              } else {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          }
        : undefined;
      return (
        <a
          href={href}
          onClick={handleHashClick}
          {...(isHash ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="cursor-pointer text-blue-600 hover:text-blue-800 hover:underline"
        >
          {children}
        </a>
      );
    },
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
    table: ({
      children,
      ...props
    }: React.TableHTMLAttributes<HTMLTableElement> & {
      children?: React.ReactNode;
    }) => (
      <div className="overflow-x-auto">
        <table {...props}>{children}</table>
      </div>
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
    }) => (
      <h1 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h1>
    ),
    h2: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
    }) => (
      <h2 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h2>
    ),
    h3: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
    }) => (
      <h3 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h3>
    ),
    h4: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
    }) => (
      <h4 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h4>
    ),
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
