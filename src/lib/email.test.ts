import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from './email';
import db from './db';
import { saveIntegrationSettings } from './integration-settings-server';

const TEST_USER_ID = 99904;

describe('sendEmail dual Resend routing', () => {
  beforeEach(async () => {
    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      'email-test@example.com',
      'hash',
      'Email Test'
    );
    await saveIntegrationSettings(TEST_USER_ID, {
      resend: {
        honour: {
          api_key: 're_honour',
          from_email: 'Honour <h@example.com>',
          order_types: ['honour訂製'],
        },
        nestiee: {
          api_key: 're_nestiee',
          from_email: 'Nestiee <n@example.com>',
          order_types: ['Nestiee 燕窩訂單'],
        },
      },
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
  });

  it('skips Cupmoka when api key is not set', async () => {
    const result = await sendEmail('a@b.com', 'subj', '<p>hi</p>', {
      userId: TEST_USER_ID,
      orderType: 'Cupmoka',
    });
    expect(result.sent).toBe(false);
    expect(result.provider).toBe('skipped');
    expect(result.brand).toBe('cupmoka');
  });

  it('sends with honour credentials for honour order type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail('a@b.com', 'subj', '<p>hi</p>', {
      userId: TEST_USER_ID,
      orderType: 'honour訂製',
    });
    expect(result.sent).toBe(true);
    expect(result.provider).toBe('resend');
    expect(result.brand).toBe('honour');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_honour' });
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe('Honour <h@example.com>');
  });

  it('skips explicit honour brand when api key missing', async () => {
    await db.prepare('DELETE FROM integration_settings WHERE user_id = ?').run(TEST_USER_ID);
    await saveIntegrationSettings(TEST_USER_ID, {
      resend: {
        honour: { from_email: 'Honour <h@example.com>', order_types: ['honour訂製'] },
        nestiee: {
          api_key: 're_nestiee',
          from_email: 'Nestiee <n@example.com>',
          order_types: ['Nestiee 燕窩訂單'],
        },
      },
    });

    const result = await sendEmail('a@b.com', 'subj', '<p>hi</p>', {
      userId: TEST_USER_ID,
      brand: 'honour',
    });
    expect(result.sent).toBe(false);
    expect(result.provider).toBe('skipped');
    expect(result.brand).toBe('honour');
  });
});
