const getAddress = require("./getAddress");

module.exports = async (account) => {
    return account.getBalance
        ? await account.getBalance()
        : ethers.provider.getBalance(await getAddress(account));
};
