const { ethers, deployments } = require("@nomiclabs/buidler");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

describe("OrderBook", async () => {
    beforeEach(async () => {
        await deployments.fixture();
    });

    it("Should createOrder()", async () => {
        const { chainId, user, address, orderBook, createOrder } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            user,
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100)
        );

        const hash = await order.getHash();
        await helpers.expectToDeepEqual(order.toArgs(), orderBook.orders(hash));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(address));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfFromToken(fromToken.address));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address));
    });
});
