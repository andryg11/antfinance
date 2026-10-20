/**
 * Barcode utilities for 1D Linear Barcode (EAN-13, Code 128)
 */

/**
 * Generate a valid 13-digit EAN-13 barcode with accurate checksum digit.
 * Defaults to Indonesian prefix '899' (GS1 Indonesia) widely used in supermarkets & minimarkets.
 */
export function generateEan13(prefix = '899'): string {
  let code = prefix;
  while (code.length < 12) {
    code += Math.floor(Math.random() * 10).toString();
  }

  // Calculate EAN-13 check digit (modulo 10)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    // odd positions weight 1, even positions weight 3 (0-indexed: 0 is 1st digit, 1 is 2nd digit)
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit.toString();
}

/**
 * Generate alphanumeric Code-128 barcode number
 */
export function generateCode128(prefix = 'BRG'): string {
  const randNum = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${randNum}`;
}

/**
 * Validates whether a string is a mathematically valid EAN-13 code
 */
export function isValidEan13(code: string): boolean {
  const clean = code.trim();
  if (!/^\d{13}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(clean[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return parseInt(clean[12], 10) === expectedCheckDigit;
}
