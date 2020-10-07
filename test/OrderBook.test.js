const { ethers, deployments } = require("@nomiclabs/buidler");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

describe("OrderBook", async () => {
    beforeEach(async () => {
        await deployments.fixture();
    });

    it("Should createOrder()", async () => {
        const { chainId, users, createOrder } = await helpers.setup();
        const orderBook = await helpers.getContract("OrderBook");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100)
        );

        const hash = await order.hash();
        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orders(hash));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0]._address));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfFromToken(fromToken.address));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address));
    });

    it("Should cancelOrder()", async () => {
        const { chainId, users, createOrder, cancelOrder } = await helpers.setup();
        const orderBook = await helpers.getContract("OrderBook");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100)
        );

        const hash = await order.hash();
        await cancelOrder(users[0], hash);

        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orders(hash));
        await helpers.expectToDeepEqual([], orderBook.hashesOfMaker(users[0]._address));
        await helpers.expectToDeepEqual([], orderBook.hashesOfFromToken(fromToken.address));
        await helpers.expectToDeepEqual([], orderBook.hashesOfToToken(toToken.address));
    });
});
