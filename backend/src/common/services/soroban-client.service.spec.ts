import { ConfigService } from '@nestjs/config';
import { SorobanClientService } from './soroban-client.service';
import { BlockchainConnectionError } from '../errors/domain-errors';

const getHealth = jest.fn();
const getLatestLedger = jest.fn();

jest.mock('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getHealth,
      getLatestLedger,
    })),
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  BASE_FEE: '100',
}));

describe('SorobanClientService startup connection', () => {
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const config: Record<string, string> = {
        SOROBAN_RPC_URL: 'https://soroban.test',
        STELLAR_NETWORK: 'testnet',
      };
      return config[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks the client connected when the RPC health probe succeeds', async () => {
    getHealth.mockResolvedValue({ status: 'healthy' });
    getLatestLedger.mockResolvedValue({ sequence: 42 });
    const service = new SorobanClientService(configService);

    await service.verifyConnection();

    expect(service.isConnected()).toBe(true);
    expect(service.getConnectionStatus()).toMatchObject({
      status: 'connected',
      rpcUrl: 'https://soroban.test',
      latestLedger: 42,
      probeAttempts: 1,
    });
  });

  it('fails startup after retries when the RPC stays unreachable', async () => {
    jest.useFakeTimers();
    getHealth.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new SorobanClientService(configService);

    const pending = service.verifyConnection();
    const assertion = expect(pending).rejects.toBeInstanceOf(
      BlockchainConnectionError,
    );
    await jest.runAllTimersAsync();
    await assertion;

    expect(getHealth).toHaveBeenCalledTimes(5);
    expect(service.isConnected()).toBe(false);
    expect(service.getConnectionStatus().failureReason).toBe('ECONNREFUSED');
  });
});
