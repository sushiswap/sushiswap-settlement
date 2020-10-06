const { buidlerArguments } = require("@nomiclabs/buidler");

module.exports = async ({ getNamedAccounts, deployments }) => {
    if (buidlerArguments.network === "buidlerevm") {
        const { deployer } = await getNamedAccounts();
        const { get, create2 } = deployments;
        const factory = await get("UniswapV2Factory");
        const weth = await get("WETH");
        const { deploy } = await create2("UniswapV2Router02", {
            from: deployer,
            args: [factory.address, weth.address],
            log: true,
        });
        await deploy();
    }
};
