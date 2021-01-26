const { network } = require("hardhat");
const { replaceInFile } = require("replace-in-file");

const replaceInitCodeHash = async hash => {
    await replaceInFile({
        files: "test/helpers/findPairs.js",
        from: new RegExp('31337: "(0x[0-9a-fA-F]{64})"'),
        to: '31337: "' + hash + '"',
    });
    await replaceInFile({
        files: "contracts/mock/uniswapv2/libraries/UniswapV2Library.sol",
        from: new RegExp('hex"([0-9a-fA-F]{64})"'),
        to: 'hex"' + hash.substring(2) + '"',
    });
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    if (network.name === "hardhat") {
        const { deployer } = await getNamedAccounts();
        const { deterministic, call } = deployments;
        const { deploy } = await deterministic("UniswapV2Factory", {
            from: deployer,
            args: [deployer],
            log: true,
        });
        await deploy();
        const hash = await call("UniswapV2Factory", "pairCodeHash");
        await replaceInitCodeHash(hash);
    }
};
