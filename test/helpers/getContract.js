const { ethers, deployments } = require("@nomiclabs/buidler");

module.exports = async (contract) => {
    const { abi, address } = await deployments.get(contract);
    return await ethers.getContractAt(abi, address);
};
