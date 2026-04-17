import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import InlineEditableField from '../components/inline/InlineEditableField';
import type { InlineEditableFieldHandle } from '../components/inline/InlineEditableField';

/* ------------------------------------------------------------------ */
/*  InlineEditableField ref-based startEditing                        */
/* ------------------------------------------------------------------ */

describe('InlineEditableField imperative handle', () => {
  const defaultProps = {
    value: 'Test Value',
    fieldName: 'name',
    onSave: vi.fn(),
    testIdPrefix: 'test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes startEditing via ref', () => {
    let handle: InlineEditableFieldHandle | null = null;
    render(
      <InlineEditableField
        ref={(el) => { handle = el; }}
        {...defaultProps}
      />,
    );

    expect(handle).toBeTruthy();
    expect(handle!.startEditing).toBeInstanceOf(Function);
  });

  it('enters edit mode when startEditing is called via ref', () => {
    let handle: InlineEditableFieldHandle | null = null;
    render(
      <InlineEditableField
        ref={(el) => { handle = el; }}
        {...defaultProps}
      />,
    );

    // Initially in display mode
    expect(screen.getByTestId('test-display-name')).toBeInTheDocument();
    expect(screen.queryByTestId('test-input-name')).not.toBeInTheDocument();

    // Trigger edit via ref
    act(() => {
      handle!.startEditing();
    });

    // Now in edit mode
    expect(screen.getByTestId('test-input-name')).toBeInTheDocument();
    expect(screen.queryByTestId('test-display-name')).not.toBeInTheDocument();
  });

  it('calls onEditStart when startEditing is called via ref', () => {
    let handle: InlineEditableFieldHandle | null = null;
    const onEditStart = vi.fn();
    render(
      <InlineEditableField
        ref={(el) => { handle = el; }}
        {...defaultProps}
        onEditStart={onEditStart}
      />,
    );

    act(() => {
      handle!.startEditing();
    });

    expect(onEditStart).toHaveBeenCalledOnce();
  });

  it('pre-fills input with current value when startEditing called via ref', () => {
    let handle: InlineEditableFieldHandle | null = null;
    render(
      <InlineEditableField
        ref={(el) => { handle = el; }}
        {...defaultProps}
        value="Alice Smith"
      />,
    );

    act(() => {
      handle!.startEditing();
    });

    const input = screen.getByTestId('test-input-name');
    expect(input).toHaveValue('Alice Smith');
  });
});

/* ------------------------------------------------------------------ */
/*  Tab traversal between multiple InlineEditableField instances      */
/* ------------------------------------------------------------------ */

