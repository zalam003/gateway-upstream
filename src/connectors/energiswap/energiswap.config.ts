import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace EnergiswapConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    gasLimitEstimate: number;
    ttl: number;
    energiswapRouterAddress: (chain: string, network: string) => string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'energiswap.allowedSlippage'
    ),
    gasLimitEstimate: ConfigManagerV2.getInstance().get(
      'energiswap.gasLimitEstimate'
    ),
    ttl: ConfigManagerV2.getInstance().get('energiswap.ttl'),
    energiswapRouterAddress: (chain: string, network: string) =>
      ConfigManagerV2.getInstance().get(
        'energiswap.contractAddresses.' +
          chain +
          '.' +
          network +
          '.energiswapRouterAddress'
      ),
    tradingTypes: ['EVM_AMM'],
    availableNetworks: [
      {
        chain: 'energi',
        networks: ['mainnet', 'testnet'],
      },
    ],
  };
}
