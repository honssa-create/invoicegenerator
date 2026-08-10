import { describe, expect, it } from 'vitest';
import { saveIntegrationSettings, getIntegrationSettingsMasked } from './integration-settings-server';
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
});
