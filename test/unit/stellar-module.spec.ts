import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '../../src/config/config.module';
import { HttpStellarHorizonClient } from '../../src/stellar/http-stellar-horizon-client';
import { HttpStellarRpcClient } from '../../src/stellar/http-stellar-rpc-client';
import { StellarBaseXdrDecoder } from '../../src/stellar/stellar-base-xdr-decoder';
import {
  MockStellarHorizonClient,
  MockStellarRpcClient,
  MockXdrDecoder,
} from '../../src/stellar/stellar.mocks';
import { StellarModule } from '../../src/stellar/stellar.module';
import {
  STELLAR_HORIZON_CLIENT,
  STELLAR_RPC_CLIENT,
  XDR_DECODER,
} from '../../src/stellar/stellar.interfaces';

async function compileStellarModule(stellarEnabled: boolean) {
  const config = {
    get: (key: string) => (key === 'stellar.enabled' ? stellarEnabled : ''),
  } as unknown as ConfigService;

  return Test.createTestingModule({
    imports: [ConfigModule, StellarModule.register()],
  })
    .overrideProvider(ConfigService)
    .useValue(config)
    .compile();
}

describe('StellarModule.register()', () => {
  it('binds mock clients when STELLAR_ENABLED is off (default)', async () => {
    const moduleRef = await compileStellarModule(false);

    expect(moduleRef.get(STELLAR_RPC_CLIENT)).toBeInstanceOf(MockStellarRpcClient);
    expect(moduleRef.get(STELLAR_HORIZON_CLIENT)).toBeInstanceOf(MockStellarHorizonClient);
    expect(moduleRef.get(XDR_DECODER)).toBeInstanceOf(MockXdrDecoder);
  });

  it('binds the real HTTP/XDR clients when STELLAR_ENABLED is on', async () => {
    const moduleRef = await compileStellarModule(true);

    expect(moduleRef.get(STELLAR_RPC_CLIENT)).toBeInstanceOf(HttpStellarRpcClient);
    expect(moduleRef.get(STELLAR_HORIZON_CLIENT)).toBeInstanceOf(HttpStellarHorizonClient);
    expect(moduleRef.get(XDR_DECODER)).toBeInstanceOf(StellarBaseXdrDecoder);
  });
});
