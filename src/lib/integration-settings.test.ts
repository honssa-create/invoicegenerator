import { describe, expect, it } from 'vitest';
import {
  saveIntegrationSettings,
  getIntegrationSettingsMasked,
  getIntegrationSettings,
  resolveResendBrandForOrderType,
} from './integration-settings-server';
import { SF_EXPRESS_DEFAULT_PRINT_TEMPLATE } from './integration-settings';
import db from './db';

const TEST_USER_ID = 99901;

describe('integration settings', () => {
  it('saves and merges woocommerce credentials without clearing secrets', async () => {
    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      'integration-test@example.com',
      'hash',
      'Integration Test'
    );

    await saveIntegrationSettings(TEST_USER_ID, {
      woocommerce: {
        nestiee: { url: 'https://nestiee.com.hk', key: 'ck_test1234', secret: 'cs_secret5678' },
      },
    });

    await saveIntegrationSettings(TEST_USER_ID, {
      woocommerce: {
        nestiee: { url: 'https://nestiee.com.hk', key: 'ck_updated' },
      },
    });

    const row = (await db
      .prepare('SELECT settings_json FROM integration_settings WHERE user_id = ?')
      .get(TEST_USER_ID)) as { settings_json: string };
    const parsed = JSON.parse(row.settings_json);
    expect(parsed.woocommerce.nestiee.key).toBe('ck_updated');
    expect(parsed.woocommerce.nestiee.secret).toBe('cs_secret5678');

    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  });

  it('saves SF Express settings and masks checkword', async () => {
    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      'integration-test@example.com',
      'hash',
      'Integration Test'
    );

    await saveIntegrationSettings(TEST_USER_ID, {
      sf_express: {
        partner_id: 'PARTNER1',
        checkword: 'secretcheck',
        monthly_card: '7550000000',
        environment: 'sandbox',
        sender_company: 'Honour Co',
        sender_contact: 'Ops',
        sender_tel: '21234567',
        sender_address: 'Kowloon',
      },
    });

    // Blank checkword keeps previous secret
    await saveIntegrationSettings(TEST_USER_ID, {
      sf_express: {
        partner_id: 'PARTNER1',
        monthly_card: '7550000001',
      },
    });

    const masked = await getIntegrationSettingsMasked(TEST_USER_ID);
    expect(masked.sf_express.partner_id).toBe('PARTNER1');
    expect(masked.sf_express.monthly_card).toBe('7550000001');
    expect(masked.sf_express.checkword_set).toBe(true);
    expect(masked.sf_express.checkword_hint).toMatch(/••••/);
    expect(masked.sf_express.print_template_code).toBe(SF_EXPRESS_DEFAULT_PRINT_TEMPLATE);
    expect(masked.sf_express.sender_company).toBe('Honour Co');

    const row = (await db
      .prepare('SELECT settings_json FROM integration_settings WHERE user_id = ?')
      .get(TEST_USER_ID)) as { settings_json: string };
    const parsed = JSON.parse(row.settings_json);
    expect(parsed.sf_express.checkword).toBe('secretcheck');

    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  });

  it('saves Resend brands, masks api keys, and resolves order types', async () => {
    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      'integration-test@example.com',
      'hash',
      'Integration Test'
    );

    await saveIntegrationSettings(TEST_USER_ID, {
      resend: {
        honour: {
          api_key: 're_honour_secret',
          from_email: 'Honour <billing@honour.com.hk>',
          order_types: ['honour訂製', 'honour en訂製'],
        },
        nestiee: {
          api_key: 're_nestiee_secret',
          from_email: 'Nestiee <hello@nestiee.com.hk>',
          order_types: ['Nestiee 燕窩訂單', '燕窩回禮燉製'],
        },
      },
    });

    const masked = await getIntegrationSettingsMasked(TEST_USER_ID);
    expect(masked.resend.honour.api_key_set).toBe(true);
    expect(masked.resend.honour.api_key_hint).toMatch(/••••/);
    expect(masked.resend.honour.from_email).toBe('Honour <billing@honour.com.hk>');
    expect(masked.resend.nestiee.order_types).toContain('Nestiee 燕窩訂單');

    // Blank api_key keeps previous
    await saveIntegrationSettings(TEST_USER_ID, {
      resend: {
        honour: { from_email: 'Honour <ops@honour.com.hk>' },
      },
    });
    const settings = await getIntegrationSettings(TEST_USER_ID);
    expect(settings.resend.honour.api_key).toBe('re_honour_secret');
    expect(settings.resend.honour.from_email).toBe('Honour <ops@honour.com.hk>');

    expect(await resolveResendBrandForOrderType(TEST_USER_ID, 'honour訂製')).toBe('honour');
    expect(await resolveResendBrandForOrderType(TEST_USER_ID, '燕窩回禮燉製')).toBe('nestiee');
    expect(await resolveResendBrandForOrderType(TEST_USER_ID, 'Cupmoka')).toBe('cupmoka');
    expect(await resolveResendBrandForOrderType(TEST_USER_ID, '')).toBeNull();

    // Moving an order type to another brand strips it from the previous brand
    await saveIntegrationSettings(TEST_USER_ID, {
      resend: {
        nestiee: {
          order_types: ['Nestiee 燕窩訂單', '燕窩回禮燉製', 'honour訂製'],
        },
      },
    });
    const afterMove = await getIntegrationSettings(TEST_USER_ID);
    expect(afterMove.resend.nestiee.order_types).toContain('honour訂製');
    expect(afterMove.resend.honour.order_types).not.toContain('honour訂製');
    expect(await resolveResendBrandForOrderType(TEST_USER_ID, 'honour訂製')).toBe('nestiee');

    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  });
});
