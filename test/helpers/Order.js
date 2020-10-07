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

    async hash() {
        const settlement = await getContract("Settlement", this.maker);
        return await settlement.hash(
            this.maker._address,
            this.fromToken.address,
            this.toToken.address,
            this.amountIn,
            this.amountOutMin,
            this.recipient,
            this.deadline
        );
    }

    async sign() {
        const hash = await this.hash();
        const signature = await this.maker.signMessage(ethers.utils.arrayify(hash));
        return ethers.utils.splitSignature(signature);
    }

    async toArgs() {
        const { v, r, s } = await this.sign();
        return [
            this.maker._address,
            this.fromToken.address,
            this.toToken.address,
            this.amountIn,
            this.amountOutMin,
            this.recipient,
            this.deadline,
            v,
            r,
            s,
        ];
    }
}

module.exports = Order;
