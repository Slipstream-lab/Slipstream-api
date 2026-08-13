import { HttpStellarHorizonClient } from '../../src/stellar/http-stellar-horizon-client';

const HORIZON_URL = 'https://horizon.example.test/';

function horizonFetch(response: unknown) {
  return jest.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => response,
      }) as unknown as Response,
  );
}

describe('HttpStellarHorizonClient', () => {
  describe('getTransactions()', () => {
    it('requests the account transactions endpoint and maps records', async () => {
      const fetchImpl = horizonFetch({
        _embedded: {
          records: [
            { id: 'tx1', hash: 'aaaa', ledger: 100, source_account: 'GABC', successful: true },
            { id: 'tx2', hash: 'bbbb', ledger: 99, source_account: 'GABC', successful: false },
          ],
        },
      });
      const client = new HttpStellarHorizonClient(HORIZON_URL, fetchImpl);

      await expect(client.getTransactions('GABC', 5)).resolves.toEqual([
        { id: 'tx1', hash: 'aaaa', ledger: 100, sourceAccount: 'GABC', successful: true },
        { id: 'tx2', hash: 'bbbb', ledger: 99, sourceAccount: 'GABC', successful: false },
      ]);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://horizon.example.test/accounts/GABC/transactions?order=desc&limit=5',
        expect.objectContaining({ headers: { Accept: 'application/json' } }),
      );
    });

    it('defaults the limit to 10', async () => {
      const fetchImpl = horizonFetch({ _embedded: { records: [] } });
      const client = new HttpStellarHorizonClient(HORIZON_URL, fetchImpl);

      await client.getTransactions('GABC');
      expect(fetchImpl).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.anything(),
      );
    });

    it('returns [] when no records are embedded', async () => {
      const fetchImpl = horizonFetch({ _embedded: {} });
      const client = new HttpStellarHorizonClient(HORIZON_URL, fetchImpl);

      await expect(client.getTransactions('GABC')).resolves.toEqual([]);
    });
  });

  describe('error handling', () => {
    it('throws on non-2xx responses', async () => {
      const fetchImpl = jest.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            statusText: 'Server Error',
            json: async () => ({}),
          }) as unknown as Response,
      );
      const client = new HttpStellarHorizonClient(HORIZON_URL, fetchImpl);

      await expect(client.getTransactions('GABC')).rejects.toThrow(/HTTP 500/);
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
      const client = new HttpStellarHorizonClient(HORIZON_URL, fetchImpl);

      await expect(client.getTransactions('GABC')).rejects.toThrow(/non-JSON/);
    });

    it('throws when the request itself fails', async () => {
      const fetchImpl = jest.fn(async () => {
        throw new Error('dns failure');
      });
      const client = new HttpStellarHorizonClient(HORIZON_URL, fetchImpl);

      await expect(client.getTransactions('GABC')).rejects.toThrow(/request failed/);
    });
  });
});
