import { StrKey, xdr } from '@stellar/stellar-base';
import { StellarBaseXdrDecoder } from '../../src/stellar/stellar-base-xdr-decoder';

const decoder = new StellarBaseXdrDecoder();

const CONTRACT_BYTES: Buffer = Buffer.alloc(32, 7);
const CONTRACT_ID = StrKey.encodeContract(CONTRACT_BYTES);

// `xdr.AccountId` exists at runtime but is a type alias (PublicKey) in the
// SDK type declarations; cast to its real class shape for test fixtures.
const accountIdOf = (bytes: Buffer): xdr.AccountId =>
  (
    xdr as unknown as {
      AccountId: { publicKeyTypeEd25519(value: Buffer): xdr.AccountId };
    }
  ).AccountId.publicKeyTypeEd25519(bytes);

function placeholderInstanceKey(): xdr.ScVal {
  return xdr.ScVal.scvContractInstance(
    new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
      storage: null,
    }),
  );
}

function contractDataKey(key: xdr.ScVal): string {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(CONTRACT_BYTES),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  ).toXDR('base64');
}

describe('StellarBaseXdrDecoder', () => {
  describe('decodeContractDataKey()', () => {
    it('renders a symbol-keyed contract key as contract:<id>:<key>', () => {
      const keyXdr = contractDataKey(xdr.ScVal.scvSymbol('count'));

      expect(decoder.decodeContractDataKey(keyXdr)).toBe(`contract:${CONTRACT_ID}:count`);
    });

    it('renders numeric, string and bytes keys', () => {
      expect(decoder.decodeContractDataKey(contractDataKey(xdr.ScVal.scvU32(42)))).toBe(
        `contract:${CONTRACT_ID}:42`,
      );
      expect(decoder.decodeContractDataKey(contractDataKey(xdr.ScVal.scvString('owner')))).toBe(
        `contract:${CONTRACT_ID}:owner`,
      );
      expect(
        decoder.decodeContractDataKey(contractDataKey(xdr.ScVal.scvBytes(Buffer.from([1, 2, 3])))),
      ).toBe(`contract:${CONTRACT_ID}:bytes:010203`);
    });

    it('renders an address key using the C... form', () => {
      const addressKey = xdr.ScVal.scvAddress(
        xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32, 1)),
      );
      expect(decoder.decodeContractDataKey(contractDataKey(addressKey))).toBe(
        `contract:${CONTRACT_ID}:${StrKey.encodeContract(Buffer.alloc(32, 1))}`,
      );
    });

    it('renders an instance key marker', () => {
      expect(decoder.decodeContractDataKey(contractDataKey(placeholderInstanceKey()))).toBe(
        `contract:${CONTRACT_ID}:<instance>`,
      );
    });

    it('throws on invalid XDR', () => {
      expect(() => decoder.decodeContractDataKey('not-base64!')).toThrow(/Invalid ledger key XDR/);
    });

    it('throws when given a non-contract-data key', () => {
      const accountKey = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({
          accountId: accountIdOf(Buffer.alloc(32, 3)),
        }),
      ).toXDR('base64');

      expect(() => decoder.decodeContractDataKey(accountKey)).toThrow(
        /Expected contract-data ledger key/,
      );
    });
  });

  describe('decodeLedgerKey()', () => {
    it('decodes contract-data, contract-code and account keys', () => {
      const dataKey = contractDataKey(xdr.ScVal.scvSymbol('count'));
      expect(decoder.decodeLedgerKey(dataKey)).toBe(`contract:${CONTRACT_ID}:count`);

      const codeKey = xdr.LedgerKey.contractCode(
        new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 9) }),
      ).toXDR('base64');
      expect(decoder.decodeLedgerKey(codeKey)).toBe(`code:${Buffer.alloc(32, 9).toString('hex')}`);

      const gAddr = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
      const accountKey = xdr.LedgerKey.account(
        new xdr.LedgerKeyAccount({ accountId: accountIdOf(Buffer.alloc(32, 3)) }),
      ).toXDR('base64');
      expect(decoder.decodeLedgerKey(accountKey)).toBe(`account:${gAddr}`);
    });
  });
});
