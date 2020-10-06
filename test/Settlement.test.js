const { ethers, deployments } = require("@nomiclabs/buidler");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

describe("Settlement", function () {
    beforeEach(async () => {
        await deployments.fixture();
    });

    it("Should fillOrder()", async () => {
        const {
            chainId,
            user,
            settlement,
            getTrade,
            swap,
            addLiquidity,
            createOrder,
            fillOrder,
        } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        // Set ratio of WETH:DAI to 1:100
        await addLiquidity(
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        // Create an order of amountOutMin to be 1% higher than the current price of 0.01 WETH
        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);
        const { order } = await createOrder(
            user,
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin
        );

        // Calling fillOrder() has no effect because the price is higher than the order
        const tx1 = await fillOrder(order, trade);
        const receipt1 = await tx1.wait();
        await helpers.expectToEqual(0, receipt1.logs.length);

        // Swap 10 DAI with WETH manually to increase the price of DAI
        await swap(await getTrade(toToken, fromToken, ethers.constants.WeiPerEther.mul(10)));

        // Call fillOrder() and it now works because DAI price increased more than 1%
        const amountIn = ethers.constants.WeiPerEther.div(100);
        const tx2 = await fillOrder(order, await getTrade(fromToken, toToken, amountIn));
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data);
        await helpers.expectToEqual(filled.hash, order.getHash());
        await helpers.expectToEqual(filled.amountIn, amountIn);
    });
});
