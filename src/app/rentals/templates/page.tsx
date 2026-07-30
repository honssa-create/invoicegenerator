'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DebitNoteTemplateWorkspace from '@/components/document-templates/DebitNoteTemplateWorkspace';
import QuotationTemplateWorkspace from '@/components/document-templates/QuotationTemplateWorkspace';
import InvoiceTemplateWorkspace from '@/components/document-templates/InvoiceTemplateWorkspace';
import DeliveryNoteTemplateWorkspace from '@/components/document-templates/DeliveryNoteTemplateWorkspace';
import TemplateHierarchyNav from '@/components/document-templates/TemplateHierarchyNav';
import { useAuth } from '@/components/AuthProvider';
import {
  companyVariantsForDocumentType,
  type DocumentTypeId,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';
import { isSectionReadOnly } from '@/lib/permissions';
import { NAV, bi } from '@/lib/ui-labels';

export default function RentalTemplatesPage() {
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [documentType, setDocumentType] = useState<DocumentTypeId>('debit_note');
  const [companyVariant, setCompanyVariant] = useState<TemplateCompanyVariantId>('label');

  useEffect(() => {
    const variants = companyVariantsForDocumentType(documentType);
    if (variants.length && !variants.some((v) => v.id === companyVariant)) {
      setCompanyVariant(variants[0].id);
    }
  }, [documentType, companyVariant]);

  return (
    <AppLayout>
      <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
        <div className="no-print px-4 sm:px-6 py-4">
          <div className="max-w-[1600px] mx-auto space-y-6">
            <div>
              <Link href="/rentals" className="text-sm text-brand-600 font-medium">
                ← {bi('Back to Rentals', '返回租金管理')}
              </Link>
              <h1 className="text-xl font-bold text-gray-900 mt-2">{NAV.templates}</h1>
              <p className="text-sm text-gray-500 mt-1 max-w-3xl">
                Edit document templates with a live preview. Hierarchy: Document Type → Company Variant →
                template details. Debit Note, Quotation, Invoice, and Delivery Note are available.
                左側編輯、右側即時預覽。
              </p>
            </div>

            <TemplateHierarchyNav
              documentType={documentType}
              onDocumentTypeChange={setDocumentType}
              companyVariant={companyVariant}
              onCompanyVariantChange={setCompanyVariant}
            />

            {documentType === 'debit_note' && (
              <DebitNoteTemplateWorkspace
                key={`debit-${companyVariant}`}
                variant={companyVariant}
                readOnly={readOnly}
              />
            )}

            {documentType === 'quotation' && (
              <QuotationTemplateWorkspace
                key={`quo-${companyVariant}`}
                variant={companyVariant}
                readOnly={readOnly}
              />
            )}

            {documentType === 'invoice' && (
              <InvoiceTemplateWorkspace
                key={`inv-${companyVariant}`}
                variant={companyVariant}
                readOnly={readOnly}
              />
            )}

            {documentType === 'delivery_note' && (
              <DeliveryNoteTemplateWorkspace
                key={`dn-${companyVariant}`}
                variant={companyVariant}
                readOnly={readOnly}
              />
            )}

            {documentType !== 'debit_note' &&
              documentType !== 'quotation' &&
              documentType !== 'invoice' &&
              documentType !== 'delivery_note' && (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                This document type is not available yet. Debit Note, Quotation, Invoice, and Delivery
                Note are implemented.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
