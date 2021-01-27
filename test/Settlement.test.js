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

    it("Should updateFee()", async () => {
        const settlement = await helpers.getContract("Settlement");
        const maxFee = await settlement.MAX_FEE_NUMERATOR();
        await helpers.expectToBeReverted(
            "fee-too-high",
            settlement.updateFee(ethers.BigNumber.from(maxFee).add(1))
        );

        const newFee = ethers.BigNumber.from(maxFee).div(2);
        await settlement.updateFee(newFee);
        await helpers.expectToEqual(newFee, settlement.feeNumerator());
    });

    it("Should updateFeeSplit()", async () => {
        const settlement = await helpers.getContract("Settlement");
        const maxFeeSplit = await settlement.MAX_FEE_SPLIT_NUMERATOR();
        await helpers.expectToBeReverted(
            "fee-split-too-high",
            settlement.updateFeeSplit(ethers.BigNumber.from(maxFeeSplit).add(1))
        );

        const newFeeSplit = ethers.BigNumber.from(maxFeeSplit).div(2);
        await settlement.updateFeeSplit(newFeeSplit);
        await helpers.expectToEqual(newFeeSplit, settlement.feeSplitNumerator());
    });

    it("Should fillOrder()", async () => {
        const {
            chainId,
            users,
            getTrade,
            swap,
            addLiquidity,
            getDeadline,
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
            amountOutMin,
            getDeadline(24)
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

    it("Should fillOrder() when feeNumerator == 0", async () => {
        const {
            chainId,
            users,
            getTrade,
            addLiquidity,
            getDeadline,
            createOrder,
            fillOrder,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await settlement.updateFee(0);

        // Set ratio of WETH:DAI to 1:100
        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin,
            getDeadline(24)
        );

        // Calling fillOrder() has no effect because the price is higher than the order
        const tx = await fillOrder(users[1], order, await getTrade(fromToken, toToken, amountIn));
        const receipt = await tx.wait();
        const event = receipt.logs[receipt.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, order.hash());
    });

    it("Should fillOrder() with 0 amount if already filled", async () => {
        const {
            chainId,
            users,
            getDeadline,
            createOrder,
            addLiquidity,
            fillOrder,
            getTrade,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await settlement.updateFee(0);

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            getDeadline(24)
        );

        const tx1 = await fillOrder(users[1], order, trade);
        await tx1.wait();
        const tx2 = await fillOrder(users[1], order, trade);
        const receipt = await tx2.wait();
        await helpers.expectToEqual(0, receipt.logs.length);
    });

    it("Should revert fillOrder() if called by a contract", async () => {
        const {
            chainId,
            users,
            getDeadline,
            createOrder,
            addLiquidity,
            getTrade,
        } = await helpers.setup();
        const caller = await helpers.getContract("SettlementCaller");

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin,
            users[0].address,
            getDeadline(24)
        );

        await helpers.expectToBeReverted(
            "called-by-contract",
            caller.fillOrder([
                await order.toArgs(),
                trade.inputAmount.raw.toString(),
                trade.route.path.map(token => token.address),
            ])
        );
    });

    it("Should fillOrder() with 0 amount if called with insufficient allowance", async () => {
        const {
            chainId,
            users,
            getDeadline,
            addLiquidity,
            fillOrder,
            getTrade,
        } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);
        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin,
            users[0].address,
            getDeadline(24)
        );

        const tx = await fillOrder(users[1], order, trade);
        const receipt = await tx.wait();
        await helpers.expectToEqual(0, receipt.logs.length);
    });

    it("Should fillOrder() with 0 amount if called with a invalid signature", async () => {
        const {
            chainId,
            users,
            getDeadline,
            addLiquidity,
            fillOrder,
            getTrade,
        } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);

        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            users[0].address,
            getDeadline(24)
        );

        const settlement = await helpers.getContract("Settlement", users[1]);
        const fromERC20 = await ethers.getContractAt(
            "IUniswapV2ERC20",
            fromToken.address,
            users[1]
        );
        await fromERC20.approve(settlement.address, amountIn);

        const tx = await fillOrder(users[2], order, trade, { maker: users[1].address });
        const receipt = await tx.wait();
        await helpers.expectToEqual(0, receipt.logs.length);
    });

    it("Should fillOrder() with 0 amount if called with invalid args", async () => {
        const { chainId, users, addLiquidity, fillOrder, getTrade } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);

        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            users[0].address,
            0
        );

        const tx = await fillOrder(users[1], order, trade);
        const receipt = await tx.wait();
        await helpers.expectToEqual(0, receipt.logs.length);
    });

    it("Should revert cancelOrder() if not called by maker", async () => {
        const { chainId, users, getDeadline, createOrder, cancelOrder } = await helpers.setup();

        const { order } = await createOrder(
            users[0],
            WETH[chainId],
            DAI[chainId],
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(101),
            getDeadline(24)
        );
        await helpers.expectToBeReverted("not-called-by-maker", cancelOrder(users[1], order));
    });

    it("Should cancelOrder()", async () => {
        const {
            chainId,
            users,
            addLiquidity,
            getDeadline,
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
            getDeadline(24)
        );
        await cancelOrder(users[0], order);
        await expectOrderCanceled(await order.hash(), users[0], fromToken, toToken);
        await helpers.expectToBeReverted("already-canceled", cancelOrder(users[0], order));

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

    it("Should revert cancelOrder() if signature is invalid", async () => {
        const { chainId, users, getDeadline, cancelOrder } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(101),
            users[0].address,
            getDeadline(24)
        );
        await helpers.expectToBeReverted(
            "invalid-signature",
            cancelOrder(users[0], order, { maker: users[1].address })
        );
    });

    it("Should fillOrders()", async () => {
        const {
            chainId,
            users,
            getDeadline,
            createOrder,
            addLiquidity,
            getTrade,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await settlement.updateFee(0);

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const args = [];
        for (let i = 0; i < 3; i++) {
            const { order } = await createOrder(
                users[0],
                fromToken,
                toToken,
                amountIn,
                amountOutMin,
                getDeadline(i + 1)
            );
            args.push([
                await order.toArgs(),
                trade.inputAmount.raw.toString(),
                trade.route.path.map(token => token.address),
            ]);
        }

        const tx = await settlement.fillOrders(args);
        const receipt = await tx.wait();
        await helpers.expectToEqual(5, receipt.logs.length);
    });

    it("Should revert fillOrders() if no order is filled", async () => {
        const {
            chainId,
            users,
            getDeadline,
            createOrder,
            addLiquidity,
            getTrade,
        } = await helpers.setup();
        const settlement = await helpers.getContract("Settlement");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await settlement.updateFee(0);

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(2);
        const args = [];
        for (let i = 0; i < 3; i++) {
            const { order } = await createOrder(
                users[0],
                fromToken,
                toToken,
                amountIn,
                amountOutMin,
                getDeadline(i + 1)
            );
            args.push([
                await order.toArgs(),
                trade.inputAmount.raw.toString(),
                trade.route.path.map(token => token.address),
            ]);
        }

        await helpers.expectToBeReverted("no-order-filled", settlement.fillOrders(args));
    });
});
