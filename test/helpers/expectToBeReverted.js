const { expect } = require("./chai");

module.exports = async (reason, promise) => {
    let result;
    if (typeof promise == "function") {
        result = promise();
    } else {
        result = promise;
    }
    if (reason) {
        await expect(result).to.be.revertedWith(reason);
    } else {
        await expect(result).to.be.reverted;
    }
};
