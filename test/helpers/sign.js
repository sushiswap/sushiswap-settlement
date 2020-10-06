module.exports = async (signer, message) => {
    return await signer.signMessage(ethers.utils.arrayify(message));
};
