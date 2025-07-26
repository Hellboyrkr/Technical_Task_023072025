const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RWA Token System", function () {
    let registry, compliance, token;
    let owner, issuer, pauser, investor1, investor2, investor3, nonVerified;

    beforeEach(async function () {
        [owner, issuer, pauser, investor1, investor2, investor3, nonVerified] = await ethers.getSigners();

        // Deploy contracts in correct order - NO .deployed() calls needed
        const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
        registry = await IdentityRegistry.deploy();

        const ComplianceModule = await ethers.getContractFactory("ComplianceModule");
        compliance = await ComplianceModule.deploy(registry.target);

        const RWAAssetToken = await ethers.getContractFactory("RWAAssetToken");
        token = await RWAAssetToken.deploy(compliance.target, "Test RWA", "TRWA");

        // Setup roles
        const issuerRole = await token.ISSUER_ROLE();
        const pauserRole = await token.PAUSER_ROLE();
        await token.grantRole(issuerRole, issuer.address);
        await token.grantRole(pauserRole, pauser.address);

        // Verify investors
        await registry.verifyInvestor(investor1.address, "IN");
        await registry.verifyInvestor(investor2.address, "US");
        await registry.verifyInvestor(investor3.address, "UK");

        // Mint initial tokens
        await token.connect(issuer).mint(investor1.address, ethers.parseEther("1000"));
    });

    describe("IdentityRegistry", function () {
        it("Should verify investors correctly", async function () {
            expect(await registry.isVerified(investor1.address)).to.be.true;
            expect(await registry.country(investor1.address)).to.equal("IN");
            expect(await registry.totalVerifiedInvestors()).to.equal(3);
        });

        it("Should track country investor counts", async function () {
            expect(await registry.getCountryInvestorCount("IN")).to.equal(1);
            expect(await registry.getCountryInvestorCount("US")).to.equal(1);
            expect(await registry.getCountryInvestorCount("UK")).to.equal(1);
        });

        it("Should revoke verification and update counters", async function () {
            await registry.revokeVerification(investor1.address);
            expect(await registry.isVerified(investor1.address)).to.be.false;
            expect(await registry.country(investor1.address)).to.equal("");
            expect(await registry.totalVerifiedInvestors()).to.equal(2);
            expect(await registry.getCountryInvestorCount("IN")).to.equal(0);
        });

        it("Should batch verify investors", async function () {
            const users = [nonVerified.address];
            const countries = ["DE"];
            
            await registry.batchVerifyInvestors(users, countries);
            expect(await registry.isVerified(nonVerified.address)).to.be.true;
            expect(await registry.country(nonVerified.address)).to.equal("DE");
            expect(await registry.totalVerifiedInvestors()).to.equal(4);
        });

        it("Should update country when re-verifying", async function () {
            await registry.verifyInvestor(investor1.address, "CA");
            expect(await registry.country(investor1.address)).to.equal("CA");
            expect(await registry.getCountryInvestorCount("IN")).to.equal(0);
            expect(await registry.getCountryInvestorCount("CA")).to.equal(1);
        });

        it("Should only allow owner to verify", async function () {
            await expect(
                registry.connect(investor1).verifyInvestor(nonVerified.address, "UK")
            ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
        });

        it("Should reject invalid inputs", async function () {
            await expect(
                registry.verifyInvestor(ethers.ZeroAddress, "UK")
            ).to.be.revertedWith("Invalid user address");

            await expect(
                registry.verifyInvestor(investor1.address, "")
            ).to.be.revertedWith("Country cannot be empty");
        });

        it("Should get investor data", async function () {
            const [verified, country, timestamp] = await registry.getInvestorData(investor1.address);
            expect(verified).to.be.true;
            expect(country).to.equal("IN");
            expect(timestamp).to.be.greaterThan(0);
        });
    });

    describe("ComplianceModule", function () {
        it("Should allow transfers between verified users", async function () {
            expect(
                await compliance.isTransferAllowed(investor1.address, investor2.address)
            ).to.be.true;
        });

        it("Should reject transfers involving non-verified users", async function () {
            expect(
                await compliance.isTransferAllowed(investor1.address, nonVerified.address)
            ).to.be.false;
            expect(
                await compliance.isTransferAllowed(nonVerified.address, investor1.address)
            ).to.be.false;
        });

        it("Should allow minting and burning", async function () {
            expect(
                await compliance.isTransferAllowed(ethers.ZeroAddress, investor1.address)
            ).to.be.true;
            expect(
                await compliance.isTransferAllowed(investor1.address, ethers.ZeroAddress)
            ).to.be.true;
        });

        it("Should handle country restrictions", async function () {
            // Enable country restrictions
            await compliance.toggleCountryRestrictions(true);
            
            // Allow only specific countries
            await compliance.setCountryAllowed("IN", true);
            await compliance.setCountryAllowed("US", false);
            
            // Should reject transfer involving disallowed country
            expect(
                await compliance.isTransferAllowed(investor1.address, investor2.address)
            ).to.be.false;
            
            // Allow US
            await compliance.setCountryAllowed("US", true);
            expect(
                await compliance.isTransferAllowed(investor1.address, investor2.address)
            ).to.be.true;
        });

        it("Should handle blacklist functionality", async function () {
            // Blacklist investor1
            await compliance.setAddressBlacklisted(investor1.address, true);
            
            expect(
                await compliance.isTransferAllowed(investor1.address, investor2.address)
            ).to.be.false;
            
            // Remove from blacklist
            await compliance.setAddressBlacklisted(investor1.address, false);
            expect(
                await compliance.isTransferAllowed(investor1.address, investor2.address)
            ).to.be.true;
        });

        it("Should handle transfer limits", async function () {
            const transferAmount = ethers.parseEther("100");
            const maxAmount = ethers.parseEther("50");
            
            // Set max transfer amount
            await compliance.setMaxTransferAmount(maxAmount);
            
            expect(
                await compliance.isTransferAllowedWithAmount(investor1.address, investor2.address, transferAmount)
            ).to.be.false;
            
            expect(
                await compliance.isTransferAllowedWithAmount(investor1.address, investor2.address, maxAmount)
            ).to.be.true;
        });

        it("Should handle daily transfer limits", async function () {
            const dailyLimit = ethers.parseEther("200");
            const firstTransfer = ethers.parseEther("150");
            const secondTransfer = ethers.parseEther("100");
            
            await compliance.setDailyTransferLimit(dailyLimit);
            
            // First transfer should be allowed
            expect(
                await compliance.isTransferAllowedWithAmount(investor1.address, investor2.address, firstTransfer)
            ).to.be.true;
            
            // Record the transfer
            await compliance.recordTransfer(investor1.address, firstTransfer);
            
            // Second transfer should exceed daily limit
            expect(
                await compliance.isTransferAllowedWithAmount(investor1.address, investor2.address, secondTransfer)
            ).to.be.false;
            
            // Check remaining limit
            const remaining = await compliance.getRemainingDailyLimit(investor1.address);
            expect(remaining).to.equal(dailyLimit - firstTransfer);
        });

        it("Should batch set countries", async function () {
            const countries = ["FR", "DE", "JP"];
            const allowed = [true, false, true];
            
            await compliance.batchSetCountriesAllowed(countries, allowed);
            
            expect(await compliance.allowedCountries("FR")).to.be.true;
            expect(await compliance.allowedCountries("DE")).to.be.false;
            expect(await compliance.allowedCountries("JP")).to.be.true;
        });

        it("Should only allow owner to modify settings", async function () {
            await expect(
                compliance.connect(investor1).setCountryAllowed("FR", true)
            ).to.be.revertedWithCustomError(compliance, "OwnableUnauthorizedAccount");
        });
    });

    describe("RWAAssetToken", function () {
        it("Should mint tokens correctly", async function () {
            const amount = ethers.parseEther("500");
            await token.connect(issuer).mint(investor2.address, amount);
            expect(await token.balanceOf(investor2.address)).to.equal(amount);
        });

        it("Should only allow issuer to mint", async function () {
            await expect(
                token.connect(investor1).mint(investor2.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("Should allow transfers between verified users", async function () {
            const amount = ethers.parseEther("100");
            await token.connect(investor1).transfer(investor2.address, amount);
            expect(await token.balanceOf(investor2.address)).to.equal(amount);
            expect(await token.balanceOf(investor1.address)).to.equal(ethers.parseEther("900"));
        });

        it("Should reject transfers to non-verified users", async function () {
            await expect(
                token.connect(investor1).transfer(nonVerified.address, ethers.parseEther("100"))
            ).to.be.revertedWith("Transfer not compliant");
        });

        it("Should allow burning tokens", async function () {
            const initialBalance = await token.balanceOf(investor1.address);
            const burnAmount = ethers.parseEther("100");
            
            await token.connect(investor1).burn(burnAmount);
            expect(await token.balanceOf(investor1.address)).to.equal(initialBalance - burnAmount);
        });

        it("Should allow issuer to burn from accounts", async function () {
            const initialBalance = await token.balanceOf(investor1.address);
            const burnAmount = ethers.parseEther("50");
            
            await token.connect(issuer).burnFrom(investor1.address, burnAmount);
            expect(await token.balanceOf(investor1.address)).to.equal(initialBalance - burnAmount);
        });

        it("Should pause and unpause correctly", async function () {
            await token.connect(pauser).pause();
            expect(await token.paused()).to.be.true;
            
            await expect(
                token.connect(investor1).transfer(investor2.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(token, "EnforcedPause");
            
            await token.connect(pauser).unpause();
            expect(await token.paused()).to.be.false;
            
            await token.connect(investor1).transfer(investor2.address, ethers.parseEther("100"));
            expect(await token.balanceOf(investor2.address)).to.equal(ethers.parseEther("100"));
        });

        it("Should reject minting to zero address", async function () {
            await expect(
                token.connect(issuer).mint(ethers.ZeroAddress, ethers.parseEther("100"))
            ).to.be.revertedWith("Cannot mint to zero address");
        });

        it("Should reject burning more than balance", async function () {
            await expect(
                token.connect(investor1).burn(ethers.parseEther("2000"))
            ).to.be.revertedWith("Insufficient balance");
        });

        it("Should emit events correctly", async function () {
            const amount = ethers.parseEther("100");
            
            await expect(token.connect(issuer).mint(investor2.address, amount))
                .to.emit(token, "TokensMinted")
                .withArgs(investor2.address, amount);
                
            await expect(token.connect(investor1).burn(amount))
                .to.emit(token, "TokensBurned")
                .withArgs(investor1.address, amount);
        });

        it("Should support interface correctly", async function () {
            // ERC165 interface ID
            expect(await token.supportsInterface("0x01ffc9a7")).to.be.true;
            // AccessControl interface ID
            expect(await token.supportsInterface("0x7965db0b")).to.be.true;
        });

        it("Should handle role management", async function () {
            const newIssuer = investor3.address;
            const issuerRole = await token.ISSUER_ROLE();
            
            await token.grantRole(issuerRole, newIssuer);
            expect(await token.hasRole(issuerRole, newIssuer)).to.be.true;
            
            await token.connect(investor3).mint(investor2.address, ethers.parseEther("50"));
            expect(await token.balanceOf(investor2.address)).to.equal(ethers.parseEther("50"));
            
            await token.revokeRole(issuerRole, newIssuer);
            expect(await token.hasRole(issuerRole, newIssuer)).to.be.false;
        });
    });

    describe("Integration Tests", function () {
        it("Should handle complete workflow", async function () {
            // 1. Verify new investor
            await registry.verifyInvestor(nonVerified.address, "CA");
            
            // 2. Mint tokens to new investor
            await token.connect(issuer).mint(nonVerified.address, ethers.parseEther("500"));
            
            // 3. Transfer between investors
            await token.connect(investor1).transfer(nonVerified.address, ethers.parseEther("100"));
            
            // 4. Check balances
            expect(await token.balanceOf(nonVerified.address)).to.equal(ethers.parseEther("600"));
            expect(await token.balanceOf(investor1.address)).to.equal(ethers.parseEther("900"));
        });

        it("Should handle compliance changes affecting transfers", async function () {
            // Initially transfer should work
            await token.connect(investor1).transfer(investor2.address, ethers.parseEther("50"));
            
            // Enable country restrictions and disallow US
            await compliance.toggleCountryRestrictions(true);
            await compliance.setCountryAllowed("IN", true);
            await compliance.setCountryAllowed("US", false);
            
            // Transfer should now fail
            await expect(
                token.connect(investor1).transfer(investor2.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Transfer not compliant");
            
            // Allow US again
            await compliance.setCountryAllowed("US", true);
            
            // Transfer should work again
            await token.connect(investor1).transfer(investor2.address, ethers.parseEther("50"));
        });

        it("Should handle verification revocation", async function () {
            // Transfer should work initially
            await token.connect(investor1).transfer(investor2.address, ethers.parseEther("50"));
            
            // Revoke verification for investor2
            await registry.revokeVerification(investor2.address);
            
            // Transfer should now fail
            await expect(
                token.connect(investor1).transfer(investor2.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Transfer not compliant");
            
            // Re-verify investor2
            await registry.verifyInvestor(investor2.address, "US");
            
            // Transfer should work again
            await token.connect(investor1).transfer(investor2.address, ethers.parseEther("50"));
        });
    });
});