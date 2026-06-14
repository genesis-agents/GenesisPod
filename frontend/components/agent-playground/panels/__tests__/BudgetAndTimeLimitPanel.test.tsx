/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/utils/common', () => ({
  cn: (...classes: (string | undefined | false | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

import {
  BudgetAndTimeLimitPanel,
  CREDIT_PRESETS,
  MULTIPLIER_PRESETS,
  WALL_TIME_PRESETS,
  MAX_CREDITS_LIMIT,
  MULTIPLIER_LIMIT,
  WALL_TIME_LIMIT_MINUTES,
} from '../BudgetAndTimeLimitPanel';

function buildProps(overrides = {}) {
  return {
    maxCredits: 2000,
    setMaxCredits: vi.fn(),
    budgetMultiplierOverride: 1.0,
    setBudgetMultiplierOverride: vi.fn(),
    wallTimeMinutes: 30,
    setWallTimeMinutes: vi.fn(),
    ...overrides,
  };
}

describe('BudgetAndTimeLimitPanel', () => {
  describe('header display', () => {
    it('renders title and description', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps()} />);
      expect(screen.getByText('预算与时限')).toBeInTheDocument();
      expect(screen.getByText(/硬上限。任意一项先到/)).toBeInTheDocument();
    });

    it('shows estimated tokens and USD for given maxCredits', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps({ maxCredits: 2000 })} />);
      // 2000 * 1000 / 1_000_000 = 2.00M tokens
      expect(screen.getByText('≈ 2.00M tokens')).toBeInTheDocument();
      // 2000 * 0.002 = $4.00
      expect(screen.getByText('≈ $4.00 USD')).toBeInTheDocument();
    });

    it('shows 0.00M tokens and $0.00 USD when maxCredits is 0', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps({ maxCredits: 0 })} />);
      expect(screen.getByText('≈ 0.00M tokens')).toBeInTheDocument();
      expect(screen.getByText('≈ $0.00 USD')).toBeInTheDocument();
    });

    it('shows large maxCredits correctly', () => {
      render(
        <BudgetAndTimeLimitPanel {...buildProps({ maxCredits: 100000 })} />
      );
      expect(screen.getByText('≈ 100.00M tokens')).toBeInTheDocument();
      expect(screen.getByText('≈ $200.00 USD')).toBeInTheDocument();
    });
  });

  describe('credit presets', () => {
    it('renders all credit presets with correct labels', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps()} />);
      // 500 → "500", 2000 → "2k", 8000 → "8k", 30000 → "30k", 100000 → "100k"
      expect(screen.getByRole('button', { name: '500' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2k' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '8k' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30k' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '100k' })).toBeInTheDocument();
    });

    it('calls setMaxCredits with preset value when preset clicked', () => {
      const setMaxCredits = vi.fn();
      render(<BudgetAndTimeLimitPanel {...buildProps({ setMaxCredits })} />);
      fireEvent.click(screen.getByRole('button', { name: '8k' }));
      expect(setMaxCredits).toHaveBeenCalledWith(8000);
    });

    it('active preset (matching current value) has amber styling', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps({ maxCredits: 2000 })} />);
      const activeBtn = screen.getByRole('button', { name: '2k' });
      expect(activeBtn.className).toContain('border-amber-500');
    });
  });

  describe('multiplier presets', () => {
    it('renders multiplier presets with ×-suffix', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps()} />);
      expect(screen.getByRole('button', { name: '0.5×' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1.0×' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2.0×' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '4.0×' })).toBeInTheDocument();
    });

    it('calls setBudgetMultiplierOverride when multiplier preset clicked', () => {
      const setBudgetMultiplierOverride = vi.fn();
      render(
        <BudgetAndTimeLimitPanel
          {...buildProps({ setBudgetMultiplierOverride })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: '2.0×' }));
      expect(setBudgetMultiplierOverride).toHaveBeenCalledWith(2.0);
    });
  });

  describe('wall time presets', () => {
    it('renders time presets with m/h suffix', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps()} />);
      expect(screen.getByRole('button', { name: '15m' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30m' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2h' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3h' })).toBeInTheDocument();
    });

    it('calls setWallTimeMinutes when time preset clicked', () => {
      const setWallTimeMinutes = vi.fn();
      render(
        <BudgetAndTimeLimitPanel {...buildProps({ setWallTimeMinutes })} />
      );
      fireEvent.click(screen.getByRole('button', { name: '1h' }));
      expect(setWallTimeMinutes).toHaveBeenCalledWith(60);
    });
  });

  describe('number inputs', () => {
    it('renders 3 number inputs', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps()} />);
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs).toHaveLength(3);
    });

    it('calls setMaxCredits clamped when input changes', () => {
      const setMaxCredits = vi.fn();
      render(<BudgetAndTimeLimitPanel {...buildProps({ setMaxCredits })} />);
      const inputs = screen.getAllByRole('spinbutton');
      // first input = credits
      fireEvent.change(inputs[0], { target: { value: '5000' } });
      expect(setMaxCredits).toHaveBeenCalledWith(5000);
    });

    it('clamps setMaxCredits to min when input too low', () => {
      const setMaxCredits = vi.fn();
      render(<BudgetAndTimeLimitPanel {...buildProps({ setMaxCredits })} />);
      const inputs = screen.getAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '1' } });
      expect(setMaxCredits).toHaveBeenCalledWith(MAX_CREDITS_LIMIT.min);
    });

    it('clamps setMaxCredits to max when input too high', () => {
      const setMaxCredits = vi.fn();
      render(<BudgetAndTimeLimitPanel {...buildProps({ setMaxCredits })} />);
      const inputs = screen.getAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: '999999' } });
      expect(setMaxCredits).toHaveBeenCalledWith(MAX_CREDITS_LIMIT.max);
    });

    it('clamps setWallTimeMinutes to min on zero input', () => {
      const setWallTimeMinutes = vi.fn();
      render(
        <BudgetAndTimeLimitPanel {...buildProps({ setWallTimeMinutes })} />
      );
      const inputs = screen.getAllByRole('spinbutton');
      // third input = wall time
      fireEvent.change(inputs[2], { target: { value: '0' } });
      expect(setWallTimeMinutes).toHaveBeenCalledWith(
        WALL_TIME_LIMIT_MINUTES.min
      );
    });

    it('falls back to min when input is not a number (NaN)', () => {
      const setMaxCredits = vi.fn();
      render(<BudgetAndTimeLimitPanel {...buildProps({ setMaxCredits })} />);
      const inputs = screen.getAllByRole('spinbutton');
      fireEvent.change(inputs[0], { target: { value: 'abc' } });
      // +('abc') = NaN → treated as 0 → clamp to min
      expect(setMaxCredits).toHaveBeenCalledWith(MAX_CREDITS_LIMIT.min);
    });
  });

  describe('compact prop', () => {
    it('does not crash in compact mode', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps({ compact: true })} />);
      expect(screen.getByText('预算与时限')).toBeInTheDocument();
    });

    it('does not crash in non-compact mode (default)', () => {
      render(<BudgetAndTimeLimitPanel {...buildProps()} />);
      expect(screen.getByText('预算与时限')).toBeInTheDocument();
    });
  });

  describe('exported constants', () => {
    it('CREDIT_PRESETS includes 500 and 100000', () => {
      expect(CREDIT_PRESETS).toContain(500);
      expect(CREDIT_PRESETS).toContain(100000);
    });

    it('MULTIPLIER_PRESETS includes 0.5 and 4.0', () => {
      expect(MULTIPLIER_PRESETS).toContain(0.5);
      expect(MULTIPLIER_PRESETS).toContain(4.0);
    });

    it('WALL_TIME_PRESETS includes 15 and 180', () => {
      expect(WALL_TIME_PRESETS).toContain(15);
      expect(WALL_TIME_PRESETS).toContain(180);
    });

    it('MAX_CREDITS_LIMIT has correct min/max', () => {
      expect(MAX_CREDITS_LIMIT.min).toBe(10);
      expect(MAX_CREDITS_LIMIT.max).toBe(100_000);
    });

    it('MULTIPLIER_LIMIT has correct min/max', () => {
      expect(MULTIPLIER_LIMIT.min).toBe(0.3);
      expect(MULTIPLIER_LIMIT.max).toBe(10);
    });

    it('WALL_TIME_LIMIT_MINUTES has correct min/max', () => {
      expect(WALL_TIME_LIMIT_MINUTES.min).toBe(1);
      expect(WALL_TIME_LIMIT_MINUTES.max).toBe(180);
    });
  });
});
