import { describe, expect, it } from 'vitest';
import sampleTask from './fixtures/clickup-wedding-task.sample.json';
import type { ClickUpTask } from './clickup';
import {
  mapClickUpStatus,
  mapClickUpTaskToUpsert,
  parseClickUpCustomFields,
  parseClickUpTaskName,
} from './clickup-map';
import { WEDDING_GIFT_ORDER_TYPE } from './orders';

const task = sampleTask as ClickUpTask;

describe('ClickUp status mapping', () => {
  it('maps exact wedding workflow status', () => {
    expect(mapClickUpStatus('已跟客人確認基本資料')).toBe('已跟客人確認基本資料');
  });

  it('falls back to OPEN for unknown status', () => {
    expect(mapClickUpStatus('Some Other Status')).toBe('OPEN');
  });
});

describe('mapClickUpTaskToUpsert', () => {
  it('maps sample task to 回禮 hub upsert input', () => {
    const upsert = mapClickUpTaskToUpsert(task);
    expect(upsert.source_platform).toBe('clickup');
    expect(upsert.original_order_id).toBe('86eyp7m63');
    expect(upsert.status).toBe('已跟客人確認基本資料');

    const mapped = upsert.raw_payload?._mapped_fields as Record<string, string>;
    expect(mapped.order_type).toBe(WEDDING_GIFT_ORDER_TYPE);
    expect(mapped.big_day).toBe('2026-12-06');
    expect(mapped.client_delivery_date).toBe('2026-12-04');
    expect(mapped.qty_red_date).toBe('50');
    expect(mapped.bottle_capacity).toBe('45g');
    expect(mapped.payment1_amount).toBe('2095');
    expect(mapped.payment_status_label).toBe('Full Paid');
    expect(mapped.contact_method).toBe('5xxx 5xxx');
    expect(upsert.total_amount).toBe(2095);
    expect(upsert.customer_name).toBe('Jxxxxxx Cxxx & Jxx Vxxxxx');
    expect(upsert.phone).toBe('6123 4567');
  });

  it('uses confirmation parser when custom fields are empty', () => {
    const stripped: ClickUpTask = {
      ...task,
      custom_fields: [],
    };
    const upsert = mapClickUpTaskToUpsert(stripped);
    const mapped = upsert.raw_payload?._mapped_fields as Record<string, string>;
    expect(mapped.big_day).toBe('2026-12-06');
    expect(mapped.qty_red_date).toBe('50');
    expect(mapped.bottle_capacity).toBe('45g');
  });

  it('fills gaps from custom fields when confirmation text is stripped', () => {
    const stripped: ClickUpTask = {
      id: 't2',
      name: task.name,
      status: task.status,
      text_content: '',
      description: '',
      custom_fields: task.custom_fields,
    };
    const upsert = mapClickUpTaskToUpsert(stripped);
    const mapped = upsert.raw_payload?._mapped_fields as Record<string, string>;
    expect(mapped.qty_red_date).toBe('50');
    expect(mapped.payment1_amount).toBe('2095');
    expect(mapped.bottle_capacity).toBe('45g');
  });
});

describe('parseClickUpTaskName', () => {
  it('extracts big day and capacity from compact task title', () => {
    const bag = parseClickUpTaskName(task.name);
    expect(bag.fields.big_day).toBe('2026-12-06');
    expect(bag.fields.bottle_capacity).toBe('45g');
  });

  it('extracts numeric phone pairs from task title', () => {
    const bag = parseClickUpTaskName('Jane Doe 9123 4567 01012026 45ml 50樽');
    expect(bag.core.phone).toBe('9123 4567');
  });

  it('strips a leading numeric task id prefix before parsing the name', () => {
    const bag = parseClickUpTaskName('7961-Teresa 9123 4567 01012026 45ml 50樽');
    expect(bag.core.name).toBe('Teresa');
  });

  it('strips trailing symbol suffixes from the parsed name', () => {
    expect(parseClickUpTaskName('7961-Teresa- 9123 4567 01012026 45ml').core.name).toBe('Teresa');
    expect(parseClickUpTaskName('7961-Teresa (9123 4567 01012026 45ml').core.name).toBe('Teresa');
  });

  it('uses the stripped task title when confirmation and custom fields omit the name', () => {
    const upsert = mapClickUpTaskToUpsert({
      id: 't-prefix',
      name: '7961-Teresa 9123 4567 06122026 45ml 50樽',
      text_content: '',
      description: '',
      custom_fields: [],
    });
    expect(upsert.customer_name).toBe('Teresa');
  });
});

describe('parseClickUpCustomFields', () => {
  it('maps payment and contact custom fields', () => {
    const bag = parseClickUpCustomFields(task.custom_fields);
    expect(bag.fields.contact_method).toBe('5xxx 5xxx');
    expect(bag.fields.payment1_amount).toBe('2095');
    expect(bag.fields.payment_status_label).toBe('Full Paid');
  });
});
