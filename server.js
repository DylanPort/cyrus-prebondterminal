// server.js

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' })); // Increase limit to handle base64 images

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '../frontend')));

// In-Memory Data Storage
let tokens = [
    {
        id: uuidv4(),
        title: 'Token Alpha',
        ticker: 'ALPHA',
        description: 'Description for Token Alpha.',
        imageUrl: 'https://via.placeholder.com/150',
        upvotes: 50, // Represents the current supply
        comments: [],
        views: 1200,
        curveA: 0.1,
        curveB: 2,
        solTarget: 0.0, // To be calculated
        collectiveSOL: 0.0,
        committedWallets: new Set(),
        upvotedWallets: new Set(), // Track wallets that have upvoted
        migrated: false, // Indicates if token has been migrated
        twitterLink: null,
        websiteLink: null,
        telegramLink: null,
    },
    {
        id: uuidv4(),
        title: 'Token Beta',
        ticker: 'BETA',
        description: 'Description for Token Beta.',
        imageUrl: 'https://via.placeholder.com/150',
        upvotes: 80,
        comments: [],
        views: 1800,
        curveA: 0.1,
        curveB: 2,
        solTarget: 0.0, // To be calculated
        collectiveSOL: 0.0,
        committedWallets: new Set(),
        upvotedWallets: new Set(),
        migrated: false,
        twitterLink: null,
        websiteLink: null,
        telegramLink: null,
    },
    // Add more sample tokens as needed
];

// Function to calculate solTarget based on current supply and bonding curve
function calculateSolTarget(token) {
    const A = token.curveA;
    const B = token.curveB;
    const s = token.upvotes;
    const n = 0.5 * s; // 50% of supply

    // solTarget = A * ( (s + n)^(b + 1) - s^(b + 1) ) / (b + 1)
    const solTarget = A * (Math.pow(s + n, B + 1) - Math.pow(s, B + 1)) / (B + 1);
    return solTarget;
}

// Initialize solTarget for existing tokens
tokens.forEach(token => {
    token.solTarget = calculateSolTarget(token);
});

// Function to calculate price based on bonding curve
function calculateBondingCurvePrice(a, b, supply, amount) {
    // Price = A * ( (supply + amount)^(b + 1) - supply^(b + 1) ) / (b + 1)
    return a * (Math.pow(supply + amount, b + 1) - Math.pow(supply, b + 1)) / (b + 1);
}

// Function to calculate total cost to buy 'n' tokens from 'supply'
function calculateCumulativeCost(a, b, supply, n) {
    return a * (Math.pow(supply + n, b + 1) - Math.pow(supply, b + 1)) / (b + 1);
}

// Routes

/**
 * @route   GET /api/tokens
 * @desc    Get all tokens
 * @access  Public
 */
app.get('/api/tokens', (req, res) => {
    console.log('GET /api/tokens - Fetching all tokens');
    try {
        const transformedTokens = tokens.map(token => ({
            ...token,
            committedWallets: Array.from(token.committedWallets),
            upvotedWallets: Array.from(token.upvotedWallets),
        }));
        res.json({
            success: true,
            tokens: transformedTokens,
            userBalance, // Assuming user balance is global for simplicity
        });
    } catch (error) {
        console.error('Error fetching tokens:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching tokens.',
        });
    }
});

let userBalance = 1000; // Virtual User Balance

/**
 * @route   POST /api/tokens
 * @desc    Create a new token
 * @access  Public
 */
app.post('/api/tokens', (req, res) => {
    const { title, ticker, description, imageUrl, curveA, curveB, twitterLink, websiteLink, telegramLink } = req.body;

    console.log('POST /api/tokens - Received token creation request:', req.body);

    // Validate Input
    if (!title || !ticker || !description || !imageUrl || curveA === undefined || curveB === undefined) {
        console.error('Validation Error: Missing required fields.');
        return res.status(400).json({
            success: false,
            message: 'All fields except optional links are required.',
        });
    }

    // Check for Duplicate Ticker
    const existingToken = tokens.find(token => token.ticker === ticker.toUpperCase());
    if (existingToken) {
        console.error(`Validation Error: Token ticker "${ticker.toUpperCase()}" already exists.`);
        return res.status(400).json({
            success: false,
            message: 'Token ticker already exists.',
        });
    }

    // Validate curveA and curveB
    const parsedCurveA = parseFloat(curveA);
    const parsedCurveB = parseFloat(curveB);

    if (isNaN(parsedCurveA) || isNaN(parsedCurveB) || parsedCurveA <= 0 || parsedCurveB <= 0) {
        console.error('Validation Error: curveA and curveB must be positive numbers.');
        return res.status(400).json({
            success: false,
            message: 'Curve parameters A and B must be positive numbers.',
        });
    }

    // Create New Token
    const newToken = {
        id: uuidv4(),
        title,
        ticker: ticker.toUpperCase(),
        description,
        imageUrl, // Base64 image string
        upvotes: 0, // Initial supply
        comments: [],
        views: 0,
        curveA: parsedCurveA,
        curveB: parsedCurveB,
        solTarget: 0.0, // To be calculated
        collectiveSOL: 0.0,
        committedWallets: new Set(),
        upvotedWallets: new Set(),
        migrated: false,
        twitterLink: twitterLink || null,
        websiteLink: websiteLink || null,
        telegramLink: telegramLink || null,
    };

    // Calculate solTarget based on initial supply
    newToken.solTarget = calculateSolTarget(newToken);

    tokens.push(newToken);

    console.log(`POST /api/tokens - Token "${newToken.ticker}" created successfully with solTarget: ${newToken.solTarget.toFixed(2)} SOL.`);

    res.status(201).json({
        success: true,
        message: `Token ${ticker.toUpperCase()} created successfully.`,
        token: {
            ...newToken,
            committedWallets: Array.from(newToken.committedWallets),
            upvotedWallets: Array.from(newToken.upvotedWallets),
        },
    });
});

