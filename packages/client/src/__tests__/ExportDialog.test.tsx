import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportDialog from '@/components/panels/ExportDialog';

describe('ExportDialog', () => {
  const mockOnExport = vi.fn();
  const mockOnClose = vi.fn();
  const departments = ['Engineering', 'Sales', 'Marketing'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open is true', () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );
    expect(screen.getByText('Export Org Chart')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(
      <ExportDialog
        open={false}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );
    expect(screen.queryByText('Export Org Chart')).not.toBeInTheDocument();
  });

  it('has PNG and PDF format options', () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );
    expect(screen.getByLabelText(/PNG/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/PDF/i)).toBeInTheDocument();
  });

  it('shows orientation option only for PDF format', async () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );

    // Select PDF format
    const pdfRadio = screen.getByLabelText(/PDF/i);
    await userEvent.click(pdfRadio);

    // Orientation options should be visible
    expect(screen.getByLabelText(/Landscape/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Portrait/i)).toBeInTheDocument();
  });

  it('has salary include/exclude toggle', () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );
    expect(screen.getByLabelText(/salary/i)).toBeInTheDocument();
  });

  it('has department filter dropdown', () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );
    const select = screen.getByLabelText(/department/i);
    expect(select).toBeInTheDocument();
  });

  it('calls onExport with selected options when Export button clicked', async () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );

    const exportBtn = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportBtn);

    expect(mockOnExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: expect.stringMatching(/^(png|pdf)$/),
        includeSalary: expect.any(Boolean),
        department: expect.any(String),
      }),
    );
  });

  it('calls onClose when Cancel button is clicked', async () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelBtn);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows loading state when isExporting is true', () => {
    render(
      <ExportDialog
        open={true}
        onClose={mockOnClose}
        onExport={mockOnExport}
        departments={departments}
        isExporting={true}
      />,
    );

    expect(screen.getByText(/exporting/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporting/i })).toBeDisabled();
  });
});
