const { buidlerArguments } = require("@nomiclabs/buidler");
const { network } = buidlerArguments;

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { create2 } = deployments;
    if (network !== "mainnet") {
        const { deploy } = await create2("OrderBook", {
            from: deployer,
            log: true,
        });
        await deploy();
    }
};
