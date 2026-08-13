import { Injectable } from '@nestjs/common';
import { StrKey, xdr } from '@stellar/stellar-base';
import { XdrDecoder } from './stellar.interfaces';

/**
 * Production {@link XdrDecoder} backed by `@stellar/stellar-base`.
 *
 * Decodes base64-XDR ledger keys into the canonical string form the engine
 * understands, e.g.:
 * - `contract:C...:<key>`  for contract-data keys
 * - `code:<hex>`           for contract-code keys
 * - `account:<G...>`       for account keys
 *
 * Unsupported ledger-key types are rendered as `<type>:<raw-xdr>` so the
 * caller can still correlate them, without coupling the decoder to the
 * long tail of legacy Stellar ledger entry types.
 */
@Injectable()
export class StellarBaseXdrDecoder implements XdrDecoder {
  decodeLedgerKey(keyXdr: string): string {
    let key: xdr.LedgerKey;
    try {
      key = xdr.LedgerKey.fromXDR(keyXdr, 'base64');
    } catch {
      throw new Error(`Invalid ledger key XDR: ${keyXdr}`);
    }

    switch (key.switch().name) {
      case 'contractData': {
        const data = key.contractData();
        return `contract:${this.renderAddress(data.contract())}:${this.renderKey(data.key())}`;
      }
      case 'contractCode': {
        const code = key.contractCode();
        return `code:${Buffer.from(code.hash()).toString('hex')}`;
      }
      case 'account': {
        return `account:${StrKey.encodeEd25519PublicKey(key.account().accountId().ed25519())}`;
      }
      default:
        return `${key.switch().name}:${keyXdr}`;
    }
  }

  decodeContractDataKey(keyXdr: string): string {
    let key: xdr.LedgerKey;
    try {
      key = xdr.LedgerKey.fromXDR(keyXdr, 'base64');
    } catch {
      throw new Error(`Invalid ledger key XDR: ${keyXdr}`);
    }
    if (key.switch().name !== 'contractData') {
      throw new Error(`Expected contract-data ledger key, got ${key.switch().name}`);
    }
    const data = key.contractData();
    return `contract:${this.renderAddress(data.contract())}:${this.renderKey(data.key())}`;
  }

  /** Render a contract id as a `C...` string. */
  private renderAddress(address: xdr.ScAddress): string {
    if (address.switch().name === 'scAddressTypeContract') {
      return StrKey.encodeContract(address.contractId());
    }
    if (address.switch().name === 'scAddressTypeAccount') {
      return address.accountId().toString();
    }
    return address.switch().name;
  }

  /** Render an ScVal ledger key into a compact canonical string. */
  private renderKey(value: xdr.ScVal): string {
    switch (value.switch().name) {
      case 'scvU32':
        return value.u32().toString();
      case 'scvI32':
        return value.i32().toString();
      case 'scvU64':
        return value.u64().toString();
      case 'scvI64':
        return value.i64().toString();
      case 'scvBool':
        return value.b().toString();
      case 'scvString':
        return value.str().toString();
      case 'scvSymbol':
        return value.sym().toString();
      case 'scvBytes':
        return `bytes:${Buffer.from(value.bytes()).toString('hex')}`;
      case 'scvAddress':
        return this.renderAddress(value.address());
      case 'scvVec': {
        const elements = value.vec() ?? [];
        return `[${elements.map((el) => this.renderKey(el)).join(',')}]`;
      }
      case 'scvMap': {
        const entries = value.map() ?? [];
        return `{${entries
          .map((entry) => `${this.renderKey(entry.key())}:${this.renderKey(entry.val())}`)
          .join(',')}}`;
      }
      case 'scvContractInstance':
        return '<instance>';
      case 'scvVoid':
        return 'void';
      default:
        return value.switch().name;
    }
  }
}
