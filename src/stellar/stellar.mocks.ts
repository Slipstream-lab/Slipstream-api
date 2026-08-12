import { Injectable } from '@nestjs/common';
import {
  HorizonTransaction,
  LedgerEntry,
  RpcHealth,
  StellarHorizonClient,
  StellarRpcClient,
  XdrDecoder,
} from './stellar.interfaces';

/**
 * Deterministic mock of {@link StellarRpcClient}. Returns canned data so the
 * app boots and tests run without any network access or credentials.
 */
@Injectable()
export class MockStellarRpcClient implements StellarRpcClient {
  getHealth(): Promise<RpcHealth> {
    return Promise.resolve({ status: 'healthy', latestLedger: 1 });
  }

  getLedgerEntries(keyXdrs: string[]): Promise<LedgerEntry[]> {
    return Promise.resolve(
      keyXdrs.map((keyXdr, i) => ({
        keyXdr,
        dataXdr: '',
        lastModifiedLedgerSeq: i + 1,
      })),
    );
  }

  getContractWasm(_contractId: string): Promise<Uint8Array> {
    // TODO: real impl fetches the deployed Wasm via Soroban RPC.
    return Promise.resolve(new Uint8Array());
  }
}

/**
 * Deterministic mock of {@link StellarHorizonClient}.
 */
@Injectable()
export class MockStellarHorizonClient implements StellarHorizonClient {
  getTransactions(account: string, limit = 10): Promise<HorizonTransaction[]> {
    return Promise.resolve(
      Array.from({ length: Math.min(limit, 3) }, (_v, i) => ({
        id: `${i + 1}`,
        hash: `mockhash${i + 1}`,
        ledger: i + 1,
        sourceAccount: account,
        successful: true,
      })),
    );
  }
}

/**
 * Mock XDR decoder. Real impl wraps `@stellar/stellar-base`; here we simply
 * echo a canonical-looking string so downstream code has a stable shape.
 */
@Injectable()
export class MockXdrDecoder implements XdrDecoder {
  decodeLedgerKey(keyXdr: string): string {
    // TODO: real impl decodes XDR; mock returns a deterministic placeholder.
    return `ledgerkey:${keyXdr.slice(0, 12)}`;
  }

  decodeContractDataKey(keyXdr: string): string {
    return `contract:MOCK:${keyXdr.slice(0, 12)}`;
  }
}
