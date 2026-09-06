/** Open the native date picker (needed on iPad Safari where type=date taps often do nothing). */
export function openNativeDatePicker(input: HTMLInputElement): void {
  if (input.disabled || input.readOnly) return;
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  } catch {
    // Safari throws if the picker is already open or the input is not visible.
  }
}

export function dateInputFromEventTarget(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof Element)) return null;
  if (target instanceof HTMLInputElement && target.type === 'date') return target;
  const nested = target.closest('input[type="date"]');
  if (nested instanceof HTMLInputElement) return nested;
  const label = target.closest('label');
  if (label) {
    const byFor = label.htmlFor ? document.getElementById(label.htmlFor) : null;
    if (byFor instanceof HTMLInputElement && byFor.type === 'date') return byFor;
    const inside = label.querySelector('input[type="date"]');
    if (inside instanceof HTMLInputElement) return inside;
  }
  return null;
}
