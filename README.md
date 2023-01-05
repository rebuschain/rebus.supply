# Supply Info API

An API for basic info about the any cosmos token supply.

This project was started from https://github.com/NodesGuru/supply-info-api

The base route `/` returns all info in JSON:

```json
{
  "apr": 234,
  "bonded_ratio": 0.12274190702916529,
  "circulating_supply": "92244001.11459994",
  "community_pool": "1643386.6813694616",
  "denom": "REBUS",
  "total_staked": "48745859.13990689",
  "total_supply": "397141125.7959692"
}
```

## Other routes

- `/circulating-supply`: returns circulating supply in plain text
- `/total-supply`: returns total supply in plain text


#### Parse vesting accounts:
```bash
cd $HOME
git clone https://github.com/rebuschain/rebus.supply.git
cd ~/rebus.supply
cp .env.example .env #
wget https://github.com/rebuschain/rebus.mainnet/raw/master/reb_1111-1/genesis.zip
unzip genesis.zip
cat genesis.json | jq -r '.app_state.auth.accounts[] | select(."@type" | contains ("vesting")) | .base_vesting_account.base_account.address' > vesting_accounts_unformatted
sed -i '$ d' vesting_accounts_unformatted
tr '\n' ',' < vesting_accounts_unformatted > vesting_accounts
sed -i '$ s/.$//' vesting_accounts
sed -i '$ d' ~/rebus.supply/.env
echo "VESTING_ACCOUNTS=$(cat vesting_accounts)" >> ~/rebus.supply/.env
```

#### Test with the progress bar:
> :warning: **Do not forget to install NodeJS** and (optional) Yarn
```bash
cd ~/rebus.supply
yarn # or npm install
yarn start # or npm run start
```
Press `Ctrl + C` to exit.

#### Test:
```bash
curl localhost:3000 | jq .
```

### How circulating supply is calculated

1. Get total supply.
2. Get community pool.
3. Subtract community pool from total supply.
4. Iterate through list of vesting amounts for large accounts (like the Dev Fund), and subtract the vesting ammount from total supply.
5. Remove the unclaimed amount of the airdrop module from total supply.

This yields the circulating supply.

Vesting accounts are provided by an environment variable. See `.env.example` for an example.
