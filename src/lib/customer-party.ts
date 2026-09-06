import type { Customer } from '@/lib/types';

export interface CustomerPartyFields {
  name?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

/** Print / party-block layout for Invoice To, Ship To, and similar address columns. */
export function formatCustomerPartyBlock(fields: CustomerPartyFields): string {
  const name = fields.name?.trim() || '';
  const company = fields.companyName?.trim() || '';
  const phone = fields.phone?.trim() || '';
  const email = fields.email?.trim() || '';
  const address = fields.address?.trim() || '';

  const lines: string[] = [];

  if (company) {
    if (name) lines.push(`${name} | ${company}`);
    else lines.push(company);
    if (phone) lines.push(phone);
  } else if (name && phone) {
    lines.push(`${name} | ${phone}`);
  } else if (name) {
    lines.push(name);
  } else if (phone) {
    lines.push(phone);
  }

  if (email) lines.push(email);
  if (address) lines.push(address);

  return lines.join('\n');
}

export function formatCustomerPartyBlockFromCustomer(
  c: Pick<Customer, 'name' | 'company_name' | 'phone' | 'email' | 'address'>,
): string {
  return formatCustomerPartyBlock({
    name: c.name,
    companyName: c.company_name,
    phone: c.phone,
    email: c.email,
    address: c.address,
  });
}
