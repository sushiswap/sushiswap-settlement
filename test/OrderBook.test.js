const { ethers, deployments } = require("hardhat");
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
        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orderOfHash(hash));
        await helpers.expectToDeepEqual([hash], orderBook.allHashes(0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0].address, 0, 1));
        await helpers.expectToDeepEqual(
            [hash],
            orderBook.hashesOfFromToken(fromToken.address, 0, 1)
        );
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address, 0, 1));
    });
});
