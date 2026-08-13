import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STELLAR_HORIZON_CLIENT, STELLAR_RPC_CLIENT, XDR_DECODER } from './stellar.interfaces';
import { MockStellarHorizonClient, MockStellarRpcClient, MockXdrDecoder } from './stellar.mocks';
import { HttpStellarHorizonClient } from './http-stellar-horizon-client';
import { HttpStellarRpcClient } from './http-stellar-rpc-client';
import { StellarBaseXdrDecoder } from './stellar-base-xdr-decoder';

/**
 * Stellar module. Binds the RPC/Horizon/XDR interfaces either to their real
 * network-backed implementations (when `STELLAR_ENABLED=true`) or to the
 * deterministic mocks (default), so the app and its test suites boot without
 * any external services.
 *
 * Endpoints are read from config: `stellar.rpcUrl` (STELLAR_RPC_URL) and
 * `stellar.horizonUrl` (HORIZON_URL).
 */
@Module({})
export class StellarModule {
  static register(): DynamicModule {
    return {
      module: StellarModule,
      providers: [
        {
          provide: STELLAR_RPC_CLIENT,
          useFactory: (config: ConfigService) => {
            if (config.get<boolean>('stellar.enabled')) {
              return new HttpStellarRpcClient(config.get<string>('stellar.rpcUrl') ?? '');
            }
            return new MockStellarRpcClient();
          },
          inject: [ConfigService],
        },
        {
          provide: STELLAR_HORIZON_CLIENT,
          useFactory: (config: ConfigService) => {
            if (config.get<boolean>('stellar.enabled')) {
              return new HttpStellarHorizonClient(config.get<string>('stellar.horizonUrl') ?? '');
            }
            return new MockStellarHorizonClient();
          },
          inject: [ConfigService],
        },
        {
          provide: XDR_DECODER,
          useFactory: (config: ConfigService) => {
            if (config.get<boolean>('stellar.enabled')) {
              return new StellarBaseXdrDecoder();
            }
            return new MockXdrDecoder();
          },
          inject: [ConfigService],
        },
      ],
      exports: [STELLAR_RPC_CLIENT, STELLAR_HORIZON_CLIENT, XDR_DECODER],
    };
  }
}
