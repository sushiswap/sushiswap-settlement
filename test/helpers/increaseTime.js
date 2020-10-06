module.exports = async (seconds) => {
    const provider = ethers.provider;
    const adjustment = await provider.send("evm_increaseTime", [seconds.toNumber()]);
    await provider.send("evm_mine", []);
    return adjustment;
};
