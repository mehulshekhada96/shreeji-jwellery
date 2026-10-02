import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import moment from 'moment-timezone';

// Helper to convert logo to base64 in browser or node
export const loadLogoBase64 = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      try {
        import('fs').then(fs => {
          import('path').then(path => {
            const logoPath = path.join(process.cwd(), 'public', 'images', 'tech-shekhada-logo.jpg');
            if (fs.existsSync(logoPath)) {
              const buffer = fs.readFileSync(logoPath);
              resolve('data:image/jpeg;base64,' + buffer.toString('base64'));
            } else {
              resolve(null);
            }
          }).catch(() => resolve(null));
        }).catch(() => resolve(null));
      } catch (e) {
        resolve(null);
      }
      return;
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = '/images/tech-shekhada-logo.jpg';
  });
};

// Helper to convert QR code to base64 in browser or node
export const loadQrBase64 = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      try {
        import('fs').then(fs => {
          import('path').then(path => {
            const qrPath = path.join(process.cwd(), 'public', 'images', 'tech-shekhada-qr.jpg');
            if (fs.existsSync(qrPath)) {
              const buffer = fs.readFileSync(qrPath);
              resolve('data:image/jpeg;base64,' + buffer.toString('base64'));
            } else {
              resolve(null);
            }
          }).catch(() => resolve(null));
        }).catch(() => resolve(null));
      } catch (e) {
        resolve(null);
      }
      return;
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = '/images/tech-shekhada-qr.jpg';
  });
};

