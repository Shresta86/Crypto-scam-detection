import os
import requests
import networkx as nx

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


def format_timestamp(timestamp):

    return datetime.fromtimestamp(
        int(timestamp),
        timezone.utc
    ).strftime("%Y-%m-%d %H:%M:%S UTC")


def get_wallet_transactions(wallet_address, limit=100):

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

    try:

        response = requests.get(
            BASE_URL,
            params=params,
            timeout=20
        )

        data = response.json()

    except Exception:

        return []


    if data.get("status") != "1":

        return []


    transactions = []

    wallet_lower = wallet_address.lower()


    for tx in data["result"]:

        from_address = tx.get("from", "")

        to_address = tx.get("to", "")


        if not from_address or not to_address:
            continue


        if from_address.lower() == wallet_lower:

            direction = "OUT"

            counterparty = to_address

        else:

            direction = "IN"

            counterparty = from_address


        value_eth = int(tx.get("value", 0)) / 10**18


        timestamp = format_timestamp(
            tx["timeStamp"]
        )


        transactions.append({

            "hash": tx["hash"],

            "from": from_address,

            "to": to_address,

            "direction": direction,

            "counterparty": counterparty,

            "amount": round(value_eth, 6),

            "timestamp": timestamp,

            "exchange": identify_exchange(counterparty),

            "type": "normal"

        })


    return transactions


def get_internal_transactions(wallet_address, limit=100):

    params = {

        "chainid": CHAIN_ID,

        "module": "account",

        "action": "txlistinternal",

        "address": wallet_address,

        "startblock": 0,

        "endblock": 999999999,

        "page": 1,

        "offset": limit,

        "sort": "desc",

        "apikey": API_KEY

    }


    try:

        response = requests.get(
            BASE_URL,
            params=params,
            timeout=20
        )

        data = response.json()

    except Exception:

        return []


    if data.get("status") != "1":

        return []


    transactions = []

    wallet_lower = wallet_address.lower()


    for tx in data["result"]:

        from_address = tx.get("from", "")

        to_address = tx.get("to", "")


        if not from_address or not to_address:
            continue


        # Ignore failed internal transactions

        if str(tx.get("isError", "0")) == "1":
            continue


        if from_address.lower() == wallet_lower:

            direction = "OUT"

            counterparty = to_address

        else:

            direction = "IN"

            counterparty = from_address


        value_eth = int(tx.get("value", 0)) / 10**18


        timestamp = format_timestamp(
            tx["timeStamp"]
        )


        transactions.append({

            "hash": tx["hash"],

            "from": from_address,

            "to": to_address,

            "direction": direction,

            "counterparty": counterparty,

            "amount": round(value_eth, 6),

            "timestamp": timestamp,

            "exchange": identify_exchange(counterparty),

            "type": "internal"

        })


    return transactions


def trace_wallet(start_wallet, max_hops=5, max_wallets=50):

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


        # Get normal transactions

        normal_transactions = get_wallet_transactions(
            current_wallet,
            limit=100
        )


        # Get internal transactions

        internal_transactions = get_internal_transactions(
            current_wallet,
            limit=100
        )


        # Combine both sources

        transactions = (
            normal_transactions
            + internal_transactions
        )


        # Remove duplicate transactions

        unique_transactions = []

        seen = set()


        for tx in transactions:

            key = (

                tx["hash"].lower(),

                tx["from"].lower(),

                tx["to"].lower(),

                tx["amount"]

            )


            if key in seen:
                continue


            seen.add(key)

            unique_transactions.append(tx)


        for tx in unique_transactions:

            tx["wallet"] = current_wallet

            tx["hop"] = hop


            all_transactions.append(tx)


            # Only follow actual ETH movement

            if (

                tx["direction"] == "OUT"

                and tx["amount"] > 0

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

                        "timestamp": tx["timestamp"],

                        "hop": hop + 1,

                        "type": tx["type"]

                    })


    return {

        "start_wallet": start_wallet,

        "wallets_traced": len(visited),

        "max_hops": max_hops,

        "transactions": all_transactions,

        "paths": wallet_paths

    }


def build_wallet_graph(trace_result):

    graph = nx.DiGraph()


    start_wallet = trace_result["start_wallet"]


    graph.add_node(

        start_wallet,

        type="suspect",

        label="Suspect Wallet"

    )


    for path in trace_result["paths"]:

        from_wallet = path["from"]

        to_wallet = path["to"]


        exchange = identify_exchange(to_wallet)


        if exchange:

            node_type = "exchange"

            label = exchange

        else:

            node_type = "wallet"

            label = "Wallet"


        graph.add_node(

            from_wallet,

            type="suspect"

            if from_wallet.lower() == start_wallet.lower()

            else "wallet",

            label="Suspect Wallet"

            if from_wallet.lower() == start_wallet.lower()

            else "Wallet"

        )


        graph.add_node(

            to_wallet,

            type=node_type,

            label=label

        )


        if path["amount"] <= 0:
            continue


        graph.add_edge(

            from_wallet,

            to_wallet,

            amount=path["amount"],

            timestamp=path.get("timestamp"),

            hash=path["hash"],

            hop=path["hop"],

            type=path.get("type", "normal")

        )


    nodes = []


    for wallet, data in graph.nodes(data=True):

        nodes.append({

            "id": wallet,

            "label": data.get(
                "label",
                "Wallet"
            ),

            "type": data.get(
                "type",
                "wallet"
            )

        })


    edges = []


    for source, target, data in graph.edges(data=True):

        if data.get("amount", 0) <= 0:
            continue


        edges.append({

            "source": source,

            "target": target,

            "amount": data.get(
                "amount",
                0
            ),

            "timestamp": data.get(
                "timestamp"
            ),

            "hash": data.get(
                "hash"
            ),

            "hop": data.get(
                "hop"
            ),

            "type": data.get(
                "type",
                "normal"
            )

        })


    return {

        "nodes": nodes,

        "edges": edges

    }


@app.route("/")
def home():

    return render_template("x.html")


@app.route("/graph")
def graph():

    return render_template("graph.html")


@app.route("/trace", methods=["POST"])
def trace():

    data = request.get_json()


    wallet_address = data.get(
        "wallet",
        ""
    ).strip()


    if not wallet_address:

        return jsonify({

            "error":
                "Wallet address is required"

        }), 400


    if (

        not wallet_address.startswith("0x")

        or len(wallet_address) != 42

    ):

        return jsonify({

            "error":
                "Invalid Ethereum wallet address"

        }), 400


    if not API_KEY:

        return jsonify({

            "error":
                "Etherscan API key is missing"

        }), 500


    result = trace_wallet(

        wallet_address,

        max_hops=3,

        max_wallets=20

    )


    graph = build_wallet_graph(result)


    result["graph"] = graph


    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5001)