const { ethers, deployments } = require("@nomiclabs/buidler");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

const create10Orders = async () => {
    const { chainId, users, createOrder } = await helpers.setup();
    const orderBook = await helpers.getContract("OrderBook");
    const fromToken = WETH[chainId];
    const toToken = DAI[chainId];

    const hashes = [];
    for (let i = 0; i < 10; i++) {
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100 + i * 10)
        );
        hashes.push(await order.hash());
    }
    return { users, fromToken, toToken, orderBook, hashes };
};

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
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0]._address, 0, 1));
        await helpers.expectToDeepEqual(
            [hash],
            orderBook.hashesOfFromToken(fromToken.address, 0, 1)
        );
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address, 0, 1));
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
        await helpers.expectToDeepEqual(
            [ethers.constants.HashZero],
            orderBook.hashesOfMaker(users[0]._address, 0, 1)
        );
        await helpers.expectToDeepEqual(
            [ethers.constants.HashZero],
            orderBook.hashesOfFromToken(fromToken.address, 0, 1)
        );
        await helpers.expectToDeepEqual(
            [ethers.constants.HashZero],
            orderBook.hashesOfToToken(toToken.address, 0, 1)
        );
    });

    it("Should return correct hashesOfMaker()", async () => {
        const { users, orderBook, hashes } = await create10Orders();

        await helpers.expectToDeepEqual(hashes, orderBook.hashesOfMaker(users[0]._address, 0, 10));
        await helpers.expectToDeepEqual(
            hashes.slice(0, 5),
            orderBook.hashesOfMaker(users[0]._address, 0, 5)
        );
        await helpers.expectToDeepEqual(
            hashes.slice(5, 10),
            orderBook.hashesOfMaker(users[0]._address, 1, 5)
        );
        await helpers.expectToDeepEqual(
            [ethers.constants.HashZero],
            orderBook.hashesOfMaker(users[1]._address, 0, 1)
        );
    });

    it("Should return correct hashesOfFromToken()", async () => {
        const { fromToken, toToken, orderBook, hashes } = await create10Orders();

        await helpers.expectToDeepEqual(
            hashes,
            orderBook.hashesOfFromToken(fromToken.address, 0, 10)
        );
        await helpers.expectToDeepEqual(
            hashes.slice(0, 5),
            orderBook.hashesOfFromToken(fromToken.address, 0, 5)
        );
        await helpers.expectToDeepEqual(
            hashes.slice(5, 10),
            orderBook.hashesOfFromToken(fromToken.address, 1, 5)
        );
        await helpers.expectToDeepEqual(
            [ethers.constants.HashZero],
            orderBook.hashesOfFromToken(toToken.address, 0, 1)
        );
    });

    it("Should return correct hashesOfToToken()", async () => {
        const { fromToken, toToken, orderBook, hashes } = await create10Orders();

        await helpers.expectToDeepEqual(hashes, orderBook.hashesOfToToken(toToken.address, 0, 10));
        await helpers.expectToDeepEqual(
            hashes.slice(0, 5),
            orderBook.hashesOfToToken(toToken.address, 0, 5)
        );
        await helpers.expectToDeepEqual(
            hashes.slice(5, 10),
            orderBook.hashesOfToToken(toToken.address, 1, 5)
        );
        await helpers.expectToDeepEqual(
            [ethers.constants.HashZero],
            orderBook.hashesOfToToken(fromToken.address, 0, 1)
        );
    });
});
