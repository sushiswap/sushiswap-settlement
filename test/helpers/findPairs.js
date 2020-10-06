const { ChainId, ETHER, Token, TokenAmount, Pair } = require("@sushiswap/sdk");
const { ethers } = require("ethers");
const { getCreate2Address, solidityKeccak256, solidityPack } = ethers.utils;
const artifacts = {
    IUniswapV2Pair: require("@sushiswap/core/build/contracts/IUniswapV2Pair.json"),
};

const { WETH, DAI, USDC, USDT, COMP, MKR, SUSHI, YAM, AMPL } = require("../tokens");

// For rinkeby and kovan, we use Uniswap's factory
const INIT_CODE_HASH = {
    [ChainId.MAINNET]: "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303",
    [ChainId.RINKEBY]: "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
    [ChainId.KOVAN]: "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
    31337: "0x68ac51f8ac654c60087d3a6c66e6fecb83cf809da0f6f4fdc4a2e81ac170c761",
};

const BASES_TO_CHECK_TRADES_AGAINST = {
    [ChainId.MAINNET]: [
        WETH[ChainId.MAINNET],
        DAI[ChainId.MAINNET],
        USDC[ChainId.MAINNET],
        USDT[ChainId.MAINNET],
        SUSHI[ChainId.MAINNET],
        YAM[ChainId.MAINNET],
    ],
    [ChainId.RINKEBY]: [
        WETH[ChainId.RINKEBY],
        DAI[ChainId.RINKEBY],
        USDC[ChainId.RINKEBY],
        USDT[ChainId.RINKEBY],
        MKR[ChainId.RINKEBY],
    ],
    [ChainId.KOVAN]: [
        WETH[ChainId.KOVAN],
        DAI[ChainId.KOVAN],
        USDC[ChainId.KOVAN],
        USDT[ChainId.KOVAN],
        COMP[ChainId.KOVAN],
        MKR[ChainId.KOVAN],
    ],
    31337: [WETH[31337], DAI[31337], USDC[31337], USDT[31337], COMP[31337], MKR[31337]],
};

const CUSTOM_BASES = {
    [ChainId.MAINNET]: {
        [AMPL[ChainId.MAINNET]]: [DAI[ChainId.MAINNET], WETH[ChainId.MAINNET]],
    },
};

function wrappedCurrency(chainId, currency) {
    return currency === ETHER ? WETH[chainId] : currency instanceof Token ? currency : undefined;
}

const findPairs = async (chainId, factory, currencyA, currencyB, provider) => {
    const bases = BASES_TO_CHECK_TRADES_AGAINST[chainId];
    const [tokenA, tokenB] = [
        wrappedCurrency(chainId, currencyA),
        wrappedCurrency(chainId, currencyB),
    ];
    const basePairs = bases
        .flatMap(base => bases.map(otherBase => [base, otherBase]))
        .filter(([t0, t1]) => t0.address !== t1.address);

    const allPairCombinations =
        tokenA && tokenB
            ? [
                  // the direct pair
                  [tokenA, tokenB],
                  // token A against all bases
                  ...bases.map(base => [tokenA, base]),
                  // token B against all bases
                  ...bases.map(base => [tokenB, base]),
                  // each base against all bases
                  ...basePairs,
              ]
                  .filter(tokens => Boolean(tokens[0] && tokens[1]))
                  .filter(([t0, t1]) => t0.address !== t1.address)
                  .filter(([a, b]) => {
                      const customBases = CUSTOM_BASES;
                      if (!customBases) return true;

                      const customBasesA = customBases[a.address];
                      const customBasesB = customBases[b.address];

                      if (!customBasesA && !customBasesB) return true;

                      if (customBasesA && !customBasesA.find(base => tokenB.equals(base)))
                          return false;
                      return !(customBasesB && !customBasesB.find(base => tokenA.equals(base)));
                  })
            : [];

    const pairs = await Promise.all(
        allPairCombinations.map(async pair => {
            try {
                return await fetchPairData(chainId, factory, pair[0], pair[1], provider);
            } catch (e) {
                return null;
            }
        })
    );
    return pairs.filter(pair => pair !== null);
};

let PAIR_ADDRESS_CACHE = {};

const fetchPairData = async (chainId, factory, tokenA, tokenB, provider) => {
    const address = getAddress(chainId, factory, tokenA, tokenB);
    const [reserves0, reserves1] = await new ethers.Contract(
        address,
        artifacts.IUniswapV2Pair.abi,
        provider
    ).getReserves();
    const balances = tokenA.sortsBefore(tokenB) ? [reserves0, reserves1] : [reserves1, reserves0];
    return new Pair(new TokenAmount(tokenA, balances[0]), new TokenAmount(tokenB, balances[1]));
};

const getAddress = (chainId, factory, tokenA, tokenB) => {
    const tokens = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]; // does safety checks

    if (
        PAIR_ADDRESS_CACHE[tokens[0].address] === undefined ||
        PAIR_ADDRESS_CACHE[tokens[0].address][tokens[1].address] === undefined
    ) {
        PAIR_ADDRESS_CACHE = {
            ...PAIR_ADDRESS_CACHE,
            [tokens[0].address]: {
                ...PAIR_ADDRESS_CACHE[tokens[0].address],
                [tokens[1].address]: getCreate2Address(
                    factory,
                    solidityKeccak256(
                        ["bytes"],
                        [
                            solidityPack(
                                ["address", "address"],
                                [tokens[0].address, tokens[1].address]
                            ),
                        ]
                    ),
                    INIT_CODE_HASH[chainId]
                ),
            },
        };
    }

    return PAIR_ADDRESS_CACHE[tokens[0].address][tokens[1].address];
};

module.exports = findPairs;