export const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return 'Rs. ' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const generateInvoicePDF = async (invoice, download = true) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // 1. Top Decorative Brand Bar
  doc.setFillColor(30, 58, 138); // Deep Blue #1E3A8A
  doc.rect(0, 0, pageWidth, 5, 'F');

  // 2. Load and draw Logo
  const logoData = await loadLogoBase64();
  let headerStartY = 12;

  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', margin, headerStartY, 22, 22);
    } catch (e) {
      console.warn('Could not add logo image:', e);
    }
  }

  // Tech Shekhada details beside logo
  const companyInfoX = logoData ? margin + 26 : margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text('TECH SHEKHADA', companyInfoX, headerStartY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Name: Mehul Shekhada | Mobile: +91 7874105288', companyInfoX, headerStartY + 10);
  doc.text('Address: 438, Prime Arcade, Lajamni Chowk,', companyInfoX, headerStartY + 14);
  doc.text('Mota Varachha, Surat - 394101', companyInfoX, headerStartY + 18);
  doc.text('UPI ID: 7874105288@ybl', companyInfoX, headerStartY + 22);

  // Right Header: INVOICE title and metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(30, 58, 138);
  doc.text('INVOICE', pageWidth - margin, headerStartY + 6, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);
  doc.text(`Invoice No: ${invoice.invoiceNumber}`, pageWidth - margin, headerStartY + 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  const formattedInvoiceDate = invoice.invoiceDate ? moment(invoice.invoiceDate).format('DD MMM YYYY') : moment().format('DD MMM YYYY');
  doc.text(`Date: ${formattedInvoiceDate}`, pageWidth - margin, headerStartY + 17, { align: 'right' });

  if (invoice.dueDate) {
    doc.text(`Due Date: ${moment(invoice.dueDate).format('DD MMM YYYY')}`, pageWidth - margin, headerStartY + 21, { align: 'right' });
  }

  const cycleText = invoice.billingCycle ? `Billing Cycle: ${invoice.billingCycle}` : '';
  if (cycleText) {
    doc.text(cycleText, pageWidth - margin, headerStartY + 25, { align: 'right' });
  }

  // Divider Line
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, headerStartY + 28, pageWidth - margin, headerStartY + 28);

  // 3. Bill To & Status Section
  const billToY = headerStartY + 34;

  // Bill To Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, billToY - 4, 115, 32, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('BILLED TO:', margin + 4, billToY + 1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(invoice.companyName || 'Valued Customer', margin + 4, billToY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81);
  if (invoice.clientContactPerson) {
    doc.text(`Attn: ${invoice.clientContactPerson}`, margin + 4, billToY + 11);
  }
  doc.text(`Mobile: ${invoice.clientMobile || 'N/A'}`, margin + 4, billToY + 15);
  if (invoice.clientEmail) {
    doc.text(`Email: ${invoice.clientEmail}`, margin + 4, billToY + 19);
  }
  if (invoice.clientAddress) {
    const splitAddr = doc.splitTextToSize(invoice.clientAddress, 105);
    doc.text(splitAddr, margin + 4, billToY + 23);
  }

  // Status Stamp / Badge Box (Right side)
  const statusBoxX = pageWidth - margin - 60;
  const status = (invoice.paymentStatus || 'PENDING').toUpperCase();

  let statusBgColor = [220, 38, 38]; // Red for PENDING
  let statusText = 'PENDING';
  if (status === 'PAID') {
    statusBgColor = [22, 163, 74]; // Green for PAID
    statusText = 'FULL PAID';
  } else if (status === 'PARTIALLY PAID' || status === 'PARTIAL') {
    statusBgColor = [217, 119, 6]; // Amber for PARTIAL
    statusText = 'PARTIALLY PAID';
  }

  doc.setFillColor(...statusBgColor);
  doc.roundedRect(statusBoxX, billToY - 2, 60, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(statusText, statusBoxX + 30, billToY + 4.5, { align: 'center' });

  // Payment Status Summary Box
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(statusBoxX, billToY + 11, 60, 17, 2, 2, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(statusBoxX, billToY + 11, 60, 17, 2, 2, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text('Paid Amount:', statusBoxX + 4, billToY + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text(formatCurrency(invoice.paidAmount), statusBoxX + 56, billToY + 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text('Balance Due:', statusBoxX + 4, billToY + 23);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(invoice.pendingAmount > 0 ? 220 : 75, invoice.pendingAmount > 0 ? 38 : 85, invoice.pendingAmount > 0 ? 38 : 99);
  doc.text(formatCurrency(invoice.pendingAmount), statusBoxX + 56, billToY + 23, { align: 'right' });

  // Service Period text if present
  let tableStartY = billToY + 33;
  if (invoice.servicePeriod?.from || invoice.servicePeriod?.to) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    const fromStr = invoice.servicePeriod?.from ? moment(invoice.servicePeriod.from).format('DD MMM YYYY') : '';
    const toStr = invoice.servicePeriod?.to ? moment(invoice.servicePeriod.to).format('DD MMM YYYY') : '';
    doc.text(`Service Period: ${fromStr} to ${toStr}`, margin, tableStartY);
    tableStartY += 4;
  }

  // 4. Items Table
  const tableData = (invoice.items || []).map((item, index) => [
    index + 1,
    item.featureName + (item.description ? `\n${item.description}` : ''),
    item.billingCycle || 'MONTHLY',
    Number(item.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    Number(item.discount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    Number(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
  ]);

  doc.autoTable({
    startY: tableStartY + 2,
    head: [['#', 'Feature / Module', 'Pricing Cycle', 'Price (Rs.)', 'Discount (Rs.)', 'Total (Rs.)']],
    body: tableData,
    theme: 'grid',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    bodyStyles: {
      textColor: [31, 41, 55],
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const finalY = doc.lastAutoTable.finalY + 6;

  // 5. Bottom Section: Left = Payment info (UPI / QR) | Right = Totals
  const bottomBoxWidth = 85;

  // Left: Payment & UPI Box
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(margin, finalY, bottomBoxWidth, 42, 2, 2, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.roundedRect(margin, finalY, bottomBoxWidth, 42, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 58, 138);
  doc.text('PAYMENT INSTRUCTIONS', margin + 4, finalY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text('Pay directly using any UPI App (GPay, PhonePe, Paytm, BHIM):', margin + 4, finalY + 11);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 24, 39);
  doc.text('UPI ID: 7874105288@ybl', margin + 4, finalY + 17);

  // QR box indicator
  const qrData = await loadQrBase64();
  if (qrData) {
    try {
      doc.addImage(qrData, 'JPEG', margin + 4, finalY + 18, 20, 20);
    } catch (e) {
      console.warn('Could not add QR image:', e);
    }
  } else {
    doc.setFillColor(255, 255, 255);
    doc.rect(margin + 4, finalY + 18, 20, 20, 'F');
    doc.setDrawColor(156, 163, 175);
    doc.rect(margin + 4, finalY + 18, 20, 20, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(75, 85, 99);
    doc.text('UPI QR', margin + 14, finalY + 27, { align: 'center' });
    doc.text('CODE', margin + 14, finalY + 31, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Scan via PhonePe, GPay, Paytm', margin + 28, finalY + 24);
  doc.text('UPI: 7874105288@ybl', margin + 28, finalY + 29);
  doc.text('Account: Mehul Kanjibhai Shekhada', margin + 28, finalY + 34);

  // Right: Totals summary
  const totalsX = pageWidth - margin - 75;
  const totalsValX = pageWidth - margin;
  let summaryY = finalY + 2;

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Subtotal:', totalsX, summaryY + 4);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 41, 55);
  doc.text(formatCurrency(invoice.subtotal), totalsValX, summaryY + 4, { align: 'right' });

  // Discount
  summaryY += 7;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text('Total Discount:', totalsX, summaryY + 4);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(`- ${formatCurrency(invoice.discountTotal || 0)}`, totalsValX, summaryY + 4, { align: 'right' });

  // Grand Total Highlight Bar
  summaryY += 8;
  doc.setFillColor(30, 58, 138);
  doc.roundedRect(totalsX - 3, summaryY, 78, 10, 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL AMOUNT:', totalsX, summaryY + 6.5);
  doc.text(formatCurrency(invoice.totalAmount), totalsValX, summaryY + 6.5, { align: 'right' });

  // Amount Paid
  summaryY += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Amount Paid:', totalsX, summaryY + 3);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text(formatCurrency(invoice.paidAmount), totalsValX, summaryY + 3, { align: 'right' });

  // Balance Due
  summaryY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(invoice.pendingAmount > 0 ? 220 : 75, invoice.pendingAmount > 0 ? 38 : 85, invoice.pendingAmount > 0 ? 38 : 99);
  doc.text('Balance Pending:', totalsX, summaryY + 3);
  doc.text(formatCurrency(invoice.pendingAmount), totalsValX, summaryY + 3, { align: 'right' });

  // 6. Notes & Terms
  const footerStartY = finalY + 48;
  if (invoice.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    doc.text('Notes:', margin, footerStartY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(invoice.notes, margin + 12, footerStartY);
  }

  // Terms & Authorized Signatory
  const termsY = footerStartY + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  const termsText = invoice.terms || 'All software features & services are subject to timely subscription renewal.';
  doc.text(termsText, margin, termsY, { maxWidth: 110 });
  doc.text('Subject to Surat, Gujarat jurisdiction. This is a computer generated invoice.', margin, termsY + 5);

  // Signatory on Right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39);
  doc.text('For TECH SHEKHADA', pageWidth - margin, termsY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text('Mehul Shekhada', pageWidth - margin, termsY + 5, { align: 'right' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Authorized Signatory', pageWidth - margin, termsY + 10, { align: 'right' });

  // Bottom footer accent line
  doc.setFillColor(30, 58, 138);
  doc.rect(0, pageHeight - 3, pageWidth, 3, 'F');

  if (download) {
    const filename = `${invoice.invoiceNumber || 'Invoice'}_${(invoice.companyName || 'client').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(filename);
  }

  return doc;
};
