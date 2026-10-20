import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, Expense, BusinessSettings } from '../types';
import { formatRupiah, formatDateTime, formatDate } from './formatters';

interface DailyReportData {
  dateLabel: string;
  transactions: Transaction[];
  expenses: Expense[];
  settings: BusinessSettings;
  summary: {
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    transactionCount: number;
    itemsSold: number;
  };
}

function formatShortRupiah(amount: number): string {
  if (amount >= 1000000000) {
    const val = (amount / 1000000000).toFixed(1).replace('.0', '');
    return `Rp ${val}M`;
  }
  if (amount >= 1000000) {
    const val = (amount / 1000000).toFixed(1).replace('.0', '');
    return `Rp ${val}jt`;
  }
  if (amount >= 1000) {
    const val = (amount / 1000).toFixed(0);
    return `Rp ${val}rb`;
  }
  return `Rp ${amount}`;
}

/**
 * Generates an executive visual analytics chart on an HTML5 canvas and converts to PNG DataURL
 * Contains 2 panels:
 * Panel 1: Sales Trend (Hourly for single date, or Daily for date range)
 * Panel 2: Payment Method Breakdown with color-coded distribution bars
 */
export function generateReportChartImage(data: DailyReportData): string | null {
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Crisp White Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle Card Outline
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    const completedTx = data.transactions.filter((t) => t.status === 'completed');

    // =========================================================================
    // PANEL 1: TREND PENJUALAN (X: 20 to 880, Y: 20 to 460)
    // =========================================================================
    
    // Header for Panel 1
    ctx.fillStyle = '#0F172A'; // slate-900
    ctx.font = 'bold 26px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('Grafik Tren Penjualan', 36, 52);

    ctx.fillStyle = '#0D9488'; // teal-600
    ctx.font = 'bold 16px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText(data.dateLabel, 36, 78);

    ctx.fillStyle = '#64748B'; // slate-500
    ctx.font = 'normal 15px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText(`Total Omzet: ${formatRupiah(data.summary.totalRevenue)} (${data.summary.transactionCount} Transaksi)`, 36, 102);

    // Determine whether to group by Date or by Hour
    const uniqueDates = Array.from(new Set(completedTx.map((t) => t.dateString).filter(Boolean))).sort();
    const isMultiDay = uniqueDates.length > 1;

    interface ChartPoint {
      label: string;
      value: number;
    }

    let chartPoints: ChartPoint[] = [];

    if (isMultiDay) {
      // Group by Date across the range
      const dateMap = new Map<string, number>();
      uniqueDates.forEach((d) => dateMap.set(d, 0));
      completedTx.forEach((tx) => {
        if (tx.dateString && dateMap.has(tx.dateString)) {
          dateMap.set(tx.dateString, (dateMap.get(tx.dateString) || 0) + tx.finalAmount);
        }
      });

      // Format short labels: e.g. "15 Okt"
      chartPoints = uniqueDates.map((d) => {
        const parts = d.split('-');
        const day = parts[2];
        const monthNum = parseInt(parts[1], 10) - 1;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return {
          label: `${day} ${monthNames[monthNum] || ''}`,
          value: dateMap.get(d) || 0,
        };
      });
    } else {
      // Group by Hour (08:00 to 22:00) for single day
      const hours = Array.from({ length: 15 }, (_, i) => i + 8);
      const hourMap = new Map<number, number>();
      hours.forEach((h) => hourMap.set(h, 0));

      completedTx.forEach((tx) => {
        const d = new Date(tx.createdAt);
        const h = d.getHours();
        if (hourMap.has(h)) {
          hourMap.set(h, (hourMap.get(h) || 0) + tx.finalAmount);
        }
      });

      chartPoints = hours.map((h) => ({
        label: `${h.toString().padStart(2, '0')}:00`,
        value: hourMap.get(h) || 0,
      }));
    }

    // Chart Dimensions
    const plotLeft = 110;
    const plotTop = 130;
    const plotWidth = 750;
    const plotHeight = 270;
    const plotBottom = plotTop + plotHeight;

    const maxVal = Math.max(...chartPoints.map((p) => p.value), 100000);

    // Draw horizontal grid lines & Y-axis labels
    const gridSteps = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#F1F5F9';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridSteps; i++) {
      const y = plotBottom - (i / gridSteps) * plotHeight;
      const val = (i / gridSteps) * maxVal;

      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotLeft + plotWidth, y);
      ctx.stroke();

      ctx.fillText(formatShortRupiah(val), plotLeft - 12, y + 5);
    }

    // Draw Bars & Line Overlay
    if (chartPoints.length > 0) {
      const barSpacing = plotWidth / chartPoints.length;
      const barWidth = Math.max(8, Math.min(36, barSpacing * 0.65));
      const lineCoords: { x: number; y: number }[] = [];

      chartPoints.forEach((point, idx) => {
        const centerX = plotLeft + idx * barSpacing + barSpacing / 2;
        const barHeight = (point.value / maxVal) * plotHeight;
        const barTop = plotBottom - barHeight;

        lineCoords.push({ x: centerX, y: barTop });

        // Bar Fill: Teal Gradient
        if (point.value > 0) {
          const grad = ctx.createLinearGradient(0, barTop, 0, plotBottom);
          grad.addColorStop(0, '#0D9488'); // teal-600
          grad.addColorStop(1, '#115E59'); // teal-800

          ctx.fillStyle = grad;
          // Rounded top bar
          const radius = Math.min(6, barWidth / 2);
          ctx.beginPath();
          ctx.moveTo(centerX - barWidth / 2, plotBottom);
          ctx.lineTo(centerX - barWidth / 2, barTop + radius);
          ctx.quadraticCurveTo(centerX - barWidth / 2, barTop, centerX - barWidth / 2 + radius, barTop);
          ctx.lineTo(centerX + barWidth / 2 - radius, barTop);
          ctx.quadraticCurveTo(centerX + barWidth / 2, barTop, centerX + barWidth / 2, barTop + radius);
          ctx.lineTo(centerX + barWidth / 2, plotBottom);
          ctx.closePath();
          ctx.fill();

          // Value above bar if space permits
          if (chartPoints.length <= 15) {
            ctx.fillStyle = '#0F766E';
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(formatShortRupiah(point.value), centerX, barTop - 8);
          }
        } else {
          // Zero bar baseline dot
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(centerX - barWidth / 4, plotBottom - 2, barWidth / 2, 2);
        }

        // X-axis label
        ctx.fillStyle = '#64748B';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';

        // Skip some labels if too many points
        const skipInterval = chartPoints.length > 18 ? 2 : 1;
        if (idx % skipInterval === 0 || idx === chartPoints.length - 1) {
          ctx.fillText(point.label, centerX, plotBottom + 22);
        }
      });

      // Smooth Curve Connecting Peaks
      if (lineCoords.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#059669'; // emerald-600
        ctx.lineWidth = 3;
        for (let i = 0; i < lineCoords.length; i++) {
          if (i === 0) {
            ctx.moveTo(lineCoords[i].x, lineCoords[i].y);
          } else {
            const prev = lineCoords[i - 1];
            const curr = lineCoords[i];
            const cpX = (prev.x + curr.x) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, cpX, (prev.y + curr.y) / 2);
          }
        }
        ctx.stroke();

        // Draw dots on data points
        lineCoords.forEach((p, idx) => {
          if (chartPoints[idx].value > 0) {
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
        });
      }
    }

    // =========================================================================
    // VERTICAL DIVIDER BETWEEN PANELS
    // =========================================================================
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(900, 30);
    ctx.lineTo(900, 450);
    ctx.stroke();

    // =========================================================================
    // PANEL 2: METODE PEMBAYARAN & KOMPOSISI TRANSAKSI (X: 930 to 1370)
    // =========================================================================
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px Inter, system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Metode Pembayaran', 930, 52);

    ctx.fillStyle = '#64748B';
    ctx.font = 'normal 14px Inter, system-ui, sans-serif';
    ctx.fillText('Komposisi penerimaan penjualan', 930, 78);

    // Payment method distribution aggregation
    const paymentMethodsConfig: { name: string; color: string; bg: string }[] = [
      { name: 'Tunai', color: '#10B981', bg: '#D1FAE5' },
      { name: 'QRIS', color: '#0284C7', bg: '#E0F2FE' },
      { name: 'Transfer Bank', color: '#6366F1', bg: '#EEF2FF' },
      { name: 'Debit', color: '#8B5CF6', bg: '#F5F3FF' },
      { name: 'Hutang / Kas Bon', color: '#F59E0B', bg: '#FEF3C7' },
    ];

    const paymentMap = new Map<string, { count: number; amount: number }>();
    paymentMethodsConfig.forEach((pm) => paymentMap.set(pm.name, { count: 0, amount: 0 }));

    completedTx.forEach((tx) => {
      const pm = tx.paymentMethod || 'Tunai';
      const existing = paymentMap.get(pm) || { count: 0, amount: 0 };
      existing.count += 1;
      existing.amount += tx.finalAmount;
      paymentMap.set(pm, existing);
    });

    const totalRev = data.summary.totalRevenue || 1;
    let startPayY = 125;
    const itemGap = 65;

    paymentMethodsConfig.forEach((pm) => {
      const stat = paymentMap.get(pm.name) || { count: 0, amount: 0 };
      const percent = Math.round((stat.amount / totalRev) * 100);

      // Color Badge Circle
      ctx.fillStyle = pm.color;
      ctx.beginPath();
      ctx.arc(942, startPayY + 6, 7, 0, Math.PI * 2);
      ctx.fill();

      // Method Name & Count
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(pm.name, 958, startPayY + 11);

      // Amount & Percentage Label
      ctx.textAlign = 'right';
      ctx.font = 'bold 15px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText(formatRupiah(stat.amount), 1360, startPayY + 11);

      ctx.fillStyle = '#64748B';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText(`${percent}% (${stat.count}x)`, 1360, startPayY + 28);

      // Progress Bar Track
      const trackX = 940;
      const trackY = startPayY + 34;
      const trackWidth = 420;
      const trackHeight = 10;
      const barFillWidth = Math.max(0, Math.min(trackWidth, (stat.amount / totalRev) * trackWidth));

      ctx.fillStyle = '#F1F5F9';
      ctx.beginPath();
      ctx.roundRect(trackX, trackY, trackWidth, trackHeight, 5);
      ctx.fill();

      // Progress Bar Fill
      if (barFillWidth > 0) {
        ctx.fillStyle = pm.color;
        ctx.beginPath();
        ctx.roundRect(trackX, trackY, barFillWidth, trackHeight, 5);
        ctx.fill();
      }

      startPayY += itemGap;
    });

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Error generating PDF chart image:', err);
    return null;
  }
}

