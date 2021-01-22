const { deployments, ethers } = require("hardhat");

module.exports = async (contract, signer = undefined) => {
    const { abi, address } = await deployments.get(contract);
    return await ethers.getContractAt(abi, address, signer);
};
