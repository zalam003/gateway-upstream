jest.useFakeTimers();
import { Energiswap } from '../../../../src/connectors/energiswap/energiswap';
import { patch, unpatch } from '../../../services/patch';
import { UniswapishPriceError as EnergiswapishPriceError } from '../../../../src/services/error-handler';
import {
  Token,
  CurrencyAmount,
  Trade,
  Pair,
  TradeType,
  Route,
} from '@energi/energiswap-sdk';
import { BigNumber } from 'ethers';
import { Energi } from '../../../../src/chains/energi/energi';
import { patchEVMNonceManager } from '../../../evm.nonce.mock';

let energi: Energi;
let energiswap: Energiswap;

const ETH = new Token(
  3,
  '0x01a5534f82Ab54e1F37Ee585F3049Cf8B80f79A4',
  18,
  'ETH'
);
const DAI = new Token(
  3,
  '0x3e798553502042088783B83e4B62e22152E8717e',
  18,
  'DAI'
);

beforeAll(async () => {
  energi = Energi.getInstance('testnet');
  patchEVMNonceManager(energi.nonceManager);
  await energi.init();

  energiswap = Energiswap.getInstance('energi', 'testnet');
  await energiswap.init();
});

beforeEach(() => {
  patchEVMNonceManager(energi.nonceManager);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await energi.close();
});

const patchFetchData = () => {
  patch(energiswap, 'fetchData', () => {
    return new Pair(
      CurrencyAmount.fromRawAmount(ETH, '2000000000000000000'),
      CurrencyAmount.fromRawAmount(DAI, '1000000000000000000')
    );
  });
};
const patchTrade = (key: string, error?: Error) => {
  patch(Trade, key, () => {
    if (error) return [];
    const ETH_DAI = new Pair(
      CurrencyAmount.fromRawAmount(ETH, '2000000000000000000'),
      CurrencyAmount.fromRawAmount(DAI, '1000000000000000000')
    );
    const DAI_TO_ETH = new Route([ETH_DAI], DAI, ETH);
    return [
      new Trade(
        DAI_TO_ETH,
        CurrencyAmount.fromRawAmount(DAI, '1000000000000000'),
        TradeType.EXACT_INPUT
      ),
    ];
  });
};

describe('verify Energiswap estimateSellTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactIn');

    const expectedTrade = await energiswap.estimateSellTrade(
      ETH,
      DAI,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should throw an error if no pair is available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactIn', new Error('error getting trade'));

    await expect(async () => {
      await energiswap.estimateSellTrade(ETH, DAI, BigNumber.from(1));
    }).rejects.toThrow(EnergiswapishPriceError);
  });
});

describe('verify energiswap estimateBuyTrade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactOut');

    const expectedTrade = await energiswap.estimateBuyTrade(
      ETH,
      DAI,
      BigNumber.from(1)
    );
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
  });

  it('Should return an error if no pair is available', async () => {
    patchFetchData();
    patchTrade('bestTradeExactOut', new Error('error getting trade'));

    await expect(async () => {
      await energiswap.estimateBuyTrade(ETH, DAI, BigNumber.from(1));
    }).rejects.toThrow(EnergiswapishPriceError);
  });
});

describe('verify energiswap Token List', () => {
  it('Should return a token by address', async () => {
    const token = energiswap.getTokenByAddress(
      '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
    );
    expect(token).toBeInstanceOf(Token);
  });
});
