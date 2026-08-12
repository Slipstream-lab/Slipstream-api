import { Module } from '@nestjs/common';
import { STELLAR_HORIZON_CLIENT, STELLAR_RPC_CLIENT, XDR_DECODER } from './stellar.interfaces';
import { MockStellarHorizonClient, MockStellarRpcClient, MockXdrDecoder } from './stellar.mocks';

/**
 * Stellar module. Binds the RPC/Horizon/XDR interfaces to their mock
 * implementations. Real network-backed implementations are out of scope for
 * this foundation (see stellar.interfaces.ts); swap the `useClass` bindings
 * for production clients that read endpoints from ConfigService.
 */
@Module({
  providers: [
    { provide: STELLAR_RPC_CLIENT, useClass: MockStellarRpcClient },
    { provide: STELLAR_HORIZON_CLIENT, useClass: MockStellarHorizonClient },
    { provide: XDR_DECODER, useClass: MockXdrDecoder },
  ],
  exports: [STELLAR_RPC_CLIENT, STELLAR_HORIZON_CLIENT, XDR_DECODER],
})
export class StellarModule {}
