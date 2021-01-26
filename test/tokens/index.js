const fs = require("fs");
const path = require("path");
const { ChainId, Token, WETH: _WETH } = require("@sushiswap/sdk");

const load = file => JSON.parse(String(fs.readFileSync(path.resolve(__dirname, file))));

const dai = load("./DAI.json");
const usdc = load("./USDC.json");
const usdt = load("./USDT.json");
const comp = load("./COMP.json");
const mkr = load("./MKR.json");
const omg = load("./OMG.json");
const bat = load("./BAT.json");
const sushi = load("./SUSHI.json");

module.exports = {
    WETH: {
        ..._WETH,
        31337: new Token(
            31337,
            "0x128236dc0cF966F37E4843D7Ed8E09b41B4053F8",
            18,
            "WETH",
            "Wrapped Ether"
        ),
    },
    DAI: [1, 4, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, dai[current], 18, "DAI", "Dai Stablecoin"),
        }),
        {}
    ),
    USDC: [1, 4, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, usdc[current], 6, "USDC", "USD//C"),
        }),
        {}
    ),
    USDT: [1, 4, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, usdt[current], 6, "USDT", "Tether USD"),
        }),
        {}
    ),
    COMP: [1, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, comp[current], 18, "COMP", "Compound"),
        }),
        {}
    ),
    MKR: [1, 4, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, mkr[current], 18, "MKR", "Maker"),
        }),
        {}
    ),
    OMG: [1, 4, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, omg[current], 18, "OMG", "OMG Network"),
        }),
        {}
    ),
    BAT: [1, 4, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, bat[current], 18, "BAT", "BAT"),
        }),
        {}
    ),
    SUSHI: [1, 4, 42, 31337].reduce(
        (prev, current) => ({
            ...prev,
            [current]: new Token(current, sushi[current], 18, "SUSHI", "SushiToken"),
        }),
        {}
    ),
    YAM: {
        [ChainId.MAINNET]: new Token(
            ChainId.MAINNET,
            "0x0e2298E3B3390e3b945a5456fBf59eCc3f55DA16",
            18,
            "YAM",
            "YAM"
        ),
    },
    AMPL: {
        [ChainId.MAINNET]: new Token(
            ChainId.MAINNET,
            "0xD46bA6D942050d489DBd938a2C909A5d5039A161",
            9,
            "AMPL",
            "Ampleforth"
        ),
    },
};
