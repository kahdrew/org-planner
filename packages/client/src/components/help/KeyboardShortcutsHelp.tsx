import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutEntry {
  keys: string;
  description: string;
}

const GENERAL_SHORTCUTS: ShortcutEntry[] = [
  { keys: '⌘ K', description: 'Open search / focus search bar' },
  { keys: '⌘ Z', description: 'Undo last change' },
  { keys: '⌘ ⇧ Z', description: 'Redo last undone change' },
  { keys: '⌫ / Delete', description: 'Delete selected employee(s)' },
  { keys: 'Escape', description: 'Close panels, deselect' },
  { keys: '?', description: 'Toggle this help dialog' },
];

const HIERARCHY_SHORTCUTS: ShortcutEntry[] = [
  { keys: '↑ / ↓', description: 'Navigate between rows' },
  { keys: '← / →', description: 'Collapse / expand subtree' },
];

const SELECTION_SHORTCUTS: ShortcutEntry[] = [
  { keys: '⌘ Click', description: 'Toggle individual selection' },
  { keys: '⇧ Click', description: 'Range select (list views)' },
  { keys: '⌘ A', description: 'Select all employees' },
];

function ShortcutSection({ title, shortcuts }: { title: string; shortcuts: ShortcutEntry[] }) {
  return (
    <div className="mb-5">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h4>
      <div className="space-y-2">
        {shortcuts.map((s) => (
          <div key={s.keys} className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{s.description}</span>
            <kbd className="ml-4 shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-mono font-medium text-gray-600 ring-1 ring-gray-200">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="shortcuts-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard size={20} className="text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close shortcuts dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Shortcut sections */}
        <ShortcutSection title="General" shortcuts={GENERAL_SHORTCUTS} />
        <ShortcutSection title="Hierarchy View" shortcuts={HIERARCHY_SHORTCUTS} />
        <ShortcutSection title="Selection" shortcuts={SELECTION_SHORTCUTS} />

        <div className="mt-4 border-t border-gray-200 pt-3">
          <p className="text-xs text-gray-400">
            Shortcuts are disabled while typing in input fields.
          </p>
        </div>
      </div>
    </div>
  );
}
