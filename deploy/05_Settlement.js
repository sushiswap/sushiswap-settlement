const { buidlerArguments, ethers } = require("@nomiclabs/buidler");
const { WETH } = require("@sushiswap/sdk");
const { network } = buidlerArguments;
const getFactoryAddress = require("../test/helpers/getFactoryAddress");

const INIT_CODE_HASH = "e18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

const getWethAddress = async get => {
    if (network === "buidlerevm") {
        return (await get("WETH")).address;
    } else {
        const { chainId } = await ethers.provider.getNetwork();
        return WETH[chainId].address;
    }
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { call, create2, get, execute } = deployments;

    const artifact = await deployments.getArtifact("Settlement");
    const contract = {
        abi: artifact.abi,
        bytecode: artifact.bytecode,
    };
    if (network === "buidlerevm") {
        const testInitCodeHash = await call("UniswapV2Factory", "pairCodeHash");
        contract.bytecode = contract.bytecode.replace(
            new RegExp(INIT_CODE_HASH, "g"),
            testInitCodeHash.substring(2)
        );
    }

    const { deploy } = await create2("Settlement", {
        contract,
        from: deployer,
        log: true,
        gasLimit: 5000000,
    });
    const { newlyDeployed } = await deploy();

    if (newlyDeployed) {
        // Initialize with fee of 0.2%
        await execute(
            "Settlement",
            {
                from: deployer,
            },
            "initialize",
            deployer,
            await getFactoryAddress(),
            await getWethAddress(get),
            2,
            1000
        );
    }
};
