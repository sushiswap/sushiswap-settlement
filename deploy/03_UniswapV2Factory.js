const { buidlerArguments } = require("@nomiclabs/buidler");
const { replaceInFile } = require("replace-in-file");

const replaceInitCodeHash = async hash => {
    const result = await replaceInFile({
        files: "test/helpers/findPairs.js",
        from: new RegExp('31337: "([0-9a-fA-F]{64})"'),
        to: '31337: "' + hash + '"',
    });
    return result.filter(file => file.hasChanged);
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    if (buidlerArguments.network === "buidlerevm") {
        const { deployer } = await getNamedAccounts();
        const { create2, call } = deployments;
        const { deploy } = await create2("UniswapV2Factory", {
            from: deployer,
            args: [deployer],
            log: true,
        });
        await deploy();
        const hash = await call("UniswapV2Factory", "pairCodeHash");
        await replaceInitCodeHash(hash);
    }
};
