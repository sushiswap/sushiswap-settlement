// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

import "./interfaces/IMasterChef.sol";

abstract contract MasterChefDelegator {
    IMasterChef public masterChef;

    constructor(IMasterChef _masterChef) internal {
        require(address(_masterChef) != address(0), "invalid-master-chef");
        masterChef = _masterChef;
    }

    function fillOrders(bytes memory args) public virtual;

    function migrate(uint256 _pid, bytes memory args) public {
        fillOrders(args);
        masterChef.migrate(_pid);
    }

    function massUpdatePools(bytes memory args) public {
        fillOrders(args);
        masterChef.massUpdatePools();
    }

    function updatePool(uint256 _pid, bytes memory args) public {
        fillOrders(args);
        masterChef.updatePool(_pid);
    }

    function deposit(
        uint256 _pid,
        uint256 _amount,
        bytes memory args
    ) public {
        fillOrders(args);
        masterChef.deposit(_pid, _amount);
    }

    function withdraw(
        uint256 _pid,
        uint256 _amount,
        bytes memory args
    ) public {
        fillOrders(args);
        masterChef.withdraw(_pid, _amount);
    }

    function emergencyWithdraw(uint256 _pid, bytes memory args) public {
        fillOrders(args);
        masterChef.emergencyWithdraw(_pid);
    }
}
