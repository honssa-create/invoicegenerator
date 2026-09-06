'use client';

/** Word v21 “For and on behalf of …” footer block (left-aligned stack). */

export default function HonourLabelSignatureBlock({
  signName = 'Honour Label Limited',
  chopSrc = '/company-chop.png',
  showChop = true,
  /** Omit the Authorized Signature label when the parent footer grid places it. */
  hideAuth = false,
}: {
  signName?: string;
  chopSrc?: string;
  showChop?: boolean;
  hideAuth?: boolean;
}) {
  return (
    <div className="quo-sign-block">
      <p className="quo-sign-behalf-line">For and on behalf of</p>
      <p className="quo-sign-company">{signName}</p>
      {showChop ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="quo-sign-chop" src={chopSrc} alt="Company chop" />
      ) : (
        <div className="quo-sign-chop-space" aria-hidden="true" />
      )}
      {!hideAuth ? (
        <p className="quo-sign-auth-label">Authorized Signature</p>
      ) : null}
    </div>
  );
}
