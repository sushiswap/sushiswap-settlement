const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deterministic } = deployments;
    if (network.name !== "mainnet") {
        const { deploy } = await deterministic("OrderBook", {
            from: deployer,
            log: true,
        });
        await deploy();
    }
};
