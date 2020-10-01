// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/UniswapV2Library.sol";

abstract contract UniswapV2Router02Delegator {
    IUniswapV2Router02 public router = IUniswapV2Router02(
        0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
    );

    address public immutable factory;
    // solhint-disable-next-line var-name-mixedcase
    address public immutable WETH;

    constructor() public {
        factory = router.factory();
        WETH = router.WETH();
    }

    function fillOrders(bytes memory args) public virtual;

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bytes memory args
    )
        public
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        fillOrders(args);
        return
            router.addLiquidity(
                tokenA,
                tokenB,
                amountADesired,
                amountBDesired,
                amountAMin,
                amountBMin,
                to,
                deadline
            );
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bytes memory args
    )
        public
        payable
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        )
    {
        fillOrders(args);
        return
            router.addLiquidityETH(
                token,
                amountTokenDesired,
                amountTokenMin,
                amountETHMin,
                to,
                deadline
            );
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bytes memory args
    ) public returns (uint256 amountA, uint256 amountB) {
        fillOrders(args);
        return
            router.removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bytes memory args
    ) public returns (uint256 amountToken, uint256 amountETH) {
        fillOrders(args);
        return
            router.removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to, deadline);
    }

    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes memory args
    ) public returns (uint256 amountA, uint256 amountB) {
        fillOrders(args);
        return
            router.removeLiquidityWithPermit(
                tokenA,
                tokenB,
                liquidity,
                amountAMin,
                amountBMin,
                to,
                deadline,
                approveMax,
                v,
                r,
                s
            );
    }

    function removeLiquidityETHWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes memory args
    ) public returns (uint256 amountToken, uint256 amountETH) {
        fillOrders(args);
        return
            router.removeLiquidityETHWithPermit(
                token,
                liquidity,
                amountTokenMin,
                amountETHMin,
                to,
                deadline,
                approveMax,
                v,
                r,
                s
            );
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public returns (uint256[] memory amounts) {
        fillOrders(args);
        return router.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public returns (uint256[] memory amounts) {
        fillOrders(args);
        return router.swapTokensForExactTokens(amountOut, amountInMax, path, to, deadline);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public payable returns (uint256[] memory amounts) {
        fillOrders(args);
        return router.swapExactETHForTokens(amountOutMin, path, to, deadline);
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public returns (uint256[] memory amounts) {
        fillOrders(args);
        return router.swapTokensForExactETH(amountOut, amountInMax, path, to, deadline);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public returns (uint256[] memory amounts) {
        fillOrders(args);
        return router.swapExactTokensForETH(amountIn, amountOutMin, path, to, deadline);
    }

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public payable returns (uint256[] memory amounts) {
        fillOrders(args);
        return router.swapETHForExactTokens(amountOut, path, to, deadline);
    }

    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure returns (uint256 amountB) {
        return UniswapV2Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        return UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountIn) {
        return UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        return router.getAmountsOut(amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        return router.getAmountsIn(amountOut, path);
    }

    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bytes memory args
    ) public returns (uint256 amountETH) {
        fillOrders(args);
        return
            router.removeLiquidityETHSupportingFeeOnTransferTokens(
                token,
                liquidity,
                amountTokenMin,
                amountETHMin,
                to,
                deadline
            );
    }

    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes memory args
    ) public returns (uint256 amountETH) {
        fillOrders(args);
        return
            router.removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
                token,
                liquidity,
                amountTokenMin,
                amountETHMin,
                to,
                deadline,
                approveMax,
                v,
                r,
                s
            );
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public {
        fillOrders(args);
        return
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountIn,
                amountOutMin,
                path,
                to,
                deadline
            );
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public payable {
        fillOrders(args);
        return
            router.swapExactETHForTokensSupportingFeeOnTransferTokens(
                amountOutMin,
                path,
                to,
                deadline
            );
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to,
        uint256 deadline,
        bytes memory args
    ) public {
        fillOrders(args);
        return
            router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                amountIn,
                amountOutMin,
                path,
                to,
                deadline
            );
    }
}
