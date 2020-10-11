const { ethers, deployments } = require("@nomiclabs/buidler");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

const create10Orders = async () => {
    const { chainId, users, createOrder } = await helpers.setup();
    const orderBook = await helpers.getContract("OrderBook");
    const fromToken = WETH[chainId];
    const toToken = DAI[chainId];

    const orders = [];
    for (let i = 0; i < 10; i++) {
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100 + i * 10),
            ethers.BigNumber.from(Math.floor(Date.now() / 1000 + 3600 + Math.random() * 3600))
        );
        orders.push(order);
    }
    return { users, fromToken, toToken, orderBook, orders };
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
        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orderOfHash(hash));
        await helpers.expectToDeepEqual([hash], orderBook.allHashes(0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0]._address, 0, 1));
        await helpers.expectToDeepEqual(
            [hash],
            orderBook.hashesOfFromToken(fromToken.address, 0, 1)
        );
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address, 0, 1));
    });

    it("Should cancelOrder()", async () => {
        const { orders } = await create10Orders();
        const { chainId, users, cancelOrder } = await helpers.setup();
        const orderBook = await helpers.getContract("OrderBook");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const order = orders[5];
        const hash = await order.hash();
        await cancelOrder(users[0], hash);

        const hashes = await Promise.all(
            orders
                .filter(o => o !== order)
                .sort((o1, o2) => o1.deadline.sub(o2.deadline).toNumber())
                .map(order => order.hash())
        );
        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orderOfHash(hash));
        await helpers.expectToDeepEqual(hashes, orderBook.allHashes(0, 9));
        await helpers.expectToDeepEqual(hashes, orderBook.hashesOfMaker(users[0]._address, 0, 9));
        await helpers.expectToDeepEqual(
            hashes,
            orderBook.hashesOfFromToken(fromToken.address, 0, 9)
        );
        await helpers.expectToDeepEqual(hashes, orderBook.hashesOfToToken(toToken.address, 0, 9));
    });

    it("Should return correct hashesOfMaker()", async () => {
        const { users, orderBook, orders } = await create10Orders();

        const hashes = await Promise.all(
            orders
                .sort((o1, o2) => o1.deadline.sub(o2.deadline).toNumber())
                .map(order => order.hash())
        );
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
        const { fromToken, toToken, orderBook, orders } = await create10Orders();

        const hashes = await Promise.all(
            orders
                .sort((o1, o2) => o1.deadline.sub(o2.deadline).toNumber())
                .map(order => order.hash())
        );
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
        const { fromToken, toToken, orderBook, orders } = await create10Orders();

        const hashes = await Promise.all(
            orders
                .sort((o1, o2) => o1.deadline.sub(o2.deadline).toNumber())
                .map(order => order.hash())
        );
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
