import { describe, expect, it } from 'vitest';
import { formatCustomerPartyBlock } from './customer-party';

describe('formatCustomerPartyBlock', () => {
  it('puts name and company on one line with phone on the next when company exists', () => {
    expect(
      formatCustomerPartyBlock({
        name: 'John',
        companyName: 'Acme Ltd',
        phone: '91234567',
        email: 'john@acme.com',
        address: '1 Main St',
      }),
    ).toBe('John | Acme Ltd\n91234567\njohn@acme.com\n1 Main St');
  });

  it('keeps name and phone on one line when company is missing', () => {
    expect(
      formatCustomerPartyBlock({
        name: 'John',
        phone: '91234567',
        email: 'john@example.com',
        address: '1 Main St',
      }),
    ).toBe('John | 91234567\njohn@example.com\n1 Main St');
  });

  it('omits empty optional lines', () => {
    expect(
      formatCustomerPartyBlock({
        name: 'John',
        companyName: 'Acme Ltd',
      }),
    ).toBe('John | Acme Ltd');
  });
});
