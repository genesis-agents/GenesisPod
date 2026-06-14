import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToneCard } from '../ToneCard';

describe('ToneCard', () => {
  it('renders children', () => {
    render(<ToneCard tone="info">card content</ToneCard>);
    expect(screen.getByText('card content')).toBeInTheDocument();
  });

  it('renders with info tone', () => {
    const { container } = render(<ToneCard tone="info">x</ToneCard>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('rounded-lg');
  });

  it('renders with success tone', () => {
    const { container } = render(<ToneCard tone="success">x</ToneCard>);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeInTheDocument();
  });

  it('renders with warn tone', () => {
    const { container } = render(<ToneCard tone="warn">x</ToneCard>);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeInTheDocument();
  });

  it('renders with error tone', () => {
    const { container } = render(<ToneCard tone="error">x</ToneCard>);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeInTheDocument();
  });

  it('renders with neutral tone', () => {
    const { container } = render(<ToneCard tone="neutral">x</ToneCard>);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(
      <ToneCard tone="info" label="Info Label">
        content
      </ToneCard>
    );
    expect(screen.getByText('Info Label')).toBeInTheDocument();
  });

  it('renders meta when provided', () => {
    render(
      <ToneCard tone="info" meta="12:00:00">
        content
      </ToneCard>
    );
    expect(screen.getByText('12:00:00')).toBeInTheDocument();
  });

  it('renders both label and meta', () => {
    render(
      <ToneCard tone="warn" label="Warning" meta="2 mins ago">
        body
      </ToneCard>
    );
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('2 mins ago')).toBeInTheDocument();
  });

  it('does not render header div when neither label nor meta provided', () => {
    const { container } = render(<ToneCard tone="info">only body</ToneCard>);
    // header div has border-b; check it's absent
    const headerDiv = container.querySelector('.border-b.border-black\\/5');
    expect(headerDiv).toBeNull();
  });

  it('renders header div when only label provided', () => {
    const { container } = render(
      <ToneCard tone="info" label="L">
        body
      </ToneCard>
    );
    const headerDiv = container.querySelector('.border-b');
    expect(headerDiv).toBeTruthy();
  });

  it('renders header div when only meta provided', () => {
    const { container } = render(
      <ToneCard tone="info" meta="M">
        body
      </ToneCard>
    );
    const headerDiv = container.querySelector('.border-b');
    expect(headerDiv).toBeTruthy();
  });

  it('meta is in ml-auto span', () => {
    const { container } = render(
      <ToneCard tone="success" meta="timestamp">
        content
      </ToneCard>
    );
    const metaSpan = container.querySelector('span.ml-auto');
    expect(metaSpan?.textContent).toBe('timestamp');
  });

  it('applies custom className', () => {
    const { container } = render(
      <ToneCard tone="info" className="custom-tone">
        x
      </ToneCard>
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('custom-tone');
  });

  it('label renders icon inside label span', () => {
    const { container } = render(
      <ToneCard tone="error" label="Error">
        x
      </ToneCard>
    );
    // The label span has an icon svg
    const labelSpan = container.querySelector('span.inline-flex');
    const svg = labelSpan?.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
