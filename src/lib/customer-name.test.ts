import { describe, expect, it } from 'vitest';
import { normalizeCustomerName } from './customer-name';

describe('normalizeCustomerName', () => {
  it('drops dash-separated segments that contain digits', () => {
    expect(normalizeCustomerName('John Smith - 91234567')).toBe('John Smith');
    expect(normalizeCustomerName('Jane - Acme Ltd - 123')).toBe('Jane - Acme Ltd');
  });

  it('keeps name and phone on one segment when there is no dash', () => {
    expect(normalizeCustomerName('John Smith')).toBe('John Smith');
  });

  it('returns the original name when every segment contains digits', () => {
    expect(normalizeCustomerName('91234567 - 87654321')).toBe('91234567 - 87654321');
  });

  it('trims whitespace', () => {
    expect(normalizeCustomerName('  John  -  91234567  ')).toBe('John');
  });
});
