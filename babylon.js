const { fromBech32 } = require("@cosmjs/encoding");
const { SigningCosmWasmClient } = require("@cosmjs/cosmwasm-stargate");
const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { coin } = require("@cosmjs/amino");
const { GasPrice } = require("@cosmjs/stargate");
const { Wallet } = require("ethers"); // Corrected ethers import
const crypto = require('crypto');
const fs = require('fs');
const { default: PQueue } = require('p-queue');
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

// ================= CONFIGURATION ================= //
const LOG_FILE = 'transaction_logsbaby.txt';
const RPC_ENDPOINTS = [
    "https://babylon-testnet-rpc.nodes.guru"
];

const CHANNELS = {
        1: { // Channel 1 (Union)
            quoteToken: "0x756e696f6e31687272336a6e737965783774737063727173703271387466787a323738366d7971716a346d646e7374326c7772323664363974737536717a7173",
            type: "cosmos",
            prefix: "union"
        },
        2: { // Channel 2 (Holesky)
            quoteToken: "0x62626e3136386666743467373737766e6639383830706c7065686a32667a776a6b656564633063327333383965716133636e6768347336736365746a617a",
            type: "ethereum"
        },
        3: { // Channel 3 (Sepolia)
            quoteToken: "0x62626e3136386666743467373737766e6639383830706c7065686a32667a776a6b656564633063327333383965716133636e6768347336736365746a617a",
            type: "ethereum"
    }
    };
const CONTRACT_ADDRESS = "bbn1x2jzeup7uwfxjxxrtfna2ktcugltntgu6kvc0eeayk0d82l247cqaa99ye";
const GAS_PRICE = GasPrice.fromString("0.025ubbn");
const FEE = {
    amount: [coin(2500, "ubbn")],
    gas: "520000"
};

// ================= STATUS DISPLAY ================= //
class StatusDisplay {
    constructor(walletCount) {
        this.wallets = Array(walletCount).fill().map(() => ({
            address: 'Initializing...',
            status: 'Waiting',
            txCount: 0,
            successCount: 0,
            failCount: 0,
            balance: 0,
            currentAction: '',
            lastTxHash: ''
        }));
        this.lastUpdate = 0;
        this.updateInterval = 500; // Update every 500ms
        this.spinnerStates = ['|', '/', '-', '\\'];
        this.spinnerIndex = 0;
    }

    updateWallet(index, updates) {
        this.wallets[index] = { ...this.wallets[index], ...updates };
        this.maybeUpdateDisplay();
    }

    maybeUpdateDisplay() {
        const now = Date.now();
        if (now - this.lastUpdate > this.updateInterval) {
            this.lastUpdate = now;
            this.updateDisplay();
        }
    }

    getSpinner() {
        this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerStates.length;
        return this.spinnerStates[this.spinnerIndex];
    }

    updateDisplay() {
        console.clear(); // Clear the console for static display
        console.log('=== Babylon Transaction Processor ===\n');
        
        this.wallets.forEach((wallet, idx) => {
            console.log(`
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡ Wallet ${idx + 1} ${this.getSpinner()} ⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡
    Address: ${wallet.address}
    Tx Number: ${wallet.status}
    Balance: ${wallet.balance} ubbn
    Transactions: ${wallet.txCount} (✅ ${wallet.successCount} ❌ ${wallet.failCount})
    TxHash: ${wallet.lastTxHash || 'None yet'}
    Status: ${wallet.currentAction}
    CHECK transaction_logs for detail
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡`);
        });
    }

    stop() {
        console.clear();
    }
}

// ================= UTILITY FUNCTIONS ================= //
function writeToLog(message, walletIndex = null) {
    const timestamp = new Date().toISOString();
    const prefix = walletIndex !== null ? `[Wallet ${walletIndex + 1}] ` : '';
    fs.appendFileSync(LOG_FILE, `${timestamp} ${prefix}${message}\n`);
}

