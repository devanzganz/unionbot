const { SigningCosmWasmClient } = require("@cosmjs/cosmwasm-stargate");
const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { coin } = require("@cosmjs/amino");
const { GasPrice } = require("@cosmjs/stargate");
const crypto = require('crypto');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to generate random amount between min and max (inclusive)
function getRandomAmount(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function executeIbcTransfer(transferCount) {
    for (let i = 0; i < transferCount; i++) {
        console.log(`\n=== Processing Transaction ${i + 1}/${transferCount} ===`);
        
        const salt = '0x' + crypto.randomBytes(32).toString('hex');
        const mnemonic = "zero impose such leaf cattle duck obvious disease envelope exact cloth olympic";
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
            prefix: "stride",
        });

        const rpcEndpoint = "https://rpc.stride-internal-1.stride.chain.kitchen/";
        const gasPrice = GasPrice.fromString("0.025ustrd");
        const client = await SigningCosmWasmClient.connectWithSigner(
            rpcEndpoint,
            wallet,
            { 
                gasPrice,
                gasLimits: { execute: 600_000 }
            }
        );

        const [account] = await wallet.getAccounts();
        console.log(`Sender Address: ${account.address}`);
        console.log(`Using salt: ${salt}`);

        const contractAddress = "stride1x2jzeup7uwfxjxxrtfna2ktcugltntgu6kvc0eeayk0d82l247cq35prus";

        // Generate random amount between 100 and 210
        const randomAmount = getRandomAmount(100, 210);
        const amountString = randomAmount.toString();

        const executeMsg = {
            transfer: {
                channel_id: 50,
                receiver: "0x756e696f6e31766b797a686367337964786e68616e337239326778386b35617139307833616d637176686375",
                base_token: "ustrd",
                base_amount: amountString,
                quote_token: "0x756e696f6e31703366663335387764666476307a6d7067776d67353577337178766a6b6a657a67667764306c3074656867796c66743530796d71703534726330",
                quote_amount: amountString,
                timeout_height: 1000000000,
                timeout_timestamp: 0,
                salt: salt
            }
        };

        const funds = [coin(randomAmount, "ustrd")];
        const fee = {
            amount: [coin(1000, "ustrd")],
            gas: "512396"
        };

        try {
            const result = await client.execute(
                account.address,
                contractAddress,
                executeMsg,
                fee,
                `${i + 1}`,
                funds
            );
            
            console.log(`✅ Transaction ${i + 1} successful!`);
            console.log("Amount sent:", amountString + "ustrd");
            console.log("Tx Hash:", result.transactionHash);
        } catch (error) {
            console.error(`❌ Error in transaction ${i + 1}:`);
            console.error(error.message);
            if (error.rawLog) {
                console.log("Raw Log:", error.rawLog);
            }
        }

        // Delay between transactions (optional)
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

readline.question('How many transactions do you want to send? ', async (count) => {
    const transferCount = parseInt(count);
    if (isNaN(transferCount)) {
        console.error("Please enter a valid number");
        process.exit(1);
    }

    console.log(`\nInitiating ${transferCount} IBC transfers with random amounts (100-210ustrd)...`);
    await executeIbcTransfer(transferCount);
    readline.close();
});