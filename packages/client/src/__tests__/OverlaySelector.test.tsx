import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OverlaySelector from '@/components/panels/OverlaySelector';
import { useOverlayStore } from '@/stores/overlayStore';

function resetOverlay() {
  useOverlayStore.setState({ mode: 'none' });
}

describe('OverlaySelector', () => {
  beforeEach(() => {
    resetOverlay();
  });

  it('renders with an "Overlay" label when off', () => {
    render(<OverlaySelector />);
    expect(screen.getByTestId('overlay-selector-button')).toHaveTextContent('Overlay');
  });

  it('opens the menu with all five overlay modes plus Off', () => {
    render(<OverlaySelector />);
    fireEvent.click(screen.getByTestId('overlay-selector-button'));

    const menu = screen.getByTestId('overlay-selector-menu');
    expect(menu).toBeInTheDocument();

    // All five data modes + "Off"
    expect(screen.getByTestId('overlay-option-none')).toHaveTextContent('Off');
    expect(screen.getByTestId('overlay-option-salary')).toHaveTextContent('Salary Band');
    expect(screen.getByTestId('overlay-option-tenure')).toHaveTextContent('Tenure');
    expect(screen.getByTestId('overlay-option-department')).toHaveTextContent('Department');
    expect(screen.getByTestId('overlay-option-employmentType')).toHaveTextContent('Employment Type');
    expect(screen.getByTestId('overlay-option-status')).toHaveTextContent('Status');
  });

  it('selecting a mode updates the store and reflects on the button', () => {
    render(<OverlaySelector />);
    fireEvent.click(screen.getByTestId('overlay-selector-button'));
    fireEvent.click(screen.getByTestId('overlay-option-salary'));

    expect(useOverlayStore.getState().mode).toBe('salary');
    // Menu should close
    expect(screen.queryByTestId('overlay-selector-menu')).not.toBeInTheDocument();
    // Button label reflects active mode
    expect(screen.getByTestId('overlay-selector-button')).toHaveTextContent(/Salary Band/i);
  });

  it('clicking the dedicated "Off" button below the menu turns overlay off', () => {
    useOverlayStore.setState({ mode: 'department' });
    render(<OverlaySelector />);
    fireEvent.click(screen.getByTestId('overlay-selector-button'));

    const off = screen.getByTestId('overlay-off-button');
    fireEvent.click(off);
    expect(useOverlayStore.getState().mode).toBe('none');
  });

  it('clicking the "Off" option in the list also resets', () => {
    useOverlayStore.setState({ mode: 'status' });
    render(<OverlaySelector />);
    fireEvent.click(screen.getByTestId('overlay-selector-button'));
    fireEvent.click(screen.getByTestId('overlay-option-none'));
    expect(useOverlayStore.getState().mode).toBe('none');
  });
});