function clearLogFile() {
    fs.writeFileSync(LOG_FILE, 'Babylon Transaction Log\n======================\n\n');
}

// ================= HELPER FUNCTIONS ================= //
function getRandomRpc() {
    return RPC_ENDPOINTS[Math.floor(Math.random() * RPC_ENDPOINTS.length)];
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function getRandomEvenAmount(min, max) {
    const randomNumber = Math.floor(Math.random() * ((max - min) / 10 + 1)) * 10 + min;
    return randomNumber.toString();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function getReceiverHex(mnemonic, channelConfig) {
    try {
        if (channelConfig.type === "cosmos") {
            // For Union (Cosmos-based chain)
            const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic.trim(), {
                prefix: channelConfig.prefix,
            });
            const [account] = await wallet.getAccounts();
            // Convert bech32 address to hex properly
            const decoded = fromBech32(account.address);
            return '0x' + Buffer.from(decoded.data).toString('hex');
        } 
        else if (channelConfig.type === "ethereum") {
            // For Ethereum-based chains (Holesky/Sepolia)
            const wallet = Wallet.fromPhrase(mnemonic.trim());
            return wallet.address.toLowerCase();
        }
        return null;
    } catch (error) {
        console.error(`Error generating address:`, error);
        return null;
    }
}

function addressToHex(address) {
    if (address.startsWith('0x')) {
        return address.toLowerCase(); // Ensure lowercase for consistency
    }
    
    try {
        // For bech32 addresses
        const decoded = fromBech32(address);
        return '0x' + Buffer.from(decoded.data).toString('hex');
    } catch (error) {
        console.error(`Error converting address to hex: ${address}`, error);
        return null;
    }
}

async function getWalletBalance(client, address) {
    try {
        const balance = await client.getBalance(address, "ubbn");
        return balance ? parseInt(balance.amount) : 0;
    } catch (error) {
        console.error("Error fetching balance:", error);
        return 0;
    }
}

// ================= CHANNEL SELECTION ================= //
async function selectChannels() {
    return new Promise((resolve) => {
        console.log('\n╔══════════════════════════════════╗');
        console.log('║      Pilih Channel untuk IBC     ║');
        console.log('╠══════════════════════════════════╣');
        console.log('║ 1. Channel 1 (Union)             ║');
        console.log('║ 2. Channel 2 (Holesky)           ║');
        console.log('║ 3. Channel 3 (Sepolia)           ║');
        console.log('║ 4. Semua Channel (1,2,3)         ║');
        console.log('║ 5. Channel Custom                ║');
        console.log('╚══════════════════════════════════╝');
        
        const question = () => {
            readline.question('\nPilihan Anda (1-5): ', (choice) => {
                const channelMap = {
                    '1': 1,  // Channel 1 (Union)
                    '2': 2,  // Channel 3 (Holesky)
                    '3': 3,  // Channel 5 (Sepolia)
                };
                
                // Validasi input
                if (!['1','2','3','4','5'].includes(choice)) {
                    console.log('Input tidak valid! Silakan masukkan angka 1-5');
                    return question(); // Tanya lagi
                }
                
                // Jika pilihan 1-4 (single channel)
                if (['1','2','3'].includes(choice)) {
                    return resolve([channelMap[choice]]);
                }
                
                // Jika pilih semua channel
                if (choice === '4') {
                    return resolve([1, 2, 3]);
                }
                
                // Jika pilihan custom
                console.log('\n╔══════════════════════════════════╗');
                console.log('║      Pilihan Custom Channel      ║');
                console.log('╠══════════════════════════════════╣');
                console.log('║ Masukkan nomor channel dipisah   ║');
                console.log('║ koma (contoh: 1,2)               ║');
                console.log('╚══════════════════════════════════╝');
                
                readline.question('\nChannel yang dipilih: ', (input) => {
                    const channels = input.split(',')
                        .map(x => x.trim())
                        .filter(x => ['1','3','5'].includes(x))
                        .map(Number);
                    
                    if (channels.length === 0) {
                        console.log('Tidak ada channel valid yang dipilih!');
                        return question(); // Tanya lagi
                    }
                    
                    resolve([...new Set(channels)]); // Hapus duplikat
                });
            });
        };
        
        question(); // Mulai pertanyaan
    });
}

// ================= WALLET PROCESSING ================= //
async function executeIbcTransferForWallet(mnemonic, roundCount, walletIndex, statusDisplay, selectedChannels) {
    try {
        statusDisplay.updateWallet(walletIndex, {
            status: 'Initializing',
            currentAction: 'Creating wallet'
        });

        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic.trim(), {
            prefix: "bbn",
        });

        const [account] = await wallet.getAccounts();
        const receiverAddressHex = addressToHex(account.address);
            if (!receiverAddressHex) {
                statusDisplay.updateWallet(walletIndex, {
                status: 'Error',
                currentAction: 'Invalid address conversion'
        });
    writeToLog(`❌ Failed to convert address to hex: ${account.address}`, walletIndex);
    return {
        error: 'Address conversion failed'
    };
}
        
        statusDisplay.updateWallet(walletIndex, {
            address: account.address.substring(0, 12) + '...' + account.address.substring(account.address.length - 6),
            status: 'Connecting',
            currentAction: 'Selecting RPC'
        });

        const rpcEndpoint = getRandomRpc();
        const client = await SigningCosmWasmClient.connectWithSigner(
            rpcEndpoint,
            wallet,
            { 
                gasPrice: GAS_PRICE,
                gasLimits: { execute: 600_000 }
            }
        );

        let currentBalance = await getWalletBalance(client, account.address);
        statusDisplay.updateWallet(walletIndex, {
            balance: currentBalance,
            status: 'Ready',
            currentAction: 'Checking balance'
        });

        writeToLog(`🔑 Wallet Address: ${account.address}`, walletIndex);
        writeToLog(`💰 Initial Balance: ${currentBalance} ubbn`, walletIndex);
        writeToLog(`📡 Selected Channels: ${selectedChannels.join(', ')}`, walletIndex);

        for (let round = 0; round < roundCount; round++) {
            statusDisplay.updateWallet(walletIndex, {
                status: `Round ${round + 1}/${roundCount}`,
                currentAction: 'Preparing transactions'
            });

            // Only use the selected channels
            const shuffledChannels = shuffleArray([...selectedChannels]);

            for (const channelId of shuffledChannels) {
                const txNumber = statusDisplay.wallets[walletIndex].txCount + 1;
                statusDisplay.updateWallet(walletIndex, {
                    currentAction: `TX ${txNumber} (Channel ${channelId})`,
                    txCount: txNumber
                });

                const salt = '0x' + crypto.randomBytes(32).toString('hex');
                const amount = getRandomEvenAmount(100, 210);
                const funds = [coin(amount, "ubbn")];
                const quoteToken = CHANNELS[channelId].quoteToken;

                if (currentBalance < parseInt(amount) + 6000) {
                    statusDisplay.updateWallet(walletIndex, {
                        status: 'Error',
                        currentAction: 'Insufficient balance',
                        failCount: statusDisplay.wallets[walletIndex].failCount + 1
                    });
                    writeToLog("❌ Insufficient balance for this transaction", walletIndex);
                    continue;
                }

                const executeMsg = {
                    transfer: {
                        channel_id: channelId,
                        receiver: await getReceiverHex(mnemonic, CHANNELS[channelId]),
                        base_token: "ubbn",
                        base_amount: amount,
                        quote_token: quoteToken,
                        quote_amount: amount,
                        timeout_height: 1000000000,
                        timeout_timestamp: 0,
                        salt: salt
                    }
                };
                try {
                    statusDisplay.updateWallet(walletIndex, {
                        currentAction: `Sending TX ${txNumber}`
                    });

                    const result = await client.execute(
                        account.address,
                        CONTRACT_ADDRESS,
                        executeMsg,
                        FEE,
                        "",
                        funds
                    );

                    statusDisplay.updateWallet(walletIndex, {
                        successCount: statusDisplay.wallets[walletIndex].successCount + 1,
                        currentAction: `TX ${txNumber} Success`,
                        lastTxHash: result.transactionHash.substring(0, 12) + '...' + 
                                    result.transactionHash.substring(result.transactionHash.length - 12)
                    });

                    writeToLog(`✅ Success! Tx Hash: ${result.transactionHash}`, walletIndex);
                    currentBalance = await getWalletBalance(client, account.address);
                    statusDisplay.updateWallet(walletIndex, { balance: currentBalance });
                    
                } catch (error) {
                    statusDisplay.updateWallet(walletIndex, {
                        failCount: statusDisplay.wallets[walletIndex].failCount + 1,
                        currentAction: `TX ${txNumber} Failed`,
                        lastTxHash: 'Failed'
                    });
                    writeToLog(`❌ Failed: ${error.message}`, walletIndex);
                }

                await new Promise(resolve => setTimeout(resolve, getRandomDelay(1, 3)));
            }
        }

        statusDisplay.updateWallet(walletIndex, {
            status: 'Completed',
            currentAction: 'All transactions done'
        });

        return {
            address: account.address,
            totalTx: statusDisplay.wallets[walletIndex].txCount,
            successfulTx: statusDisplay.wallets[walletIndex].successCount,
            failedTx: statusDisplay.wallets[walletIndex].failCount,
            finalBalance: currentBalance
        };
    } catch (error) {
        statusDisplay.updateWallet(walletIndex, {
            status: 'Error',
            currentAction: error.message,
            lastTxHash: 'Error'
        });
        writeToLog(`❌ Error processing wallet: ${error.message}`, walletIndex);
        return {
            error: error.message
        };
    }
}

