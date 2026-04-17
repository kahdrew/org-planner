import { toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';

export interface ExportOptions {
  format: 'png' | 'pdf';
  includeSalary: boolean;
  department: string; // 'all' or specific department name
  orientation?: 'landscape' | 'portrait';
}

/**
 * Generate export filename following the pattern:
 * org-planner-{scenarioName}-{date}.{ext}
 */
export function generateExportFilename(
  scenarioName: string,
  ext: 'png' | 'pdf',
): string {
  const safe = (scenarioName || 'export').replace(/[^a-zA-Z0-9-]/g, '-');
  const date = new Date().toISOString().slice(0, 10);
  return `org-planner-${safe}-${date}.${ext}`;
}

/**
 * Apply salary visibility to the React Flow viewport before capture.
 * Returns a cleanup function that restores the original state.
 */
function applySalaryVisibility(
  container: HTMLElement,
  includeSalary: boolean,
): () => void {
  if (includeSalary) return () => {};

  // Hide salary-related elements during export
  const salaryElements = container.querySelectorAll<HTMLElement>(
    '[data-export-salary]',
  );
  const originalDisplays: string[] = [];
  salaryElements.forEach((el, i) => {
    originalDisplays[i] = el.style.display;
    el.style.display = 'none';
  });

  return () => {
    salaryElements.forEach((el, i) => {
      el.style.display = originalDisplays[i];
    });
  };
}

/**
 * Find the React Flow viewport element from the page.
 */
function getReactFlowViewport(): HTMLElement | null {
  return document.querySelector('.react-flow__viewport');
}

/**
 * Capture the React Flow canvas as a high-resolution PNG blob.
 * Captures the full org chart (not just visible area).
 */
async function captureCanvas(
  includeSalary: boolean,
): Promise<Blob> {
  const viewport = getReactFlowViewport();
  if (!viewport) {
    throw new Error('React Flow viewport not found');
  }

  const restoreSalary = applySalaryVisibility(viewport, includeSalary);

  try {
    const blob = await toBlob(viewport as HTMLElement, {
      backgroundColor: '#f9fafb',
      pixelRatio: 2, // High-resolution capture
      filter: (node: Element) => {
        // Exclude minimap and controls from export
        const classList = (node as HTMLElement).classList;
        if (!classList) return true;
        if (classList.contains('react-flow__minimap')) return false;
        if (classList.contains('react-flow__controls')) return false;
        if (classList.contains('react-flow__attribution')) return false;
        return true;
      },
    });

    if (!blob) {
      throw new Error('Failed to capture canvas — empty blob');
    }

    return blob;
  } finally {
    restoreSalary();
  }
}

/**
 * Trigger a browser download for the given blob.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export the org chart as PNG.
 */
export async function exportAsPng(
  scenarioName: string,
  options: ExportOptions,
): Promise<void> {
  const blob = await captureCanvas(options.includeSalary);
  const filename = generateExportFilename(scenarioName, 'png');
  downloadBlob(blob, filename);
}

/**
 * Export the org chart as PDF with title and date header.
 */
export async function exportAsPdf(
  scenarioName: string,
  options: ExportOptions,
): Promise<void> {
  const blob = await captureCanvas(options.includeSalary);
  const orientation = options.orientation ?? 'landscape';

  // Convert blob to data URL for jsPDF
  const dataUrl = await blobToDataUrl(blob);

  // Create a temporary image to get dimensions
  const img = await loadImage(dataUrl);
  const imgWidth = img.width;
  const imgHeight = img.height;

  // Create PDF
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Add title and date header
  const title = `Org Chart — ${scenarioName || 'Export'}`;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  pdf.setFontSize(16);
  pdf.text(title, 14, 15);
  pdf.setFontSize(10);
  pdf.setTextColor(128);
  pdf.text(dateStr, 14, 22);
  pdf.setTextColor(0);

  // Calculate chart area (below header)
  const headerHeight = 30; // mm
  const margin = 10;
  const chartAreaWidth = pageWidth - margin * 2;
  const chartAreaHeight = pageHeight - headerHeight - margin;

  // Scale image to fit available area while maintaining aspect ratio
  const imgAspect = imgWidth / imgHeight;
  const areaAspect = chartAreaWidth / chartAreaHeight;

  let drawWidth: number;
  let drawHeight: number;

  if (imgAspect > areaAspect) {
    // Image is wider — fit to width
    drawWidth = chartAreaWidth;
    drawHeight = chartAreaWidth / imgAspect;
  } else {
    // Image is taller — fit to height
    drawHeight = chartAreaHeight;
    drawWidth = chartAreaHeight * imgAspect;
  }

  const x = margin + (chartAreaWidth - drawWidth) / 2;
  const y = headerHeight;

  pdf.addImage(dataUrl, 'PNG', x, y, drawWidth, drawHeight);

  // Download PDF
  const filename = generateExportFilename(scenarioName, 'pdf');
  pdf.save(filename);
}

/**
 * Main export function that dispatches to PNG or PDF.
 */
export async function exportOrgChart(
  scenarioName: string,
  options: ExportOptions,
): Promise<void> {
  if (options.format === 'png') {
    await exportAsPng(scenarioName, options);
  } else {
    await exportAsPdf(scenarioName, options);
  }
}

// --- Helpers ---

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
