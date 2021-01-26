const { ethers, network } = require("hardhat");
const { replaceInFile } = require("replace-in-file");
const WETH = require("canonical-weth/build/contracts/WETH9.json");

const replaceTokenAddress = async (name, address) => {
    address = await ethers.utils.getAddress(address);
    const result = await replaceInFile({
        files: "test/tokens/" + name + ".json",
        from: new RegExp('"31337": "0x([0-9a-fA-F]{40})"'),
        to: '"31337": "' + address + '"',
    });
    return result.filter(file => file.hasChanged);
};

const deployERC20 = async (deterministic, deployer, name, symbol, decimals) => {
    const args = [name, symbol, decimals, deployer, ethers.BigNumber.from(10).pow(decimals + 4)];
    const { deploy } = await deterministic(symbol, {
        from: deployer,
        contract: "MockERC20",
        args,
        log: true,
    });
    const { address } = await deploy();

    await replaceTokenAddress(symbol, address);
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { deterministic, execute } = deployments;
    if (network.name === "hardhat") {
        const { deploy } = await deterministic("WETH", {
            from: deployer,
            contract: WETH,
            log: true,
        });
        await deploy();
        await execute(
            "WETH",
            {
                from: deployer,
                value: ethers.constants.WeiPerEther.mul(100),
            },
            "deposit"
        );
        await deployERC20(deterministic, deployer, "DAI Stablecoin", "DAI", 18);
        // await deployERC20(deterministic, deployer, "USD//C", "USDC", 6);
        // await deployERC20(deterministic, deployer, "Tether USD", "USDT", 6);
        // await deployERC20(deterministic, deployer, "Compound", "COMP", 18);
        // await deployERC20(deterministic, deployer, "Maker", "MKR", 18);
        // await deployERC20(deterministic, deployer, "OMG Network", "OMG", 18);
        // await deployERC20(deterministic, deployer, "BAT", "BAT", 18);
    }
    if (network.name !== "mainnet") {
        await deployERC20(deterministic, deployer, "SushiToken", "SUSHI", 18);
    }
};
