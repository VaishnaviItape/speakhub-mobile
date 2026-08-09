/**
 * Input validation utilities for speakhub-mobile
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates that a name contains only letters, spaces, dots, and hyphens.
 */
export function validateName(name: string, fieldLabel = 'Name'): ValidationResult {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldLabel} is required.` };
  }

  const nameRegex = /^[a-zA-Z\u00C0-\u024F\s.-]+$/;
  if (!nameRegex.test(trimmed)) {
    return { isValid: false, error: `${fieldLabel} must contain letters only (no numbers or special characters).` };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: `${fieldLabel} must be at least 2 characters long.` };
  }

  return { isValid: true };
}

/**
 * Validates a Batch Name (allows letters, numbers, spaces, colons, hyphens, slashes, and parentheses).
 * e.g. "April 07:00 to 08:00", "SEP-2026 Morning"
 */
export function validateBatchName(batchName: string, fieldLabel = 'Batch Name'): ValidationResult {
  const trimmed = (batchName || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldLabel} is required.` };
  }

  const batchRegex = /^[a-zA-Z0-9\u00C0-\u024F\s.:\-\/()]+$/;
  if (!batchRegex.test(trimmed)) {
    return { isValid: false, error: `${fieldLabel} contains invalid characters.` };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: `${fieldLabel} must be at least 2 characters long.` };
  }

  return { isValid: true };
}

/**
 * Validates that a price, fee, or amount is a positive number strictly greater than 0.
 */
export function validatePositiveNumber(value: number | string, fieldLabel = 'Price'): ValidationResult {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { isValid: false, error: `${fieldLabel} is required.` };
  }

  const num = Number(value);
  if (isNaN(num)) {
    return { isValid: false, error: `${fieldLabel} must be a valid number.` };
  }

  if (num <= 0) {
    return { isValid: false, error: `${fieldLabel} must be a positive number greater than 0.` };
  }

  return { isValid: true };
}

/**
 * Validates that a phone/mobile number contains exactly 10 numeric digits.
 */
export function validatePhoneNumber(phone: string, fieldLabel = 'Mobile Number'): ValidationResult {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    return { isValid: false, error: `${fieldLabel} is required.` };
  }

  const cleanDigits = trimmed.replace(/[^0-9]/g, '');
  if (cleanDigits.length !== 10) {
    return { isValid: false, error: `${fieldLabel} must be a valid 10-digit number.` };
  }

  return { isValid: true };
}
