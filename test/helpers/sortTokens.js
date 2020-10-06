module.exports = (tokenA, tokenB) => {
    return tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
};
