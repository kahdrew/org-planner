import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KeyboardShortcutsHelp from '@/components/help/KeyboardShortcutsHelp';

describe('KeyboardShortcutsHelp', () => {
  it('renders the dialog with a title', () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
  });

  it('does not render when open is false', () => {
    render(<KeyboardShortcutsHelp open={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Keyboard Shortcuts')).toBeNull();
  });

  it('calls onClose when Escape is pressed inside the dialog', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsHelp open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsHelp open={true} onClose={onClose} />);
    const backdrop = screen.getByTestId('shortcuts-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('lists all expected shortcuts', () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} />);

    // Check that key shortcuts are listed
    expect(screen.getByText('⌘ K')).toBeTruthy();
    expect(screen.getByText('⌘ Z')).toBeTruthy();
    expect(screen.getByText('⌘ ⇧ Z')).toBeTruthy();
    expect(screen.getByText('⌫ / Delete')).toBeTruthy();
    expect(screen.getByText('Escape')).toBeTruthy();
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('shows arrow key navigation shortcuts', () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} />);
    expect(screen.getByText('↑ / ↓')).toBeTruthy();
    expect(screen.getByText('← / →')).toBeTruthy();
  });
});
