const { network, getChainId } = require("hardhat");
const getFactoryAddress = require("../test/helpers/getFactoryAddress");

const INIT_CODE_HASH = "e18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { call, deploy, deterministic } = deployments;

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
        args: [chainId, orderBook, await getFactoryAddress()],
        from: deployer,
        log: true,
        gasLimit: 5000000,
    });
};
