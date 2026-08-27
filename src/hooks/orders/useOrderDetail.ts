'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountUser } from '@/components/OrderPropertyBar';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { CONFLICT_MESSAGE, CONFLICT_MESSAGE_ZH } from '@/lib/concurrency';
import { DEFAULT_OPTIONS } from '@/lib/expenses';
import {
  formatKitchenShortageConfirm,
  parseKitchenShortageResponse,
} from '@/lib/kitchen-ship-allocate';
import { isUnattendedImportedOrder, NESTIEE_GIFT_BOX_TYPES, type Order } from '@/lib/orders';
import type { OrderDetailPatchPayload } from '@/components/orders/order-detail-types';
import { MSG, bi } from '@/lib/ui-labels';

export interface InvoiceOption {
  id: number;
  invoice_number: string;
  status: string;
}

export interface QuotationOption {
  id: number;
  quote_number: string;
  status: string;
}

export type QuoteToast = { text: string; kind: 'success' | 'error' } | null;

export function useOrderDetail(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteToast, setQuoteToast] = useState<QuoteToast>(null);
  const [accountUsers, setAccountUsers] = useState<AccountUser[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([...DEFAULT_OPTIONS.supplier]);
  const [nestieeGiftBoxes, setNestieeGiftBoxes] = useState(NESTIEE_GIFT_BOX_TYPES);

  const bigDayPersistedRef = useRef('');
  const bigDaySavedOnChangeRef = useRef<string | null>(null);
  const patchQueueRef = useRef(Promise.resolve());
  const updatedAtRef = useRef('');
  const patchSeqRef = useRef(0);
  const patchesInFlightRef = useRef(0);
  const attendPostedForRef = useRef<string | null>(null);

  const setCoreLocal = useCallback((col: string, value: unknown) => {
    setOrder((o) => (o ? ({ ...o, [col]: value } as Order) : o));
  }, []);

  const setFieldLocal = useCallback((key: string, value: unknown) => {
    setOrder((o) => (o ? { ...o, fields: { ...o.fields, [key]: value as string | boolean } } : o));
  }, []);

  const refetchOrder = useCallback(() => {
    if (patchesInFlightRef.current > 0) return;
    fetch(`/api/orders/${orderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (patchesInFlightRef.current > 0) return;
        const o = d?.order || null;
        if (!o) return;
        setOrder(o);
        bigDayPersistedRef.current = String(o.fields?.big_day || '');
        updatedAtRef.current = o.updated_at || '';
      })
      .catch(() => {});
  }, [orderId]);

  const patch = useCallback(
    (payload: OrderDetailPatchPayload, opts?: { revertStatusTo?: string }) => {
      const seq = ++patchSeqRef.current;
      patchesInFlightRef.current += 1;
      if (payload.fields && Object.keys(payload.fields).length) {
        setOrder((o) =>
          o
            ? {
                ...o,
                fields: {
                  ...o.fields,
                  ...(payload.fields as Record<string, string | boolean>),
                },
              }
            : o,
        );
      }
      patchQueueRef.current = patchQueueRef.current.then(async () => {
        try {
          const res = await fetch(`/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              expected_updated_at: updatedAtRef.current || undefined,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.order) {
            updatedAtRef.current = data.order.updated_at || '';
            if (seq === patchSeqRef.current) {
              setOrder(data.order);
              bigDayPersistedRef.current = String(data.order.fields?.big_day || '');
            }
            return;
          }
          const shortages = parseKitchenShortageResponse(data);
          if (res.status === 409 && shortages) {
            const shipAnyway = window.confirm(formatKitchenShortageConfirm(shortages));
            if (shipAnyway) {
              patch({ ...payload, skip_kitchen_allocation: true }, opts);
            } else if (opts?.revertStatusTo != null) {
              setCoreLocal('status', opts.revertStatusTo);
            }
            return;
          }
          if (res.status === 409) {
            if (data.order) {
              setOrder(data.order);
              bigDayPersistedRef.current = String(data.order.fields?.big_day || '');
              updatedAtRef.current = data.order.updated_at || '';
            } else {
              refetchOrder();
            }
            setQuoteToast({
              text: bi(CONFLICT_MESSAGE, CONFLICT_MESSAGE_ZH),
              kind: 'error',
            });
          } else if (!res.ok) {
            if (opts?.revertStatusTo != null) setCoreLocal('status', opts.revertStatusTo);
            setQuoteToast({
              text: (data as { error?: string }).error || MSG.saveFailed,
              kind: 'error',
            });
          }
        } catch {
          if (opts?.revertStatusTo != null) setCoreLocal('status', opts.revertStatusTo);
          setQuoteToast({ text: MSG.saveFailed, kind: 'error' });
        } finally {
          patchesInFlightRef.current = Math.max(0, patchesInFlightRef.current - 1);
        }
      });
    },
    [orderId, refetchOrder, setCoreLocal],
  );

  useEffect(() => {
    attendPostedForRef.current = null;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orders/${orderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const o = d?.order || null;
        setOrder(o);
        if (o) {
          bigDayPersistedRef.current = String(o.fields?.big_day || '');
          bigDaySavedOnChangeRef.current = null;
          updatedAtRef.current = o.updated_at || '';
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (!order || String(order.id) !== orderId) return;
    if (!isUnattendedImportedOrder(order)) return;
    if (attendPostedForRef.current === orderId) return;
    attendPostedForRef.current = orderId;
    let cancelled = false;
    fetch(`/api/orders/${orderId}/attend`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.attended_at) return;
        setOrder((o) => (o ? { ...o, attended_at: d.attended_at as string } : o));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId, order]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kitchen/catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.catalog?.giftBoxTypes) return;
        const boxes = (d.catalog.giftBoxTypes as {
          id: string;
          label: string;
          qtyKey: string;
          active?: boolean;
        }[])
          .filter((g) => g.active !== false)
          .map((g) => ({
            id: g.id,
            label: g.label,
            qtyKey: g.qtyKey || `nestiee_gift_qty_${g.id}`,
          }));
        if (boxes.length) setNestieeGiftBoxes(boxes);
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useRefetchOnFocus(refetchOrder, Boolean(orderId) && !loading);

  useEffect(() => {
    fetch('/api/invoices?fields=options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setInvoices(
          (d?.invoices || []).map((i: InvoiceOption) => ({
            id: i.id,
            invoice_number: i.invoice_number,
            status: i.status,
          })),
        ),
      )
      .catch(() => {});
    fetch('/api/quotations?fields=options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setQuotations(
          (d?.quotations || []).map((q: QuotationOption) => ({
            id: q.id,
            quote_number: q.quote_number,
            status: q.status,
          })),
        ),
      )
      .catch(() => {});
    fetch('/api/account/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAccountUsers(Array.isArray(d?.users) ? d.users : []))
      .catch(() => {});
    fetch('/api/orders/tag-options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTagSuggestions(Array.isArray(d?.tags) ? d.tags : []))
      .catch(() => {});
    fetch('/api/expense-options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.options?.supplier;
        if (Array.isArray(list)) setSupplierOptions(list.map(String));
      })
      .catch(() => {});
  }, []);

  return {
    order,
    setOrder,
    loading,
    invoices,
    quotations,
    quoteToast,
    setQuoteToast,
    accountUsers,
    tagSuggestions,
    setTagSuggestions,
    supplierOptions,
    setSupplierOptions,
    nestieeGiftBoxes,
    bigDayPersistedRef,
    bigDaySavedOnChangeRef,
    patch,
    refetchOrder,
    setCoreLocal,
    setFieldLocal,
    updatedAtRef,
  };
}
