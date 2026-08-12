/**
 * Stellar integration layer — INTERFACES + MOCKS ONLY.
 *
 * Real network access to Stellar RPC / Horizon is intentionally out of scope
 * for this foundation. We define clean, testable interfaces here and provide
 * deterministic mock implementations. No credentials or endpoints are
 * hardcoded; production implementations must read them from config
 * (STELLAR_RPC_URL, HORIZON_URL, STELLAR_NETWORK_PASSPHRASE).
 */

/** A minimal view of a ledger entry retrieved from Soroban RPC. */
export interface LedgerEntry {
  /** Base64 XDR of the ledger key. */
  keyXdr: string;
  /** Base64 XDR of the ledger entry data. */
  dataXdr: string;
  /** Ledger sequence at which this entry was last modified. */
  lastModifiedLedgerSeq: number;
}

/** Health/liveness info returned by an RPC node. */
export interface RpcHealth {
  status: string;
  latestLedger: number;
}

/**
 * Soroban RPC client abstraction. Production impl talks to `STELLAR_RPC_URL`;
 * {@link MockStellarRpcClient} returns canned data for tests.
 */
export const STELLAR_RPC_CLIENT = Symbol('STELLAR_RPC_CLIENT');

export interface StellarRpcClient {
  getHealth(): Promise<RpcHealth>;
  /** Fetch ledger entries by their base64-XDR keys. */
  getLedgerEntries(keyXdrs: string[]): Promise<LedgerEntry[]>;
  /** Fetch the deployed Wasm for a contract id, as raw bytes. */
  getContractWasm(contractId: string): Promise<Uint8Array>;
}

/** A minimal Horizon transaction record. */
export interface HorizonTransaction {
  id: string;
  hash: string;
  ledger: number;
  sourceAccount: string;
  successful: boolean;
}

/**
 * Horizon client abstraction. Production impl talks to `HORIZON_URL`.
 */
export const STELLAR_HORIZON_CLIENT = Symbol('STELLAR_HORIZON_CLIENT');

export interface StellarHorizonClient {
  /** Fetch recent transactions for a contract/account, newest first. */
  getTransactions(account: string, limit?: number): Promise<HorizonTransaction[]>;
}

/**
 * XDR decoding abstraction. slipstream-core deliberately does NOT couple to a
 * specific XDR codec — the API layer is responsible for decoding XDR ledger
 * keys into the canonical string form the engine understands
 * (e.g. `contract:C...:key`). A production impl would wrap `@stellar/stellar-base`.
 */
export const XDR_DECODER = Symbol('XDR_DECODER');

export interface XdrDecoder {
  /** Decode a base64-XDR ledger key into its canonical string form. */
  decodeLedgerKey(keyXdr: string): string;
  /** Decode a base64-XDR contract-data key into `contract:<id>:<key>`. */
  decodeContractDataKey(keyXdr: string): string;
}
