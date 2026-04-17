import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { cn } from '@/utils/cn';

export interface InlineEditableFieldHandle {
  /** Programmatically activate edit mode (used for Tab traversal) */
  startEditing: () => void;
}

export interface InlineEditableFieldProps {
  value: string;
  fieldName: string;
  onSave: (value: string) => void;
  validate?: (value: string) => string | null;
  className?: string;
  inputClassName?: string;
  displayClassName?: string;
  /** Prevent click from propagating (e.g., to parent card click handlers) */
  stopPropagation?: boolean;
  /** data-testid prefix for testing */
  testIdPrefix?: string;
  /** Callback when editing starts */
  onEditStart?: () => void;
  /** Callback when editing ends (save or cancel) */
  onEditEnd?: () => void;
  /** Called when Tab is pressed, return true to handle externally */
  onTab?: (shiftKey: boolean) => void;
  /** When true, the field is read-only and cannot be clicked to edit */
  disabled?: boolean;
}

const InlineEditableField = forwardRef<InlineEditableFieldHandle, InlineEditableFieldProps>(function InlineEditableField({
  value,
  fieldName,
  onSave,
  validate,
  className,
  inputClassName,
  displayClassName,
  stopPropagation = true,
  testIdPrefix = 'inline-edit',
  onEditStart,
  onEditEnd,
  onTab,
  disabled = false,
}, ref) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Sync value prop when not editing
  const [prevValue, setPrevValue] = useState(value);
  if (!isEditing && prevValue !== value) {
    setPrevValue(value);
    setEditValue(value);
  }

  // Expose startEditing for programmatic Tab traversal
  useImperativeHandle(ref, () => ({
    startEditing: () => {
      if (disabled) return;
      setIsEditing(true);
      setEditValue(value);
      setError(null);
      onEditStart?.();
    },
  }), [value, onEditStart, disabled]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      // Don't enter edit mode when modifier keys are held (allows multi-select)
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        return;
      }
      if (disabled) {
        return;
      }
      if (stopPropagation) {
        e.stopPropagation();
      }
      e.preventDefault();
      setIsEditing(true);
      setEditValue(value);
      setError(null);
      onEditStart?.();
    },
    [value, stopPropagation, onEditStart, disabled],
  );

  const save = useCallback(() => {
    const trimmed = editValue.trim();
    if (validate) {
      const validationError = validate(trimmed);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    if (trimmed !== value) {
      onSave(trimmed);
    }
    setIsEditing(false);
    setError(null);
    onEditEnd?.();
  }, [editValue, value, validate, onSave, onEditEnd]);

  const cancel = useCallback(() => {
    setIsEditing(false);
    setEditValue(value);
    setError(null);
    onEditEnd?.();
  }, [value, onEditEnd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        save();
        onTab?.(e.shiftKey);
      }
    },
    [save, cancel, onTab],
  );

  const handleBlur = useCallback(() => {
    save();
  }, [save]);

  const handleInputClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Prevent drag initiation when clicking to edit
    e.stopPropagation();
  }, []);

  if (isEditing) {
    return (
      <div className={cn('relative', className)}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={handleInputClick}
          onMouseDown={handleMouseDown}
          data-testid={`${testIdPrefix}-input-${fieldName}`}
          data-inline-edit="true"
          className={cn(
            'w-full rounded border bg-white px-1 py-0.5 text-sm outline-none transition-colors',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200'
              : 'border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200',
            inputClassName,
          )}
          aria-label={`Edit ${fieldName}`}
          aria-invalid={!!error}
        />
        {error && (
          <div
            className="absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600 shadow-sm"
            data-testid={`${testIdPrefix}-error-${fieldName}`}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      onClick={disabled ? undefined : startEditing}
      onMouseDown={disabled ? undefined : handleMouseDown}
      className={cn(
        disabled
          ? 'rounded px-0.5'
          : 'cursor-pointer rounded px-0.5 transition-colors hover:bg-blue-50',
        displayClassName,
      )}
      data-testid={`${testIdPrefix}-display-${fieldName}`}
      title={disabled ? undefined : `Click to edit ${fieldName}`}
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      onKeyDown={disabled ? undefined : (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsEditing(true);
          setEditValue(value);
          setError(null);
          onEditStart?.();
        }
      }}
    >
      {value}
    </span>
  );
});

export default InlineEditableField;
