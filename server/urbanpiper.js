import { timingSafeEqual } from 'node:crypto';

let fetchImpl = globalThis.fetch;

export function setChannelFetch(fn) {
  fetchImpl = fn;
}

export function urbanpiperConfig() {
  const username = process.env.URBANPIPER_API_USERNAME || '';
  const apiKey = process.env.URBANPIPER_API_KEY || '';
  const bizId = process.env.URBANPIPER_BIZ_ID || '';
  const webhookToken = process.env.URBANPIPER_WEBHOOK_TOKEN || '';
  const baseUrl = (process.env.URBANPIPER_BASE_URL || 'https://pos-int.urbanpiper.com').replace(/\/$/, '');
  const configured = Boolean(username && apiKey && bizId && webhookToken);
  return {
    configured,
    baseUrl,
    environment: /pos-int\.urbanpiper\.com$/i.test(baseUrl) ? 'test' : 'production',
    usernameHint: username ? `${username.slice(0, 2)}…` : '',
    username,
    apiKey,
    bizId,
    webhookToken,
  };
}

export function webhookAuthorized(header) {
  const expected = urbanpiperConfig().webhookToken;
  const received = String(header || '');
  if (!expected || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function headers() {
  const config = urbanpiperConfig();
  return {
    Authorization: `apikey ${config.username}:${config.apiKey}`,
    'X-UPR-Biz-Id': config.bizId,
    'content-type': 'application/json',
  };
}

export async function validateUrbanpiper() {
  const config = urbanpiperConfig();
  if (!config.configured) {
    return { ok: false, code: 'not_configured', message: 'UrbanPiper credentials are not set on the server.' };
  }
  try {
    const response = await fetchImpl(`${config.baseUrl}/external/api/v1/webhooks/`, { headers: headers() });
    if (response.status === 200) return { ok: true, code: 'ok', message: 'UrbanPiper accepted the API key.' };
    if (response.status === 401) return { ok: false, code: 'unauthorized', message: 'UrbanPiper rejected the API key.' };
    if (response.status === 429) return { ok: false, code: 'rate_limited', message: 'UrbanPiper rate-limited the connection check.' };
    return { ok: false, code: 'http_error', message: `UrbanPiper returned HTTP ${response.status}.` };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { ok: false, code: timedOut ? 'timeout' : 'network', message: timedOut ? 'UrbanPiper did not respond in time.' : 'UrbanPiper could not be reached.' };
  }
}

export async function pushOrderStatus(orderId, body) {
  const config = urbanpiperConfig();
  if (!config.configured) {
    return { outcome: 'not_configured', message: 'UrbanPiper credentials are not set, so the status was not sent.' };
  }
  try {
    const response = await fetchImpl(`${config.baseUrl}/external/api/v1/orders/${encodeURIComponent(orderId)}/status/`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    let parsed = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }
    if (response.status === 429) return { outcome: 'rate_limited', message: 'UrbanPiper rate-limited this status update.', errCode: parsed.err_code || null };
    if (response.status >= 200 && response.status < 300) return { outcome: 'confirmed', message: parsed.message || 'UrbanPiper accepted the status.', errCode: parsed.err_code || null };
    return { outcome: 'rejected', message: parsed.message || `UrbanPiper returned HTTP ${response.status}.`, errCode: parsed.err_code || null };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { outcome: timedOut ? 'timeout' : 'network', message: timedOut ? 'UrbanPiper did not respond. The result was not retried.' : 'UrbanPiper could not be reached.' };
  }
}
