// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@sushiswap/core/contracts/uniswapv2/libraries/SafeMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IMintable.sol";
import "./libraries/Verifier.sol";
import "./mixins/Ownable.sol";
import "./UniswapV2Router02Settlement.sol";

contract Settlement is Ownable, UniswapV2Router02Settlement {
    using SafeMathUniswap for uint256;
    using Orders for Orders.Order;

    IMintable public rewardToken;
    // How many tokens will be rewarded for every ETH value filled (in 10^18)
    uint256 public rewardPerAmountFilled;
    mapping(bytes32 => Orders.OrderInfo) public orderInfoOfHash;

    // solhint-disable-next-line var-name-mixedcase
    constructor(address _factory, address _WETH)
        public
        UniswapV2Router02Settlement(_factory, _WETH)
    // solhint-disable-next-line no-empty-blocks
    {
        // empty
    }

    function updateRewardToken(IMintable _rewardToken) public onlyOwner {
        rewardToken = _rewardToken;
    }

    function updateRewardPerAmountFilled(uint256 _rewardPerAmountFilled) public onlyOwner {
        rewardPerAmountFilled = _rewardPerAmountFilled;
    }

    function hash(Orders.Order memory order) external view returns (bytes32) {
        return order.hash();
    }

    function fillOrder(FillOrderArgs memory args) public override returns (uint256 amountOut) {
        bytes32 hash = args.order.hash();
        if (!_validateArgs(args, hash)) {
            return 0;
        }

        Orders.OrderInfo storage info = orderInfoOfHash[hash];
        if (_updateStatus(args, info) != Orders.Status.Fillable) {
            return 0;
        }

        // requires args.amountToFillIn to have already been approved to this
        amountOut = _swapExactTokensForTokens(
            args.amountToFillIn,
            args.order.amountOutMin.mul(args.amountToFillIn) / args.order.amountIn,
            args.path,
            args.order.recipient
        );

        if (amountOut > 0) {
            info.filledAmountIn = info.filledAmountIn + args.amountToFillIn;
            if (info.filledAmountIn == args.order.amountIn) {
                info.status = Orders.Status.Filled;
            }
            _transferReward(args.order.toToken, amountOut);

            emit OrderFilled(hash, args.amountToFillIn, amountOut);
        }
    }

    function _validateArgs(FillOrderArgs memory args, bytes32 hash) internal pure returns (bool) {
        return
            args.order.maker != address(0) &&
            args.order.fromToken != address(0) &&
            args.order.toToken != address(0) &&
            args.order.fromToken != args.order.toToken &&
            args.order.amountIn != uint256(0) &&
            args.order.amountOutMin != uint256(0) &&
            args.order.deadline != uint256(0) &&
            args.amountToFillIn > 0 &&
            args.path.length >= 2 &&
            args.order.fromToken == args.path[0] &&
            args.order.toToken == args.path[args.path.length - 1] &&
            Verifier.verify(args.order.maker, hash, args.v, args.r, args.s);
    }

    function _updateStatus(FillOrderArgs memory args, Orders.OrderInfo storage info)
        internal
        returns (Orders.Status)
    {
        if (info.status == Orders.Status.Invalid) {
            info.status = Orders.Status.Fillable;
        }
        Orders.Status status = info.status;
        if (status == Orders.Status.Fillable) {
            if (args.order.deadline < block.timestamp) {
                info.status = Orders.Status.Expired;
                return Orders.Status.Expired;
            } else if (info.filledAmountIn.add(args.amountToFillIn) > args.order.amountIn) {
                return Orders.Status.Invalid;
            } else {
                return Orders.Status.Fillable;
            }
        }
        return status;
    }

    function _swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to
    ) internal returns (uint256 amountOut) {
        uint256[] memory amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) {
            return 0;
        }
        address pair = UniswapV2Library.pairFor(factory, path[0], path[1]);
        // IERC20(path[0]).transferFrom(msg.sender, pair, amountIn)
        (bool success, ) = path[0].call(
            abi.encodeWithSelector(0x23b872dd, msg.sender, pair, amountIn)
        );
        if (!success) {
            return 0;
        }
        _swap(amounts, path, to);
        amountOut = amounts[amounts.length - 1];
    }

    function _transferReward(address toToken, uint256 amountOut) internal {
        if (address(rewardToken) == address(0) || rewardPerAmountFilled == uint256(0)) {
            return;
        }
        // 1. Calculates the amount of toToken filled in ETH value (amountFilledInETH)
        // 2. (amountToMint) = (rewardPerAmountFilled) * (amountFilledInETH)
        // 3. Mint (amountToMint) to msg.sender
        address pair = IUniswapV2Factory(factory).getPair(toToken, WETH);
        (uint112 toTokenReserve, uint112 wethReserve, ) = IUniswapV2Pair(pair).getReserves();
        uint256 amountFilledInETH = quote(amountOut, toTokenReserve, wethReserve);
        uint256 amountToMint = amountFilledInETH.mul(rewardPerAmountFilled) / 10**18;
        rewardToken.mint(msg.sender, amountToMint);
    }

    function fillOrders(FillOrderArgs[] memory args)
        public
        override
        returns (uint256[] memory amountsOut)
    {
        amountsOut = new uint256[](args.length);
        for (uint256 i = 0; i < args.length; i++) {
            amountsOut[i] = fillOrder(args[i]);
        }
    }
}
