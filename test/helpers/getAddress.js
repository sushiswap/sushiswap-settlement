module.exports = async (account) => {
    return account.address
        ? account.address
        : account.getAddress
        ? await account.getAddress()
        : account.resolvedAddress
        ? await account.resolvedAddress()
        : account;
};
