import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Card } from '../Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>hello world</Card>);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('applies default classes (bordered + elevated + radius lg)', () => {
    const { container } = render(<Card>content</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-white');
    expect(div.className).toContain('border-gray-200');
    expect(div.className).toContain('shadow-sm');
    expect(div.className).toContain('rounded-xl');
  });

  it('radius sm → rounded-md', () => {
    const { container } = render(<Card radius="sm">x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('rounded-md');
    expect(div.className).not.toContain('rounded-xl');
  });

  it('radius md → rounded-lg', () => {
    const { container } = render(<Card radius="md">x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('rounded-lg');
  });

  it('radius lg (default) → rounded-xl', () => {
    const { container } = render(<Card radius="lg">x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('rounded-xl');
  });

  it('bordered=false removes border class', () => {
    const { container } = render(<Card bordered={false}>x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).not.toContain('border-gray-200');
  });

  it('elevated=false removes shadow-sm', () => {
    const { container } = render(<Card elevated={false}>x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).not.toContain('shadow-sm');
  });

  it('onClick makes card clickable with cursor-pointer', () => {
    const handler = vi.fn();
    const { container } = render(<Card onClick={handler}>click me</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('cursor-pointer');
    fireEvent.click(div);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('no onClick → no cursor-pointer class', () => {
    const { container } = render(<Card>no click</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).not.toContain('cursor-pointer');
  });

  it('passes custom className', () => {
    const { container } = render(<Card className="my-custom-class">x</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('my-custom-class');
  });
});
