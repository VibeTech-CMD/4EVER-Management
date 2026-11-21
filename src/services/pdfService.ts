import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  DEFAULT_PDF_FIELD_MAPPINGS,
  DEFAULT_PDF_TEMPLATE_URL,
} from '../lib/defaults';
import type {
  PdfFieldKey,
  PdfFieldMapping,
  PdfTemplateRecord,
} from '../lib/types';
import { formatBRL, formatDateBR } from './validation';

const MONTHS_PT = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

function sanitizePdfText(text: string): string {
  // Standard PDF Helvetica uses WinAnsi encoding — strip unsupported characters safely
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .trim();
}

export function formatDateLongPT(dateStr?: string): string {
  if (!dateStr) return 'A DEFINIR';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr.toUpperCase();
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  const day = parts[2];
  const monthName = MONTHS_PT[monthIdx] || parts[1];
  return `${day} DE ${monthName} DE ${year}`;
}

function hexToRgb(hex: string) {
  const clean = (hex || '#30483B').replace('#', '');
  if (clean.length !== 6) return rgb(0.188, 0.282, 0.231);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(
    Number.isFinite(r) ? r : 0.188,
    Number.isFinite(g) ? g : 0.282,
    Number.isFinite(b) ? b : 0.231
  );
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo local.'));
    reader.readAsDataURL(file);
  });
}

