// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IdentityRegistry.sol";

contract ComplianceModule is Ownable, ReentrancyGuard {
    IdentityRegistry public immutable registry;
    
    mapping(string => bool) public allowedCountries;
    mapping(address => bool) public blacklistedAddresses;
    
    bool public countryRestrictionsEnabled;
    bool public blacklistEnabled;
    uint256 public maxTransferAmount;
    uint256 public dailyTransferLimit;
    
    // Daily transfer tracking
    mapping(address => mapping(uint256 => uint256)) public dailyTransfers; // user => day => amount
    
    event CountryAllowed(string country);
    event CountryDisallowed(string country);
    event CountryRestrictionsToggled(bool enabled);
    event AddressBlacklisted(address indexed user);
    event AddressWhitelisted(address indexed user);
    event BlacklistToggled(bool enabled);
    event MaxTransferAmountSet(uint256 amount);
    event DailyTransferLimitSet(uint256 limit);

    constructor(address _registry) Ownable(msg.sender) {
        require(_registry != address(0), "Invalid registry address");
        registry = IdentityRegistry(_registry);
        
        // Default settings
        countryRestrictionsEnabled = false;
        blacklistEnabled = true;
        maxTransferAmount = type(uint256).max; // No limit by default
        dailyTransferLimit = type(uint256).max; // No limit by default
    }

    function isTransferAllowed(address from, address to) external view returns (bool) {
        return _isTransferAllowed(from, to, 0); // Amount check handled separately
    }

    function isTransferAllowedWithAmount(
        address from, 
        address to, 
        uint256 amount
    ) external view returns (bool) {
        return _isTransferAllowed(from, to, amount);
    }

    function _isTransferAllowed(
        address from, 
        address to, 
        uint256 amount
    ) internal view returns (bool) {
        // Allow minting (from = address(0)) and burning (to = address(0))
        if (from == address(0) || to == address(0)) {
            return true;
        }
        
        // Check blacklist
        if (blacklistEnabled) {
            if (blacklistedAddresses[from] || blacklistedAddresses[to]) {
                return false;
            }
        }
        
        // Check if both parties are verified
        if (!registry.isVerified(from) || !registry.isVerified(to)) {
            return false;
        }
        
        // Check country restrictions if enabled
        if (countryRestrictionsEnabled) {
            string memory fromCountry = registry.country(from);
            string memory toCountry = registry.country(to);
            
            if (!allowedCountries[fromCountry] || !allowedCountries[toCountry]) {
                return false;
            }
        }
        
        // Check transfer amount limits (skip for amount = 0 which is used for general checks)
        if (amount > 0) {
            if (amount > maxTransferAmount) {
                return false;
            }
            
            // Check daily limit
            uint256 currentDay = block.timestamp / 1 days;
            if (dailyTransfers[from][currentDay] + amount > dailyTransferLimit) {
                return false;
            }
        }
        
        return true;
    }

    function recordTransfer(address from, uint256 amount) external {
        // Only the token contract should call this - you might want to add access control
        require(from != address(0), "Invalid from address");
        
        uint256 currentDay = block.timestamp / 1 days;
        dailyTransfers[from][currentDay] += amount;
    }

    function setCountryAllowed(string calldata _country, bool allowed) external onlyOwner {
        require(bytes(_country).length > 0, "Country cannot be empty");
        require(bytes(_country).length <= 50, "Country name too long");
        
        allowedCountries[_country] = allowed;
        
        if (allowed) {
            emit CountryAllowed(_country);
        } else {
            emit CountryDisallowed(_country);
        }
    }

    function batchSetCountriesAllowed(
        string[] calldata countries, 
        bool[] calldata allowed
    ) external onlyOwner {
        require(countries.length == allowed.length, "Arrays length mismatch");
        require(countries.length > 0, "Empty arrays");
        require(countries.length <= 50, "Batch size too large");
        
        for (uint256 i = 0; i < countries.length; i++) {
            require(bytes(countries[i]).length > 0, "Country cannot be empty");
            require(bytes(countries[i]).length <= 50, "Country name too long");
            
            allowedCountries[countries[i]] = allowed[i];
            
            if (allowed[i]) {
                emit CountryAllowed(countries[i]);
            } else {
                emit CountryDisallowed(countries[i]);
            }
        }
    }

    function toggleCountryRestrictions(bool enabled) external onlyOwner {
        countryRestrictionsEnabled = enabled;
        emit CountryRestrictionsToggled(enabled);
    }

    function setAddressBlacklisted(address user, bool blacklisted) external onlyOwner {
        require(user != address(0), "Invalid user address");
        
        blacklistedAddresses[user] = blacklisted;
        
        if (blacklisted) {
            emit AddressBlacklisted(user);
        } else {
            emit AddressWhitelisted(user);
        }
    }

    function batchSetAddressesBlacklisted(
        address[] calldata users, 
        bool[] calldata blacklisted
    ) external onlyOwner {
        require(users.length == blacklisted.length, "Arrays length mismatch");
        require(users.length > 0, "Empty arrays");
        require(users.length <= 100, "Batch size too large");
        
        for (uint256 i = 0; i < users.length; i++) {
            require(users[i] != address(0), "Invalid user address");
            
            blacklistedAddresses[users[i]] = blacklisted[i];
            
            if (blacklisted[i]) {
                emit AddressBlacklisted(users[i]);
            } else {
                emit AddressWhitelisted(users[i]);
            }
        }
    }

    function toggleBlacklist(bool enabled) external onlyOwner {
        blacklistEnabled = enabled;
        emit BlacklistToggled(enabled);
    }

    function setMaxTransferAmount(uint256 amount) external onlyOwner {
        maxTransferAmount = amount;
        emit MaxTransferAmountSet(amount);
    }

    function setDailyTransferLimit(uint256 limit) external onlyOwner {
        dailyTransferLimit = limit;
        emit DailyTransferLimitSet(limit);
    }

    function getDailyTransferAmount(address user, uint256 day) external view returns (uint256) {
        return dailyTransfers[user][day];
    }

    function getCurrentDayTransferAmount(address user) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        return dailyTransfers[user][currentDay];
    }

    function getRemainingDailyLimit(address user) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;
        uint256 used = dailyTransfers[user][currentDay];
        
        if (used >= dailyTransferLimit) {
            return 0;
        }
        
        return dailyTransferLimit - used;
    }

    function isCountryAllowed(string calldata _country) external view returns (bool) {
        if (!countryRestrictionsEnabled) {
            return true;
        }
        return allowedCountries[_country];
    }

    function isAddressBlacklisted(address user) external view returns (bool) {
        if (!blacklistEnabled) {
            return false;
        }
        return blacklistedAddresses[user];
    }
}