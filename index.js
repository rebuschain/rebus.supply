const axios = require("axios");
const express = require("express");
const fs = require('fs').promises;
const { Decimal } = require("@cosmjs/math");
const { QueryClient, setupAuthExtension } = require("@cosmjs/stargate");
const { Tendermint34Client } = require("@cosmjs/tendermint-rpc");
const {
  ContinuousVestingAccount,
  DelayedVestingAccount,
  PeriodicVestingAccount,
} = require("cosmjs-types/cosmos/vesting/v1beta1/vesting");
const cliProgress = require('cli-progress');
const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

require("dotenv").config();

const denom = process.env.DENOM || "arebus";
const interval = process.env.INTERVAL || 7200000;
const total_max_supply = 1000000000
const reb18 = 1000000000000000000
// const total_block_reward_supply= 635708034
const claim_wallet = process.env.AIRDROP_CLAIM_ACCOUNT;
const block_reward_staking_percent = 0.72

const vestingAccounts = process.env.VESTING_ACCOUNTS
  ? process.env.VESTING_ACCOUNTS.split(",")
  : [];

const app = express();
const port = process.env.PORT || 3000;

async function makeClientWithAuth(rpcUrl) {
  const tmClient = await Tendermint34Client.connect(rpcUrl);
  return [QueryClient.withExtensions(tmClient, setupAuthExtension), tmClient];
}

// Declare variables
let totalSupply,
  communityPool,
  communityPoolMainDenomTotal,
  circulatingSupply,
  tmpCirculatingSupply,
  apr,
  bondedRatio,
  totalStaked;

async function loadSupply() {
  circulatingSupply = await fs.readFile('circulating_supply.txt', (err, supply) => {
    return supply;
  })
}

// Gets supply info from chain
async function updateData() {
  try {
    // Create Tendermint RPC Client
    const [client, tmClient] = await makeClientWithAuth(
      process.env.RPC_ENDPOINT
    );

    await loadSupply();
    console.log("Loaded circulating supply: " + circulatingSupply);
    console.log("Updating supply info", new Date());

    // Get total supply
    totalSupply = await axios({
      method: "get",
      url: `${process.env.REST_API_ENDPOINT}/cosmos/bank/v1beta1/supply/${denom}`,
    });
    console.log("Total supply: ", totalSupply.data.amount.amount);

    // Get community pool
    communityPool = await axios({
      method: "get",
      url: `${process.env.REST_API_ENDPOINT}/cosmos/distribution/v1beta1/community_pool`,
    });

    // Get staking info
    stakingInfo = await axios({
      method: "get",
      url: `${process.env.REST_API_ENDPOINT}/cosmos/staking/v1beta1/pool`,
    });

    // Get inflation
    inflation = await axios({
      method: "get",
      url: `${process.env.REST_API_ENDPOINT}/cosmos/mint/v1beta1/inflation`,
    });

    // Get inflation
    claim_module = await axios({
      method: "get",
      url: `${process.env.REST_API_ENDPOINT}/cosmos/bank/v1beta1/balances/${claim_wallet}`,
    });
    claimAirdropBalance = claim_module.data.balances[0].amount;
    
    current_token_emission = await axios({
      method: "get",
      url: `${process.env.REST_API_ENDPOINT}/cosmos/mint/v1beta1/annual_provisions`,
    });
    current_emission = current_token_emission.data.annual_provisions;

    // normalize inflation (inflation is vs block_reward_pool not current total supply)
    
    totalStaked = stakingInfo.data.pool.bonded_tokens;
    bondedRatio = totalStaked / totalSupply.data.amount.amount;
    // apr in %
    apr = parseInt((inflation.data.inflation / bondedRatio * block_reward_staking_percent * 100), 10);

    console.log("APR: ", apr);
    console.log("Total Staked: ", totalStaked);
    console.log("Bonded ratio: ", bondedRatio);
    console.log("Airdrop module balance: ", claimAirdropBalance);

    // Loop through pool balances to find denom
    for (let i in communityPool.data.pool) {
      if (communityPool.data.pool[i].denom === denom) {
        console.log("Community pool: ", communityPool.data.pool[i].amount);
        communityPoolMainDenomTotal = communityPool.data.pool[i].amount;
        // Subtract community pool from total supply
        tmpCirculatingSupply =
          totalSupply.data.amount.amount - communityPool.data.pool[i].amount;
      }
    }

    // Iterate through vesting accounts and subtract vesting balance from total
    bar1.start(vestingAccounts.length, 0);
    for (let i = 0; i < vestingAccounts.length; i++) {
      const account = await client.auth.account(vestingAccounts[i]);
      let accountInfo = ContinuousVestingAccount.decode(account.value);
      let originalVesting =
        accountInfo.baseVestingAccount.originalVesting[0].amount;
      let delegatedFree =
        accountInfo.baseVestingAccount.delegatedFree.length > 0
          ? accountInfo.baseVestingAccount.delegatedFree[0].amount
          : 0;
      tmpCirculatingSupply -= originalVesting - delegatedFree;
      bar1.update(i);
    }    
    bar1.update(vestingAccounts.length);
    bar1.stop();
    
    // remove from circulating supply the airdrop module account balance.
    tmpCirculatingSupply -= claimAirdropBalance;
    circulatingSupply = tmpCirculatingSupply;

    console.log("Circulating supply: ", circulatingSupply/reb18);
    fs.writeFile('circulating_supply.txt', circulatingSupply.toString(), function (err) {
      if (err) return console.log(err);
    });
    console.log('Circulating supply saved');
  } catch (e) {
    console.error(e);
  }
}

// Get initial data
updateData();

// Update data on an interval (2 hours)
setInterval(updateData, interval);

app.get("/", async (req, res) => {
  res.json({
    apr,
    bonded_ratio: bondedRatio,    
    circulating_supply: (circulatingSupply/reb18).toString(),   
    community_pool: (communityPoolMainDenomTotal/reb18).toString(),  
    denom: denom.substring(1).toUpperCase(),   
    total_staked: (totalStaked/reb18).toString(),
    total_supply: (totalSupply.data.amount.amount/reb18).toString()
  });
});

app.get("/circulating-supply", async (req, res) => {
  res.send((circulatingSupply/reb18).toString());
});

app.get("/total-supply", async (req, res) => {
  res.send((totalSupply.data.amount.amount/reb18).toString());
});


app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
