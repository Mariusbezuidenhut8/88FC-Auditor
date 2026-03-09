/**
 * Azure Data Adapter
 * Handles different response formats from Azure backend
 */

import { AccessCode } from '../types';

interface AzureResponse {
  [key: string]: any;
}

/**
 * Normalizes Azure response to AccessCode array
 * Handles various response structures from Azure
 */
export const normalizeAzureResponse = (response: AzureResponse): AccessCode[] => {
  try {
    let accessCodes: any[] = [];

    // Strategy 1: Direct array
    if (Array.isArray(response)) {
      accessCodes = response;
      console.log('✅ Found direct array format');
    }
    // Strategy 2: Nested in 'accessCodes' property
    else if (response.accessCodes && Array.isArray(response.accessCodes)) {
      accessCodes = response.accessCodes;
      console.log('✅ Found nested accessCodes property');
    }
    // Strategy 3: Nested in 'data' property
    else if (response.data && Array.isArray(response.data)) {
      accessCodes = response.data;
      console.log('✅ Found nested data property');
    }
    // Strategy 4: Nested in 'data.accessCodes'
    else if (response.data?.accessCodes && Array.isArray(response.data.accessCodes)) {
      accessCodes = response.data.accessCodes;
      console.log('✅ Found data.accessCodes property');
    }
    // Strategy 5: Azure Functions wraps in 'body'
    else if (response.body && Array.isArray(response.body)) {
      accessCodes = response.body;
      console.log('✅ Found Azure Functions body format');
    }
    else {
      console.warn('⚠️ Unknown response structure:', response);
      return [];
    }

    // Normalize each access code
    const normalized = accessCodes.map(normalizeAccessCode);

    console.log(`📦 Normalized ${normalized.length} access codes`);
    return normalized;

  } catch (error) {
    console.error('❌ Error normalizing Azure response:', error);
    return [];
  }
};

/**
 * Normalizes a single access code object
 * Handles casing and date format differences
 */
export const normalizeAccessCode = (code: any): AccessCode => {
  // Handle case variations
  const normalizedCode: AccessCode = {
    id: code.id || code.Id || code.ID || generateId(),
    code: (code.code || code.Code || code.CODE || '').toUpperCase(),
    status: (code.status || code.Status || code.STATUS || 'ACTIVE').toUpperCase(),
    expiryDate: normalizeDate(code.expiryDate || code.ExpiryDate || code.expiry_date || code.expiration),
    // Optional fields
    userId: code.userId || code.UserId || code.user_id,
    createdAt: code.createdAt || code.CreatedAt || code.created_at,
    usedAt: code.usedAt || code.UsedAt || code.used_at,
  };

  return normalizedCode;
};

/**
 * Normalizes date formats from Azure
 * Handles: ISO 8601, Unix timestamps, date strings
 */
export const normalizeDate = (dateValue: any): string => {
  if (!dateValue) {
    // Default to 1 year from now if no expiry
    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
    return defaultExpiry.toISOString();
  }

  try {
    let date: Date;

    // Unix timestamp (seconds)
    if (typeof dateValue === 'number') {
      date = new Date(dateValue * 1000);
    }
    // Date object already
    else if (dateValue instanceof Date) {
      date = dateValue;
    }
    // String (ISO 8601 or other format)
    else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    }
    else {
      throw new Error('Unknown date format');
    }

    // Validate
    if (isNaN(date.getTime())) {
      console.warn('⚠️ Invalid date:', dateValue);
      const fallback = new Date();
      fallback.setFullYear(fallback.getFullYear() + 1);
      return fallback.toISOString();
    }

    return date.toISOString();

  } catch (error) {
    console.error('❌ Error parsing date:', dateValue, error);
    const fallback = new Date();
    fallback.setFullYear(fallback.getFullYear() + 1);
    return fallback.toISOString();
  }
};

/**
 * Generates a unique ID if missing
 */
const generateId = (): string => {
  return `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Validates an access code object
 */
export const validateAccessCode = (code: AccessCode): boolean => {
  if (!code.code || code.code.trim().length === 0) {
    console.warn('⚠️ Invalid code: missing code field', code);
    return false;
  }

  if (!code.status) {
    console.warn('⚠️ Invalid code: missing status field', code);
    return false;
  }

  if (!code.expiryDate) {
    console.warn('⚠️ Invalid code: missing expiryDate field', code);
    return false;
  }

  const expiryDate = new Date(code.expiryDate);
  if (isNaN(expiryDate.getTime())) {
    console.warn('⚠️ Invalid code: invalid expiryDate', code);
    return false;
  }

  return true;
};

/**
 * Filters and returns only valid, active codes
 */
export const getActiveValidCodes = (codes: AccessCode[]): AccessCode[] => {
  const now = new Date();
  
  return codes.filter(code => {
    // Must be valid
    if (!validateAccessCode(code)) return false;

    // Must be active
    if (code.status.toUpperCase() !== 'ACTIVE') return false;

    // Must not be expired
    const expiryDate = new Date(code.expiryDate);
    if (expiryDate < now) return false;

    // Must not be used (if usedAt exists)
    if (code.usedAt) return false;

    return true;
  });
};

/**
 * Example usage in your component:
 * 
 * import { normalizeAzureResponse, getActiveValidCodes } from './utils/azureAdapter';
 * 
 * const fetchAccessCodes = async () => {
 *   const response = await fetch('your-azure-endpoint');
 *   const data = await response.json();
 *   
 *   const allCodes = normalizeAzureResponse(data);
 *   const activeCodes = getActiveValidCodes(allCodes);
 *   
 *   setAccessCodes(activeCodes);
 * };
 */

export default {
  normalizeAzureResponse,
  normalizeAccessCode,
  normalizeDate,
  validateAccessCode,
  getActiveValidCodes,
};
