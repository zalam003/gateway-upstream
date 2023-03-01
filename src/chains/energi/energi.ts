import abi from './energi.abi.json';
import { logger } from '../../services/logger';
import { BigNumber, Contract, Transaction, Wallet } from 'ethers';
import { EnergiBase } from './energi-base';
import { getEnergiConfig } from './energi.config';
import { Provider } from '@ethersproject/abstract-provider';
import { Energiish } from '../../services/common-interfaces';
import { EnergiswapConfig } from '../../connectors/energiswap/energiswap.config';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

// MKR does not match the ERC20 perfectly so we need to use a separate ABI.
const MKR_ADDRESS = '0x050317d93f29D1bA5FF3EaC3b8157fD4E345588D';

export class Energi extends EnergiBase implements Energiish {
  private static _instances: { [name: string]: Energi };
  private _gasPrice: number;
  private _gasPriceRefreshInterval: number | null;
  private _nativeTokenSymbol: string;
  private _chain: string;
  private _requestCount: number;
  private _metricsLogInterval: number;

  private constructor(network: string) {
    const config = getEnergiConfig('energi', network);
    super(
      'energi',
      config.network.chainID,
      config.network.nodeURL,
      config.network.tokenListSource,
      config.network.tokenListType,
      config.manualGasPrice,
      config.gasLimitTransaction,
      ConfigManagerV2.getInstance().get('server.nonceDbPath'),
      ConfigManagerV2.getInstance().get('server.transactionDbPath')
    );
    this._chain = network;
    this._nativeTokenSymbol = config.nativeCurrencySymbol;
    this._gasPrice = config.manualGasPrice;
    this._gasPriceRefreshInterval =
      config.network.gasPriceRefreshInterval !== undefined
        ? config.network.gasPriceRefreshInterval
        : null;

    this.updateGasPrice();

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this.onDebugMessage(this.requestCounter.bind(this));
    setInterval(this.metricLogger.bind(this), this.metricsLogInterval);
  }

  public static getInstance(network: string): Energi {
    if (Energi._instances === undefined) {
      Energi._instances = {};
    }
    if (!(network in Energi._instances)) {
      Energi._instances[network] = new Energi(network);
    }

    return Energi._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Energi } {
    return Energi._instances;
  }

  public requestCounter(msg: any): void {
    if (msg.action === 'request') this._requestCount += 1;
  }

  public metricLogger(): void {
    logger.info(
      this.requestCount +
        ' request(s) sent in last ' +
        this.metricsLogInterval / 1000 +
        ' seconds.'
    );
    this._requestCount = 0; // reset
  }

  // getters
  public get gasPrice(): number {
    return this._gasPrice;
  }

  public get chain(): string {
    return this._chain;
  }

  public get nativeTokenSymbol(): string {
    return this._nativeTokenSymbol;
  }

  public get requestCount(): number {
    return this._requestCount;
  }

  public get metricsLogInterval(): number {
    return this._metricsLogInterval;
  }

  /**
   * Automatically update the prevailing gas price on the network.
   *
   * Otherwise, it'll obtain the prevailing gas price from the connected
   * ETH node.
   */
  async updateGasPrice(): Promise<void> {
    if (this._gasPriceRefreshInterval === null) {
      return;
    }

    const gasPrice = await this.getGasPriceFromEnergiNode();
    if (gasPrice !== null) {
      this._gasPrice = gasPrice;
    } else {
      logger.info('gasPrice is unexpectedly null.');
    }

    setTimeout(
      this.updateGasPrice.bind(this),
      this._gasPriceRefreshInterval * 1000
    );
  }

  /**
   * Get the base gas fee and the current max priority fee from the Energi
   * node, and add them together.
   */
  async getGasPriceFromEnergiNode(): Promise<number> {
    const baseFee: BigNumber = await this.provider.getGasPrice();
    let priorityFee: BigNumber = BigNumber.from('0');
    if (this._chain === 'mainnet') {
      priorityFee = BigNumber.from(
        await this.provider.send('eth_maxPriorityFeePerGas', [])
      );
    }
    return baseFee.add(priorityFee).toNumber() * 1e-9;
  }

  getContract(
    tokenAddress: string,
    signerOrProvider?: Wallet | Provider
  ): Contract {
    return tokenAddress === MKR_ADDRESS
      ? new Contract(tokenAddress, abi.MKRAbi, signerOrProvider)
      : new Contract(tokenAddress, abi.ERC20Abi, signerOrProvider);
  }

  // TODO Check the possibility to use something similar for CLOB/Solana/Serum
  // Use the following link: https://hummingbot.org/developers/gateway/building-gateway-connectors/#6-add-connector-to-spender-list
  getSpender(reqSpender: string): string {
    let spender: string;
    if (reqSpender === 'energiswap') {
      spender = EnergiswapConfig.config.routerAddress(
        this._chain
      );
    } else {
      spender = reqSpender;
    }
    return spender;
  }

  // cancel transaction
  async cancelTx(wallet: Wallet, nonce: number): Promise<Transaction> {
    logger.info(
      'Canceling any existing transaction(s) with nonce number ' + nonce + '.'
    );
    return this.cancelTxWithGasPrice(wallet, nonce, this._gasPrice * 2);
  }

  async close() {
    await super.close();
    if (this._chain in Energi._instances) {
      delete Energi._instances[this._chain];
    }
  }
}
