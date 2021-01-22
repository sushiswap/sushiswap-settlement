const { network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;
    if (network.name !== "mainnet") {
        await deploy("OrderBook", {
            from: deployer,
            log: true,
        });
    }
};
