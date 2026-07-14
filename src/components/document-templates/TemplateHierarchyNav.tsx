'use client';

import {
  DEBIT_NOTE_COMPANY_VARIANTS,
  DOCUMENT_TYPES,
  type DocumentTypeId,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';

interface Props {
  documentType: DocumentTypeId;
  onDocumentTypeChange: (id: DocumentTypeId) => void;
  companyVariant: TemplateCompanyVariantId;
  onCompanyVariantChange: (id: TemplateCompanyVariantId) => void;
}

export default function TemplateHierarchyNav({
  documentType,
  onDocumentTypeChange,
  companyVariant,
  onCompanyVariantChange,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Document Type 文件類型
        </p>
        <div className="flex flex-wrap gap-2">
          {DOCUMENT_TYPES.map((doc) => (
            <button
              key={doc.id}
              type="button"
              disabled={!doc.enabled}
              onClick={() => doc.enabled && onDocumentTypeChange(doc.id)}
              title={doc.description}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                documentType === doc.id
                  ? 'bg-brand-600 text-white border-brand-600'
                  : doc.enabled
                    ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    : 'bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed'
              }`}
            >
              {doc.labelZh} {doc.label}
              {!doc.enabled && <span className="ml-1 text-[10px] opacity-75">Soon</span>}
            </button>
          ))}
        </div>
      </div>

      {documentType === 'debit_note' && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Company Variant 公司版本
          </p>
          <div className="flex flex-wrap gap-2">
            {DEBIT_NOTE_COMPANY_VARIANTS.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => onCompanyVariantChange(variant.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  companyVariant === variant.id
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {variant.shortLabel}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {DEBIT_NOTE_COMPANY_VARIANTS.find((v) => v.id === companyVariant)?.label}
          </p>
        </div>
      )}
    </div>
  );
}
