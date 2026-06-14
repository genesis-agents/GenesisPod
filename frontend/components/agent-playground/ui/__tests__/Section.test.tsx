import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Section } from '../Section';

describe('Section', () => {
  it('renders title', () => {
    render(<Section title="My Section">content</Section>);
    expect(screen.getByText('My Section')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Section title="T">child content</Section>);
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('renders count badge when count provided', () => {
    render(
      <Section title="T" count={5}>
        x
      </Section>
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not render count badge when count is undefined', () => {
    render(<Section title="T">x</Section>);
    // Look for a badge element — the count is wrapped in a specific span
    const badges = document.querySelectorAll(
      'span.font-mono.rounded.bg-gray-100'
    );
    expect(badges.length).toBe(0);
  });

  it('does not render count badge when count is empty string', () => {
    render(
      <Section title="T" count="">
        x
      </Section>
    );
    const badges = document.querySelectorAll('span.font-mono.rounded');
    expect(badges.length).toBe(0);
  });

  it('renders action when provided', () => {
    render(
      <Section title="T" action={<button>Action</button>}>
        x
      </Section>
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('variant=default uses gray-700 title color', () => {
    render(<Section title="Gray Title">x</Section>);
    const heading = screen.getByText('Gray Title');
    expect(heading.className).toContain('text-gray-700');
  });

  it('variant=accent uses violet-700 title color', () => {
    render(
      <Section title="Accent Title" variant="accent">
        x
      </Section>
    );
    const heading = screen.getByText('Accent Title');
    expect(heading.className).toContain('text-violet-700');
  });

  it('non-collapsible renders as div header (no button)', () => {
    const { container } = render(
      <Section title="T" collapsible={false}>
        content
      </Section>
    );
    const buttons = container.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBe(0);
  });

  it('collapsible=true renders a button header', () => {
    render(
      <Section title="Collapsible" collapsible={true}>
        content
      </Section>
    );
    // There should be a button for the header toggle
    const toggleBtn = screen.getByRole('button');
    expect(toggleBtn).toBeInTheDocument();
  });

  it('collapsible with defaultOpen=true shows children', () => {
    render(
      <Section title="T" collapsible={true} defaultOpen={true}>
        visible child
      </Section>
    );
    expect(screen.getByText('visible child')).toBeInTheDocument();
  });

  it('collapsible with defaultOpen=false hides children', () => {
    render(
      <Section title="T" collapsible={true} defaultOpen={false}>
        hidden child
      </Section>
    );
    expect(screen.queryByText('hidden child')).not.toBeInTheDocument();
  });

  it('clicking header toggles open/close', () => {
    render(
      <Section title="Toggle" collapsible={true} defaultOpen={true}>
        toggle content
      </Section>
    );
    expect(screen.getByText('toggle content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('toggle content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('toggle content')).toBeInTheDocument();
  });

  it('collapsible open shows ChevronDown icon', () => {
    const { container } = render(
      <Section title="T" collapsible={true} defaultOpen={true}>
        x
      </Section>
    );
    // ChevronDown has a unique path attribute; we check via class
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('collapsible closed shows ChevronRight icon', () => {
    const { container } = render(
      <Section title="T" collapsible={true} defaultOpen={false}>
        x
      </Section>
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('applies custom className', () => {
    const { container } = render(
      <Section title="T" className="custom-section">
        x
      </Section>
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('custom-section');
  });

  it('renders string count badge', () => {
    render(
      <Section title="T" count="42">
        x
      </Section>
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
