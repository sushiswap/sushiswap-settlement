const { network, ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deploy } = deployments;

    const settlement = await ethers.getContract("Settlement", deployer);
    if (network.name !== "mainnet") {
        await deploy("SettlementCaller", {
            args: [settlement.address],
            from: deployer,
            log: true,
        });
    }
};
