// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@sushiswap/core/contracts/uniswapv2/libraries/SafeMath.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/TransferHelper.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/UniswapV2Library.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IERC20.sol";
import "./interfaces/ISettlement.sol";
import "./libraries/Orders.sol";
import "./libraries/EIP712.sol";

contract Settlement is ISettlement {
    using SafeMathUniswap for uint256;
    using Orders for Orders.Order;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 public immutable DOMAIN_SEPARATOR;

    // Hash of an order => if canceled
    mapping(address => mapping(bytes32 => bool)) public canceledOfHash;
    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;

    address public immutable factory;

    constructor(
        uint256 orderBookChainId,
        address orderBookAddress,
        address _factory
    ) public {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("OrderBook"),
                keccak256("1"),
                orderBookChainId,
                orderBookAddress
            )
        );

        factory = _factory;
    }

    // Fills an order
    function fillOrder(FillOrderArgs memory args) public override returns (uint256 amountOut) {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateStatus(args, hash);

        // Check if the signature is valid
        address signer = EIP712.recover(DOMAIN_SEPARATOR, hash, args.order.v, args.order.r, args.order.s);
        require(signer != address(0) && signer == args.order.maker, "invalid-signature");

        // Calculates amountOutMin
        uint256 amountOutMin = (args.order.amountOutMin.mul(args.amountToFillIn) / args.order.amountIn);

        // Requires args.amountToFillIn to have already been approved to this
        amountOut = _swapExactTokensForTokens(
            args.order.maker,
            args.amountToFillIn,
            amountOutMin,
            args.path,
            args.order.recipient
        );

        // This line is free from reentrancy issues since UniswapV2Pair prevents from them
        filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(args.amountToFillIn);

        emit OrderFilled(hash, args.amountToFillIn, amountOut);
    }

    // Checks if an order is canceled / already fully filled
    function _validateStatus(FillOrderArgs memory args, bytes32 hash) internal {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[args.order.maker][hash], "order-canceled");
        require(filledAmountInOfHash[hash].add(args.amountToFillIn) <= args.order.amountIn, "already-filled");
    }

    // Swaps an exact amount of tokens for another token through the path passed as an argument
    // Returns the amount of the final token
    function _swapExactTokensForTokens(
        address from,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to
    ) internal returns (uint256 amountOut) {
        uint256[] memory amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path);
        amountOut = amounts[amounts.length - 1];
        require(amountOut >= amountOutMin, "insufficient-amount-out");
        TransferHelper.safeTransferFrom(path[0], from, UniswapV2Library.pairFor(factory, path[0], path[1]), amountIn);
        _swap(amounts, path, to);
    }

    // requires the initial amount to have already been sent to the first pair
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = UniswapV2Library.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(factory, output, path[i + 2]) : _to;
            IUniswapV2Pair(UniswapV2Library.pairFor(factory, input, output)).swap(
                amount0Out,
                amount1Out,
                to,
                new bytes(0)
            );
        }
    }

    // Cancels an order, has to been called by order maker
    function cancelOrder(bytes32 hash) public override {
        canceledOfHash[msg.sender][hash] = true;

        emit OrderCanceled(hash);
    }
}
