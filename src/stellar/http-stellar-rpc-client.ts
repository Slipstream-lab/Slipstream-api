import { Injectable } from '@nestjs/common';
import { StrKey, xdr } from '@stellar/stellar-base';
import { LedgerEntry, RpcHealth, StellarRpcClient } from './stellar.interfaces';

/**
 * Real Soroban RPC client backed by `fetch` against `STELLAR_RPC_URL`.
 *
 * Uses the JSON-RPC 2.0 methods `getHealth`, `getLedgerEntries` and
 * `getTransaction`-free reading. `getContractWasm` resolves the deployed Wasm
 * in two steps: the contract instance entry (keyed by `SCV_CONTRACT_INSTANCE`)
 * yields the Wasm hash, which is then used to read the `ContractCode` entry.
 */
@Injectable()
export class HttpStellarRpcClient implements StellarRpcClient {
  constructor(
    private readonly rpcUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getHealth(): Promise<RpcHealth> {
    const result = await this.rpc<{ status: string; latestLedger: string }>('getHealth', {});
    return { status: result.status, latestLedger: Number(result.latestLedger) };
  }

  async getLedgerEntries(keyXdrs: string[]): Promise<LedgerEntry[]> {
    if (keyXdrs.length === 0) {
      return [];
    }
    const result = await this.rpc<{
      entries: { key: string; xdr: string; lastModifiedLedgerSeq: string }[];
    }>('getLedgerEntries', { keys: keyXdrs });
    return (result.entries ?? []).map((entry) => ({
      keyXdr: entry.key,
      dataXdr: entry.xdr,
      lastModifiedLedgerSeq: Number(entry.lastModifiedLedgerSeq),
    }));
  }

  async getContractWasm(contractId: string): Promise<Uint8Array> {
    const instanceKey = buildInstanceLedgerKey(contractId);
    const [instanceEntry] = await this.getLedgerEntries([instanceKey]);
    if (!instanceEntry) {
      throw new Error(`No instance ledger entry for contract ${contractId}`);
    }

    let instance: xdr.ContractDataEntry;
    try {
      instance = xdr.ContractDataEntry.fromXDR(instanceEntry.dataXdr, 'base64');
    } catch {
      throw new Error(`Could not decode instance entry for contract ${contractId}`);
    }

    const executable = instance.val().instance().executable();
    if (executable.switch().name !== 'contractExecutableWasm') {
      throw new Error(
        `Contract ${contractId} is not a Wasm contract (${executable.switch().name})`,
      );
    }

    const wasmHash = executable.wasmHash();
    const codeKey = buildCodeLedgerKey(wasmHash);
    const [codeEntry] = await this.getLedgerEntries([codeKey]);
    if (!codeEntry) {
      throw new Error(
        `No contract-code entry for Wasm hash ${Buffer.from(wasmHash).toString('hex')}`,
      );
    }

    let code: xdr.ContractCodeEntry;
    try {
      code = xdr.ContractCodeEntry.fromXDR(codeEntry.dataXdr, 'base64');
    } catch {
      throw new Error(`Could not decode contract-code entry for contract ${contractId}`);
    }
    return new Uint8Array(code.code());
  }

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method,
          params,
        }),
      });
    } catch {
      throw new Error(`Stellar RPC request failed (${this.rpcUrl})`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error(`Stellar RPC returned non-JSON response (HTTP ${response.status})`);
    }

    const payload = body as { error?: { message?: string }; result?: T };
    if (!response.ok || payload.error) {
      throw new Error(
        `Stellar RPC ${method} failed (HTTP ${response.status}): ${
          payload.error?.message ?? response.statusText
        }`,
      );
    }
    if (payload.result === undefined) {
      throw new Error(`Stellar RPC ${method} returned no result`);
    }
    return payload.result;
  }
}

/**
 * Ledger key of the contract-instance entry for a contract id. The instance
 * entry is keyed by `SCV_CONTRACT_INSTANCE` with a placeholder instance — the
 * ledger only matches on the key's type discriminator.
 */
function buildInstanceLedgerKey(contractId: string): string {
  const contractIdBytes = StrKey.decodeContract(contractId);
  const key = xdr.ScVal.scvContractInstance(
    new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
      storage: null,
    }),
  );
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(contractIdBytes),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  ).toXDR('base64');
}

/** Ledger key of a `ContractCode` entry for a Wasm hash. */
function buildCodeLedgerKey(wasmHash: Uint8Array): string {
  return xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: Buffer.from(wasmHash) }),
  ).toXDR('base64');
}
