// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/UniswapV2Library.sol";
import "./interfaces/IMintable.sol";

abstract contract BaseSettlement is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event OrderFilled(bytes32 hash, uint256 amountIn, uint256 amountOut);

    enum Status {Null, Fillable, Cancelled, Filled}

    struct Order {
        address maker;
        address fromToken;
        address toToken;
        uint256 amountIn;
        uint256 amountOutMin;
        address recipient;
        uint256 deadline;
    }

    struct OrderInfo {
        Status status;
        uint256 filledAmountIn;
    }

    struct FillOrderArgs {
        Order order;
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 amountToFillIn;
        address[] path;
    }

    IUniswapV2Router02 public router = IUniswapV2Router02(
        0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
    );
    address public immutable factory;
    // solhint-disable-next-line var-name-mixedcase
    address public immutable WETH;

    IMintable public rewardToken;
    // How many tokens will be rewarded for every ETH value filled (in 10^18)
    uint256 public rewardPerAmountFilled;
    mapping(bytes32 => OrderInfo) public orderInfoOfHash;

    constructor() public {
        factory = router.factory();
        WETH = router.WETH();
    }

    function updateRewardPerAmountFilled(uint256 _rewardPerAmountFilled) public onlyOwner {
        rewardPerAmountFilled = _rewardPerAmountFilled;
    }

    function hashOfOrder(Order memory order) public view returns (bytes32 hash) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return
            keccak256(
                abi.encodePacked(
                    chainId,
                    address(this),
                    order.maker,
                    order.fromToken,
                    order.toToken,
                    order.amountIn,
                    order.amountOutMin,
                    order.recipient,
                    order.deadline
                )
            );
    }

    function fillOrder(FillOrderArgs memory args) public returns (uint256 amountOut) {
        bytes32 hash = _canFill(args);
        if (hash == bytes32(0)) {
            return 0;
        }
        (bool success, bytes memory data) = address(router).call(
            abi.encodeWithSelector(
                router.swapExactTokensForTokens.selector,
                args.amountToFillIn,
                args.order.amountOutMin.mul(args.amountToFillIn).div(args.order.amountIn),
                args.path,
                args.order.recipient,
                args.order.deadline
            )
        );
        if (success) {
            amountOut = abi.decode(data, (uint256));
            emit OrderFilled(hash, args.amountToFillIn, amountOut);

            // Reward msg.sender:
            // 1. Calculates the amount of toToken filled in ETH value (amountFilledInETH)
            // 2. (amountToMint) = (rewardPerAmountFilled) * (amountFilledInETH)
            // 3. Mint (amountToMint) to msg.sender
            address pair = IUniswapV2Factory(factory).getPair(args.order.toToken, WETH);
            (uint112 toTokenReserve, uint112 wethReserve, ) = IUniswapV2Pair(pair).getReserves();
            uint256 amountFilledInETH = UniswapV2Library.quote(
                amountOut,
                toTokenReserve,
                wethReserve
            );
            uint256 amountToMint = amountFilledInETH.mul(rewardPerAmountFilled).div(10**18);
            rewardToken.mint(msg.sender, amountToMint);
        }
        return 0;
    }

    function _canFill(FillOrderArgs memory args) internal returns (bytes32 hash) {
        hash = hashOfOrder(args.order);
        // Verify the given signature
        if (!_verify(args.order.maker, hash, args.v, args.r, args.s)) {
            return bytes32(0);
        }

        OrderInfo storage info = orderInfoOfHash[hash];
        if (info.status == Status.Null) {
            info.status = Status.Fillable;
        }
        if (
            info.status != Status.Fillable ||
            args.order.deadline < block.timestamp ||
            args.order.fromToken != args.path[0] ||
            args.order.toToken != args.path[args.path.length - 1] ||
            info.filledAmountIn.add(args.amountToFillIn) > args.order.amountIn
        ) {
            return bytes32(0);
        }

        info.filledAmountIn = info.filledAmountIn + args.amountToFillIn;
        if (info.filledAmountIn == args.order.amountIn) {
            info.status = Status.Filled;
        }
    }

    function _verify(
        address signer,
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public pure returns (bool) {
        bool verified = signer == ecrecover(hash, v, r, s);
        if (verified) {
            return true;
        } else {
            // Consider it signed by web3.eth_sign
            hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
            return signer == ecrecover(hash, v, r, s);
        }
    }

    function fillOrders(FillOrderArgs[] memory args) public {
        for (uint256 i = 0; i < args.length; i++) {
            fillOrder(args[i]);
        }
    }
}