/**
 * @route   POST /api/tokens/:id/commit
 * @desc    Commit SOL to a token's wallet
 * @access  Public
 */
app.post('/api/tokens/:id/commit', (req, res) => {
    const { id } = req.params;
    const { amount, walletId } = req.body;

    console.log(`POST /api/tokens/${id}/commit - Commit request: Amount=${amount} SOL, WalletID=${walletId}`);

    // Validate Input
    if (amount === undefined || isNaN(amount) || amount <= 0) {
        console.error('Validation Error: Invalid amount to commit.');
        return res.status(400).json({
            success: false,
            message: 'Please enter a valid amount to commit.',
        });
    }

    const presetAmounts = [0.2, 0.5, 1, 1.5, 2];
    if (!presetAmounts.includes(amount)) {
        console.error('Validation Error: Amount not in preset options.');
        return res.status(400).json({
            success: false,
            message: `Please select an amount from the preset options: ${presetAmounts.join(', ')} SOL.`,
        });
    }

    if (!walletId) {
        console.error('Validation Error: Missing walletId.');
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required.',
        });
    }

    const token = tokens.find(t => t.id === id);
    if (!token) {
        console.error(`POST /api/tokens/${id}/commit - Token not found.`);
        return res.status(404).json({
            success: false,
            message: 'Token not found.',
        });
    }

    // Check if wallet has already committed
    if (token.committedWallets.has(walletId)) {
        console.error(`POST /api/tokens/${id}/commit - Wallet ID ${walletId} has already committed to Token ${token.ticker}.`);
        return res.status(400).json({
            success: false,
            message: 'This wallet has already committed to this token.',
        });
    }

    // Add the amount to collectiveSOL
    token.collectiveSOL += amount;

    // Add walletId to committedWallets
    token.committedWallets.add(walletId);

    console.log(`POST /api/tokens/${id}/commit - Wallet ID ${walletId} committed ${amount} SOL to Token ${token.ticker}. Total SOL: ${token.collectiveSOL.toFixed(2)} SOL.`);

    // Check if collectiveSOL has reached or exceeded solTarget
    if (token.collectiveSOL >= token.solTarget && !token.migrated) {
        console.log(`POST /api/tokens/${id}/commit - SOL target reached for Token ${token.ticker}. Initiating migration to bonding curve and Raydium.`);
        migrateToken(token);
    }

    res.json({
        success: true,
        message: `Successfully committed ${amount} SOL to ${token.ticker}.`,
        token: {
            ...token,
            committedWallets: Array.from(token.committedWallets),
            upvotedWallets: Array.from(token.upvotedWallets),
        },
        userBalance, // Assuming user balance is global; adjust as needed
    });
});

/**
 * @route   POST /api/tokens/:id/upvote
 * @desc    Upvote a token (equivalent to buying one token)
 * @access  Public
 */
