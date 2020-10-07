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
            users,
            getTrade,
            swap,
            addLiquidity,
            createOrder,
            fillOrder,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

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

        const fromERC20 = await ethers.getContractAt("IERC20", fromToken.address);
        await helpers.expectToEqual(ethers.constants.Zero, fromERC20.balanceOf(users[1]._address));

        // Call fillOrder() and it now works because DAI price increased more than 1%
        const amountIn = ethers.constants.WeiPerEther.div(100);
        const tx2 = await fillOrder(users[1], order, await getTrade(fromToken, toToken, amountIn));
        const receipt2 = await tx2.wait();
        const event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, order.hash());
        await helpers.expectToEqual(filled.amountIn, amountIn);

        // The relayer should have received a fee
        const fee = amountIn
            .mul(await settlement.feeNumerator())
            .div(await settlement.feeDenominator());
        await helpers.expectToEqual(fee, fromERC20.balanceOf(users[1]._address));
    });
});
