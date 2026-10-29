/**
 * Runtime kill switch for automatic kitchen-prep creation/activation.
 *
 * Disabled only when KITCHEN_PREP_AUTO_SCHEDULE (trimmed, lowercased) is
 * exactly 'false', '0' or 'off'. Missing, empty or any other value keeps
 * automatic scheduling enabled.
 */
export function isKitchenPrepAutoScheduleEnabled(): boolean {
  const raw = (process.env.KITCHEN_PREP_AUTO_SCHEDULE ?? '').trim().toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
}
