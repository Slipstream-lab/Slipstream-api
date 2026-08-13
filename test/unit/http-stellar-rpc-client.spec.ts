import { StrKey, xdr } from '@stellar/stellar-base';
import { HttpStellarRpcClient } from '../../src/stellar/http-stellar-rpc-client';

const RPC_URL = 'https://rpc.example.test';

const CONTRACT_BYTES: Buffer = Buffer.alloc(32, 3);
const CONTRACT_ID = StrKey.encodeContract(CONTRACT_BYTES);
const WASM_HASH: Buffer = Buffer.alloc(32, 7);
const WASM_BYTES: Buffer = Buffer.from([1, 2, 3, 4, 5]);

function extPoint(): xdr.ExtensionPoint {
  return new (xdr.ExtensionPoint as unknown as new (value: number) => xdr.ExtensionPoint)(0);
}

function codeEntryExt(): xdr.ContractCodeEntryExt {
  return new (
    xdr.ContractCodeEntryExt as unknown as new (value: number) => xdr.ContractCodeEntryExt
  )(0);
}

function instanceEntryXdr(): string {
  return new xdr.ContractDataEntry({
    ext: extPoint(),
    contract: xdr.ScAddress.scAddressTypeContract(CONTRACT_BYTES),
    key: xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
        storage: null,
      }),
    ),
    durability: xdr.ContractDataDurability.persistent(),
    val: xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableWasm(WASM_HASH),
        storage: [],
      }),
    ),
  }).toXDR('base64');
}

function codeEntryXdr(): string {
  return new xdr.ContractCodeEntry({
    ext: codeEntryExt(),
    hash: WASM_HASH,
    code: WASM_BYTES,
  }).toXDR('base64');
}

function stellarAssetInstanceEntryXdr(): string {
  return new xdr.ContractDataEntry({
    ext: extPoint(),
    contract: xdr.ScAddress.scAddressTypeContract(CONTRACT_BYTES),
    key: xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
        storage: null,
      }),
    ),
    durability: xdr.ContractDataDurability.persistent(),
    val: xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
        storage: null,
      }),
    ),
  }).toXDR('base64');
}

/** A fetch impl that routes getLedgerEntries by the requested key. */
function jsonRpcFetch(handlers: Record<string, (params: unknown) => unknown>) {
  return jest.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const handler = handlers[body.method as string];
    const result = handler ? handler(body.params) : undefined;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', id: body.id, result }),
    } as unknown as Response;
  });
}

describe('HttpStellarRpcClient', () => {
  describe('getHealth()', () => {
    it('maps the RPC health response', async () => {
      const fetchImpl = jsonRpcFetch({
        getHealth: () => ({ status: 'healthy', latestLedger: '128' }),
      });
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getHealth()).resolves.toEqual({
        status: 'healthy',
        latestLedger: 128,
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        RPC_URL,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });

  describe('getLedgerEntries()', () => {
    it('maps entries and coerces lastModifiedLedgerSeq to a number', async () => {
      const keyXdr = 'K0000000000=';
      const fetchImpl = jsonRpcFetch({
        getLedgerEntries: () => ({
          entries: [{ key: keyXdr, xdr: 'D0000000000=', lastModifiedLedgerSeq: '99' }],
        }),
      });
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getLedgerEntries([keyXdr])).resolves.toEqual([
        { keyXdr, dataXdr: 'D0000000000=', lastModifiedLedgerSeq: 99 },
      ]);
    });

    it('returns [] for empty keys and skips the request', async () => {
      const fetchImpl = jest.fn();
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getLedgerEntries([])).resolves.toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('getContractWasm()', () => {
    it('resolves the deployed wasm via instance + code entries', async () => {
      const fetchImpl = jsonRpcFetch({
        getLedgerEntries: (params) => {
          const keys = (params as { keys: string[] }).keys;
          const keyName = xdr.LedgerKey.fromXDR(keys[0], 'base64').switch().name;
          const xdrData = keyName === 'contractData' ? instanceEntryXdr() : codeEntryXdr();
          return { entries: [{ key: keys[0], xdr: xdrData, lastModifiedLedgerSeq: '10' }] };
        },
      });
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      const wasm = await client.getContractWasm(CONTRACT_ID);

      expect(Array.from(wasm)).toEqual(Array.from(WASM_BYTES));
      // two-step lookup: instance key + code key
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('throws when no instance entry exists', async () => {
      const fetchImpl = jsonRpcFetch({
        getLedgerEntries: () => ({ entries: [] }),
      });
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getContractWasm(CONTRACT_ID)).rejects.toThrow(/No instance ledger entry/);
    });

    it('throws when the contract is not a wasm contract', async () => {
      const fetchImpl = jsonRpcFetch({
        getLedgerEntries: () => ({
          entries: [{ key: 'k', xdr: stellarAssetInstanceEntryXdr(), lastModifiedLedgerSeq: '10' }],
        }),
      });
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getContractWasm(CONTRACT_ID)).rejects.toThrow(/not a Wasm contract/);
    });
  });

  describe('error handling', () => {
    it('surfaces JSON-RPC errors', async () => {
      const fetchImpl = jest.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -32601, message: 'Method not found' },
            }),
          }) as unknown as Response,
      );
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getHealth()).rejects.toThrow(/Method not found/);
    });

    it('throws on non-JSON responses', async () => {
      const fetchImpl = jest.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => {
              throw new Error('bad json');
            },
          }) as unknown as Response,
      );
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getHealth()).rejects.toThrow(/non-JSON/);
    });

    it('throws when the request itself fails', async () => {
      const fetchImpl = jest.fn(async () => {
        throw new Error('network down');
      });
      const client = new HttpStellarRpcClient(RPC_URL, fetchImpl);

      await expect(client.getHealth()).rejects.toThrow(/request failed/);
    });
  });
});
