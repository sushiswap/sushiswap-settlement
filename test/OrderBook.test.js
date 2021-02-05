const { ethers, deployments } = require("hardhat");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

describe("OrderBook", async () => {
    beforeEach(async () => {
        await deployments.fixture();
    });

    it("Should createOrder()", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const orderBook = await helpers.getContract("OrderBook");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100),
            getDeadline(24)
        );

        const hash = await order.hash();
        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orderOfHash(hash));

        await helpers.expectToEqual(1, orderBook.numberOfAllHashes());
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfMaker(users[0].address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfFromToken(fromToken.address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfToToken(toToken.address));

        await helpers.expectToDeepEqual([hash], orderBook.allHashes(0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0].address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfFromToken(fromToken.address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address, 0, 1));
    });

    it("Should revert createOrder() if maker isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-maker",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    maker: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if fromToken isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-from-token",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    fromToken: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if toToken isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-to-token",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    toToken: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if fromToken == toToken valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "duplicate-tokens",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    toToken: fromToken.address,
                }
            )
        );
    });

    it("Should revert createOrder() if amountIn isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-amount-in",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.Zero,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24)
            )
        );
    });

    it("Should revert createOrder() if amountOutMin isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-amount-out-min",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.Zero,
                getDeadline(24)
            )
        );
    });

    it("Should revert createOrder() if recipient isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-recipient",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                {
                    recipient: ethers.constants.AddressZero,
                }
            )
        );
    });

    it("Should revert createOrder() if deadline isn't valid", async () => {
        const { chainId, users, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-deadline",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                0
            )
        );
    });

    it("Should revert createOrder() if not signed by maker", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-signature",
            createOrder(
                users[1],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24)
            )
        );
    });

    it("Should revert createOrder() if duplicated", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const args = [
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100),
            getDeadline(24),
        ];
        await createOrder(...args);
        await helpers.expectToBeReverted("order-exists", createOrder(...args));
    });
});
