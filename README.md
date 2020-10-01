# Sushiswap Settlement

This repository contains solidity contracts to enable **limit orders** for Sushiswap.

## What is this for?

On Sushiswap, you can swap any ERC20 token for another ERC20 token instantly.

However it does not support limit order feature. It only allows you to submit an order with a pair of amount and price. It will either succeed or fail instantly so that you cannot submit an order of a expectedly lower price than now and wait for it to be settled.

Contracts in this repo help you submit a limit order with a lower price than what it is now. Later, when the price gets lower enough to meet the requirement of your order, it gets settled.


## How does it work?
It works in decentralized manner, without the need of any centralized authority.

`OrderBook` is the core contract that users would interact with. Anyone can call `createOrder()` to create a limit order with the amount to sell and the maximum price. On that transaction, the amount of tokens you want to sell is transferred to the contract. Then, the order is kept in the orderbook to be filled.

Now, anyone can call `fillOrder()` to fill the order submitted. He/she needs to call it with proper parameters to meet the condition set in the order. If the call is successful, reward is minted to the caller. It is possible to fill only a certain amount of tokens, not all. In most cases, submitted orders will reside on the orderbook and their amount will be filled by different callers in different blocks.

Before all the amount is filled, maker of the order can call `cancelOrder()` on it. Otherwise if the deadline of the order expired, anyone can cancel it.

## Who would fill orders and why?
`OrderBook` is a wrapper contract around `UniswapV2Router02` and `MasterChef`. Every function in these two contracts are duplicated in the `OrderBook` with an extra parameter `args`. If `args` is not empty, it is used for filling orders; see `OrderBook.fillOrders()` for details.

Users could just call normal functions without `args` for the original contracts or call it with proper `args` on `OrderBook` to be rewarded. It's their choice!

# License
MIT
