import { Injectable } from '@nestjs/common';
import { HorizonTransaction, StellarHorizonClient } from './stellar.interfaces';

/**
 * Real Stellar Horizon client backed by `fetch` against `HORIZON_URL`.
 *
 * Currently only exposes the transaction history endpoint used for contract
 * provenance; the response is trimmed to the interface's minimal record shape.
 */
@Injectable()
export class HttpStellarHorizonClient implements StellarHorizonClient {
  constructor(
    private readonly horizonUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getTransactions(account: string, limit = 10): Promise<HorizonTransaction[]> {
    const url = `${this.horizonUrl.replace(/\/$/, '')}/accounts/${encodeURIComponent(
      account,
    )}/transactions?order=desc&limit=${limit}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new Error(`Horizon request failed (${url})`);
    }

    if (!response.ok) {
      throw new Error(`Horizon request failed (HTTP ${response.status})`);
    }

    let body: { _embedded?: { records?: Array<Record<string, unknown>> } };
    try {
      body = await response.json();
    } catch {
      throw new Error(`Horizon returned non-JSON response (HTTP ${response.status})`);
    }

    return (body._embedded?.records ?? []).map((record) => ({
      id: String(record.id ?? ''),
      hash: String(record.hash ?? ''),
      ledger: Number(record.ledger ?? 0),
      sourceAccount: String(record.source_account ?? ''),
      successful: record.successful !== false,
    }));
  }
}
