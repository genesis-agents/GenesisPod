import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MetricStat } from '../MetricStat';

describe('MetricStat', () => {
  it('renders label and value', () => {
    render(<MetricStat label="耗时" value="1.2s" />);
    expect(screen.getByText('耗时')).toBeInTheDocument();
    expect(screen.getByText('1.2s')).toBeInTheDocument();
  });

  it('shows dash when value is null', () => {
    render(<MetricStat label="Token" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows dash when value is undefined', () => {
    render(<MetricStat label="Token" value={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows dash when value is empty string', () => {
    render(<MetricStat label="Token" value="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders ReactNode value', () => {
    render(<MetricStat label="Status" value={<span>running</span>} />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('emphasis=false uses default bg-gray-50 styling', () => {
    const { container } = render(
      <MetricStat label="x" value="y" emphasis={false} />
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-gray-50');
    expect(div.className).not.toContain('bg-violet-50');
  });

  it('emphasis=true applies violet styling', () => {
    const { container } = render(
      <MetricStat label="x" value="y" emphasis={true} />
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-violet-50');
    expect(div.className).toContain('ring-violet-100');
  });

  it('emphasis value text uses violet color', () => {
    render(<MetricStat label="x" value="99" emphasis={true} />);
    const valueEl = screen.getByText('99');
    expect(valueEl.className).toContain('text-violet-900');
  });

  it('non-emphasis value text uses gray-900', () => {
    render(<MetricStat label="x" value="99" />);
    const valueEl = screen.getByText('99');
    expect(valueEl.className).toContain('text-gray-900');
  });

  it('passes custom className', () => {
    const { container } = render(
      <MetricStat label="x" value="y" className="my-class" />
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('my-class');
  });

  it('renders numeric zero (0) without dash', () => {
    render(<MetricStat label="x" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
