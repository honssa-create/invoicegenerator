import {
  FUNDING_SOURCE_CC_SELF,
  FUNDING_SOURCES,
  PAYMENT_CHANNELS,
  isValidCardLast4,
  type FundingSourceId,
  type PaymentChannelId,
} from './expenses';

const PAYMENT_CHANNEL_SET = new Set(PAYMENT_CHANNELS.map((o) => o.value));
const FUNDING_SOURCE_SET = new Set(FUNDING_SOURCES.map((o) => o.value));

export interface ExpensePaymentFieldsInput {
  payment_channel?: string | null;
  funding_source?: string | null;
  card_last4?: string | null;
}

export interface NormalizedExpensePaymentFields {
  payment_channel: PaymentChannelId | null;
  funding_source: FundingSourceId | null;
  card_last4: string | null;
}

export function normalizeExpensePaymentFields(
  input: ExpensePaymentFieldsInput,
): { ok: true; fields: NormalizedExpensePaymentFields } | { ok: false; error: string } {
  const payment_channel = (input.payment_channel?.trim() || '') as PaymentChannelId | '';
  const funding_source = (input.funding_source?.trim() || '') as FundingSourceId | '';
  const card_last4 = input.card_last4?.trim() || '';

  if (!payment_channel || !PAYMENT_CHANNEL_SET.has(payment_channel)) {
    return { ok: false, error: 'Select a payment channel 請選擇支付渠道' };
  }
  if (!funding_source || !FUNDING_SOURCE_SET.has(funding_source)) {
    return { ok: false, error: 'Select a funding source 請選擇扣款來源' };
  }
  if (funding_source === FUNDING_SOURCE_CC_SELF) {
    if (!isValidCardLast4(card_last4)) {
      return {
        ok: false,
        error: 'Enter the last 4 digits of the card (信用卡尾四位數字)',
      };
    }
    return {
      ok: true,
      fields: { payment_channel, funding_source, card_last4 },
    };
  }

  return {
    ok: true,
    fields: {
      payment_channel,
      funding_source,
      card_last4: card_last4 && isValidCardLast4(card_last4) ? card_last4 : null,
    },
  };
}
