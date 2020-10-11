# Sushiswap Settlement

This repository contains solidity contracts to enable **limit orders** for Sushiswap.

## Overview

On Sushiswap, you can swap any ERC20 token for another ERC20 token instantly.

However it does not support limit order feature. It only allows you to submit an order with a pair of amount and price. It will either succeed or fail instantly so that you cannot submit an order of a expectedly lower price than now and wait for it to be settled.

Contracts in this repo help you submit a limit order with a lower price than what it is now. Later, when the price gets lower enough to meet the requirement of your order, it gets settled.


## Contracts
It works in a decentralized manner, without the need of any centralized authority.

### OrderBook
`OrderBook` is deployed at `0x363a4d1500f15c0212995ecbd968291eded342ff` on kovan and rinkeby testnets.

`OrderBook` keeps limit orders that users have submitted. Anyone can call `createOrder()` to create a limit order with the amount to sell and the minimum price. He/she needs to approve the amount to sell for the `Settlement` contract.

The maker of the order can cancel it with `cancelOrder()`. It accepts the hash of the order created.

To reduce users' gas fee, OrderBook isn't deployed on the mainnet. The one on **kovan** testnet is used for production.

### Settlement
`Settlement` is deployed at `0x0a32167dfa4eada6758d77b7ac27f76e8a723df2` on the Ethereum mainnet, kovan and rinkeby testnets.

`Settlement` is in charge of swapping tokens for orders. Anyone can call `fillOrder()` to fill the order submitted. We'll call this caller a 'relayer'. Relayers need to call it with proper parameters to meet the minimum price requirement set in the order. If the call is successful, fee will be transferred to the relayer.

It is possible to fill only a certain amount of tokens, not all. In most cases, submitted orders will reside on the `OrderBook` and their amount will be filled by different callers in different blocks.

## Incentives
### Relayer
`Settlement` is a wrapper contract around `UniswapV2Router02`. Every function in this contract has a duplicated version in the `Settlement` with an extra parameter `args`. If `args` is not empty, it is used for filling orders; see `Settlement.fillOrders()` for details.

So, users for sushiswap can choose to be a relayer or not. If he/she decided to do so, calling any swap functions in `Settlement` will benefit them. Otherwise, he/she can just call functions in `UniswapV2Router02` without receiving any fee.
 
### Fee
For every `fillOrder()` call, 0.2% of fee for the amount sold is transferred to the relayer. The fee is deducted prior to the swap.

Let's assume *Alice* created an order to sell **1 ETH** with the minimum price of **500 DAI**. Current price of **ETH** is **400 DAI** so this order cannot be filled right away. Leter, when the market price goes up to **500 DAI**, *Bob* is trying to fill the entire amount of this order as a relayer.

If the call is successful, amounts of tokens transferred are:
* Limit Order Fee: **1 ETH** x 0.2% = **0.002 ETH** (goes to *Bob*; relayer)
* Swap Fee: (**1 ETH** - **0.002 ETH**) x 0.3% = **0.002994 ETH** (goes to the liquidity provider)
* ETH Amount Sold: **1 ETH** - **0.002 ETH** - **0.002994 ETH** = **0.995006 ETH** (goes to the liquidity pool)
* DAI Amount Bought: **0.995006 ETH** x **500 DAI** = **497.503 DAI** (goes to *Alice*; maker)

## License
MIT
