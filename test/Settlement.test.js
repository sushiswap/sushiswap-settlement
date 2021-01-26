const { ethers, deployments } = require("hardhat");
const { WETH, DAI, SUSHI } = require("./tokens");
const helpers = require("./helpers");

const expectOrderCanceled = async hash => {
    const settlement = await helpers.getContract("Settlement");
    const filter = settlement.filters.OrderCanceled(hash);
    const events = await settlement.queryFilter(filter);
    helpers.chai.expect(events.length).to.be.equal(1);
};

describe("Settlement", function () {
    beforeEach(async () => {
        await deployments.fixture();
    });

    it("Should fillOrder()", async () => {
        const {
            chainId,
            users,
            getTrade,
            swap,
            addLiquidity,
            createOrder,
            fillOrder,
            filledAmountIn,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        // setup SUSHI-WETH pool for fee swapping
        await addLiquidity(
            users[0],
            WETH[chainId],
            SUSHI[chainId],
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        // Set ratio of WETH:DAI to 1:100
        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );
        // Create an order of amountOutMin to be 1% higher than the current price of 0.01 WETH
        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin
        );

        // Calling fillOrder() has no effect because the price is higher than the order
        const tx1 = await fillOrder(users[1], order, trade);
        const receipt1 = await tx1.wait();
        await helpers.expectToEqual(0, receipt1.logs.length);

        // Swap 10 DAI with WETH manually to increase the price of DAI
        await swap(
            users[0],
            await getTrade(toToken, fromToken, ethers.constants.WeiPerEther.mul(10))
        );

        const fromERC20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address);
        await helpers.expectToEqual(ethers.constants.Zero, fromERC20.balanceOf(users[1].address));

        // Call fillOrder() and it now works because DAI price increased more than 1%
        const amountIn = ethers.constants.WeiPerEther.div(100);
        const tx2 = await fillOrder(users[1], order, await getTrade(fromToken, toToken, amountIn));
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, order.hash());
        await helpers.expectToEqual(filled.amountIn, amountIn);
        await helpers.expectToEqual(amountIn, filledAmountIn(users[1], order));

        // The relayer and feeSplitRecipient should have received fees
        const address = await helpers.getPair(WETH[chainId], SUSHI[chainId]);
        const pair = await ethers.getContractAt(
            "contracts/mock/uniswapv2/interfaces/IUniswapV2Pair.sol:IUniswapV2Pair",
            address
        );
        const events = await pair.queryFilter(pair.filters.Swap());
        const fee = events[events.length - 1].args.amount1Out;
        const feeSplit = fee.mul(await settlement.feeSplitNumerator()).div(10000);

        const sushi = await helpers.getContract("SUSHI");
        await helpers.expectToEqual(
            feeSplit,
            sushi.balanceOf(await settlement.feeSplitRecipient())
        );
        await helpers.expectToEqual(fee.sub(feeSplit), sushi.balanceOf(users[1].address));
    });

    it("Should revert cancelOrder() if not called by maker", async () => {
        const { chainId, users, createOrder, cancelOrder } = await helpers.setup();

        const { order } = await createOrder(
            users[0],
            WETH[chainId],
            DAI[chainId],
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(101),
            ethers.BigNumber.from(Math.floor(Date.now() / 1000 + 3600 + Math.random() * 3600))
        );
        await helpers.expectToBeReverted("not-called-by-maker", cancelOrder(users[1], order));
    });

    it("Should cancelOrder()", async () => {
        const {
            chainId,
            users,
            addLiquidity,
            createOrder,
            cancelOrder,
            fillOrder,
            getTrade,
        } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(101),
            ethers.BigNumber.from(Math.floor(Date.now() / 1000 + 3600 + Math.random() * 3600))
        );
        await cancelOrder(users[0], order);
        await expectOrderCanceled(await order.hash(), users[0], fromToken, toToken);

        // Filling a canceled order does nothing
        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );
        const tx = await fillOrder(
            users[1],
            order,
            await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100))
        );
        const receipt = await tx.wait();
        await helpers.expectToEqual(0, receipt.logs.length);
    });
});
