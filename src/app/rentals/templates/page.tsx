'use client';

import { useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DebitNoteTemplateWorkspace from '@/components/document-templates/DebitNoteTemplateWorkspace';
import TemplateHierarchyNav from '@/components/document-templates/TemplateHierarchyNav';
import { useAuth } from '@/components/AuthProvider';
import type { DocumentTypeId, TemplateCompanyVariantId } from '@/lib/document-templates';
import { isSectionReadOnly } from '@/lib/permissions';

export default function RentalTemplatesPage() {
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [documentType, setDocumentType] = useState<DocumentTypeId>('debit_note');
  const [companyVariant, setCompanyVariant] = useState<TemplateCompanyVariantId>('label');

  return (
    <AppLayout>
      <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
        <div className="no-print px-4 sm:px-6 py-4">
          <div className="max-w-[1600px] mx-auto space-y-6">
            <div>
              <Link href="/rentals" className="text-sm text-brand-600 font-medium">
                ← Back to Rentals
              </Link>
              <h1 className="text-xl font-bold text-gray-900 mt-2">Document Templates 文件範本</h1>
              <p className="text-sm text-gray-500 mt-1 max-w-3xl">
                Edit document templates with a live preview. Hierarchy: Document Type → Company Variant →
                template details (header, payment notes, layout).
                左側編輯、右側即時預覽；支援動態變數如 {'{{customer_name}}'}。
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
                key={companyVariant}
                variant={companyVariant}
                readOnly={readOnly}
              />
            )}

            {documentType !== 'debit_note' && (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
                This document type is not available yet. Debit Note is implemented first.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
