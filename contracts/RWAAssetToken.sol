// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "./ComplianceModule.sol";

contract RWAAssetToken is ERC20, ERC20Pausable, AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    ComplianceModule public immutable compliance;

    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    constructor(
        address _compliance,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        require(_compliance != address(0), "Invalid compliance address");

        compliance = ComplianceModule(_compliance);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(ISSUER_ROLE) whenNotPaused {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than 0");

        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    function burn(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) external onlyRole(ISSUER_ROLE) whenNotPaused {
        require(account != address(0), "Cannot burn from zero address");
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(account) >= amount, "Insufficient balance");

        _burn(account, amount);
        emit TokensBurned(account, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Override _update to enforce compliance and pause checks
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Pausable) {
        // Call parent implementation first (includes pause check)
        super._update(from, to, value);
        
        // Minting (from = 0) and burning (to = 0) are allowed without compliance
        if (from != address(0) && to != address(0)) {
            require(compliance.isTransferAllowed(from, to), "Transfer not compliant");
        }
    }

    /// @notice Required for AccessControl interface support
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}