import axios from 'axios';

const ETHERSCAN_URL = 'https://api.etherscan.io/v2/api';
const lower = value => String(value || '').toLowerCase();
const retryableProviderCode = code => ['unavailable', 'timeout', 'provider_error'].includes(code);
async function retryOnce(operation) {
  let firstError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      firstError = error;
      if (attempt || !retryableProviderCode(error?.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 180));
    }
  }
  throw firstError;
}

export class ProviderError extends Error {
  constructor(provider, code, message, cause = null) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.cause = cause;
  }
}

function parseInteger(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = typeof value === 'string' && value.startsWith('0x')
    ? Number.parseInt(value.slice(2), 16)
    : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rawToDecimal(rawValue, decimals) {
  try {
    const raw = typeof rawValue === 'string' && rawValue.startsWith('0x')
      ? BigInt(rawValue)
      : BigInt(String(rawValue || '0'));
    const precision = Math.max(0, Number(decimals) || 0);
    if (!precision) return raw.toString();
    const base = 10n ** BigInt(precision);
    const whole = raw / base;
    const fraction = (raw % base).toString().padStart(precision, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch {
    return '0';
  }
}

function displayTimestamp(value) {
  if (!value) return null;
  const numeric = /^\d+$/.test(String(value)) ? Number(value) * 1000 : value;
  const date = new Date(numeric);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function createNormalizedTransaction({
  wallet, hash, from, to, blockNumber, timestamp, rawAmount, decimals,
  asset, tokenAddress = null, transactionType, provider, status = 'success',
  assetName = null, amountOverride = null, identifyExchange = () => null
}) {
  if (!hash || !from || !to) return null;
  const direction = lower(from) === lower(wallet) ? 'OUT' : 'IN';
  const counterparty = direction === 'OUT' ? to : from;
  const decimalAmount = amountOverride ?? rawToDecimal(rawAmount, decimals);
  const amount = Number(decimalAmount);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const isToken = transactionType === 'ERC20_TRANSFER';
  return {
    chain_id: 1,
    chain_name: 'ethereum',
    chain: 'ethereum',
    blockchain: 'ethereum',
    tx_hash: hash,
    transaction_hash: hash,
    hash,
    block_number: blockNumber,
    timestamp: timestamp || null,
    sender: from,
    receiver: to,
    from,
    to,
    amount: safeAmount,
    raw_amount: String(rawAmount ?? '0'),
    display_amount: safeAmount,
    asset: asset || (isToken ? 'UNKNOWN' : 'ETH'),
    asset_type: isToken ? 'token' : 'native',
    token_address: isToken ? tokenAddress : null,
    token_contract: isToken ? tokenAddress : null,
    token_symbol: asset || (isToken ? 'UNKNOWN' : 'ETH'),
    token_decimals: Number(decimals) || 0,
    decimals: Number(decimals) || 0,
    transaction_type: transactionType,
    type: transactionType,
    provider,
    status,
    direction,
    counterparty,
    exchange: identifyExchange(counterparty),
    wallet,
    value: safeAmount,
    display_value: safeAmount,
    asset_name: assetName || asset || (isToken ? 'UNKNOWN' : 'Ethereum'),
    token_name: isToken ? (assetName || asset || 'UNKNOWN') : undefined
  };
}

export function normalizeAlchemyTransfer(raw, wallet, identifyExchange = () => null) {
  const category = lower(raw?.category);
  const isToken = category === 'erc20';
  const transactionType = isToken ? 'ERC20_TRANSFER' : category === 'internal' ? 'internal' : 'normal';
  const decimals = isToken ? parseInteger(raw?.rawContract?.decimal, 0) : 18;
  const rawValue = raw?.rawContract?.value;
  let rawAmount = rawValue ?? '0';
  let amountOverride = null;

  if ((rawValue === null || rawValue === undefined) && raw?.value !== null && raw?.value !== undefined) {
    amountOverride = String(raw.value);
    try {
      rawAmount = BigInt(Math.round(Number(raw.value) * (10 ** decimals))).toString();
    } catch {
      rawAmount = '0';
    }
  }

  return createNormalizedTransaction({
    wallet,
    hash: raw?.hash || raw?.uniqueId,
    from: raw?.from,
    to: raw?.to,
    blockNumber: parseInteger(raw?.blockNum, raw?.blockNum || null),
    timestamp: displayTimestamp(raw?.metadata?.blockTimestamp),
    rawAmount,
    decimals,
    asset: isToken ? (raw?.asset || 'UNKNOWN') : 'ETH',
    tokenAddress: isToken ? (raw?.rawContract?.address || null) : null,
    transactionType,
    provider: 'alchemy',
    assetName: raw?.asset,
    amountOverride,
    identifyExchange
  });
}

export function normalizeEtherscanTransaction(raw, wallet, type, identifyExchange = () => null) {
  const isToken = type === 'ERC20_TRANSFER';
  const decimals = isToken ? parseInteger(raw?.tokenDecimal ?? raw?.decimals, 0) : 18;
  return createNormalizedTransaction({
    wallet,
    hash: raw?.hash || raw?.transactionHash,
    from: raw?.from,
    to: raw?.to,
    blockNumber: parseInteger(raw?.blockNumber, raw?.blockNumber || null),
    timestamp: displayTimestamp(raw?.timeStamp || raw?.timestamp),
    rawAmount: raw?.value || '0',
    decimals,
    asset: isToken ? (raw?.tokenSymbol || raw?.symbol || 'UNKNOWN') : 'ETH',
    tokenAddress: isToken ? (raw?.contractAddress || null) : null,
    transactionType: type,
    provider: 'etherscan',
    status: String(raw?.isError || '0') === '1' ? 'failed' : 'success',
    assetName: isToken ? (raw?.tokenName || raw?.tokenSymbol) : 'Ethereum',
    identifyExchange
  });
}

function uniqueTransactions(transactions, limit) {
  const unique = new Map();
  for (const transaction of transactions.filter(Boolean)) {
    const key = [
      lower(transaction.hash), lower(transaction.from), lower(transaction.to),
      lower(transaction.token_contract), transaction.raw_amount, transaction.type
    ].join('|');
    if (!unique.has(key)) unique.set(key, transaction);
  }
  return [...unique.values()]
    .sort((a, b) => (Number(b.block_number) || 0) - (Number(a.block_number) || 0))
    .slice(0, limit);
}

export class AlchemyProvider {
  constructor({ rpcUrl, client = axios, identifyExchange = () => null, timeoutMs = 20000 } = {}) {
    this.name = 'alchemy';
    this.rpcUrl = rpcUrl;
    this.client = client;
    this.identifyExchange = identifyExchange;
    this.timeoutMs = timeoutMs;
  }

  get configured() { return Boolean(this.rpcUrl); }

  async rpc(method, params) {
    return retryOnce(async () => {
      try {
      const { data, status } = await this.client.post(this.rpcUrl, {
        jsonrpc: '2.0', id: 1, method, params
      }, { timeout: this.timeoutMs, headers: { 'content-type': 'application/json' } });
      if (status >= 400 || data?.error) {
        const errorCode = data?.error?.code;
        const code = errorCode === -32600 || errorCode === -32602 ? 'invalid_request' : 'provider_error';
        throw new ProviderError(this.name, code, data?.error?.message || 'Alchemy request failed');
      }
      return data?.result;
      } catch (error) {
      if (error instanceof ProviderError) throw error;
      const status = error?.response?.status;
      const code = status === 401 || status === 403 ? 'authentication' : status === 429 ? 'rate_limit' : error?.code === 'ECONNABORTED' ? 'timeout' : 'unavailable';
      throw new ProviderError(this.name, code, `Alchemy ${code.replace('_', ' ')}`, error);
      }
    });
  }

  async fetchTransactions(wallet, limit = 100) {
    if (!this.configured) throw new ProviderError(this.name, 'not_configured', 'Alchemy is not configured');
    const shared = {
      fromBlock: '0x0', toBlock: 'latest', category: ['external', 'internal', 'erc20'],
      withMetadata: true, excludeZeroValue: false, maxCount: `0x${Math.min(limit, 1000).toString(16)}`, order: 'desc'
    };
    const [outgoing, incoming] = await Promise.all([
      this.rpc('alchemy_getAssetTransfers', [{ ...shared, fromAddress: wallet }]),
      this.rpc('alchemy_getAssetTransfers', [{ ...shared, toAddress: wallet }])
    ]);
    const transfers = [...(outgoing?.transfers || []), ...(incoming?.transfers || [])];
    return uniqueTransactions(transfers.map(item => normalizeAlchemyTransfer(item, wallet, this.identifyExchange)), limit);
  }
}

export class EtherscanProvider {
  constructor({ apiKey, client = axios, identifyExchange = () => null, timeoutMs = 20000 } = {}) {
    this.name = 'etherscan';
    this.apiKey = apiKey;
    this.client = client;
    this.identifyExchange = identifyExchange;
    this.timeoutMs = timeoutMs;
  }

  get configured() { return Boolean(this.apiKey); }

  async fetchAction(action, wallet, limit) {
    return retryOnce(async () => {
      try {
      const { data } = await this.client.get(ETHERSCAN_URL, {
        timeout: this.timeoutMs,
        params: { chainid: 1, module: 'account', action, address: wallet, startblock: 0, endblock: 999999999, page: 1, offset: limit, sort: 'desc', apikey: this.apiKey }
      });
      if (data?.status === '1' && Array.isArray(data.result)) return data.result;
      const message = String(data?.result || data?.message || 'Etherscan request failed');
      if (/no transactions found/i.test(message)) return [];
      const code = /invalid api key|missing api key/i.test(message) ? 'authentication' : /rate limit|max rate/i.test(message) ? 'rate_limit' : 'provider_error';
      throw new ProviderError(this.name, code, `Etherscan ${code.replace('_', ' ')}`);
      } catch (error) {
      if (error instanceof ProviderError) throw error;
      const status = error?.response?.status;
      const code = status === 401 || status === 403 ? 'authentication' : status === 429 ? 'rate_limit' : error?.code === 'ECONNABORTED' ? 'timeout' : 'unavailable';
      throw new ProviderError(this.name, code, `Etherscan ${code.replace('_', ' ')}`, error);
      }
    });
  }

  async fetchTransactions(wallet, limit = 100) {
    if (!this.configured) throw new ProviderError(this.name, 'not_configured', 'Etherscan is not configured');
    const [normal, internal, tokens] = await Promise.all([
      this.fetchAction('txlist', wallet, limit),
      this.fetchAction('txlistinternal', wallet, limit),
      this.fetchAction('tokentx', wallet, limit)
    ]);
    return uniqueTransactions([
      ...normal.map(tx => normalizeEtherscanTransaction(tx, wallet, 'normal', this.identifyExchange)),
      ...internal.filter(tx => String(tx.isError || '0') !== '1').map(tx => normalizeEtherscanTransaction(tx, wallet, 'internal', this.identifyExchange)),
      ...tokens.map(tx => normalizeEtherscanTransaction(tx, wallet, 'ERC20_TRANSFER', this.identifyExchange))
    ], limit);
  }
}

export class BlockchainProviderService {
  constructor({ alchemy, etherscan, logger = console } = {}) {
    this.alchemy = alchemy;
    this.etherscan = etherscan;
    this.logger = logger;
    this.alchemyDisabledReason = null;
    this.providersUsed = new Set();
    this.fallbackUsed = false;
  }

  get configured() { return Boolean(this.alchemy?.configured || this.etherscan?.configured); }

  async fetchTransactions(wallet, limit = 100) {
    if (this.alchemy?.configured && !this.alchemyDisabledReason) {
      try {
        const transactions = await this.alchemy.fetchTransactions(wallet, limit);
        this.providersUsed.add('alchemy');
        this.logger.info?.('Blockchain provider: Alchemy');
        return transactions;
      } catch (error) {
        this.alchemyDisabledReason = error?.code || 'unavailable';
        this.logger.warn?.('Alchemy unavailable; attempting Etherscan fallback.');
      }
    }
    if (this.etherscan?.configured) {
      const transactions = await this.etherscan.fetchTransactions(wallet, limit);
      this.providersUsed.add('etherscan');
      this.fallbackUsed = true;
      this.logger.info?.('Blockchain provider: Etherscan fallback');
      return transactions;
    }
    if (this.alchemyDisabledReason) {
      throw new ProviderError('blockchain', 'all_providers_failed', 'Alchemy failed and Etherscan fallback is not configured');
    }
    throw new ProviderError('blockchain', 'not_configured', 'No blockchain provider is configured');
  }

  summary() {
    const providers = [...this.providersUsed];
    return {
      primary: 'alchemy',
      selected: providers.length === 1 ? providers[0] : providers.length ? 'mixed' : null,
      providers_used: providers,
      fallback_used: this.fallbackUsed,
      alchemy_status: this.alchemyDisabledReason ? 'unavailable' : this.alchemy?.configured ? 'available' : 'not_configured',
      fallback: this.etherscan?.configured ? 'etherscan' : null
    };
  }
}

export function createBlockchainService({ env = process.env, client = axios, identifyExchange = () => null, logger = console } = {}) {
  return new BlockchainProviderService({
    alchemy: new AlchemyProvider({ rpcUrl: env.ALCHEMY_RPC_URL, client, identifyExchange }),
    etherscan: new EtherscanProvider({ apiKey: env.ETHERSCAN_API_KEY, client, identifyExchange }),
    logger
  });
}
