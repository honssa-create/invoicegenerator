/** Shared Honour Label document preview / print CSS (mirrors Word v21 deposit invoice). */

export const QUOTATION_DOCUMENT_CSS = `
  .quo-preview-page {
    font-family: var(--quo-font-family);
    font-size: var(--quo-font-size);
    line-height: var(--quo-line-height);
    color: var(--quo-color-text);
  }
  .quo-preview-page .accent { color: var(--quo-color-accent); }
  .quo-preview-page .accent-bg {
    background: var(--quo-color-table-header-bg);
    color: var(--quo-color-accent-text);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .quo-preview-page .muted { color: var(--quo-color-muted); }
  .quo-preview-page .label {
    font-size: var(--quo-label-size);
    font-weight: 700;
    letter-spacing: normal;
    text-transform: uppercase;
    color: var(--quo-color-label);
    margin: 0 0 2px;
    line-height: 1;
  }
  .quo-preview-page .quo-field {
    background: var(--quo-field-bg);
    border-radius: 2px;
    padding: 4px 6px;
    min-height: 4.5em;
    margin: 0;
  }
  .quo-preview-page.quo-print-mode .quo-field {
    background: transparent;
    padding: 0;
  }
  .quo-preview-page .quo-rule {
    display: none;
  }
  .quo-preview-page .quo-page-number {
    position: absolute;
    left: 0;
    right: 0;
    height: 297mm;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 0 52px 24px 0;
    font-size: var(--quo-page-number-size);
    line-height: 1;
    color: var(--quo-page-number-color);
    text-align: right;
    pointer-events: none;
    user-select: none;
    z-index: 2;
  }
  .quo-preview-page .quo-company-address {
    line-height: var(--quo-line-height);
  }
  .quo-preview-page .quo-title {
    color: var(--quo-color-accent);
    font-size: var(--quo-title-size);
    font-weight: 700;
    letter-spacing: normal;
    text-decoration: underline;
    margin: 0;
    line-height: var(--quo-line-height);
  }
  .quo-preview-page .quo-parties-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 0;
  }
  .quo-preview-page .quo-parties-grid > div {
    padding: var(--quo-table-cell-padding);
  }
  .quo-preview-page .quo-parties-grid .quo-meta-block {
    padding: var(--quo-table-cell-padding);
  }
  .quo-preview-page .quo-th {
    font-size: var(--quo-table-header-size);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: normal;
  }
  .quo-preview-page .quo-table-grid {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--quo-item-font-size);
  }
  .quo-preview-page .quo-table-grid th,
  .quo-preview-page .quo-table-grid td {
    padding: var(--quo-table-cell-padding);
    vertical-align: top;
    border: none;
  }
  .quo-preview-page .quo-table-grid thead th {
    padding: var(--quo-table-header-cell-padding);
  }
  .quo-preview-page .quo-table-grid thead th {
    background: var(--quo-color-table-header-bg);
    color: var(--quo-color-accent-text);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .quo-preview-page .quo-item-desc {
    font-size: var(--quo-item-font-size);
    color: var(--quo-color-text);
  }
  .quo-preview-page .quo-tot-label {
    text-align: right;
    color: var(--quo-color-label);
    font-weight: 700;
    font-size: var(--quo-total-label-size);
    text-transform: uppercase;
    letter-spacing: normal;
    padding-right: 16px;
    white-space: nowrap;
  }
  .quo-preview-page .quo-tot-value {
    text-align: right;
    min-width: 90px;
    color: var(--quo-color-text);
    font-size: var(--quo-total-label-size);
  }
  .quo-preview-page .quo-tot-grand .quo-tot-label,
  .quo-preview-page .quo-tot-grand .quo-tot-value {
    font-weight: 700;
    font-size: var(--quo-total-grand-size);
    line-height: 1.5;
  }
  .quo-preview-page .quo-tot-grand .quo-tot-label {
    color: var(--quo-color-label);
  }
  .quo-preview-page .quo-payment-text {
    font-size: var(--quo-payment-size);
    line-height: var(--quo-line-height);
    color: var(--quo-color-text);
  }
  .quo-preview-page .quo-signature-text {
    font-size: var(--quo-signature-size);
    line-height: var(--quo-line-height);
    color: var(--quo-color-text);
  }
  .quo-preview-page .quo-logo {
    max-height: var(--quo-logo-max-height);
    max-width: var(--quo-logo-max-width);
  }
  .quo-preview-page .quo-chop {
    display: block;
    max-height: 88px;
    max-width: 88px;
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 8px auto 4px;
  }
  .quo-preview-page .quo-sign-block {
    text-align: left;
    width: 100%;
    justify-self: start;
  }
  .quo-preview-page .quo-sign-behalf-line {
    margin: 0 0 10px;
    padding-left: 55.5pt;
    text-indent: 0;
    font-size: var(--quo-signature-size);
    line-height: var(--quo-line-height);
    color: var(--quo-color-text);
  }
  .quo-preview-page .quo-sign-company {
    margin: 0 0 10px;
    padding-left: 55.5pt;
    font-size: var(--quo-signature-size);
    line-height: var(--quo-line-height);
    color: var(--quo-color-text);
  }
  .quo-preview-page .quo-sign-chop {
    display: block;
    max-height: 88px;
    max-width: 88px;
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 0 0 4px 55.5pt;
  }
  .quo-preview-page .quo-sign-chop-space {
    min-height: 88px;
    margin: 0 0 4px 55.5pt;
  }
  .quo-preview-page .quo-sign-auth-line {
    border: 0;
    border-top: 1px solid #333;
    width: 70%;
    margin: 12px 0 8px 55.5pt;
  }
  .quo-preview-page .quo-sign-auth-label {
    margin: 12px 0 0;
    padding-left: 55.5pt;
    font-size: var(--quo-signature-size);
    line-height: var(--quo-line-height);
    color: var(--quo-color-text);
    text-align: left;
  }
  .quo-preview-page .quo-footer-pay-sign {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.35fr) minmax(0, 1fr);
    gap: 0;
    margin-top: 1.5rem;
    align-items: start;
  }
  .quo-preview-page .quo-sign-footer {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto minmax(4.5rem, 1fr) auto;
    column-gap: 1.5rem;
    margin-top: 1.5rem;
    align-items: start;
  }
  .quo-preview-page .quo-sign-accept-label {
    grid-column: 1;
    grid-row: 1;
    margin: 0;
    font-size: var(--quo-font-size);
    color: var(--quo-color-text);
  }
  .quo-preview-page .quo-sign-block-slot {
    grid-column: 2;
    grid-row: 1 / 3;
    justify-self: start;
    align-self: start;
    width: 100%;
  }
  .quo-preview-page .quo-sign-left-fill {
    grid-column: 1;
    grid-row: 2;
  }
  .quo-preview-page .quo-sign-accept-line {
    grid-column: 1;
    grid-row: 3;
    border: 0;
    border-top: 1px solid #333;
    width: 85%;
    margin: 1.75rem 0 0;
    align-self: end;
  }
  .quo-preview-page .quo-sign-auth-line-slot {
    grid-column: 2;
    grid-row: 3;
    border: 0;
    border-top: 1px solid #333;
    width: 70%;
    margin: 1.75rem 0 8px 55.5pt;
    align-self: end;
    justify-self: start;
  }
  .quo-preview-page .quo-sign-auth-label-slot {
    grid-column: 2;
    grid-row: 4;
    margin: 0;
    padding-left: 55.5pt;
    font-size: var(--quo-signature-size);
    line-height: var(--quo-line-height);
    color: var(--quo-color-text);
    text-align: left;
    justify-self: start;
    width: 100%;
  }
  .quo-preview-page .quo-sign-footer--accept {
    grid-template-rows: auto minmax(4.5rem, 1fr) auto auto;
  }
  .quo-preview-page .quo-sign-footer--accept .quo-sign-behalf-line,
  .quo-preview-page .quo-sign-footer--accept .quo-sign-company {
    padding-left: 0;
  }
  .quo-preview-page .quo-sign-footer--accept .quo-sign-chop,
  .quo-preview-page .quo-sign-footer--accept .quo-sign-chop-space {
    margin-left: 0;
  }
  .quo-preview-page .quo-sign-footer--accept .quo-sign-auth-line-slot {
    margin-left: 0;
  }
  .quo-preview-page .quo-sign-footer--accept .quo-sign-auth-label-slot {
    padding-left: 0;
  }
  .quo-preview-page .quo-sign-accept-only {
    margin-top: 1.5rem;
    width: 50%;
  }
  .quo-preview-page .quo-sign-accept-only .quo-sign-accept-label {
    margin: 0 0 1.75rem;
  }
  .quo-preview-page .quo-sign-accept-only .quo-sign-accept-line {
    width: 85%;
    margin: 0;
  }
  .quo-preview-page .quo-sign-only {
    margin-top: 1.5rem;
    display: flex;
    justify-content: flex-end;
  }
  .quo-preview-page .quo-sign-only .quo-sign-block {
    width: 50%;
    justify-self: start;
  }
  .quo-preview-page .quo-footer-pay-sign > .quo-sign-block {
    justify-self: start;
    width: 100%;
  }
  .quo-preview-page .quo-meta-block {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 6px;
    row-gap: 0;
    justify-content: end;
    justify-items: end;
    align-content: start;
  }
  .quo-preview-page .quo-meta-row {
    display: contents;
  }
  .quo-preview-page .quo-meta-k {
    display: block;
    min-width: unset;
    text-align: right;
    color: var(--quo-color-label);
    font-weight: 700;
    letter-spacing: normal;
    text-transform: uppercase;
    margin: 0;
    padding: 0;
    line-height: 1;
    font-size: var(--quo-label-size);
  }
  .quo-preview-page .quo-meta-v {
    display: block;
    min-width: 5.5em;
    text-align: left;
    justify-self: start;
    margin: 0;
    padding: 0;
    line-height: 1;
    font-size: var(--quo-font-size);
  }
  .quo-preview-page .quo-order-no-k {
    font-weight: 700;
    letter-spacing: normal;
    text-transform: uppercase;
    color: var(--quo-color-label);
    margin-right: 8px;
    font-size: var(--quo-label-size);
  }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    .quo-preview-page {
      width: 100% !important;
      box-shadow: none !important;
      margin: 0 !important;
    }
    .quo-preview-page .accent-bg,
    .quo-preview-page .quo-table-grid thead th {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .quo-preview-page .quo-item-desc,
    .quo-preview-page .quo-message,
    .quo-preview-page .muted {
      color: var(--quo-color-text);
    }
  }
`;
