import { expect } from "chai";
import hre from "hardhat";

describe("Marketplace - Basic Relisting", function () {
    let marketplace: any;
    let usdc: any;
    let owner: any;
    let seller: any;
    let relister: any;
    let buyer: any;

    const nftMetadata = {
        nftName: "Test NFT",
        imageUrls: [],
        documentUrls: [],
        description: "A test NFT",
        category: "Other",
        location: "Test Location",
        squareMeters: 1,
    };

    const initialSupply = hre.ethers.parseUnits("10", 0);
    const initialPrice = hre.ethers.parseUnits("1", 0);
    const newPrice = hre.ethers.parseUnits("2", 0);

    const relisterPurchaseAmount = hre.ethers.parseUnits("3", 0);
    const relisterResaleAmount = hre.ethers.parseUnits("1", 0);
    const relisterResalePrice = hre.ethers.parseUnits("1", 0);

    const buyerPurchaseAmount = hre.ethers.parseUnits("2", 0);

    // Because in contract we do * 10**6
    const initialUSDC = hre.ethers.parseUnits("1000", 6);

    beforeEach(async function () {
        [owner, seller, relister, buyer] = await hre.ethers.getSigners();

        const USDCToken = await hre.ethers.getContractFactory("ERC20Token");
        usdc = await USDCToken.deploy("USD Coin", "USDC");

        await usdc.mint(relister.address, initialUSDC);
        await usdc.mint(buyer.address, initialUSDC);

        const MarketplaceContract = await hre.ethers.getContractFactory("Marketplace");
        marketplace = await hre.upgrades.deployProxy(MarketplaceContract, [usdc.target, owner.address], { initializer: "initialize" })
        await marketplace.waitForDeployment();
    });

    it("Should allow the owner to update the listing price", async function () {
        // Mint and fractionalize the NFT
        await marketplace.connect(seller).mintAndFractionalizeNFT(initialSupply, initialPrice, JSON.stringify(nftMetadata));
        const listings = await marketplace.fetchAllListings();
        const erc20 = await hre.ethers.getContractAt("ERC20Token", listings[listings.length - 1].erc20TokenAddress) as any;
        await erc20.connect(seller).approve(marketplace.target, initialSupply);

        // Relister buys fractions of the NFT
        const nftId = listings[listings.length - 1].nftId;
        await usdc.connect(relister).approve(marketplace.target, initialUSDC); // Should be calculated
        await marketplace.connect(relister).buyFractions(nftId, relisterPurchaseAmount);

        // Relister lists the NFT for sale
        await erc20.connect(relister).approve(marketplace.target, relisterResaleAmount);
        await marketplace.connect(relister).sellFractions(nftId, relisterResaleAmount, relisterResalePrice);

        // Seller updates the listing price
        await marketplace.connect(seller).updateListing(nftId, newPrice, JSON.stringify(nftMetadata));

        // Buyer buy fractions of the NFT
        await usdc.connect(buyer).approve(marketplace.target, initialUSDC); // Should be calculated
        await marketplace.connect(buyer).buyFractions(nftId, buyerPurchaseAmount);

        console.log("Buyer USDC balance after purchase:", hre.ethers.formatUnits(await usdc.balanceOf(buyer.address), 6));
        expect(await erc20.balanceOf(buyer.address)).to.equal(buyerPurchaseAmount);
    });
});