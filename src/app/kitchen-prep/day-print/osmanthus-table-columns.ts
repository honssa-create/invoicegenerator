/**
 * ① 桂花 materials detail table column headers (production baseline, PR #176).
 * Yellow-box spare scaling must not change these or the table body markup.
 */
export const OSMANTHUS_DAY_PRINT_TABLE_COLUMNS: ReadonlyArray<{
  label: string;
  align: 'left' | 'right';
}> = [
  { label: '容量', align: 'left' },
  { label: '今次要燉', align: 'right' },
  { label: '燕餅 g', align: 'right' },
  { label: '桂花 g', align: 'right' },
  { label: '片糖 g', align: 'right' },
  { label: '水(煮糖) g', align: 'right' },
  { label: '水(冷泡) g', align: 'right' },
];

export const OSMANTHUS_DAY_PRINT_TABLE_TOTAL_LABEL = '桂花合計';