describe('Tab traversal between fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Simulates the pattern used by EmployeeCard and TreeRow:
   * Multiple InlineEditableField instances with refs and a handleTab
   * that activates the next field.
   */
  function TabTraversalFixture() {
    const fieldOrder = ['name', 'title', 'department', 'level'] as const;
    type Field = (typeof fieldOrder)[number];

    const refs = useRef<Record<Field, InlineEditableFieldHandle | null>>({
      name: null,
      title: null,
      department: null,
      level: null,
    });

    const handleTab = (field: Field, shiftKey: boolean) => {
      const currentIndex = fieldOrder.indexOf(field);
      if (currentIndex === -1) return;
      const nextIndex = shiftKey ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex >= 0 && nextIndex < fieldOrder.length) {
        const nextField = fieldOrder[nextIndex];
        setTimeout(() => {
          refs.current[nextField]?.startEditing();
        }, 0);
      }
    };

    return (
      <div>
        {fieldOrder.map((field) => (
          <InlineEditableField
            key={field}
            ref={(el) => { refs.current[field] = el; }}
            value={`${field}-value`}
            fieldName={field}
            onSave={vi.fn()}
            testIdPrefix="traverse"
            onTab={(shiftKey) => handleTab(field, shiftKey)}
          />
        ))}
      </div>
    );
  }

  it('Tab from name activates title field', () => {
    render(<TabTraversalFixture />);

    // Click name to enter edit mode
    fireEvent.click(screen.getByTestId('traverse-display-name'));
    expect(screen.getByTestId('traverse-input-name')).toBeInTheDocument();

    // Press Tab
    fireEvent.keyDown(screen.getByTestId('traverse-input-name'), { key: 'Tab' });

    // Advance timers to trigger setTimeout
    act(() => {
      vi.runAllTimers();
    });

    // Title should now be in edit mode
    expect(screen.getByTestId('traverse-input-title')).toBeInTheDocument();
  });

  it('Tab from title activates department field', () => {
    render(<TabTraversalFixture />);

    // Click title to enter edit mode
    fireEvent.click(screen.getByTestId('traverse-display-title'));
    expect(screen.getByTestId('traverse-input-title')).toBeInTheDocument();

    // Press Tab
    fireEvent.keyDown(screen.getByTestId('traverse-input-title'), { key: 'Tab' });

    act(() => {
      vi.runAllTimers();
    });

    // Department should now be in edit mode
    expect(screen.getByTestId('traverse-input-department')).toBeInTheDocument();
  });

  it('Tab from department activates level field', () => {
    render(<TabTraversalFixture />);

    // Click department to enter edit mode
    fireEvent.click(screen.getByTestId('traverse-display-department'));
    expect(screen.getByTestId('traverse-input-department')).toBeInTheDocument();

    // Press Tab
    fireEvent.keyDown(screen.getByTestId('traverse-input-department'), { key: 'Tab' });

    act(() => {
      vi.runAllTimers();
    });

    // Level should now be in edit mode
    expect(screen.getByTestId('traverse-input-level')).toBeInTheDocument();
  });

  it('Tab from level (last field) does not activate any field', () => {
    render(<TabTraversalFixture />);

    // Click level to enter edit mode
    fireEvent.click(screen.getByTestId('traverse-display-level'));
    expect(screen.getByTestId('traverse-input-level')).toBeInTheDocument();

    // Press Tab — no next field
    fireEvent.keyDown(screen.getByTestId('traverse-input-level'), { key: 'Tab' });

    act(() => {
      vi.runAllTimers();
    });

    // No other fields should be in edit mode
    expect(screen.queryByTestId('traverse-input-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('traverse-input-title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('traverse-input-department')).not.toBeInTheDocument();
  });

  it('Shift+Tab from title activates name field (reverse traversal)', () => {
    render(<TabTraversalFixture />);

    // Click title to enter edit mode
    fireEvent.click(screen.getByTestId('traverse-display-title'));
    expect(screen.getByTestId('traverse-input-title')).toBeInTheDocument();

    // Press Shift+Tab
    fireEvent.keyDown(screen.getByTestId('traverse-input-title'), {
      key: 'Tab',
      shiftKey: true,
    });

    act(() => {
      vi.runAllTimers();
    });

    // Name should now be in edit mode
    expect(screen.getByTestId('traverse-input-name')).toBeInTheDocument();
  });

  it('Shift+Tab from name (first field) does not activate any field', () => {
    render(<TabTraversalFixture />);

    // Click name to enter edit mode
    fireEvent.click(screen.getByTestId('traverse-display-name'));
    expect(screen.getByTestId('traverse-input-name')).toBeInTheDocument();

    // Press Shift+Tab — no previous field
    fireEvent.keyDown(screen.getByTestId('traverse-input-name'), {
      key: 'Tab',
      shiftKey: true,
    });

    act(() => {
      vi.runAllTimers();
    });

    // No other fields should be in edit mode
    expect(screen.queryByTestId('traverse-input-title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('traverse-input-department')).not.toBeInTheDocument();
    expect(screen.queryByTestId('traverse-input-level')).not.toBeInTheDocument();
  });

  it('full forward traversal: name → title → department → level', () => {
    render(<TabTraversalFixture />);

    // Start with name
    fireEvent.click(screen.getByTestId('traverse-display-name'));
    expect(screen.getByTestId('traverse-input-name')).toBeInTheDocument();

    // Tab to title
    fireEvent.keyDown(screen.getByTestId('traverse-input-name'), { key: 'Tab' });
    act(() => { vi.runAllTimers(); });
    expect(screen.getByTestId('traverse-input-title')).toBeInTheDocument();

    // Tab to department
    fireEvent.keyDown(screen.getByTestId('traverse-input-title'), { key: 'Tab' });
    act(() => { vi.runAllTimers(); });
    expect(screen.getByTestId('traverse-input-department')).toBeInTheDocument();

    // Tab to level
    fireEvent.keyDown(screen.getByTestId('traverse-input-department'), { key: 'Tab' });
    act(() => { vi.runAllTimers(); });
    expect(screen.getByTestId('traverse-input-level')).toBeInTheDocument();
  });

  it('Tab saves current field value before advancing', () => {
    const saves: Array<{ field: string; value: string }> = [];

    function SaveTrackingFixture() {
      const fieldOrder = ['name', 'title'] as const;
      type Field = (typeof fieldOrder)[number];

      const refs = useRef<Record<Field, InlineEditableFieldHandle | null>>({
        name: null,
        title: null,
      });

      const handleTab = (field: Field, shiftKey: boolean) => {
        const currentIndex = fieldOrder.indexOf(field);
        const nextIndex = shiftKey ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex >= 0 && nextIndex < fieldOrder.length) {
          const nextField = fieldOrder[nextIndex];
          setTimeout(() => {
            refs.current[nextField]?.startEditing();
          }, 0);
        }
      };

      return (
        <div>
          {fieldOrder.map((field) => (
            <InlineEditableField
              key={field}
              ref={(el) => { refs.current[field] = el; }}
              value={`${field}-original`}
              fieldName={field}
              onSave={(v) => saves.push({ field, value: v })}
              testIdPrefix="save-track"
              onTab={(shiftKey) => handleTab(field, shiftKey)}
            />
          ))}
        </div>
      );
    }

    render(<SaveTrackingFixture />);

    // Click name, change value, then Tab
    fireEvent.click(screen.getByTestId('save-track-display-name'));
    const input = screen.getByTestId('save-track-input-name');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Tab' });

    // Verify save was called before moving to next
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual({ field: 'name', value: 'New Name' });

    act(() => { vi.runAllTimers(); });

    // Next field should now be active
    expect(screen.getByTestId('save-track-input-title')).toBeInTheDocument();
  });
});
