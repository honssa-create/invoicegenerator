'use client';

/** Live preview of the Honour Label quotation layout (mirrors public/quotation-style-template.html). */

export interface QuotationPreviewModel {
  companyAddressLines: string[];
  billingAddress: string;
  shippingAddress: string;
  orderNo: string;
  quotationNo: string;
  date: string;
  itemName: string;
  itemDescription: string;
  qty: string;
  rate: string;
  amount: string;
  message: string;
  remarks: string[];
  subtotal: string;
  discount: string;
  total: string;
  logoSrc?: string;
}

export const DEFAULT_QUOTATION_PREVIEW: QuotationPreviewModel = {
  companyAddressLines: [
    'Honour Label Limited',
    'Room 13, Block C, 13/F',
    'Wah Tat Industrial Centre',
    '8 Wah Sing Street, Kwai Chung',
    'honour.com.hk',
    'hello@honour.com.hk',
  ],
  billingAddress: '<BillingAddress>',
  shippingAddress: '<ShippingAddress>',
  orderNo: '<custom1>',
  quotationNo: '<refnumber>',
  date: '<Date>',
  itemName: '<Item>',
  itemDescription: '<ItemDescription>',
  qty: '<Qty>',
  rate: '<Rate>',
  amount: '<Amount>',
  message: '<Message>',
  remarks: [
    '報價有效期為報價日起計十四天。',
    '訂貨時需支付訂金百分之五十，餘款於出貨前清付。',
    '如無特別註明，以上報價以港幣計算。',
    '如有任何疑問，請與我們聯絡。',
  ],
  subtotal: '<Subtotal>',
  discount: '<DiscountBeforeTax>',
  total: '<Total>',
  logoSrc: '/company-logo.png',
};

export default function FormalQuotationDocument({
  model = DEFAULT_QUOTATION_PREVIEW,
}: {
  model?: QuotationPreviewModel;
}) {
  const lines = [...model.companyAddressLines];
  while (lines.length < 6) lines.push('');
  const six = lines.slice(0, 6);

  return (
    <div className="quo-preview-page bg-white shadow-lg mx-auto" style={{ width: '210mm', minHeight: '297mm', padding: '48px 52px' }}>
      <style>{`
        .quo-preview-page { font-family: Arial, 'Helvetica Neue', Helvetica, 'Microsoft JhengHei', 'PingFang TC', sans-serif; font-size: 13px; line-height: 1.45; color: #222; }
        .quo-preview-page .accent { color: #e8a070; }
        .quo-preview-page .accent-bg { background: #e8a070; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .quo-preview-page .muted { color: #b0b0b0; }
        .quo-preview-page .label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #b0b0b0; }
      `}</style>

      <header className="flex justify-between items-start gap-6 mb-7">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={model.logoSrc || '/company-logo.png'}
            alt="Company logo"
            className="block object-contain"
            style={{ maxHeight: 88, maxWidth: 160 }}
          />
        </div>
        <div className="text-right text-[12px] leading-[1.4] max-w-[280px]">
          {six.map((line, i) => (
            <div key={i} className={i === 0 ? 'font-bold text-[13px]' : undefined}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </header>

      <div className="mb-7">
        <h1 className="accent text-[36px] font-bold tracking-wide m-0 leading-none">QUOTATION</h1>
        <hr className="mt-2.5 border-0 border-t-2 border-[#e8a070]" />
      </div>

      <section className="grid grid-cols-3 gap-4 mb-7">
        <div>
          <p className="label mb-2">Invoice To</p>
          <p className="whitespace-pre-wrap m-0 min-h-[4.5em]">{model.billingAddress}</p>
        </div>
        <div>
          <p className="label mb-2">Ship To</p>
          <p className="whitespace-pre-wrap m-0 min-h-[4.5em]">{model.shippingAddress}</p>
        </div>
        <div className="text-right text-[12px] space-y-1.5">
          <p className="m-0">
            <span className="muted font-bold uppercase tracking-wide inline-block min-w-[7.5em] text-right mr-2.5">Order No.</span>
            <span className="inline-block min-w-[5.5em] text-left">{model.orderNo}</span>
          </p>
          <p className="m-0">
            <span className="muted font-bold uppercase tracking-wide inline-block min-w-[7.5em] text-right mr-2.5">Quotation No.</span>
            <span className="inline-block min-w-[5.5em] text-left">{model.quotationNo}</span>
          </p>
          <p className="m-0">
            <span className="muted font-bold uppercase tracking-wide inline-block min-w-[7.5em] text-right mr-2.5">Date</span>
            <span className="inline-block min-w-[5.5em] text-left">{model.date}</span>
          </p>
        </div>
      </section>

      <table className="w-full border-collapse mb-7 text-[13px]">
        <thead>
          <tr>
            <th className="accent-bg text-left text-[11px] font-bold tracking-wider uppercase px-3 py-2.5">Description</th>
            <th className="accent-bg text-right text-[11px] font-bold tracking-wider uppercase px-3 py-2.5">Qty</th>
            <th className="accent-bg text-right text-[11px] font-bold tracking-wider uppercase px-3 py-2.5">Price</th>
            <th className="accent-bg text-right text-[11px] font-bold tracking-wider uppercase px-3 py-2.5">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="px-3 py-3.5 align-top">
              <p className="font-bold m-0 mb-1">1. {model.itemName}</p>
              <p className="m-0 text-[12px] text-[#9a9a9a]">{model.itemDescription}</p>
            </td>
            <td className="px-3 py-3.5 text-right align-top">{model.qty}</td>
            <td className="px-3 py-3.5 text-right align-top">{model.rate}</td>
            <td className="px-3 py-3.5 text-right align-top">{model.amount}</td>
          </tr>
        </tbody>
      </table>

      <section className="grid grid-cols-[1.4fr_1fr] gap-6 mb-10">
        <div>
          <p className="m-0 mb-4 text-[#9a9a9a] whitespace-pre-wrap min-h-[1.5em]">{model.message}</p>
          <p className="m-0 mb-2 font-bold">Remarks:</p>
          <ol className="m-0 pl-5 text-[12px] leading-relaxed space-y-1">
            {model.remarks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
        <div>
          <table className="w-full max-w-[260px] ml-auto text-[12px]">
            <tbody>
              <tr>
                <td className="py-1 text-right muted font-bold uppercase tracking-wide pr-4">Subtotal</td>
                <td className="py-1 text-right min-w-[90px]">{model.subtotal}</td>
              </tr>
              <tr>
                <td className="py-1 text-right muted font-bold uppercase tracking-wide pr-4">Discount</td>
                <td className="py-1 text-right">{model.discount}</td>
              </tr>
              <tr>
                <td className="pt-2 text-right font-bold text-[14px] pr-4">Total</td>
                <td className="pt-2 text-right font-bold text-[14px]">{model.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer className="grid grid-cols-2 gap-6 mt-6">
        <div className="self-end">
          <p className="m-0 mb-7 text-[13px]">Accepted by &amp; Date</p>
          <hr className="border-0 border-t border-gray-800 w-[85%] m-0" />
        </div>
        <div className="text-center self-end">
          <p className="m-0 mb-2 text-[12px]">For and on behalf of Honour Label Limited</p>
          <hr className="border-0 border-t border-gray-800 w-[70%] mx-auto mt-[72px] mb-2" />
          <p className="m-0 text-[12px]">Authorized Signature</p>
        </div>
      </footer>
    </div>
  );
}
