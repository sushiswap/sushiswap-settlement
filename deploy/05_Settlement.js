const { network, ethers, getChainId } = require("hardhat");
const { WETH } = require("@sushiswap/sdk");
const getFactoryAddress = require("../test/helpers/getFactoryAddress");

const INIT_CODE_HASH = "e18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";
const MULTISIG = "0x19B3Eb3Af5D93b77a5619b047De0EED7115A19e7";
const SUSHI_BAR = "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272";

const getWethAddress = async get => {
    if (network.name === "hardhat") {
        return (await get("WETH")).address;
    } else {
        const { chainId } = await ethers.provider.getNetwork();
        return WETH[chainId].address;
    }
};

const getSushiAddress = async get => {
    if (network.name === "mainnet") {
        return "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2";
    } else {
        return (await get("SUSHI")).address;
    }
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { call, deploy, deterministic, get } = deployments;

    const artifact = await deployments.getArtifact("Settlement");
    const contract = {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
    };
    if (network.name === "hardhat") {
        const testInitCodeHash = await call("UniswapV2Factory", "pairCodeHash");
        contract.bytecode = contract.bytecode.replace(
            new RegExp(INIT_CODE_HASH, "g"),
            testInitCodeHash.substring(2)
        );
    }

    const chainId = network.name === "mainnet" ? 42 : await getChainId();
    const { address: orderBook } = await deterministic("OrderBook", {
        from: deployer,
        log: true,
    });
    await deploy("Settlement", {
        contract,
        args: [
            chainId,
            orderBook,
            network.name === "mainnet" ? MULTISIG : deployer,
            await getFactoryAddress(),
            await getWethAddress(get),
            await getSushiAddress(get),
            SUSHI_BAR,
            20, // 0.2%
            2000, // 20%
        ],
        from: deployer,
        log: true,
        gasLimit: 5000000,
    });
};
