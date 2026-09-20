import os
import requests
import networkx as nx

from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from fraud_intelligence import identify_exchange


load_dotenv()

app = Flask(__name__)

BASE_URL = "https://api.etherscan.io/v2/api"


def get_api_key():

    load_dotenv()

    return os.getenv("ETHERSCAN_API_KEY")

CHAIN_ID = 1


def format_timestamp(timestamp):

    return datetime.fromtimestamp(
        int(timestamp),
        timezone.utc
    ).strftime("%Y-%m-%d %H:%M:%S UTC")


def get_wallet_transactions(wallet_address, limit=100, api_key=None):

    api_key = api_key or get_api_key()

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

        "apikey": api_key

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


def get_internal_transactions(wallet_address, limit=100, api_key=None):

    api_key = api_key or get_api_key()

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

        "apikey": api_key

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


def get_token_transactions(wallet_address, limit=100, api_key=None):

    api_key = api_key or get_api_key()

    if not api_key:
        return []

    params = {

        "chainid": CHAIN_ID,

        "module": "account",

        "action": "tokentx",

        "address": wallet_address,

        "page": 1,

        "offset": limit,

        "sort": "asc",

        "apikey": api_key

    }

    try:

        response = requests.get(
            BASE_URL,
            params=params,
            timeout=20
        )

        response.raise_for_status()
        data = response.json()

    except (requests.RequestException, ValueError, TypeError):

        return []


    if (
        not isinstance(data, dict)
        or data.get("status") != "1"
        or not isinstance(data.get("result"), list)
    ):

        return []


    transactions = []
    wallet_lower = wallet_address.lower()


    for tx in data["result"]:

        if not isinstance(tx, dict):
            continue

        from_address = tx.get("from", "")

        to_address = tx.get("to", "")

        timestamp_value = tx.get("timeStamp")

        if not from_address or not to_address or not timestamp_value:
            continue


        try:

            decimals = int(tx.get("tokenDecimal"))

            if decimals < 0:
                continue

            raw_value = int(tx.get("value"))
            amount = raw_value / 10**decimals
            timestamp = format_timestamp(timestamp_value)

        except (TypeError, ValueError, OverflowError):

            continue


        if from_address.lower() == wallet_lower:

            direction = "OUT"

            counterparty = to_address

        elif to_address.lower() == wallet_lower:

            direction = "IN"

            counterparty = from_address

        else:

            continue


        transactions.append({

            "hash": tx.get("hash", ""),

            "from": from_address,

            "to": to_address,

            "direction": direction,

            "counterparty": counterparty,

            "amount": amount,

            "timestamp": timestamp,

            "exchange": identify_exchange(counterparty),

            "type": "erc20",

            "token_symbol": tx.get("tokenSymbol", ""),

            "token_name": tx.get("tokenName", ""),

            "contract_address": tx.get("contractAddress", ""),

            "decimals": decimals,

            "raw_value": str(raw_value)

        })


    return transactions


def trace_wallet(start_wallet, max_hops=5, max_wallets=50, api_key=None):

    api_key = api_key or get_api_key()

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
            limit=100,
            api_key=api_key
        )


        # Get internal transactions

        internal_transactions = get_internal_transactions(
            current_wallet,
            limit=100,
            api_key=api_key
        )

        token_transactions = get_token_transactions(
            current_wallet,
            limit=100,
            api_key=api_key
        )


        # Combine both sources

        transactions = (
            normal_transactions
            + internal_transactions
            + token_transactions
        )


        # Remove duplicate transactions

        unique_transactions = []

        seen = set()


        for tx in transactions:

            key = (

                tx["hash"].lower(),

                tx["from"].lower(),

                tx["to"].lower(),

                tx["amount"],

                tx.get("type", "normal"),

                tx.get("contract_address", ""),

                tx.get("raw_value", "")

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

                        "type": tx["type"],

                        "token_symbol": tx.get("token_symbol"),

                        "token_name": tx.get("token_name"),

                        "contract_address": tx.get("contract_address")

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

            type=path.get("type", "normal"),

            token_symbol=path.get("token_symbol"),

            token_name=path.get("token_name"),

            contract_address=path.get("contract_address")

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
            ),

            "token_symbol": data.get("token_symbol"),

            "token_name": data.get("token_name"),

            "contract_address": data.get("contract_address")

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


    current_api_key = get_api_key()

    if not current_api_key:

        return jsonify({

            "error":
                "Etherscan API key is missing"

        }), 500


    result = trace_wallet(

        wallet_address,

        max_hops=3,

        max_wallets=20,

        api_key=current_api_key

    )


    graph = build_wallet_graph(result)


    result["graph"] = graph

    from fraud_intelligence import (
        analyze_suspicious_indicators,
        calculate_risk_score,
        get_risk_level
    )

    indicators = analyze_suspicious_indicators(
        result["transactions"],
        result["paths"]
    )
    risk_score = calculate_risk_score(
        result["transactions"],
        result["paths"],
        indicators
    )
    result["risk_score"] = risk_score
    result["risk_level"] = get_risk_level(risk_score)
    result["indicators"] = indicators
    result["suspicious_indicators"] = indicators
    result["exchange_count"] = len({
        transaction.get("exchange")
        for transaction in result["transactions"]
        if transaction.get("exchange")
    })


    return jsonify(result)


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5001,
        debug=False,
        use_reloader=False
    )