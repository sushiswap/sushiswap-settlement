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
    const [user] = await ethers.getSigners();
    const address = await user.getAddress();
    const router = await getContract("UniswapV2Router02");
    const factory = await getContract("UniswapV2Factory");
    const orderBook = await getContract("OrderBook");
    const settlement = await getContract("Settlement");

    const getTrade = async (fromToken, toToken, amountIn) => {
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

    const swap = async trade => {
        const fromER20 = await ethers.getContractAt("IERC20", trade.route.path[0].address);
        await fromER20.approve(router.address, trade.inputAmount.raw.toString());

        const { methodName, args } = Router.swapCallParameters(trade, {
            ttl: fromNow(twentyMinutes).toNumber(),
            recipient: address,
            allowedSlippage,
        });
        await router.functions[methodName](...args);
    };

    const addLiquidity = async (fromToken, toToken, fromAmount, toAmount, recipient = address) => {
        const fromER20 = await ethers.getContractAt("IERC20", fromToken.address);
        await fromER20.approve(router.address, fromAmount);
        const toER20 = await ethers.getContractAt("IERC20", toToken.address);
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

    const createOrder = async (signer, fromToken, toToken, amountIn, amountOutMin) => {
        const fromER20 = await ethers.getContractAt("IERC20", fromToken.address);
        await fromER20.approve(settlement.address, amountIn);

        const order = new Order(signer, fromToken, toToken, amountIn, amountOutMin);
        const callHash = await orderBook.createOrderCallHash(...order.toArgs());
        const signature = await signer.signMessage(ethers.utils.arrayify(callHash));
        const { v, r, s } = ethers.utils.splitSignature(signature);
        const tx = await orderBook.createOrder(...order.toArgs(), v, r, s);

        return { order, tx };
    };

    const fillOrder = async (order, trade) => {
        const { v, r, s } = await order.sign();
        const args = [
            order.toArgs(),
            v,
            r,
            s,
            trade.inputAmount.raw.toString(),
            trade.route.path.map(token => token.address),
        ];
        return await settlement.fillOrder(args);
    };

    return {
        chainId,
        user,
        address,
        orderBook,
        settlement,
        getTrade,
        swap,
        addLiquidity,
        createOrder,
        fillOrder,
    };
};