app.post('/api/tokens/:id/upvote', (req, res) => {
    const { id } = req.params;
    const { walletId } = req.body;

    console.log(`POST /api/tokens/${id}/upvote - Upvote request from WalletID=${walletId}`);

    // Validate Input
    if (!walletId) {
        console.error('Validation Error: Missing walletId.');
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required.',
        });
    }

    const token = tokens.find(t => t.id === id);
    if (!token) {
        console.error(`POST /api/tokens/${id}/upvote - Token not found.`);
        return res.status(404).json({
            success: false,
            message: 'Token not found.',
        });
    }

    // Check if wallet has already upvoted
    if (token.upvotedWallets.has(walletId)) {
        console.error(`POST /api/tokens/${id}/upvote - Wallet ID ${walletId} has already upvoted Token ${token.ticker}.`);
        return res.status(400).json({
            success: false,
            message: 'You have already upvoted this token.',
        });
    }

    // Upvote the token
    token.upvotes += 1;
    token.upvotedWallets.add(walletId);

    console.log(`POST /api/tokens/${id}/upvote - Token ${token.ticker} upvoted by Wallet ID ${walletId}. Total Upvotes: ${token.upvotes}`);

    res.json({
        success: true,
        message: `Upvoted ${token.ticker} successfully.`,
        token: {
            ...token,
            committedWallets: Array.from(token.committedWallets),
            upvotedWallets: Array.from(token.upvotedWallets),
        },
        userBalance, // Adjust as needed
    });
});

/**
 * @route   POST /api/tokens/:id/comments
 * @desc    Add a comment to a token
 * @access  Public
 */
app.post('/api/tokens/:id/comments', (req, res) => {
    const { id } = req.params;
    const { user, comment } = req.body;

    console.log(`POST /api/tokens/${id}/comments - Comment from ${user}: ${comment}`);

    // Validate Input
    if (!user || !comment) {
        console.error('Validation Error: Missing user or comment.');
        return res.status(400).json({
            success: false,
            message: 'User and comment are required.',
        });
    }

    const token = tokens.find(t => t.id === id);
    if (!token) {
        console.error(`POST /api/tokens/${id}/comments - Token not found.`);
        return res.status(404).json({
            success: false,
            message: 'Token not found.',
        });
    }

    const newComment = {
        user,
        comment,
        timestamp: new Date(),
    };

    token.comments.push(newComment);

    console.log(`POST /api/tokens/${id}/comments - Comment added by ${user} to Token ${token.ticker}.`);

    res.status(201).json({
        success: true,
        message: 'Comment added successfully.',
        comment: newComment,
    });
});

/**
 * @route   GET /api/tokens/trending
 * @desc    Get top 5 trending tokens based on upvotes
 * @access  Public
 */
app.get('/api/tokens/trending', (req, res) => {
    console.log('GET /api/tokens/trending - Fetching trending tokens');
    try {
        const trendingTokens = [...tokens]
            .sort((a, b) => b.upvotes - a.upvotes)
            .slice(0, 5)
            .map(token => ({
                ...token,
                committedWallets: Array.from(token.committedWallets),
                upvotedWallets: Array.from(token.upvotedWallets),
            }));

        res.json({
            success: true,
            trending: trendingTokens,
        });
    } catch (error) {
        console.error('Error fetching trending tokens:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching trending tokens.',
        });
    }
});

/**
 * @route   GET /api/migrated-tokens
 * @desc    Get all migrated tokens
 * @access  Public
 */
app.get('/api/migrated-tokens', (req, res) => {
    console.log('GET /api/migrated-tokens - Fetching migrated tokens');
    try {
        const migratedTokens = tokens.filter(token => token.migrated).map(token => ({
            ...token,
            committedWallets: Array.from(token.committedWallets),
            upvotedWallets: Array.from(token.upvotedWallets),
        }));

        res.json({
            success: true,
            migratedTokens,
        });
    } catch (error) {
        console.error('Error fetching migrated tokens:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching migrated tokens.',
        });
    }
});

/**
 * @route   GET /api/migrated-tokens/:id
 * @desc    Get a specific migrated token
 * @access  Public
 */
app.get('/api/migrated-tokens/:id', (req, res) => {
    const { id } = req.params;
    console.log(`GET /api/migrated-tokens/${id} - Fetching specific migrated token`);

    const token = tokens.find(t => t.id === id && t.migrated);
    if (!token) {
        console.error(`GET /api/migrated-tokens/${id} - Token not found or not migrated.`);
        return res.status(404).json({
            success: false,
            message: 'Migrated token not found.',
        });
    }

    res.json({
        success: true,
        token: {
            ...token,
            committedWallets: Array.from(token.committedWallets),
            upvotedWallets: Array.from(token.upvotedWallets),
        },
    });
});

/**
 * @route   POST /api/tokens/:id/buy-migrated
 * @desc    Buy tokens from migrated tokens with desired amount of SOL
 * @access  Public
 */
