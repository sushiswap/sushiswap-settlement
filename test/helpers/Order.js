const { ethers } = require("@nomiclabs/buidler");
const getContract = require("./getContract");

class Order {
    constructor(
        maker,
        fromToken,
        toToken,
        amountIn,
        amountOutMin,
        recipient = maker._address,
        deadline = ethers.BigNumber.from(Math.floor(Date.now() / 1000 + 24 * 3600))
    ) {
        this.maker = maker;
        this.fromToken = fromToken;
        this.toToken = toToken;
        this.amountIn = amountIn;
        this.amountOutMin = amountOutMin;
        this.recipient = recipient;
        this.deadline = deadline;
    }

    async getHash() {
        const settlement = await getContract("Settlement");
        return await settlement.hash(this.toArgs());
    }

    async sign() {
        const hash = await this.getHash();
        const signature = await this.maker.signMessage(ethers.utils.arrayify(hash));
        return ethers.utils.splitSignature(signature);
    }

    toArgs() {
        return [
            this.maker._address,
            this.fromToken.address,
            this.toToken.address,
            this.amountIn,
            this.amountOutMin,
            this.recipient,
            this.deadline,
        ];
    }
}

module.exports = Order;
