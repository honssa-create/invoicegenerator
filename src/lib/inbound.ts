export interface InboundShipment {
  id: number;
  user_id: number;
  waybill_number: string | null;
  sender: string | null;
  arrival_date: string | null;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
}

export interface ShipmentScanResult {
  waybill_number: string | null;
  sender: string | null;
  photo_path: string | null;
  source: 'ai' | 'ocr';
}
