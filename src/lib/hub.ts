/** Client-safe types for the Centralized Order & Reconciliation Hub. */

export const HUB_PLATFORMS = ['nestiee', 'honour', 'honour_en', 'cupmoka', 'quickbooks', 'clickup', 'manual'] as const;
export type HubPlatform = (typeof HUB_PLATFORMS)[number];

export const HUB_PLATFORM_LABELS: Record<HubPlatform, string> = {
  nestiee: 'Nestiee (nestiee.com.hk)',
  honour: 'Honour (honour.com.hk)',
  honour_en: 'Honour EN',
  cupmoka: 'Cup Moka (cupmoka.com.hk)',
  quickbooks: 'QuickBooks',
  clickup: 'ClickUp 回禮',
  manual: 'Manual 手動',
};

export const HUB_PLATFORM_PREFIX: Record<Exclude<HubPlatform, 'manual'>, string> = {
  nestiee: 'NES',
  honour: 'HON',
  honour_en: 'HEN',
  cupmoka: 'CUP',
  quickbooks: 'QB',
  clickup: 'CLK',
};

export interface HubOrderRow {
  id: number;
  source_platform: HubPlatform;
  original_order_id: string | null;
  system_order_no: string | null;
  reference_number: string;
  customer_name: string;
  total_amount: number | null;
  status: string;
  po_number: string;
  created_at: string;
  updated_at: string;
  linked_invoice_id: number | null;
  linked_invoice_number: string | null;
  linked_external_invoice_number: string | null;
}

export interface HubSyncResult {
  platform: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  linked: number;
  errors: string[];
}

export interface HubIntegrationStatus {
  platform: HubPlatform | 'woocommerce';
  label: string;
  configured: boolean;
  connected: boolean;
  last_synced_at: string | null;
  setup_error?: string | null;
  environment?: 'sandbox' | 'production' | null;
}
