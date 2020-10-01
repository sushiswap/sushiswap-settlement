// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./UniswapV2Router02Delegator.sol";
import "./MasterChefDelegator.sol";
import "./interfaces/IMintable.sol";

contract OrderBook is Ownable, UniswapV2Router02Delegator, MasterChefDelegator {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event OrderCreated(bytes32 hash);
    event OrderCancelled(bytes32 hash);
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
        Status status;
        uint256 filledAmountIn;
    }

    IMintable public rewardToken;
    // How many tokens will be rewarded for every ETH value filled (in 10^18)
    uint256 public rewardPerAmountFilled;
    mapping(address => bytes32[]) public hashesOfMaker;
    mapping(address => bytes32[]) public hashesOfFromToken;
    mapping(address => bytes32[]) public hashesOfToToken;
    mapping(bytes32 => Order) internal orders;

    constructor(
        IMasterChef _masterChef,
        IMintable _rewardToken,
        uint256 _rewardPerAmountFilled
    ) public Ownable() MasterChefDelegator(_masterChef) {
        rewardToken = _rewardToken;
        rewardPerAmountFilled = _rewardPerAmountFilled;
    }

    function updateRewardPerAmountFilled(uint256 _rewardPerAmountFilled) public onlyOwner {
        rewardPerAmountFilled = _rewardPerAmountFilled;
    }

    function hashOfOrder(
        address maker,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint256 deadline
    ) public view returns (bytes32 hash) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return
            keccak256(
                abi.encodePacked(
                    chainId,
                    address(this),
                    maker,
                    fromToken,
                    toToken,
                    amountIn,
                    amountOutMin,
                    recipient,
                    deadline
                )
            );
    }

    function fillableOrderHashesOfMaker(address maker) public view returns (bytes32[] memory) {
        return _fillableOrderHashes(hashesOfMaker[maker]);
    }

    function fillableOrderHashesOfFromToken(address fromToken)
        public
        view
        returns (bytes32[] memory)
    {
        return _fillableOrderHashes(hashesOfFromToken[fromToken]);
    }

    function fillableOrderHashesOfToToken(address toToken) public view returns (bytes32[] memory) {
        return _fillableOrderHashes(hashesOfToToken[toToken]);
    }

    function _fillableOrderHashes(bytes32[] storage hashes)
        internal
        view
        returns (bytes32[] memory)
    {
        uint256 length = 0;
        for (uint256 i = 0; i < hashes.length; i++) {
            if (orders[hashes[i]].status == Status.Fillable) {
                length += 1;
            }
        }
        bytes32[] memory fillable = new bytes32[](length);
        uint256 j = 0;
        for (uint256 i = 0; i < fillable.length; i++) {
            bytes32 hash = hashes[i];
            if (orders[hash].status == Status.Fillable) {
                fillable[j++] = hash;
            }
        }
        return fillable;
    }

    function createOrder(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint256 deadline
    ) external {
        require(fromToken != address(0), "invalid-from-token-address");
        require(toToken != address(0), "invalid-to-token-address");
        require(amountIn > 0, "invalid-amount-in");
        require(recipient != address(0), "invalid-recipient");
        require(deadline > block.timestamp, "invalid-deadline");

        bytes32 hash = hashOfOrder(
            msg.sender,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            recipient,
            deadline
        );
        require(orders[hash].status == Status.Null, "order-exists");
        hashesOfMaker[msg.sender].push(hash);
        hashesOfFromToken[fromToken].push(hash);
        hashesOfToToken[toToken].push(hash);

        Order storage order = orders[hash];
        order.maker = msg.sender;
        order.fromToken = fromToken;
        order.toToken = toToken;
        order.amountIn = amountIn;
        order.amountOutMin = amountOutMin;
        order.recipient = recipient;
        order.deadline = deadline;
        order.status = Status.Fillable;

        // msg.sender already should have allowed this contract to transfer 'fromToken'
        IERC20(fromToken).safeTransferFrom(msg.sender, address(this), amountIn);

        emit OrderCreated(hash);
    }

    function cancelOrder(bytes32 hash) public {
        Order storage order = orders[hash];
        require(order.status == Status.Fillable, "invalid-status");

        address maker = order.maker;
        require(order.deadline < block.timestamp || maker == msg.sender, "cannot-cancel-now");

        order.status = Status.Cancelled;
        IERC20(order.fromToken).safeTransfer(maker, order.amountIn.sub(order.filledAmountIn));

        emit OrderCancelled(hash);
    }

    function fillOrder(
        bytes32 hash,
        uint256 amountIn,
        address[] memory path
    ) public returns (uint256 amountOut) {
        Order storage order = orders[hash];
        // Cancel the order if deadline has expired
        if (order.status == Status.Fillable && order.deadline < block.timestamp) {
            cancelOrder(hash);
            return 0;
        }

        // Do not fill unless it's possible to do so
        if (
            order.status != Status.Fillable ||
            order.fromToken != path[0] ||
            order.toToken != path[path.length - 1] ||
            order.filledAmountIn.add(amountIn) > order.amountIn
        ) {
            return 0;
        }

        order.filledAmountIn = order.filledAmountIn + amountIn;
        if (order.filledAmountIn == order.amountIn) {
            order.status = Status.Filled;
        }
        uint256 amountOutMin = order.amountOutMin.mul(order.amountIn).div(amountIn);
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory data) = address(router).call(
            abi.encodeWithSelector(
                router.swapExactTokensForTokens.selector,
                amountIn,
                amountOutMin,
                path,
                order.recipient,
                order.deadline
            )
        );
        if (success) {
            amountOut = abi.decode(data, (uint256));
            emit OrderFilled(hash, amountIn, amountOut);

            // Reward msg.sender:
            // 1. Calculates the amount of toToken filled in ETH value (amountFilledInETH)
            // 2. (amountToMint) = (rewardPerAmountFilled) * (amountFilledInETH)
            // 3. Mint (amountToMint) to msg.sender
            IUniswapV2Factory factory = IUniswapV2Factory(factory);
            IUniswapV2Pair pair = IUniswapV2Pair(factory.getPair(order.toToken, WETH));
            (uint112 toTokenReserve, uint112 wethReserve, ) = pair.getReserves();
            uint256 amountFilledInETH = quote(amountOut, toTokenReserve, wethReserve);
            uint256 amountToMint = amountFilledInETH.mul(rewardPerAmountFilled).div(10**18);
            rewardToken.mint(msg.sender, amountToMint);
        }
        return 0;
    }

    function fillOrders(bytes calldata args)
        public
        override(MasterChefDelegator, UniswapV2Router02Delegator)
    {
        if (args.length == 0) {
            return;
        }
        uint256 length = abi.decode(args[:4], (uint256));
        for (uint256 i = 4; i < length; ) {
            // Parse each calldata for fillOrder()
            bytes32 hash = abi.decode(args[i:i + 4], (bytes32));
            uint256 amountIn = abi.decode(args[i + 4:i + 8], (uint256));
            uint256 pathLength = abi.decode(args[i + 8:i + 12], (uint256));
            address[] memory path = new address[](pathLength);
            for (uint256 j = 0; j < pathLength; j++) {
                path[j] = abi.decode(args[i + 12 + j * 20:i + 12 + j * 20 + 20], (address));
            }
            fillOrder(hash, amountIn, path);
            i = i + 12 + pathLength * 20;
        }
    }
}
