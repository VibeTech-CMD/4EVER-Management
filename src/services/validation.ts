export function clampString(value: string | undefined | null, maxLength: number): string {
  if (!value) return '';
  return value.trim().slice(0, maxLength);
}

export function clampNumber(value: number | string | undefined | null, min = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return min;
  return Math.max(min, parsed);
}

export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 160);
}

export function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

export function formatBRL(value: number | undefined | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

export function formatDateBR(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function generateCode(prefix: string): string {
  const now = new Date();
  const yr = now.getFullYear();
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${yr}-${rnd}`;
}