// ================= MAIN EXECUTION ================= //
async function main() {
    try {
        clearLogFile();
        const mnemonics = fs.readFileSync('mnemonic.txt', 'utf8')
            .split('\n')
            .filter(m => m.trim().length > 0);
            
        if (mnemonics.length === 0) {
            console.error("No mnemonics found in mnemonic.txt");
            process.exit(1);
        }

        const statusDisplay = new StatusDisplay(mnemonics.length);
        
        // First ask for channel selection
        const selectedChannels = await selectChannels();
        
        readline.question('\nHow many FULL rounds per wallet? ', async (count) => {
            const roundCount = parseInt(count);
            if (isNaN(roundCount)) {
                console.error("Please enter a valid number");
                process.exit(1);
            }

            const queue = new PQueue({ concurrency: 4 });
            const walletPromises = mnemonics.map((mnemonic, index) => 
                queue.add(() => executeIbcTransferForWallet(mnemonic, roundCount, index, statusDisplay, selectedChannels))
            );

            const results = await Promise.all(walletPromises);
            statusDisplay.stop();

            // Final summary display
            console.log('\n📊 FINAL TRANSACTION REPORT');
            results.forEach((result, index) => {
                if (result.error) {
                    console.log(`[Wallet ${index + 1}] ❌ Error: ${result.error}`);
                } else {
                    console.log(`
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡ Wallet ${index + 1} ⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡
    Address: ${result.address}
    Final Balance: ${result.finalBalance} ubbn
    Transactions: ${result.totalTx} (✅ ${result.successfulTx} ❌ ${result.failedTx})
    Success Rate: ${Math.round((result.successfulTx/result.totalTx)*100)}%
    Channels Used: ${selectedChannels.join(', ')}
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡`);
                }
            });

            console.log('\n💾 Detailed logs saved to transaction_logs.txt');
            readline.close();
        });
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main();