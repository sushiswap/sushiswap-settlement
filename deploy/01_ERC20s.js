const { buidlerArguments, ethers } = require("@nomiclabs/buidler");
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

const deployERC20 = async (create2, deployer, name, symbol, decimals) => {
    const args = [name, symbol, decimals, deployer, ethers.BigNumber.from(10).pow(decimals + 4)];
    const { deploy } = await create2(symbol, {
        from: deployer,
        contract: "MockERC20",
        args,
        log: true,
    });
    const { address } = await deploy();
    await replaceTokenAddress(symbol, address);
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    if (buidlerArguments.network === "buidlerevm") {
        const { deployer } = await getNamedAccounts();
        const { create2, execute } = deployments;
        const { deploy } = await create2("WETH", {
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
        await deployERC20(create2, deployer, "DAI Stablecoin", "DAI", 18);
        // await deployERC20(create2, deployer, "USD//C", "USDC", 6);
        // await deployERC20(create2, deployer, "Tether USD", "USDT", 6);
        // await deployERC20(create2, deployer, "Compound", "COMP", 18);
        // await deployERC20(create2, deployer, "Maker", "MKR", 18);
        // await deployERC20(create2, deployer, "OMG Network", "OMG", 18);
        // await deployERC20(create2, deployer, "BAT", "BAT", 18);
    }
};