async function getLogoDataUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/jpeg'));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = '/logo.jpg';
  });
}

export async function generateDailySalesReportPDF(data: DailyReportData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 26, 'F');

  // Embed Logo in PDF Header Banner (Top Right)
  try {
    const logoData = await getLogoDataUrl();
    if (logoData) {
      doc.addImage(logoData, 'JPEG', pageWidth - 32, 3, 20, 20);
    }
  } catch (e) {
    // ignore
  }

  // Business Name & Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.settings.businessName || 'CATAT USAHA', 14, 12);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`${data.settings.address || 'Alamat Toko'} | Telp/WA: ${data.settings.phone || '-'}`, 14, 19);

  // Document Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('LAPORAN PENJUALAN & ANALISIS KEUANGAN', 14, 35);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Periode: ${data.dateLabel} | Dicetak: ${formatDateTime(new Date().toISOString())}`, 14, 41);

  // Financial Summary Cards / Table
  const summaryBody = [
    [
      'Total Omzet (Penjualan)',
      formatRupiah(data.summary.totalRevenue),
      'Total Transaksi Selesai',
      `${data.summary.transactionCount} Transaksi`,
    ],
    [
      'Total Modal (HPP)',
      formatRupiah(data.summary.totalCost),
      'Total Produk Terjual',
      `${data.summary.itemsSold} Item`,
    ],
    [
      'Laba Kotor Penjualan',
      formatRupiah(data.summary.grossProfit),
      'Beban Pengeluaran',
      formatRupiah(data.summary.totalExpenses),
    ],
    [
      'ESTIMASI LABA BERSIH',
      formatRupiah(data.summary.netProfit),
      'Rata-rata Belanja / Transaksi',
      formatRupiah(data.summary.transactionCount > 0 ? data.summary.totalRevenue / data.summary.transactionCount : 0),
    ],
  ];

  autoTable(doc, {
    startY: 46,
    head: [['Indikator Finansial', 'Nilai', 'Indikator Operasional', 'Nilai']],
    body: summaryBody,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 118, 110], // teal-700
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.8,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 46 },
      1: { halign: 'right', cellWidth: 45, fontStyle: 'bold' },
      2: { fontStyle: 'bold', cellWidth: 48 },
      3: { halign: 'right', cellWidth: 43 },
    },
  });

  let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 7 : 78;

  // =========================================================================
  // EMBED EXECUTIVE VISUAL CHART (GRAFIK TREN & METODE PEMBAYARAN)
  // =========================================================================
  const chartImage = generateReportChartImage(data);
  if (chartImage) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Visualisasi Grafik Analisis Penjualan & Pembayaran', 14, currentY);

    const chartWidth = pageWidth - 28; // 182mm
    const chartHeight = 62; // 62mm height (approx 3:1 ratio)
    doc.addImage(chartImage, 'PNG', 14, currentY + 3, chartWidth, chartHeight);

    currentY += chartHeight + 11;
  }

  // =========================================================================
  // TOP PRODUCTS BREAKDOWN TABLE
  // =========================================================================
  if (currentY > 215) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('10 Produk Terlaris (Kontribusi Omzet)', 14, currentY);

  const productSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
  data.transactions
    .filter((t) => t.status === 'completed')
    .forEach((tx) => {
      tx.items.forEach((item) => {
        const existing = productSalesMap.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
        existing.qty += item.quantity;
        existing.revenue += item.subtotal;
        productSalesMap.set(item.productId, existing);
      });
    });

  const topProducts = Array.from(productSalesMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  const topProductsBody = topProducts.length > 0
    ? topProducts.map((p, idx) => [
        String(idx + 1),
        p.name,
        `${p.qty} item`,
        formatRupiah(p.revenue),
      ])
    : [['-', 'Belum ada transaksi produk pada periode ini', '-', '-']];

  autoTable(doc, {
    startY: currentY + 3,
    head: [['No', 'Nama Produk / Layanan', 'Jumlah Terjual', 'Total Omzet']],
    body: topProductsBody,
    theme: 'striped',
    headStyles: {
      fillColor: [51, 65, 85], // slate-700
      textColor: 255,
      fontSize: 8.5,
    },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 90 },
      2: { cellWidth: 35, halign: 'center' },
      3: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 150;

  // =========================================================================
  // EXPENSES SUMMARY TABLE (IF ANY)
  // =========================================================================
  if (data.expenses.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Rincian Pengeluaran Operasional (${formatRupiah(data.summary.totalExpenses)})`, 14, currentY);

    const expenseBody = data.expenses.map((e, idx) => [
      String(idx + 1),
      e.title,
      e.category,
      formatDate(e.createdAt),
      e.createdBy || '-',
      formatRupiah(e.amount),
    ]);

    autoTable(doc, {
      startY: currentY + 3,
      head: [['No', 'Keterangan Pengeluaran', 'Kategori', 'Tanggal', 'Pencatat', 'Jumlah']],
      body: expenseBody,
      theme: 'striped',
      headStyles: {
        fillColor: [190, 18, 60], // rose-700
        textColor: 255,
        fontSize: 8.5,
      },
      styles: { fontSize: 8, cellPadding: 2.2 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 35 },
        3: { cellWidth: 28 },
        4: { cellWidth: 24 },
        5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      },
    });

    currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 200;
  }

  // =========================================================================
  // DETAILED TRANSACTIONS TABLE
  // =========================================================================
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Daftar Transaksi Penjualan', 14, currentY);

  const completedTx = data.transactions.filter((t) => t.status === 'completed');
  const txBody = completedTx.length > 0
    ? completedTx.map((tx, idx) => [
        String(idx + 1),
        tx.invoiceNumber,
        formatDateTime(tx.createdAt),
        tx.customerName || 'Pelanggan Umum',
        tx.paymentMethod,
        tx.cashierName || 'Kasir',
        formatRupiah(tx.finalAmount),
      ])
    : [['-', 'Tidak ada transaksi', '-', '-', '-', '-', '-']];

  autoTable(doc, {
    startY: currentY + 3,
    head: [['No', 'No. Invoice', 'Waktu', 'Pelanggan', 'Metode', 'Kasir', 'Total']],
    body: txBody,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 118, 110], // teal-700
      textColor: 255,
      fontSize: 8.5,
    },
    styles: { fontSize: 7.5, cellPadding: 2.2 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 38 },
      2: { cellWidth: 30 },
      3: { cellWidth: 32 },
      4: { cellWidth: 25 },
      5: { cellWidth: 22 },
      6: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
    },
  });

  // Footer page numbering across all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Halaman ${i} dari ${pageCount} • Dilengkapi Visualisasi Grafik Otomatis • CatatUsaha POS Realtime`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  // Save the PDF
  const safeDate = data.dateLabel.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Laporan_Penjualan_${safeDate}.pdf`);
}
