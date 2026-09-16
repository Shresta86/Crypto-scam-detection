import os
import requests
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

API_KEY = os.getenv("ETHERSCAN_API_KEY")
BASE_URL = "https://api.etherscan.io/v2/api"
CHAIN_ID = 1

EXCHANGE_ADDRESSES = {
    "Binance": set(),
    "Coinbase": set(),
    "Kraken": set()
}


def identify_exchange(address):
    if not address:
        return None

    address = address.lower()

    for exchange, addresses in EXCHANGE_ADDRESSES.items():
        if address in {a.lower() for a in addresses}:
            return exchange

    return None


def get_wallet_transactions(wallet_address, limit=20):

    params = {
        "chainid": CHAIN_ID,
        "module": "account",
        "action": "txlist",
        "address": wallet_address,
        "startblock": 0,
        "endblock": 999999999,
        "page": 1,
        "offset": limit,
        "sort": "desc",
        "apikey": API_KEY
    }

    response = requests.get(
        BASE_URL,
        params=params,
        timeout=20
    )

    data = response.json()

    if data.get("status") != "1":
        return []

    transactions = []

    wallet_lower = wallet_address.lower()

    for tx in data["result"]:

        from_address = tx["from"]
        to_address = tx["to"]

        if from_address.lower() == wallet_lower:
            direction = "OUT"
            counterparty = to_address
        else:
            direction = "IN"
            counterparty = from_address

        value_eth = int(tx["value"]) / 10**18

        timestamp = datetime.fromtimestamp(
            int(tx["timeStamp"]),
            timezone.utc
        ).strftime("%Y-%m-%d %H:%M:%S UTC")

        transactions.append({
            "hash": tx["hash"],
            "from": from_address,
            "to": to_address,
            "direction": direction,
            "counterparty": counterparty,
            "amount": round(value_eth, 6),
            "timestamp": timestamp,
            "exchange": identify_exchange(counterparty)
        })

    return transactions


def trace_wallet(start_wallet, max_hops=2, max_wallets=20):

    visited = set()
    queue = [(start_wallet, 0)]

    all_transactions = []
    wallet_paths = []

    while queue and len(visited) < max_wallets:

        current_wallet, hop = queue.pop(0)

        current_lower = current_wallet.lower()

        if current_lower in visited:
            continue

        visited.add(current_lower)

        transactions = get_wallet_transactions(
            current_wallet,
            limit=20
        )

        for tx in transactions:

            tx["wallet"] = current_wallet
            tx["hop"] = hop

            all_transactions.append(tx)

            # Only follow money leaving the current wallet
            if (
                tx["direction"] == "OUT"
                and tx["counterparty"]
                and tx["counterparty"].lower() != current_lower
                and hop < max_hops
            ):

                next_wallet = tx["counterparty"]

                if next_wallet.lower() not in visited:

                    queue.append(
                        (next_wallet, hop + 1)
                    )

                    wallet_paths.append({
                        "from": current_wallet,
                        "to": next_wallet,
                        "amount": tx["amount"],
                        "hash": tx["hash"],
                        "hop": hop + 1
                    })

    return {
        "start_wallet": start_wallet,
        "wallets_traced": len(visited),
        "max_hops": max_hops,
        "transactions": all_transactions,
        "paths": wallet_paths
    }


@app.route("/")
def home():
    return render_template("x.html")


@app.route("/trace", methods=["POST"])
def trace():

    data = request.get_json()

    wallet_address = data.get("wallet", "").strip()

    if not wallet_address:
        return jsonify({
            "error": "Wallet address is required"
        }), 400

    if not wallet_address.startswith("0x") or len(wallet_address) != 42:
        return jsonify({
            "error": "Invalid Ethereum wallet address"
        }), 400

    if not API_KEY:
        return jsonify({
            "error": "Etherscan API key is missing"
        }), 500

    result = trace_wallet(
        wallet_address,
        max_hops=2,
        max_wallets=20
    )

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)