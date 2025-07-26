// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract IdentityRegistry is Ownable, ReentrancyGuard {
    struct InvestorData {
        bool isVerified;
        string country;
        uint256 verificationTimestamp;
    }

    mapping(address => InvestorData) public investors;
    mapping(string => uint256) public countryInvestorCount;
    
    uint256 public totalVerifiedInvestors;

    event InvestorVerified(address indexed user, string country, uint256 timestamp);
    event VerificationRevoked(address indexed user, string country);

    constructor() Ownable(msg.sender) {}

    function verifyInvestor(address user, string calldata userCountry) external onlyOwner nonReentrant {
        require(user != address(0), "Invalid user address");
        require(bytes(userCountry).length > 0, "Country cannot be empty");
        require(bytes(userCountry).length <= 50, "Country name too long");
        
        
        if (!investors[user].isVerified) {
            totalVerifiedInvestors++;
            countryInvestorCount[userCountry]++;
        } else {
            
            string memory oldCountry = investors[user].country;
            if (keccak256(bytes(oldCountry)) != keccak256(bytes(userCountry))) {
                if (countryInvestorCount[oldCountry] > 0) {
                    countryInvestorCount[oldCountry]--;
                }
                countryInvestorCount[userCountry]++;
            }
        }
        
        investors[user] = InvestorData({
            isVerified: true,
            country: userCountry,
            verificationTimestamp: block.timestamp
        });
        
        emit InvestorVerified(user, userCountry, block.timestamp);
    }

    function revokeVerification(address user) external onlyOwner nonReentrant {
        require(user != address(0), "Invalid user address");
        require(investors[user].isVerified, "User not verified");
        
        string memory userCountry = investors[user].country;
        
        
        if (totalVerifiedInvestors > 0) {
            totalVerifiedInvestors--;
        }
        if (countryInvestorCount[userCountry] > 0) {
            countryInvestorCount[userCountry]--;
        }
        
        
        delete investors[user];
        
        emit VerificationRevoked(user, userCountry);
    }

    function batchVerifyInvestors(
        address[] calldata users, 
        string[] calldata countries
    ) external onlyOwner nonReentrant {
        require(users.length == countries.length, "Arrays length mismatch");
        require(users.length > 0, "Empty arrays");
        require(users.length <= 100, "Batch size too large"); 
        
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            string calldata userCountry = countries[i];
            
            require(user != address(0), "Invalid user address");
            require(bytes(userCountry).length > 0, "Country cannot be empty");
            require(bytes(userCountry).length <= 50, "Country name too long");
            
            
            if (!investors[user].isVerified) {
                totalVerifiedInvestors++;
                countryInvestorCount[userCountry]++;
            } else {
                
                string memory oldCountry = investors[user].country;
                if (keccak256(bytes(oldCountry)) != keccak256(bytes(userCountry))) {
                    if (countryInvestorCount[oldCountry] > 0) {
                        countryInvestorCount[oldCountry]--;
                    }
                    countryInvestorCount[userCountry]++;
                }
            }
            
            investors[user] = InvestorData({
                isVerified: true,
                country: userCountry,
                verificationTimestamp: block.timestamp
            });
            
            emit InvestorVerified(user, userCountry, block.timestamp);
        }
    }

    function isVerified(address user) external view returns (bool) {
        return investors[user].isVerified;
    }

    function country(address user) external view returns (string memory) {
        return investors[user].country;
    }

    function getInvestorCountry(address user) external view returns (string memory) {
        require(investors[user].isVerified, "User not verified");
        return investors[user].country;
    }

    function getInvestorData(address user) external view returns (
        bool verified,
        string memory userCountry,
        uint256 timestamp
    ) {
        InvestorData memory data = investors[user];
        return (data.isVerified, data.country, data.verificationTimestamp);
    }

    function getCountryInvestorCount(string calldata userCountry) external view returns (uint256) {
        return countryInvestorCount[userCountry];
    }
}