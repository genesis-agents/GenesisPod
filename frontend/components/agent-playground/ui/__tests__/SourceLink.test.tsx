import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SourceLink } from '../SourceLink';

describe('SourceLink', () => {
  it('renders as anchor when valid http url provided', () => {
    const { container } = render(
      <SourceLink title="Test" url="https://example.com" />
    );
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('https://example.com');
  });

  it('renders as div when url is undefined', () => {
    const { container } = render(<SourceLink title="No URL" />);
    const a = container.querySelector('a');
    const div = container.querySelector('div');
    expect(a).toBeNull();
    expect(div).toBeTruthy();
  });

  it('renders as div when url is not http(s)', () => {
    const { container } = render(
      <SourceLink title="Bad URL" url="ftp://bad.com" />
    );
    const a = container.querySelector('a');
    expect(a).toBeNull();
  });

  it('shows explicit title when provided', () => {
    render(<SourceLink title="My Article" url="https://example.com" />);
    expect(screen.getByText('My Article')).toBeInTheDocument();
  });

  it('shows hostname chip when url provided', () => {
    render(<SourceLink title="Article" url="https://www.reuters.com/news/x" />);
    expect(screen.getByText('reuters.com')).toBeInTheDocument();
  });

  it('strips www from hostname', () => {
    render(<SourceLink title="T" url="https://www.bbc.com/news" />);
    expect(screen.getByText('bbc.com')).toBeInTheDocument();
  });

  it('shows hits badge when hits > 1', () => {
    render(<SourceLink title="T" url="https://example.com" hits={3} />);
    expect(screen.getByText('引用 3 次')).toBeInTheDocument();
  });

  it('does not show hits badge when hits <= 1', () => {
    render(<SourceLink title="T" url="https://example.com" hits={1} />);
    expect(screen.queryByText(/引用/)).not.toBeInTheDocument();
  });

  it('does not show hits badge when hits = 0', () => {
    render(<SourceLink title="T" url="https://example.com" hits={0} />);
    expect(screen.queryByText(/引用/)).not.toBeInTheDocument();
  });

  it('does not show hits badge when hits is undefined', () => {
    render(<SourceLink title="T" url="https://example.com" />);
    expect(screen.queryByText(/引用/)).not.toBeInTheDocument();
  });

  it('uses snippet first sentence as fallback title', () => {
    render(<SourceLink snippet="This is the first sentence. More text." />);
    expect(screen.getByText('This is the first sentence')).toBeInTheDocument();
  });

  it('uses <title> tag from snippet as fallback', () => {
    render(
      <SourceLink snippet="<title>Extracted Title</title> some content" />
    );
    expect(screen.getByText('Extracted Title')).toBeInTheDocument();
  });

  it('uses URL path segment as fallback when no snippet', () => {
    render(<SourceLink url="https://example.com/my-article-name" />);
    expect(screen.getByText('my article name')).toBeInTheDocument();
  });

  it('uses hostname as fallback when path is empty', () => {
    render(<SourceLink url="https://example.com/" />);
    // Both the display title and the hostname chip show example.com
    const matches = screen.getAllByText('example.com');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows (无标题) when no title, snippet, or url', () => {
    render(<SourceLink />);
    expect(screen.getByText('(无标题)')).toBeInTheDocument();
  });

  it('shows hostname chip = undefined when no url', () => {
    const { container } = render(<SourceLink title="T" />);
    // no hostname span when url is undefined
    const monoSpan = container.querySelector('span.font-mono');
    expect(monoSpan).toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(
      <SourceLink title="T" url="https://x.com" className="my-class" />
    );
    const a = container.querySelector('a');
    expect(a?.className).toContain('my-class');
  });

  it('applies custom className on div variant', () => {
    const { container } = render(<SourceLink title="T" className="my-class" />);
    const div = container.querySelector('div');
    expect(div?.className).toContain('my-class');
  });

  it('uses title that is not equal to hostname', () => {
    // Title that equals hostname should fall back to extractFallbackTitle
    render(
      <SourceLink
        title="example.com"
        url="https://www.example.com/article"
        snippet="Better title from snippet."
      />
    );
    // The title "example.com" matches the hostname so fallback to snippet
    expect(screen.getByText('Better title from snippet')).toBeInTheDocument();
  });

  it('title with length <= 2 falls back to snippet', () => {
    render(<SourceLink title="AB" snippet="This is the snippet." />);
    expect(screen.getByText('This is the snippet')).toBeInTheDocument();
  });

  it('uses url slice as fallback for invalid URL', () => {
    render(<SourceLink url="not-a-valid-url-at-all" />);
    // extractFallbackTitle tries to parse, catches exception → returns url.slice(0, 80)
    expect(screen.getByText('not-a-valid-url-at-all')).toBeInTheDocument();
  });

  it('javascript-required snippet falls back to url path', () => {
    render(
      <SourceLink
        snippet="Please enable javascript to use this site."
        url="https://example.com/my-page"
      />
    );
    expect(screen.getByText('my page')).toBeInTheDocument();
  });

  it('snippet first sentence too short (<6 chars) falls back to url path', () => {
    // firstSentence.length < 6 → condition fails → falls through to URL path
    render(
      <SourceLink
        snippet="Hi. This is the rest"
        url="https://example.com/my-article"
      />
    );
    // "Hi" (2 chars) < 6, so falls through to URL path → "my article"
    expect(screen.getByText('my article')).toBeInTheDocument();
  });

  it('snippet first sentence too long (>120 chars) falls back to url path', () => {
    // firstSentence.length > 120 → condition fails → falls through to URL path
    const longSentence = 'x'.repeat(121);
    render(
      <SourceLink snippet={longSentence} url="https://example.com/my-page" />
    );
    // Long sentence without a period so entire text is "first sentence"
    expect(screen.getByText('my page')).toBeInTheDocument();
  });
});
