const WebSocket = require('ws');
const axios = require('axios');
const keccak256 = require('keccak256')
const chalk = require('chalk');
require('dotenv').config();
const { NFTStorage, File, Blob } = require('nft.storage')
const ethers = require('ethers');


const log = console.log;
const port = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: port });
const NFTSTORAGE_API_KEY = process.env.NFTSTORAGE_API_KEY;

const nftClient = new NFTStorage({ token: NFTSTORAGE_API_KEY });

const nftImageHashes = {
  blue: 'bafybeihfcu5elh44272jx7iuky6uwmvhauv6gjtnsy3mge7ukruovnqezu',
  green: 'bafybeigb4aoz5ce5acxsspmfv5s6pb2u7eogg3skafqaujecwwb4i4nsy4',
  orange: 'bafybeicnzvyqwaokyp3uakw5mvgw2bxpqrdbgnwsy4j5l2cveskzji4b5i',
  pink: 'bafybeifyompwju6vmtlzni2yjoz23kgpincncosvn5akrcljps7x3jgbf4',
  red: 'bafybeid3l4urrmqysuqrn7quti2fykc26mftt46sbsu5o6x44m5roe7gvu',
  yellow: 'bafybeihszguzzfhbadtlscz6ihb5br4oolrempyik3ab53tgy3cix5tmuq',
  object_3d: 'bafkreie43kjws6n7aaotqe7fp7dicac6gtlq6z4pendnirhdcwnm7wfpla'
}


const prepareData = async(data) => {
  try {

    const parsedData = JSON.parse(data);

    // Check if the selected design is valid
    if (typeof nftImageHashes[parsedData.design] === 'undefined') {
      throw new Error('Invalid design');
    }

    log(chalk.green('Received payload: ' + chalk.cyan(JSON.stringify(parsedData))));
    const hashedEmail = "0x" + keccak256(parsedData.email).toString('hex');

    return new Promise((resolve, reject) => {
      resolve(JSON.stringify({
        address: parsedData.address,
        design: parsedData.design,
        email: hashedEmail,
      }));
    });
} catch (error) {
    log(chalk.red("[ERROR] " + error.message));
    return new Promise((resolve, reject) => {
      resolve("[ERROR] " + error.message);
    });
  }
};

const newMetadataFile = async(data) => {
  
  
  const parsedJSON = JSON.parse(data);


  const obj = {
    "description": "A membership pass for Greenwich Blockchain Association. The pass allows you to access our events and to participate in voting.", 
    "external_url": "https://greblockchain.co.uk", 
    "image": `/ipfs/${nftImageHashes[parsedJSON.design]}`,
    // "animation_url": `/ipfs/${nftImageHashes.object_3d}`,
    "name": "GBA Pass Beta-testing",
    "attributes": [
      {
        "trait_type": "Color",
        "value": parsedJSON.design.charAt(0).toUpperCase() + parsedJSON.design.slice(1)
      },
      {
        "trait_type": "Member since",
        "value": `${new Date().toLocaleString('en-us',{month:'short', year:'numeric'})}`
      }
    ]
  }
  const metadataFile = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const cid = await nftClient.storeBlob(metadataFile);
  return cid;
}

// Polygon Mumbai Testnet 


const submitTransaction = async(data) => {
  
  const provider = new ethers.providers.JsonRpcProvider(process.env.MUMBAI_ENDPOINT);
  const signer = new ethers.Wallet(process.env.MASTER_PRIV_KEY, provider);
  const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    [
      "function safeMint(address to, string calldata uri, bytes32 _studentEmailHash) public ",
    ],
    signer
  );
  
  const tx = await contract.safeMint(data.address, data.uri, data.hashedEmail);
  log(chalk.green('[SUCCESS] Transaction submitted: ' + chalk.cyan(tx.hash)));
  return tx;
}



log(chalk.green.bold('Server started on port 8080'));
log(chalk.yellow('Waiting for connection...'));
wss.on('connection', function connection(ws) {

    
  // data in JSON will contain
  // 1. Student's MATIC address
  // 2. Selected design
  // 3. Student email
  // {"address":"0xblablabla","design":"blue","email":"0xrgh328gh432b9"}

  ws.on('message', function message(data) {


    (async () => {
      try {
      const preparedData = await prepareData(data)
      const preparedDataJSON = JSON.parse(preparedData);
      
      log(chalk.green('----------------------------------------'));
      log(chalk.yellow.bold('Preparing data...'));
      log(chalk.green("Target address: ") + chalk.cyan(preparedDataJSON.address))
      log(chalk.green("Selected color: ") + chalk.cyan(preparedDataJSON.design))
      log(chalk.green("Hash of student email: ") + chalk.cyan(preparedDataJSON.email))
      log(chalk.green('----------------------------------------'));

      log(chalk.yellow.bold('Uploading metadata to IPFS...'));
      ws.send(JSON.stringify({status: 'uploading_metadata'}));

      const metadataCID = await newMetadataFile(preparedData);

      log(chalk.green('[SUCCESS] CID: ' + chalk.cyan(metadataCID)));
      log(chalk.green('----------------------------------------'));

      const transactionPayload = {
        address: preparedDataJSON.address,
        uri: `/ipfs/${metadataCID}`,
        hashedEmail: preparedDataJSON.email,
      }

      log(chalk.yellow.bold('Submitting transaction...'));

      ws.send(JSON.stringify({
        status: 'submitting_tx'
      }));

      const transaction = await submitTransaction(transactionPayload);

      ws.send(JSON.stringify({
        status: 'submitted',
        txHash: transaction.hash,
      }));

      await transaction.wait();
      log(chalk.green('[SUCCESS] Transaction confirmed: ' + chalk.cyan(transaction.hash)));
      ws.send(JSON.stringify({
        status: 'confirmed',
        txHash: transaction.hash,
      }));

      // Payload for Discord Webhook
      // TRANSACTION_ID can be accessed with transaction.hash (use ${})
      // HASH_HERE - check which design was selected (preparedDataJSON.design) and use the corresponding hash from nftImageHashes (in line 18)

      const payload = {
        "content": null,
        "embeds": [
          {
            "title": "New mint!",
            "description": `Someone just claimed a pass!\n\nTransaction link: https://mumbai.polygonscan.com/tx/${transaction.hash}`,
            "color": 894228,
            "thumbnail": {
              "url": `https://cloudflare-ipfs.com/ipfs/${nftImageHashes[preparedDataJSON.design]}`
            }
          }
        ],
        "attachments": []
      }

      const webhookURL = process.env.DISCORD_WEBHOOK_URL; // test with a pasted URL from the Discord channel, but once you're done, replace it with process.env.DISCORD_WEBHOOK_URL

      // Sending notification to Discord channel
      log(chalk.yellow.bold('Sending notification to Discord...'));

      // add header content-type: application/json

      axios.post(webhookURL, JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json'
        }})
      .then((response) => {
        log(chalk.green("SUCCESS: sent notification to Discord"));
      })
      .catch((error) => {
        log(chalk.red("[ERROR] Failed to send notification to Discord"));
        log(chalk.red(error));
      })

    } catch (error) {
      log(chalk.red("[ERROR] Claim procedure failed."));
      log(chalk.red(error.message));
      ws.send(JSON.stringify({
        status: 'error'
      }));
    }
    })();
    

  });

  log(chalk.green("A client connected with IP:") + chalk.cyan(ws._socket.remoteAddress));
  
});


