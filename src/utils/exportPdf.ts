import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const PDF_PADDING = 20; // points
const A4_WIDTH = 595.28; // points
const A4_HEIGHT = 841.89; // points

/**
 * Capture a DOM element and save it as a multi-page PDF.
 * Hides elements with the `no-print` class during capture.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  // Hide interactive / non-printable elements
  const hidden: HTMLElement[] = [];
  element.querySelectorAll<HTMLElement>('.no-print').forEach((el) => {
    hidden.push(el);
    el.dataset.prevDisplay = el.style.display;
    el.style.display = 'none';
  });

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FAFAF9',
      logging: false,
    });

    const imgWidth = A4_WIDTH - PDF_PADDING * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageHeight = A4_HEIGHT - PDF_PADDING * 2;

    const pdf = new jsPDF('p', 'pt', 'a4');
    let yOffset = 0;

    while (yOffset < imgHeight) {
      if (yOffset > 0) pdf.addPage();

      // Slice a page-sized portion of the canvas
      const sliceHeight = Math.min(pageHeight, imgHeight - yOffset);
      const sourceY = (yOffset / imgHeight) * canvas.height;
      const sourceH = (sliceHeight / imgHeight) * canvas.height;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceH;

      const ctx = pageCanvas.getContext('2d')!;
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sourceH,
        0,
        0,
        canvas.width,
        sourceH,
      );

      const pageData = pageCanvas.toDataURL('image/png');
      pdf.addImage(pageData, 'PNG', PDF_PADDING, PDF_PADDING, imgWidth, sliceHeight);

      yOffset += pageHeight;
    }

    pdf.save(`${filename}.pdf`);
  } finally {
    // Restore hidden elements
    hidden.forEach((el) => {
      el.style.display = el.dataset.prevDisplay || '';
      delete el.dataset.prevDisplay;
    });
  }
}
