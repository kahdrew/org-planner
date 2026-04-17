import { useState } from 'react';
import { FileImage, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ExportOptions } from '@/utils/exportOrgChart';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  departments: string[];
  isExporting?: boolean;
}

export default function ExportDialog({
  open,
  onClose,
  onExport,
  departments,
  isExporting = false,
}: ExportDialogProps) {
  const [format, setFormat] = useState<'png' | 'pdf'>('png');
  const [includeSalary, setIncludeSalary] = useState(true);
  const [department, setDepartment] = useState('all');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(
    'landscape',
  );

  if (!open) return null;

  const handleExport = () => {
    onExport({
      format,
      includeSalary,
      department,
      ...(format === 'pdf' ? { orientation } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">
          Export Org Chart
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose format and options for your export.
        </p>

        {/* Format selection */}
        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-gray-700">Format</legend>
          <div className="mt-2 flex gap-3">
            <label
              className={cn(
                'flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-3 transition-colors',
                format === 'png'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300',
              )}
            >
              <input
                type="radio"
                name="format"
                value="png"
                checked={format === 'png'}
                onChange={() => setFormat('png')}
                className="sr-only"
                aria-label="PNG"
              />
              <FileImage
                size={20}
                className={format === 'png' ? 'text-blue-600' : 'text-gray-400'}
              />
              <div>
                <div className="text-sm font-medium text-gray-900">PNG</div>
                <div className="text-xs text-gray-500">High-res image</div>
              </div>
            </label>
            <label
              className={cn(
                'flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-3 transition-colors',
                format === 'pdf'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300',
              )}
            >
              <input
                type="radio"
                name="format"
                value="pdf"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
                className="sr-only"
                aria-label="PDF"
              />
              <FileText
                size={20}
                className={format === 'pdf' ? 'text-blue-600' : 'text-gray-400'}
              />
              <div>
                <div className="text-sm font-medium text-gray-900">PDF</div>
                <div className="text-xs text-gray-500">Document with header</div>
              </div>
            </label>
          </div>
        </fieldset>

        {/* PDF orientation */}
        {format === 'pdf' && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-gray-700">
              Page Orientation
            </legend>
            <div className="mt-2 flex gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orientation"
                  value="landscape"
                  checked={orientation === 'landscape'}
                  onChange={() => setOrientation('landscape')}
                  aria-label="Landscape"
                />
                <span className="text-sm text-gray-700">Landscape</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orientation"
                  value="portrait"
                  checked={orientation === 'portrait'}
                  onChange={() => setOrientation('portrait')}
                  aria-label="Portrait"
                />
                <span className="text-sm text-gray-700">Portrait</span>
              </label>
            </div>
          </fieldset>
        )}

        {/* Salary toggle */}
        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeSalary}
              onChange={(e) => setIncludeSalary(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              aria-label="Include salary data"
            />
            <span className="text-sm text-gray-700">Include salary data</span>
          </label>
        </div>

        {/* Department filter */}
        <div className="mt-4">
          <label
            htmlFor="export-department"
            className="block text-sm font-medium text-gray-700"
          >
            Department
          </label>
          <select
            id="export-department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Department"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors',
              isExporting
                ? 'cursor-not-allowed bg-blue-400'
                : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Exporting…
              </>
            ) : (
              'Export'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