async function fetchBinaryBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Não foi possível carregar o arquivo de modelo (${res.status}).`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function loadPdfBytesFromTemplate(
  template?: PdfTemplateRecord | null
): Promise<Uint8Array> {
  if (template?.baseDataUrl) {
    return dataUrlToUint8Array(template.baseDataUrl);
  }
  const url = template?.downloadUrl || DEFAULT_PDF_TEMPLATE_URL;
  return fetchBinaryBytes(url);
}

export function safeFileSlug(name: string): string {
  return (name || 'Casal')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export interface ProposalPdfInput {
  template?: PdfTemplateRecord | null;
  coupleName: string;
  eventType?: string;
  venue: string;
  city: string;
  weddingDate?: string;
  estimatedGuests: number;
  loveValue: number;
  foreverValue: number;
}

export async function generateProposalPdfFromTemplate(
  input: ProposalPdfInput
): Promise<{ bytes: Uint8Array; fileName: string; pagesCount: number }> {
  const templateBytes = await loadPdfBytesFromTemplate(input.template);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const venueFormatted = input.venue?.trim()
    ? `${input.venue.trim()}${input.city ? ` - ${input.city}` : ''}`
    : input.city || 'A DEFINIR';

  const fieldValues: Record<PdfFieldKey, string> = {
    coupleName: input.coupleName?.trim() || 'CASAL A CONFIRMAR',
    eventType: input.eventType || 'CASAMENTO',
    venue: venueFormatted,
    eventDate: formatDateLongPT(input.weddingDate),
    guestCount: `${Math.max(1, Math.round(input.estimatedGuests || 0))} PESSOAS`,
    loveValue: formatBRL(input.loveValue),
    foreverValue: formatBRL(input.foreverValue),
  };

  // 1. If the uploaded template includes AcroForm fields, fill them first
  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    if (fields.length > 0) {
      let filledAny = false;
      for (const field of fields) {
        const name = field.getName();
        const key = (Object.keys(fieldValues) as PdfFieldKey[]).find(
          (k) => k.toLowerCase() === name.toLowerCase()
        );
        if (key) {
          try {
            form.getTextField(name).setText(sanitizePdfText(fieldValues[key]));
            filledAny = true;
          } catch {
            // Skip non-text fields
          }
        }
      }
      if (filledAny) {
        form.flatten();
      }
    }
  } catch {
    // Template has no AcroForm — proceed cleanly with calibrated overlay mappings
  }

  // 2. Apply calibrated field mappings preserving all pages, layout, graphics and text
  const mappings: PdfFieldMapping[] =
    input.template?.fieldMappings?.length
      ? input.template.fieldMappings
      : DEFAULT_PDF_FIELD_MAPPINGS;

  for (const mapping of mappings) {
    if (!mapping.enabled) continue;
    const page = pages[mapping.pageIndex];
    if (!page) continue;

    const rawValue = fieldValues[mapping.key] ?? '';
    const composed = `${mapping.prefix || ''}${
      mapping.uppercase ? rawValue.toUpperCase() : rawValue
    }`;
    const text = sanitizePdfText(composed);

    // Mask original placeholder area seamlessly using configured background color
    if (mapping.maskColor) {
      page.drawRectangle({
        x: mapping.x,
        y: mapping.y,
        width: mapping.width,
        height: mapping.height,
        color: hexToRgb(mapping.maskColor),
      });
    }

    const useBold =
      mapping.key === 'coupleName' ||
      mapping.key === 'loveValue' ||
      mapping.key === 'foreverValue';
    const font = useBold ? fontBold : fontRegular;

    // Auto-scale font size slightly if string is wider than bounding box
    let size = mapping.fontSize || 12;
    const maxTextWidth = Math.max(40, mapping.width - 6);
    while (size > 8 && font.widthOfTextAtSize(text, size) > maxTextWidth) {
      size -= 0.5;
    }

    const textY = mapping.y + Math.max(3, (mapping.height - size) / 2);

    page.drawText(text, {
      x: mapping.x + 2,
      y: textY,
      size,
      font,
      color: hexToRgb(mapping.textColor || '#30483B'),
    });
  }

  const bytes = await pdfDoc.save();
  const cleanCouple = safeFileSlug(input.coupleName || 'Casal');
  return {
    bytes,
    fileName: `Proposta - ${cleanCouple} - 4EVER.pdf`,
    pagesCount: pages.length,
  };
}

export interface ReceiptPdfInput {
  receiptNumber: string;
  coupleName: string;
  eventName: string;
  eventDate?: string;
  amount: number;
  receivedAt: string;
  paymentMethod: string;
  installmentLabel: string;
  contractedValue: number;
  totalPaid: number;
  remainingBalance: number;
  paymentId: string;
  notes?: string;
  emittedByName: string;
  emittedAtIso?: string;
}

export async function generatePaymentReceiptPdf(
  input: ReceiptPdfInput
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const green = rgb(0.188, 0.282, 0.231); // #30483B
  const taupe = rgb(0.663, 0.604, 0.514); // #A99A83
  const brown = rgb(0.349, 0.275, 0.204); // #594634
  const offwhite = rgb(0.961, 0.953, 0.933); // #F5F3EE
  const ink = rgb(0.122, 0.165, 0.141); // #1F2A24
  const muted = rgb(0.361, 0.333, 0.298); // #5C554C
  const white = rgb(1, 1, 1);

  // Page clean off-white canvas + inner card border
  page.drawRectangle({ x: 0, y: 0, width, height, color: white });
  page.drawRectangle({ x: 0, y: height - 104, width, height: 104, color: green });
  page.drawRectangle({ x: 0, y: height - 108, width, height: 4, color: taupe });

  // Embed official 4EVER white-on-dark logo & watermark monogram
  try {
    const base = import.meta.env.BASE_URL || './';
    const logoBytes = await fetchBinaryBytes(`${base}assets/aistudio/Code_Generated_Image_bab81833.png`);
    const logoImg = await pdfDoc.embedPng(logoBytes);
    const dims = logoImg.scaleToFit(170, 52);
    page.drawImage(logoImg, {
      x: 44,
      y: height - 76,
      width: dims.width,
      height: dims.height,
    });
  } catch {
    page.drawText('4EVER CERIMONIAL', {
      x: 44,
      y: height - 60,
      size: 18,
      font: fontBold,
      color: white,
    });
  }

  // Right header receipt info
  page.drawText(sanitizePdfText('COMPROVANTE DE PAGAMENTO'), {
    x: width - 260,
    y: height - 46,
    size: 12,
    font: fontBold,
    color: white,
  });
  page.drawText(sanitizePdfText(`N. ${input.receiptNumber}`), {
    x: width - 260,
    y: height - 65,
    size: 11,
    font: fontBold,
    color: taupe,
  });
  page.drawText(sanitizePdfText(`Emissao: ${formatDateBR(input.emittedAtIso || new Date().toISOString())}`), {
    x: width - 260,
    y: height - 82,
    size: 9,
    font: fontRegular,
    color: offwhite,
  });

  // Optional subtle monogram seal
  try {
    const base = import.meta.env.BASE_URL || './';
    const monoBytes = await fetchBinaryBytes(
      `${base}assets/aistudio/Monograma-4Ever-VerdeEscuro-Bege_cda07930.png`
    );
    const monoImg = await pdfDoc.embedPng(monoBytes);
    page.drawImage(monoImg, {
      x: width - 125,
      y: 120,
      width: 78,
      height: 78,
      opacity: 0.22,
    });
  } catch {
    // Non-blocking seal
  }

  let cursorY = height - 148;

  // Company identification line
  page.drawText(sanitizePdfText('4EVER Assessoria e Cerimonial'), {
    x: 44,
    y: cursorY,
    size: 13,
    font: fontBold,
    color: green,
  });
  cursorY -= 16;
  page.drawText(sanitizePdfText('Documento oficial de registro e comprovacao financeira interna'), {
    x: 44,
    y: cursorY,
    size: 9.5,
    font: fontRegular,
    color: muted,
  });

  // Highlighted Value Box
  cursorY -= 68;
  page.drawRectangle({
    x: 44,
    y: cursorY,
    width: width - 88,
    height: 54,
    color: offwhite,
    borderColor: taupe,
    borderWidth: 1,
  });
  page.drawText(sanitizePdfText('VALOR RECEBIDO'), {
    x: 60,
    y: cursorY + 32,
    size: 9,
    font: fontBold,
    color: brown,
  });
  page.drawText(sanitizePdfText(formatBRL(input.amount)), {
    x: 60,
    y: cursorY + 12,
    size: 20,
    font: fontBold,
    color: green,
  });
  page.drawText(sanitizePdfText(`Recebido em ${formatDateBR(input.receivedAt)} via ${input.paymentMethod}`), {
    x: 245,
    y: cursorY + 18,
    size: 10,
    font: fontRegular,
    color: ink,
  });

  const drawSectionTitle = (title: string) => {
    cursorY -= 30;
    page.drawText(sanitizePdfText(title), {
      x: 44,
      y: cursorY,
      size: 10.5,
      font: fontBold,
      color: brown,
    });
    cursorY -= 6;
    page.drawLine({
      start: { x: 44, y: cursorY },
      end: { x: width - 44, y: cursorY },
      thickness: 0.8,
      color: taupe,
    });
    cursorY -= 18;
  };

  const drawRow = (label: string, value: string, boldVal = false) => {
    page.drawText(sanitizePdfText(label), {
      x: 44,
      y: cursorY,
      size: 9.5,
      font: fontRegular,
      color: muted,
    });
    page.drawText(sanitizePdfText(value || '-'), {
      x: 215,
      y: cursorY,
      size: 10,
      font: boldVal ? fontBold : fontRegular,
      color: ink,
    });
    cursorY -= 20;
  };

  drawSectionTitle('DADOS DO EVENTO E CONTRATO');
  drawRow('Casal / Contratante:', input.coupleName, true);
  drawRow('Evento:', input.eventName || input.coupleName);
  drawRow('Data do Evento:', input.eventDate ? formatDateBR(input.eventDate) : 'A definir');
  drawRow('Referencia da Parcela:', input.installmentLabel, true);
  drawRow('ID do Pagamento:', input.paymentId);

  drawSectionTitle('RESUMO FINANCEIRO DO CONTRATO');
  drawRow('Valor Total Contratado:', formatBRL(input.contractedValue), true);
  drawRow('Total Pago Acumulado:', formatBRL(input.totalPaid), true);
  drawRow('Saldo Restante:', formatBRL(Math.max(0, input.remainingBalance)), true);

  if (input.notes?.trim()) {
    drawSectionTitle('OBSERVACOES');
    page.drawText(sanitizePdfText(input.notes.trim().slice(0, 260)), {
      x: 44,
      y: cursorY,
      size: 9.5,
      font: fontRegular,
      color: ink,
      maxWidth: width - 88,
    });
    cursorY -= 32;
  }

  // Emitter signature block
  page.drawLine({
    start: { x: 44, y: 120 },
    end: { x: 290, y: 120 },
    thickness: 0.8,
    color: ink,
  });
  page.drawText(sanitizePdfText(`Emitido por: ${input.emittedByName}`), {
    x: 44,
    y: 105,
    size: 9.5,
    font: fontBold,
    color: ink,
  });
  page.drawText(sanitizePdfText('4EVER Assessoria e Cerimonial · 4EVER Management'), {
    x: 44,
    y: 90,
    size: 8.5,
    font: fontRegular,
    color: muted,
  });

  // Footer strip
  page.drawRectangle({ x: 0, y: 0, width, height: 32, color: offwhite });
  page.drawText(
    sanitizePdfText(`Comprovante ${input.receiptNumber} · Gerado em ${new Date().toLocaleString('pt-BR')}`),
    {
      x: 44,
      y: 12,
      size: 8,
      font: fontRegular,
      color: muted,
    }
  );

  const bytes = await pdfDoc.save();
  const cleanCouple = safeFileSlug(input.coupleName || 'Casal');
  return {
    bytes,
    fileName: `Comprovante - ${cleanCouple} - ${input.receiptNumber}.pdf`,
  };
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function pdfBytesToBlobUrl(bytes: Uint8Array): string {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}
