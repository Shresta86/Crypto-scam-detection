import os
import json

BASE_PATH = "data/cex-addresses/data/etherscan"

EXCHANGES = [
    "bitfinex",
    "bitget",
    "bitstamp",
    "bittrex",
    "coinbase",
    "coinone",
    "crypto-com",
    "gemini",
    "gate-io",
    "hitbtc",
    "kraken",
    "okx",
    "poloniex",
    "upbit"
]

dataset = []

for exchange in EXCHANGES:
    file_path = os.path.join(BASE_PATH, exchange, "accounts.json")

    if not os.path.exists(file_path):
        print(f"Skipping {exchange} - accounts.json not found")
        continue

    with open(file_path, "r") as file:
        accounts = json.load(file)

    for account in accounts:
        dataset.append({
            "address": account["address"].lower(),
            "exchange": exchange,
            "nameTag": account.get("nameTag", "")
        })

output_path = "data/exchange_addresses.json"

with open(output_path, "w") as file:
    json.dump(dataset, file, indent=2)

print(f"Created {output_path}")
print(f"Total addresses: {len(dataset)}")