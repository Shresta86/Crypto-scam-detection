import axios from 'axios';

const CHAINABUSE_URL = 'https://api.chainabuse.com/v0/reports';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractReports(payload) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.reports, payload?.content, payload?.data, payload?.items, payload?.results]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function reportCategory(report) {
  const value = report?.category ?? report?.scamCategory ?? report?.scam_category ?? report?.type;
  if (typeof value === 'string') return value;
  return value?.name || value?.label || value?.value || null;
}

function reportConfidence(report) {
  const value = report?.confidence ?? report?.confidenceScore ?? report?.confidence_score;
  if (value === null || value === undefined) return null;
  return typeof value === 'object' ? (value.score ?? value.value ?? value.label ?? null) : value;
}

export function normalizeChainabuseResponse(payload, address, checkedAt = new Date()) {
  const reports = extractReports(payload).map(report => ({
    id: report?.id ?? report?.reportId ?? report?._id ?? null,
    category: reportCategory(report),
    confidence: reportConfidence(report),
    checked: report?.checked ?? report?.verified ?? null,
    trusted: report?.trusted ?? null,
    created_at: report?.createdAt ?? report?.created_at ?? report?.reportedAt ?? null,
    description: report?.description ? String(report.description).slice(0, 1000) : null
  }));
  const categories = [...new Set(reports.map(report => report.category).filter(Boolean))];
  const confidences = reports.map(report => report.confidence).filter(value => value !== null);
  const declaredCount = payload?.totalNumberOfReports ?? payload?.totalElements ?? payload?.total ?? payload?.count;
  return {
    source: 'chainabuse',
    status: 'available',
    address,
    report_count: Number.isFinite(Number(declaredCount)) ? Number(declaredCount) : reports.length,
    categories,
    reports,
    confidence: confidences.length ? confidences : null,
    last_checked: checkedAt.toISOString(),
    cached: false
  };
}

function publicErrorStatus(error) {
  const status = error?.response?.status;
  if (status === 401 || status === 403) return { code: 'authentication', message: 'Chainabuse authentication failed' };
  if (status === 429) return { code: 'rate_limit', message: 'Chainabuse quota or rate limit reached' };
  if (error?.code === 'ECONNABORTED') return { code: 'timeout', message: 'Chainabuse request timed out' };
  return { code: 'unavailable', message: 'Chainabuse is temporarily unavailable' };
}

export class ChainabuseService {
  constructor({ apiKey, CacheModel, client = axios, ttlHours = 168, failureTtlMinutes = 60, timeoutMs = 30000 } = {}) {
    this.apiKey = apiKey;
    this.CacheModel = CacheModel;
    this.client = client;
    this.ttlMs = Math.max(1, Number(ttlHours) || 168) * 60 * 60 * 1000;
    this.failureTtlMs = Math.max(1, Number(failureTtlMinutes) || 60) * 60 * 1000;
    this.timeoutMs = timeoutMs;
  }

  async cached(address, chain) {
    if (!this.CacheModel) return null;
    const item = await this.CacheModel.findOne({ address: address.toLowerCase(), chain, provider: 'chainabuse' }).lean();
    if (!item || new Date(item.expires_at).valueOf() <= Date.now()) return null;
    return { ...item.data, cached: true, cache_expires_at: new Date(item.expires_at).toISOString() };
  }

  async store(address, chain, data, ttlMs) {
    if (!this.CacheModel) return;
    const checkedAt = new Date();
    await this.CacheModel.findOneAndUpdate(
      { address: address.toLowerCase(), chain, provider: 'chainabuse' },
      { data, status: data.status, checked_at: checkedAt, expires_at: new Date(checkedAt.valueOf() + ttlMs) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async screenAddress(address, chain = 'ethereum') {
    const cached = await this.cached(address, chain);
    if (cached) return cached;
    if (!this.apiKey) {
      return { source: 'chainabuse', status: 'not_configured', address, report_count: 0, categories: [], reports: [], confidence: null, last_checked: null, cached: false };
    }

    try {
      const checkedAt = new Date();
      const { data } = await this.client.get(CHAINABUSE_URL, {
        timeout: this.timeoutMs,
        auth: { username: this.apiKey, password: this.apiKey },
        headers: { accept: 'application/json' },
        params: { address, page: 1, perPage: 50 }
      });
      const normalized = normalizeChainabuseResponse(data, address, checkedAt);
      await this.store(address, chain, normalized, this.ttlMs);
      return normalized;
    } catch (error) {
      const publicError = publicErrorStatus(error);
      const data = {
        source: 'chainabuse', status: 'unavailable', error: publicError,
        address, report_count: 0, categories: [], reports: [], confidence: null,
        last_checked: new Date().toISOString(), cached: false
      };
      await this.store(address, chain, data, this.failureTtlMs);
      return data;
    }
  }
}

export function createChainabuseService({ env = process.env, CacheModel, client = axios } = {}) {
  return new ChainabuseService({
    apiKey: env.CHAINABUSE_API_KEY,
    CacheModel,
    client,
    ttlHours: env.CHAINABUSE_CACHE_TTL_HOURS || 168,
    failureTtlMinutes: env.CHAINABUSE_FAILURE_CACHE_MINUTES || 60
  });
}

export { extractReports, asArray };
