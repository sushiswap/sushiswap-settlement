const { deployments, network } = require("hardhat");

module.exports = async () => {
    if (network.name === "hardhat") {
        const { get } = deployments;
        return (await get("UniswapV2Factory")).address;
    } else if (network.name === "mainnet") {
        return "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";
    } else {
        // Use Uniswap's factory for testnets
        return "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    }
};
