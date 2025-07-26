require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
    console.log("Starting RWA Token deployment...");

    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");


    // 1. Deploy IdentityRegistry
    console.log("\n1. Deploying IdentityRegistry...");
    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy();
    const registryAddress = await registry.getAddress();
    console.log("IdentityRegistry deployed to:", registryAddress);

    // 2. Deploy ComplianceModule
    console.log("\n2. Deploying ComplianceModule...");
    const ComplianceModule = await ethers.getContractFactory("ComplianceModule");
    const compliance = await ComplianceModule.deploy(registryAddress);
    const complianceAddress = await compliance.getAddress();
    console.log("ComplianceModule deployed to:", complianceAddress);

    // 3. Deploy RWAAssetToken
    console.log("\n3. Deploying RWAAssetToken...");
    const RWAAssetToken = await ethers.getContractFactory("RWAAssetToken");
    const token = await RWAAssetToken.deploy(complianceAddress, "Real World Asset Token", "RWA");
    const tokenAddress = await token.getAddress();
    console.log("RWAAssetToken deployed to:", tokenAddress);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
});