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
      node: _node,
      ...props
    }: React.HTMLAttributes<HTMLParagraphElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => <p {...props}>{processChildren(children, processText)}</p>,
    li: ({
      children,
      node: _node,
      ...props
    }: React.LiHTMLAttributes<HTMLLIElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => <li {...props}>{processChildren(children, processText)}</li>,
    strong: ({
      children,
      node: _node,
      ...props
    }: React.HTMLAttributes<HTMLElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => (
      <strong {...props}>{processChildrenSimple(children, processText)}</strong>
    ),
    em: ({
      children,
      node: _node,
      ...props
    }: React.HTMLAttributes<HTMLElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => <em {...props}>{processChildrenSimple(children, processText)}</em>,
    table: ({
      children,
      node: _node,
      ...props
    }: React.TableHTMLAttributes<HTMLTableElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => {
      // Extract text from children to detect risk matrix table
      function extractText(node: React.ReactNode): string {
        if (typeof node === 'string') return node;
        if (typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(extractText).join('');
        if (React.isValidElement(node) && node.props?.children) {
          return extractText(node.props.children as React.ReactNode);
        }
        return '';
      }

      const tableText = extractText(children);
      const isRiskMatrix =
        /风险类型|概率|影响|Risk Type|Probability|Impact/i.test(tableText);

      return (
        <div className="overflow-x-auto">
          <table
            {...props}
            className={isRiskMatrix ? 'border border-red-100' : ''}
          >
            {children}
          </table>
        </div>
      );
    },
    td: ({
      children,
      node: _node,
      ...props
    }: React.TdHTMLAttributes<HTMLTableCellElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => {
      // Extract text from children to detect risk level
      function extractText(node: React.ReactNode): string {
        if (typeof node === 'string') return node;
        if (typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(extractText).join('');
        if (React.isValidElement(node) && node.props?.children) {
          return extractText(node.props.children as React.ReactNode);
        }
        return '';
      }

      const cellText = extractText(children).trim();

      // Check if cell contains risk level indicator
      const riskLevelMap: Record<string, string> = {
        高: 'bg-red-100 text-red-700 font-medium',
        High: 'bg-red-100 text-red-700 font-medium',
        中: 'bg-amber-100 text-amber-700 font-medium',
        Medium: 'bg-amber-100 text-amber-700 font-medium',
        低: 'bg-green-100 text-green-700 font-medium',
        Low: 'bg-green-100 text-green-700 font-medium',
      };

      const riskClass = riskLevelMap[cellText];

      if (riskClass) {
        return (
          <td {...props}>
            <span
              className={`inline-block rounded-sm px-1.5 py-0.5 ${riskClass}`}
            >
              {processChildren(children, processText)}
            </span>
          </td>
        );
      }

      return <td {...props}>{processChildren(children, processText)}</td>;
    },
    th: ({
      children,
      node: _node,
      ...props
    }: React.ThHTMLAttributes<HTMLTableCellElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => <th {...props}>{processChildren(children, processText)}</th>,
    h1: ({
      children,
      node: _node,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => (
      <h1 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h1>
    ),
    h2: ({
      children,
      node: _node,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => (
      <h2 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h2>
    ),
    h3: ({
      children,
      node: _node,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => (
      <h3 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h3>
    ),
    h4: ({
      children,
      node: _node,
      ...props
    }: React.HTMLAttributes<HTMLHeadingElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => (
      <h4 id={headingSlug(children)} {...props}>
        {processChildrenSimple(children, processText)}
      </h4>
    ),
    blockquote: ({
      children,
      node: _node,
      ...props
    }: React.BlockquoteHTMLAttributes<HTMLQuoteElement> & {
      children?: React.ReactNode;
      node?: unknown;
    }) => (
      <blockquote {...props}>
        {processChildrenSimple(children, processText)}
      </blockquote>
    ),
  };
}