app.post('/api/tokens/:id/buy-migrated', (req, res) => {
    const { id } = req.params;
    const { solAmount, walletId } = req.body;

    console.log(`POST /api/tokens/${id}/buy-migrated - Buy migrated tokens: SOL Amount=${solAmount}, WalletID=${walletId}`);

    // Validate Input
    if (solAmount === undefined || isNaN(solAmount) || solAmount <= 0) {
        console.error('Validation Error: Invalid SOL amount to buy.');
        return res.status(400).json({
            success: false,
            message: 'Please enter a valid SOL amount to buy.',
        });
    }

    if (!walletId) {
        console.error('Validation Error: Missing walletId.');
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required.',
        });
    }

    const token = tokens.find(t => t.id === id && t.migrated);
    if (!token) {
        console.error(`POST /api/tokens/${id}/buy-migrated - Migrated Token not found.`);
        return res.status(404).json({
            success: false,
            message: 'Migrated token not found.',
        });
    }

    // Calculate Price based on SOL amount
    const A = token.curveA;
    const B = token.curveB;
    const supply = token.upvotes;
    const price = calculateBondingCurvePrice(A, B, supply, solAmount);

    console.log(`POST /api/tokens/${id}/buy-migrated - Calculated price: ${price.toFixed(2)} units for ${solAmount} SOL`);

    if (userBalance < price) {
        console.error('POST /api/tokens/:id/buy-migrated - Transaction Error: Insufficient balance.');
        return res.status(400).json({
            success: false,
            message: 'Insufficient balance to buy tokens.',
        });
    }

    // Update Token Supply and User Balance
    token.upvotes += solAmount;
    userBalance -= price;

    console.log(`POST /api/tokens/${id}/buy-migrated - Transaction Successful: Bought ${solAmount} SOL worth ${token.ticker}. New balance: ${userBalance.toFixed(2)} units.`);

    res.json({
        success: true,
        message: `Bought ${solAmount} SOL worth ${token.ticker} for ${price.toFixed(2)} units.`,
        token: {
            ...token,
            committedWallets: Array.from(token.committedWallets),
            upvotedWallets: Array.from(token.upvotedWallets),
        },
        userBalance,
    });
});

/**
 * @route   POST /api/tokens/:id/sell-migrated
 * @desc    Sell tokens from migrated tokens and receive desired amount of SOL
 * @access  Public
 */
app.post('/api/tokens/:id/sell-migrated', (req, res) => {
    const { id } = req.params;
    const { solAmount, walletId } = req.body;

    console.log(`POST /api/tokens/${id}/sell-migrated - Sell migrated tokens: SOL Amount=${solAmount}, WalletID=${walletId}`);

    // Validate Input
    if (solAmount === undefined || isNaN(solAmount) || solAmount <= 0) {
        console.error('Validation Error: Invalid SOL amount to sell.');
        return res.status(400).json({
            success: false,
            message: 'Please enter a valid SOL amount to sell.',
        });
    }

    if (!walletId) {
        console.error('Validation Error: Missing walletId.');
        return res.status(400).json({
            success: false,
            message: 'Wallet ID is required.',
        });
    }

    const token = tokens.find(t => t.id === id && t.migrated);
    if (!token) {
        console.error(`POST /api/tokens/${id}/sell-migrated - Migrated Token not found.`);
        return res.status(404).json({
            success: false,
            message: 'Migrated token not found.',
        });
    }

    if (token.upvotes < solAmount) {
        console.error(`POST /api/tokens/${id}/sell-migrated - Transaction Error: Not enough tokens to sell.`);
        return res.status(400).json({
            success: false,
            message: `You don't own enough ${token.ticker} to sell.`,
        });
    }

    // Calculate Refund based on SOL amount
    const A = token.curveA;
    const B = token.curveB;
    const supply = token.upvotes;
    const refund = calculateCumulativeCost(A, B, supply - solAmount, solAmount);

    console.log(`POST /api/tokens/${id}/sell-migrated - Calculated refund: ${refund.toFixed(2)} units for ${solAmount} SOL`);

    // Update Token Supply and User Balance
    token.upvotes -= solAmount;
    userBalance += refund;

    console.log(`POST /api/tokens/${id}/sell-migrated - Transaction Successful: Sold ${solAmount} SOL worth ${token.ticker}. New balance: ${userBalance.toFixed(2)} units.`);

    res.json({
        success: true,
        message: `Sold ${solAmount} SOL worth ${token.ticker} for ${refund.toFixed(2)} units.`,
        token: {
            ...token,
            committedWallets: Array.from(token.committedWallets),
            upvotedWallets: Array.from(token.upvotedWallets),
        },
        userBalance,
    });
});

// Function to handle migration when solTarget is reached
function migrateToken(token) {
    // Placeholder for actual migration logic
    // In a real scenario, this would involve interacting with blockchain services
    console.log(`Migrating Token ${token.ticker} to bonding curve and then to Raydium.`);
    // Simulate migration steps
    token.migrated = true; // Add a field to indicate migration
    // Further migration logic would go here
}

// Fallback Route to Serve Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html')); // Adjusted path
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
