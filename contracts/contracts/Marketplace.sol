// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import "./BaseNFT.sol";
import "./ERC20Token.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

contract Marketplace is
    Initializable,
    PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    ERC721HolderUpgradeable
{
    // Global platform fee (in basis points, 10 = 0.1%)
    uint256 public platformFee;
    address private feeRecipient;

    BaseNFT private nftContract;
    IERC20 public USDC;

    struct NFTDetails {
        address nftOwner;
        uint256 nftId;
        string metadata;
        uint256 totalSupply;
        uint256 pricePerFraction;
        address erc20TokenAddress;
        bool isFractionalized;
    }
    struct NFTResaleDetails {
        address seller;
        uint256 amount;
        uint256 amountSold;
        uint256 pricePerFraction;
    }

    mapping(uint256 => NFTDetails) private nfts;
    mapping(uint256 => address[]) private holderList;
    mapping(uint256 => NFTResaleDetails[]) private resales;

    event NFTFractionalized(
        uint256 indexed nftId,
        address erc20TokenAddress,
        uint256 totalSupply,
        uint256 pricePerFraction
    );
    event FractionBought(
        address indexed buyer,
        address indexed erc20Token,
        uint256 amount,
        uint256 pricePaid
    );
    event RoyaltyDistributed(
        address indexed erc20Token,
        uint256 amount,
        uint256 timestamp
    );

    function initialize(
        address _usdcAddress,
        address _feeRecipient
    ) public initializer {
        __Pausable_init();
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __ERC721Holder_init();

        nftContract = new BaseNFT(address(this), "Fractionalized NFT", "fNFT");
        USDC = IERC20(_usdcAddress);
        platformFee = 10; // Set initial platform fee to 0.1%
        feeRecipient = _feeRecipient;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function mintAndFractionalizeNFT(
        uint256 totalSupply,
        uint256 pricePerFraction,
        string calldata metadata
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(totalSupply > 0, "Total supply must be greater than zero");
        require(pricePerFraction > 0, "Price per fraction must be positive");

        nftContract.safeMint(address(this));

        uint256 nftId = nftContract.totalSupply() - 1;

        string memory tokenName = string(
            abi.encodePacked("Fraction of NFT ", Strings.toString(nftId))
        );
        string memory tokenSymbol = string(
            abi.encodePacked("fNFT", Strings.toString(nftId))
        );

        ERC20Token newToken = new ERC20Token(tokenName, tokenSymbol);

        newToken.mint(msg.sender, totalSupply);

        nfts[nftId] = NFTDetails({
            nftOwner: msg.sender,
            nftId: nftId,
            metadata: metadata,
            totalSupply: totalSupply,
            pricePerFraction: pricePerFraction,
            erc20TokenAddress: address(newToken),
            isFractionalized: true
        });

        NFTResaleDetails[] storage resaleList = resales[nftId];
        resaleList.push(
            NFTResaleDetails({
                seller: msg.sender,
                amount: totalSupply,
                amountSold: 0,
                pricePerFraction: pricePerFraction
            })
        );

        emit NFTFractionalized(
            nftId,
            address(newToken),
            totalSupply,
            pricePerFraction
        );

        return nftId;
    }

    function fetchAllListings() external view returns (NFTDetails[] memory) {
        uint256 totalListings = nftContract.totalSupply();
        NFTDetails[] memory listings = new NFTDetails[](totalListings);

        for (uint256 i = 0; i < totalListings; i++) {
            listings[i] = nfts[i];
        }

        return listings;
    }

    function quickSort(
        NFTResaleDetails[] storage resaleList,
        int left,
        int right
    ) private {
        int i = left;
        int j = right;
        if (i == j) return;
        uint pivot = resaleList[uint(left + (right - left) / 2)]
            .pricePerFraction;
        while (i <= j) {
            while (resaleList[uint(i)].pricePerFraction < pivot) i++;
            while (pivot < resaleList[uint(j)].pricePerFraction) j--;
            if (i <= j) {
                NFTResaleDetails memory temp = resaleList[uint(i)];
                resaleList[uint(i)] = resaleList[uint(j)];
                resaleList[uint(j)] = temp;
                i++;
                j--;
            }
        }
        if (left < j) quickSort(resaleList, left, j);
        if (i < right) quickSort(resaleList, i, right);
    }

    function updateListing(
        uint256 nftId,
        uint256 pricePerFraction,
        string calldata metadata
    ) external nonReentrant whenNotPaused {
        require(pricePerFraction > 0, "Price per fraction must be positive");

        NFTDetails storage nftDetails = nfts[nftId];
        require(
            nftDetails.nftOwner == msg.sender,
            "Only the owner can update the listing"
        );

        nftDetails.pricePerFraction = pricePerFraction;
        nftDetails.metadata = metadata;

        NFTResaleDetails[] storage resaleList = resales[nftId];
        for (uint256 i = 0; i < resaleList.length; i++) {
            NFTResaleDetails storage resale = resaleList[i];
            if (resale.seller == msg.sender) {
                resale.pricePerFraction = pricePerFraction;
            }
        }
        if (resaleList.length > 1) {
            quickSort(resaleList, 0, int(resaleList.length - 1));
        }
    }

    function updateHolderList(
        uint256 nftId,
        address buyer,
        address seller,
        address erc20TokenAddress
    ) private {
        ERC20Token erc20Token = ERC20Token(erc20TokenAddress);

        address[] storage holders = holderList[nftId];
        bool holderExists = false;
        bool sellerRemoved = false;

        uint256 i = 0;
        while (i < holders.length) {
            if (holders[i] == buyer) {
                holderExists = true;
            }
            if (erc20Token.balanceOf(seller) == 0 && holders[i] == seller) {
                holders[i] = holders[holders.length - 1];
                holders.pop();
                sellerRemoved = true;
                continue;
            }
            if (sellerRemoved && holderExists) {
                break;
            }
            i++;
        }
        if (!holderExists) {
            holders.push(buyer);
        }
    }

    function buyFractions(
        uint256 nftId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");

        NFTDetails storage nftDetails = nfts[nftId];
        require(nftDetails.isFractionalized, "NFT is not fractionalized");

        ERC20Token erc20Token = ERC20Token(nftDetails.erc20TokenAddress);
        NFTResaleDetails[] storage resaleDetails = resales[nftId];

        uint256 totalPrice = 0;
        uint256 remainingAmount = amount;
        for (
            uint256 i = 0;
            i < resaleDetails.length && remainingAmount > 0;
            i++
        ) {
            NFTResaleDetails storage resale = resaleDetails[i];
            uint256 availableAmount = resale.amount - resale.amountSold;
            uint256 purchaseAmount = remainingAmount > availableAmount
                ? availableAmount
                : remainingAmount;

            totalPrice =
                totalPrice +
                (purchaseAmount * resale.pricePerFraction);
            remainingAmount = remainingAmount - purchaseAmount;
        }

        require(remainingAmount == 0, "Not enough fractions listed for sale");

        uint256 platformFeeAmount = (totalPrice * platformFee) / 10000;
        uint256 totalAmount = totalPrice + platformFeeAmount;

        require(
            USDC.balanceOf(msg.sender) >= totalAmount,
            "Insufficient USDC balance for transfer"
        );
        require(
            USDC.allowance(msg.sender, address(this)) >= totalAmount,
            "Insufficient USDC allowance for transfer"
        );

        remainingAmount = amount;
        for (
            int256 i = 0;
            i < int256(resaleDetails.length) && remainingAmount > 0;
            i++
        ) {
            NFTResaleDetails storage resale = resaleDetails[uint256(i)];
            uint256 availableAmount = resale.amount - resale.amountSold;
            uint256 purchaseAmount = remainingAmount > availableAmount
                ? availableAmount
                : remainingAmount;

            require(
                erc20Token.allowance(resale.seller, address(this)) >=
                    purchaseAmount,
                "Insufficient allowance for transfer"
            );

            bool success = erc20Token.transferFrom(
                resale.seller,
                msg.sender,
                purchaseAmount
            );
            require(success, "Token transfer failed");

            bool paymentSuccess = USDC.transferFrom(
                msg.sender,
                resale.seller,
                purchaseAmount * resale.pricePerFraction
            );
            require(paymentSuccess, "Payment transfer failed");

            if (msg.sender != resale.seller) {
                updateHolderList(
                    nftId,
                    msg.sender,
                    resale.seller,
                    address(erc20Token)
                );
            }

            resale.amountSold = resale.amountSold + purchaseAmount;
            remainingAmount = remainingAmount - purchaseAmount;
        }

        bool resaleRemoved = false;
        uint256 j = 0;
        while (j < resaleDetails.length) {
            NFTResaleDetails storage resale = resaleDetails[j];
            if (resale.amountSold == resale.amount) {
                resaleDetails[j] = resaleDetails[resaleDetails.length - 1];
                resaleDetails.pop();
                resaleRemoved = true;
                continue;
            }
            j++;
        }
        if (resaleRemoved && resaleDetails.length > 1) {
            quickSort(resaleDetails, 0, int(resaleDetails.length - 1));
        }

        bool feeSuccess = USDC.transferFrom(
            msg.sender,
            feeRecipient,
            platformFeeAmount
        );
        require(feeSuccess, "Fee transfer failed");

        emit FractionBought(
            msg.sender,
            address(erc20Token),
            amount,
            totalPrice
        );
    }

    function sellFractions(
        uint256 nftId,
        uint256 amount,
        uint256 pricePerFraction
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than zero");
        require(
            pricePerFraction > 0,
            "Price per fraction must be greater than zero"
        );

        NFTDetails storage nftDetails = nfts[nftId];
        require(nftDetails.isFractionalized, "NFT is not fractionalized");

        ERC20Token erc20Token = ERC20Token(nftDetails.erc20TokenAddress);
        require(
            erc20Token.balanceOf(msg.sender) >= amount,
            "Not enough fractions available"
        );
        require(
            erc20Token.allowance(msg.sender, address(this)) >= amount,
            "Insufficient allowance for transfer"
        );

        NFTResaleDetails memory newResale = NFTResaleDetails({
            seller: msg.sender,
            amount: amount,
            amountSold: 0,
            pricePerFraction: pricePerFraction
        });

        NFTResaleDetails[] storage resaleList = resales[nftId];
        resaleList.push(newResale);
        if (resaleList.length > 1) {
            quickSort(resaleList, 0, int(resaleList.length - 1));
        }
    }

    function unlistFractions(
        uint256 nftId,
        uint256 pricePerFraction
    ) external whenNotPaused {
        NFTResaleDetails[] storage resaleList = resales[nftId];
        uint256 len = resaleList.length;
        require(len > 0, "No resales available");

        for (uint256 i = 0; i < len; ++i) {
            NFTResaleDetails storage resale = resaleList[i];
            if (
                resale.seller == msg.sender &&
                resale.pricePerFraction == pricePerFraction
            ) {
                resaleList[i] = resaleList[len - 1];
                resaleList.pop();
                break;
            }
        }
        if (resaleList.length > 1) {
            quickSort(resaleList, 0, int(resaleList.length - 1));
        }
    }

    function depositRevenue(
        uint256 nftId
    ) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Must deposit ETH");

        NFTDetails storage nftDetails = nfts[nftId];
        address[] storage holders = holderList[nftId];
        ERC20Token erc20Token = ERC20Token(nftDetails.erc20TokenAddress);

        uint256 totalEarnings = msg.value;
        uint256 totalSupply = nftDetails.totalSupply;
        uint256 transferedAmount = 0;

        for (uint256 i = 0; i < holders.length; i++) {
            address holder = holders[i];
            uint256 holderBalance = erc20Token.balanceOf(holder);

            if (holderBalance == 0 || holder == address(0)) continue;

            uint256 holderShare = (totalEarnings * holderBalance) / totalSupply;
            if (holderShare > 0) {
                (bool success, ) = payable(holder).call{value: holderShare}("");
                require(success, "Transfer failed");
                transferedAmount = transferedAmount + holderShare;
            }
        }

        if (transferedAmount < totalEarnings) {
            (bool success, ) = payable(owner()).call{
                value: totalEarnings - transferedAmount
            }("");
            require(success, "Transfer failed");
        }

        emit RoyaltyDistributed(
            nftDetails.erc20TokenAddress,
            totalEarnings,
            block.timestamp
        );
    }

    function setPlatformFee(uint256 newFee) external onlyOwner {
        platformFee = newFee;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid address");
        feeRecipient = newRecipient;
    }

    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    function withdrawERC20(
        address tokenAddress,
        uint256 amount
    ) external onlyOwner {
        require(amount > 0, "Amount must be greater than zero");

        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(balance >= amount, "Insufficient token balance");

        bool success = token.transfer(owner(), amount);
        require(success, "Token transfer failed");
    }
}
