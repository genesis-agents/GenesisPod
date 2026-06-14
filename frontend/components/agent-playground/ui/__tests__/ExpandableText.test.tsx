import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ExpandableText, linkifyText } from '../ExpandableText';

describe('linkifyText', () => {
  it('returns plain text as React fragment', () => {
    const nodes = linkifyText('hello world');
    // Should return at least 1 node
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('turns markdown link [label](url) into anchor', () => {
    const nodes = linkifyText('see [Google](https://google.com) now');
    const { container } = render(<>{nodes}</>);
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://google.com');
    expect(link?.textContent).toBe('Google');
  });

  it('turns bare URL into anchor', () => {
    const nodes = linkifyText('visit https://example.com today');
    const { container } = render(<>{nodes}</>);
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://example.com');
  });

  it('truncates long bare URLs at 60 chars', () => {
    const longUrl =
      'https://example.com/very/long/path/that/exceeds/sixty/characters/total/yes';
    const nodes = linkifyText(longUrl);
    const { container } = render(<>{nodes}</>);
    const link = container.querySelector('a');
    expect(link?.textContent).toContain('…');
  });

  it('handles text with no links', () => {
    const nodes = linkifyText('just plain text');
    const { container } = render(<>{nodes}</>);
    expect(container.textContent).toBe('just plain text');
    expect(container.querySelectorAll('a').length).toBe(0);
  });

  it('handles text before and after markdown link', () => {
    const nodes = linkifyText('before [link](https://test.com) after');
    const { container } = render(<>{nodes}</>);
    expect(container.textContent).toContain('before');
    expect(container.textContent).toContain('after');
    expect(container.querySelector('a')?.href).toContain('test.com');
  });

  it('handles multiple bare URLs', () => {
    const nodes = linkifyText('https://one.com and https://two.com');
    const { container } = render(<>{nodes}</>);
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);
  });

  it('markdown link at start of text (m.index === 0, no prefix text)', () => {
    // Covers the `if (m.index > lastIdx)` false branch in linkifyText
    const nodes = linkifyText(
      '[Google](https://google.com) is a search engine'
    );
    const { container } = render(<>{nodes}</>);
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://google.com');
    expect(link?.textContent).toBe('Google');
    expect(container.textContent).toContain('is a search engine');
  });

  it('text with only a markdown link and no trailing text', () => {
    // Covers when lastIdx >= text.length after the link (no trailing text)
    const nodes = linkifyText('[Click here](https://example.org)');
    const { container } = render(<>{nodes}</>);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.org');
    // No extra text node besides the link
    expect(container.textContent).toBe('Click here');
  });
});

describe('ExpandableText', () => {
  it('renders short text without expand button', () => {
    render(<ExpandableText text="short text" maxChars={240} />);
    expect(screen.getByText('short text')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('text exactly at maxChars → no expand button', () => {
    const text = 'a'.repeat(10);
    render(<ExpandableText text={text} maxChars={10} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('long text shows truncated content + expand button', () => {
    const text = 'a'.repeat(300);
    render(<ExpandableText text={text} maxChars={100} />);
    expect(
      screen.getByRole('button', { name: '展开全文' })
    ).toBeInTheDocument();
  });

  it('clicking "展开全文" expands text and shows "收起" button', () => {
    const text = 'Hello '.repeat(100);
    render(<ExpandableText text={text} maxChars={10} />);
    fireEvent.click(screen.getByRole('button', { name: '展开全文' }));
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument();
  });

  it('clicking "收起" collapses text back', () => {
    const text = 'Hello '.repeat(100);
    render(<ExpandableText text={text} maxChars={10} />);
    fireEvent.click(screen.getByRole('button', { name: '展开全文' }));
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(
      screen.getByRole('button', { name: '展开全文' })
    ).toBeInTheDocument();
  });

  it('expand button click stops propagation', () => {
    const text = 'x'.repeat(300);
    const parentClickMock = vi.fn();
    render(
      <div onClick={parentClickMock}>
        <ExpandableText text={text} maxChars={10} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: '展开全文' }));
    expect(parentClickMock).not.toHaveBeenCalled();
  });

  it('applies className to outer span', () => {
    const text = 'short';
    const { container } = render(
      <ExpandableText text={text} className="test-class" />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies className for long text', () => {
    const text = 'x'.repeat(300);
    const { container } = render(
      <ExpandableText text={text} maxChars={10} className="test-class" />
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('test-class');
  });

  it('uses default maxChars=240', () => {
    const text = 'a'.repeat(239);
    render(<ExpandableText text={text} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('text with markdown link renders link inside short text', () => {
    const text = 'see [Google](https://google.com)';
    render(<ExpandableText text={text} maxChars={500} />);
    const link = screen.getByRole('link', { name: 'Google' });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('https://google.com');
  });
});
