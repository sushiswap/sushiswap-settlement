const { ethers } = require("@nomiclabs/buidler");
const { TokenAmount, Trade, Percent, Router } = require("@sushiswap/sdk");
const getContract = require("./getContract");
const findPairs = require("./findPairs");
const sortTokens = require("./sortTokens");
const Order = require("./Order");

const allowedSlippage = new Percent("50", "10000"); // 0.05%
const twentyMinutes = 60 * 20;

const deductedAmount = (amount, percent) => {
    return amount.sub(amount.mul(percent.numerator.toString()).div(percent.denominator.toString()));
};

const fromNow = delay => {
    return ethers.BigNumber.from(Math.floor(Date.now() / 1000 + delay));
};

module.exports = async () => {
    const { chainId } = await ethers.provider.detectNetwork();
    const users = await ethers.getSigners();

    const getTrade = async (fromToken, toToken, amountIn) => {
        const factory = await getContract("UniswapV2Factory");
        const pairs = await findPairs(
            chainId,
            factory.address,
            fromToken,
            toToken,
            ethers.provider
        );
        return Trade.bestTradeExactIn(
            pairs,
            new TokenAmount(fromToken, amountIn.toString()),
            toToken,
            { maxNumResults: 1, maxHops: 3 }
        )[0];
    };

    const swap = async (signer, trade, recipient = signer._address) => {
        const router = await getContract("UniswapV2Router02", signer);
        const fromER20 = await ethers.getContractAt(
            "IUniswapV2ERC20",
            trade.route.path[0].address,
            signer
        );
        await fromER20.approve(router.address, trade.inputAmount.raw.toString());

        const { methodName, args } = Router.swapCallParameters(trade, {
            ttl: fromNow(twentyMinutes).toNumber(),
            recipient,
            allowedSlippage,
        });
        await router.functions[methodName](...args);
    };

    const addLiquidity = async (
        signer,
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        recipient = signer._address
    ) => {
        const router = await getContract("UniswapV2Router02", signer);
        const fromER20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address, signer);
        await fromER20.approve(router.address, fromAmount);
        const toER20 = await ethers.getContractAt("IUniswapV2ERC20", toToken.address, signer);
        await toER20.approve(router.address, toAmount);

        const [token0, token1] = sortTokens(fromToken, toToken);
        const [amount0, amount1] =
            token0 === fromToken ? [fromAmount, toAmount] : [toAmount, fromAmount];

        await router.addLiquidity(
            token0.address,
            token1.address,
            amount0,
            amount1,
            deductedAmount(amount0, allowedSlippage),
            deductedAmount(amount1, allowedSlippage),
            recipient,
            fromNow(twentyMinutes)
        );
    };

    const createOrder = async (signer, fromToken, toToken, amountIn, amountOutMin, deadline) => {
        const settlement = await getContract("Settlement", signer);
        const fromERC20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address, signer);
        await fromERC20.approve(settlement.address, amountIn);

        const order = new Order(
            signer,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            signer._address,
            deadline
        );
        const orderBook = await getContract("OrderBook", signer);
        const tx = await orderBook.createOrder(await order.toArgs());

        return { order, tx };
    };

    const cancelOrder = async (signer, order) => {
        const settlement = await getContract("Settlement", signer);
        const args = await order.toArgs();
        return await settlement.cancelOrder(...args.slice(0, 7));
    };

    const fillOrder = async (signer, order, trade) => {
        const settlement = await getContract("Settlement", signer);
        return await settlement.fillOrder([
            await order.toArgs(),
            trade.inputAmount.raw.toString(),
            trade.route.path.map(token => token.address),
        ]);
    };

    const filledAmountIn = async (signer, order) => {
        const settlement = await getContract("Settlement", signer);
        return await settlement.filledAmountInOfHash(await order.hash());
    };

    return {
        chainId,
        users,
        getTrade,
        swap,
        addLiquidity,
        createOrder,
        cancelOrder,
        fillOrder,
        filledAmountIn,
    };
};
