import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineEditableField from '../components/inline/InlineEditableField';

describe('InlineEditableField', () => {
  const defaultProps = {
    value: 'Alice Smith',
    fieldName: 'name',
    onSave: vi.fn(),
    testIdPrefix: 'test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ---------------------------------------------------------- */
  /*  Display mode                                               */
  /* ---------------------------------------------------------- */

  it('renders the value as static text by default', () => {
    render(<InlineEditableField {...defaultProps} />);
    expect(screen.getByTestId('test-display-name')).toHaveTextContent('Alice Smith');
  });

  it('shows a click-to-edit title', () => {
    render(<InlineEditableField {...defaultProps} />);
    expect(screen.getByTestId('test-display-name')).toHaveAttribute('title', 'Click to edit name');
  });

  /* ---------------------------------------------------------- */
  /*  Click to edit                                              */
  /* ---------------------------------------------------------- */

  it('enters edit mode when clicked', () => {
    render(<InlineEditableField {...defaultProps} />);

    fireEvent.click(screen.getByTestId('test-display-name'));

    const input = screen.getByTestId('test-input-name');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Alice Smith');
  });

  it('focuses and selects input when entering edit mode', () => {
    render(<InlineEditableField {...defaultProps} />);

    fireEvent.click(screen.getByTestId('test-display-name'));

    const input = screen.getByTestId('test-input-name') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });

  /* ---------------------------------------------------------- */
  /*  Save on Enter                                              */
  /* ---------------------------------------------------------- */

  it('saves on Enter key and exits edit mode', () => {
    const onSave = vi.fn();
    render(<InlineEditableField {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.change(input, { target: { value: 'Bob Jones' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledWith('Bob Jones');
    // Should exit edit mode
    expect(screen.queryByTestId('test-input-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('test-display-name')).toBeInTheDocument();
  });

  it('does not save on Enter if value is unchanged', () => {
    const onSave = vi.fn();
    render(<InlineEditableField {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    // Don't change the value, just press Enter
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------- */
  /*  Save on blur                                               */
  /* ---------------------------------------------------------- */

  it('saves on blur (click away)', () => {
    const onSave = vi.fn();
    render(<InlineEditableField {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.change(input, { target: { value: 'Charlie Brown' } });
    fireEvent.blur(input);

    expect(onSave).toHaveBeenCalledWith('Charlie Brown');
  });

  /* ---------------------------------------------------------- */
  /*  Cancel on Escape                                           */
  /* ---------------------------------------------------------- */

  it('cancels edit on Escape without saving', () => {
    const onSave = vi.fn();
    render(<InlineEditableField {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.change(input, { target: { value: 'New Value' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onSave).not.toHaveBeenCalled();
    // Should exit edit mode and show original value
    expect(screen.queryByTestId('test-input-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('test-display-name')).toHaveTextContent('Alice Smith');
  });

  /* ---------------------------------------------------------- */
  /*  Tab behavior                                               */
  /* ---------------------------------------------------------- */

  it('calls onTab when Tab key is pressed', () => {
    const onTab = vi.fn();
    const onSave = vi.fn();
    render(<InlineEditableField {...defaultProps} onSave={onSave} onTab={onTab} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Tab' });

    expect(onSave).toHaveBeenCalledWith('New Name');
    expect(onTab).toHaveBeenCalledWith(false); // shiftKey = false
  });

  it('calls onTab with shiftKey=true for Shift+Tab', () => {
    const onTab = vi.fn();
    const onSave = vi.fn();
    render(<InlineEditableField {...defaultProps} onSave={onSave} onTab={onTab} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });

    expect(onTab).toHaveBeenCalledWith(true);
  });

  /* ---------------------------------------------------------- */
  /*  Validation                                                 */
  /* ---------------------------------------------------------- */

  it('shows validation error for empty required field', () => {
    const onSave = vi.fn();
    const validate = (value: string) => (!value.trim() ? 'Name is required' : null);

    render(
      <InlineEditableField {...defaultProps} onSave={onSave} validate={validate} />,
    );

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Should show error and NOT save
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('test-error-name')).toHaveTextContent('Name is required');
    // Should stay in edit mode
    expect(screen.getByTestId('test-input-name')).toBeInTheDocument();
  });

  it('clears validation error when user types', () => {
    const validate = (value: string) => (!value.trim() ? 'Name is required' : null);
    render(
      <InlineEditableField {...defaultProps} validate={validate} />,
    );

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    // Trigger validation error
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('test-error-name')).toBeInTheDocument();

    // Start typing — error should clear
    fireEvent.change(input, { target: { value: 'A' } });
    expect(screen.queryByTestId('test-error-name')).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------------- */
  /*  Event propagation                                          */
  /* ---------------------------------------------------------- */

  it('stops click propagation when stopPropagation=true', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <InlineEditableField {...defaultProps} stopPropagation />
      </div>,
    );

    fireEvent.click(screen.getByTestId('test-display-name'));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('stops keyDown propagation on input', () => {
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <InlineEditableField {...defaultProps} />
      </div>,
    );

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(parentKeyDown).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------- */
  /*  Callbacks                                                  */
  /* ---------------------------------------------------------- */

  it('calls onEditStart when entering edit mode', () => {
    const onEditStart = vi.fn();
    render(<InlineEditableField {...defaultProps} onEditStart={onEditStart} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    expect(onEditStart).toHaveBeenCalledOnce();
  });

  it('calls onEditEnd when exiting edit mode via Enter', () => {
    const onEditEnd = vi.fn();
    render(<InlineEditableField {...defaultProps} onEditEnd={onEditEnd} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onEditEnd).toHaveBeenCalledOnce();
  });

  it('calls onEditEnd when exiting edit mode via Escape', () => {
    const onEditEnd = vi.fn();
    render(<InlineEditableField {...defaultProps} onEditEnd={onEditEnd} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onEditEnd).toHaveBeenCalledOnce();
  });

  /* ---------------------------------------------------------- */
  /*  Accessibility                                              */
  /* ---------------------------------------------------------- */

  it('has correct aria attributes on the input', () => {
    render(<InlineEditableField {...defaultProps} />);

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    expect(input).toHaveAttribute('aria-label', 'Edit name');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('marks aria-invalid=true when validation error exists', () => {
    const validate = (value: string) => (!value.trim() ? 'Name is required' : null);
    render(
      <InlineEditableField {...defaultProps} validate={validate} />,
    );

    fireEvent.click(screen.getByTestId('test-display-name'));
    const input = screen.getByTestId('test-input-name');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('display element has role="button" and is keyboard accessible', () => {
    render(<InlineEditableField {...defaultProps} />);
    const display = screen.getByTestId('test-display-name');

    expect(display).toHaveAttribute('role', 'button');
    expect(display).toHaveAttribute('tabindex', '0');
  });

  it('enters edit mode via Enter key on display element', () => {
    render(<InlineEditableField {...defaultProps} />);
    const display = screen.getByTestId('test-display-name');

    fireEvent.keyDown(display, { key: 'Enter' });

    expect(screen.getByTestId('test-input-name')).toBeInTheDocument();
  });
});
