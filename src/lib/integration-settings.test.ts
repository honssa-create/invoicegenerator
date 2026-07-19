import { describe, expect, it } from 'vitest';
import { saveIntegrationSettings } from './integration-settings-server';
import db from './db';

const TEST_USER_ID = 99901;

describe('integration settings', () => {
  it('saves and merges woocommerce credentials without clearing secrets', () => {
    db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      'integration-test@example.com',
      'hash',
      'Integration Test'
    );

    saveIntegrationSettings(TEST_USER_ID, {
      woocommerce: {
        nestiee: { url: 'https://nestiee.com.hk', key: 'ck_test1234', secret: 'cs_secret5678' },
      },
    });

    saveIntegrationSettings(TEST_USER_ID, {
      woocommerce: {
        nestiee: { url: 'https://nestiee.com.hk', key: 'ck_updated' },
      },
    });

    const row = db
      .prepare('SELECT settings_json FROM integration_settings WHERE user_id = ?')
      .get(TEST_USER_ID) as { settings_json: string };
    const parsed = JSON.parse(row.settings_json);
    expect(parsed.woocommerce.nestiee.key).toBe('ck_updated');
    expect(parsed.woocommerce.nestiee.secret).toBe('cs_secret5678');

    db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  });
});
