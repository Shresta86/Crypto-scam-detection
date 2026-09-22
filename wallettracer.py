import os
import json
import requests
import networkx as nx

from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv


# =========================
# SETUP
# =========================

load_dotenv()

app = Flask(__name__)

API_KEY = os.getenv("ETHERSCAN_API_KEY")

BASE_URL = "https://api.etherscan.io/v2/api"

CHAIN_ID = 1


# =========================
# EXCHANGE DATASET
# =========================

EXCHANGE_DATASET = "data/exchange_addresses.json"

with open(EXCHANGE_DATASET, "r") as file:
    exchange_data = json.load(file)

EXCHANGE_ADDRESSES = {}

for item in exchange_data:

    exchange = item["exchange"]
    address = item["address"].lower()

    if exchange not in EXCHANGE_ADDRESSES:
        EXCHANGE_ADDRESSES[exchange] = set()

    EXCHANGE_ADDRESSES[exchange].add(address)


def identify_exchange(address):

    if not address:
        return None

    address = address.lower()

    for exchange, addresses in EXCHANGE_ADDRESSES.items():

        if address in addresses:
            return exchange

    return None


# =========================
# TIMESTAMP
# =========================

def format_timestamp(timestamp):

    return datetime.fromtimestamp(
        int(timestamp),
        timezone.utc
    ).strftime("%Y-%m-%d %H:%M:%S UTC")


# =========================
# NORMAL TRANSACTIONS
# =========================

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

        value_eth = int(
            tx.get("value", 0)
        ) / 10**18

        timestamp = format_timestamp(
            tx["timeStamp"]
        )

        transactions.append({

            "hash": tx["hash"],

            "from": from_address,

            "to": to_address,

            "direction": direction,

            "counterparty": counterparty,

            "amount": round(
                value_eth,
                6
            ),

            "timestamp": timestamp,

            "exchange": identify_exchange(
                counterparty
            ),

            "type": "normal"

        })

    return transactions


# =========================
# INTERNAL TRANSACTIONS
# =========================

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

        if str(
            tx.get("isError", "0")
        ) == "1":
            continue

        if from_address.lower() == wallet_lower:

            direction = "OUT"
            counterparty = to_address

        else:

            direction = "IN"
            counterparty = from_address

        value_eth = int(
            tx.get("value", 0)
        ) / 10**18

        timestamp = format_timestamp(
            tx["timeStamp"]
        )

        transactions.append({

            "hash": tx["hash"],

            "from": from_address,

            "to": to_address,

            "direction": direction,

            "counterparty": counterparty,

            "amount": round(
                value_eth,
                6
            ),

            "timestamp": timestamp,

            "exchange": identify_exchange(
                counterparty
            ),

            "type": "internal"

        })

    return transactions


# =========================
# TRACE WALLET
# =========================

def trace_wallet(
    start_wallet,
    max_hops=5,
    max_wallets=50
):

    visited = set()

    queue = [
        (start_wallet, 0)
    ]

    all_transactions = []

    wallet_paths = []

    while queue and len(visited) < max_wallets:

        current_wallet, hop = queue.pop(0)

        current_lower = current_wallet.lower()

        if current_lower in visited:
            continue

        visited.add(current_lower)

        normal_transactions = get_wallet_transactions(
            current_wallet,
            limit=100
        )

        internal_transactions = get_internal_transactions(
            current_wallet,
            limit=100
        )

        transactions = (
            normal_transactions +
            internal_transactions
        )

        # =========================
        # REMOVE DUPLICATES
        # =========================

        unique_transactions = []

        seen = set()

        for tx in transactions:

            dedup_key = (
                tx["hash"].lower(),
                tx["from"].lower(),
                tx["to"].lower(),
                tx["amount"]
            )

            if dedup_key in seen:
                continue

            seen.add(dedup_key)

            unique_transactions.append(tx)

        # =========================
        # GROUP CONNECTIONS
        # =========================

        connection_map = {}

        for tx in unique_transactions:

            tx["wallet"] = current_wallet
            tx["hop"] = hop

            all_transactions.append(tx)

            if (
                tx["direction"] == "OUT"
                and tx["counterparty"]
                and tx["counterparty"].lower()
                != current_lower
            ):

                next_wallet = tx["counterparty"]

                next_key = next_wallet.lower()

                if next_key not in connection_map:

                    connection_map[next_key] = {

                        "from": current_wallet,

                        "to": next_wallet,

                        "amount": 0,

                        "count": 0,

                        "hash": tx["hash"],

                        "timestamp": tx["timestamp"],

                        "hop": hop + 1,

                        "type": tx["type"],

                        "exchange":
                            identify_exchange(
                                next_wallet
                            )

                    }

                connection_map[
                    next_key
                ]["amount"] += tx["amount"]

                connection_map[
                    next_key
                ]["count"] += 1

                # =========================
                # FOLLOW NON-EXCHANGE WALLET
                # =========================

                if (

                    not identify_exchange(
                        next_wallet
                    )

                    and hop < max_hops

                    and next_key not in visited

                    and not any(
                        item[0].lower() == next_key
                        for item in queue
                    )

                ):

                    queue.append(
                        (
                            next_wallet,
                            hop + 1
                        )
                    )

        # =========================
        # SAVE CONNECTIONS
        # =========================

        for connection in connection_map.values():

            connection["amount"] = round(
                connection["amount"],
                6
            )

            wallet_paths.append(
                connection
            )

    return {

        "start_wallet": start_wallet,

        "wallets_traced": len(visited),

        "max_hops": max_hops,

        "transactions": all_transactions,

        "paths": wallet_paths

    }


# =========================
# SUSPICIOUS ACTIVITY
# =========================

def detect_suspicious_activity(
    transactions,
    paths
):

    indicators = []

    # =========================
    # 1. HIGH TRANSACTION ACTIVITY
    # =========================

    if len(transactions) >= 20:

        indicators.append({

            "type": "high_activity",

            "message":
                "High transaction activity detected",

            "severity": "medium",

            "points": 15

        })

    # =========================
    # GROUP TRANSACTIONS BY WALLET
    # =========================

    wallet_transactions = {}

    for tx in transactions:

        wallet = tx.get("wallet")

        if not wallet:
            continue

        wallet = wallet.lower()

        if wallet not in wallet_transactions:
            wallet_transactions[wallet] = []

        wallet_transactions[wallet].append(tx)

    # =========================
    # 2. RAPID FUND MOVEMENT
    # =========================

    rapid_movement = False

    for wallet, txs in wallet_transactions.items():

        timed_transactions = []

        for tx in txs:

            try:

                tx_time = datetime.strptime(
                    tx["timestamp"],
                    "%Y-%m-%d %H:%M:%S UTC"
                )

                timed_transactions.append(
                    (
                        tx_time,
                        tx
                    )
                )

            except Exception:

                continue

        timed_transactions.sort(
            key=lambda x: x[0]
        )

        for i in range(
            len(timed_transactions) - 1
        ):

            first_time, first_tx = \
                timed_transactions[i]

            second_time, second_tx = \
                timed_transactions[i + 1]

            difference = (
                second_time - first_time
            ).total_seconds()

            if (

                first_tx["direction"] == "IN"

                and second_tx["direction"] == "OUT"

                and 0 <= difference <= 600

            ):

                rapid_movement = True

                break

        if rapid_movement:
            break

    if rapid_movement:

        indicators.append({

            "type": "rapid_movement",

            "message":
                "Funds moved out shortly after being received",

            "severity": "high",

            "points": 25

        })

    # =========================
    # 3. FUND SPLITTING
    # =========================

    splitting_detected = False

    for wallet, txs in wallet_transactions.items():

        outgoing_wallets = set()

        for tx in txs:

            if (

                tx.get("direction") == "OUT"

                and tx.get("counterparty")

            ):

                outgoing_wallets.add(
                    tx["counterparty"].lower()
                )

        if len(outgoing_wallets) >= 3:

            splitting_detected = True

            break

    if splitting_detected:

        indicators.append({

            "type": "fund_splitting",

            "message":
                "Funds split across multiple wallets",

            "severity": "medium",

            "points": 20

        })

    # =========================
    # 4. FUND CONSOLIDATION
    # =========================

    consolidation_detected = False

    for wallet, txs in wallet_transactions.items():

        incoming_wallets = set()

        for tx in txs:

            if (

                tx.get("direction") == "IN"

                and tx.get("counterparty")

            ):

                incoming_wallets.add(
                    tx["counterparty"].lower()
                )

        if len(incoming_wallets) >= 3:

            consolidation_detected = True

            break

    if consolidation_detected:

        indicators.append({

            "type": "fund_consolidation",

            "message":
                "Funds consolidated from multiple wallets",

            "severity": "high",

            "points": 20

        })

    # =========================
    # 5. EXCHANGE INTERACTION
    # =========================

    exchange_detected = False
    exchange_name = None

    for tx in transactions:

        if tx.get("exchange"):

            exchange_detected = True

            exchange_name = tx["exchange"]

            break

    if exchange_detected:

        indicators.append({

            "type": "exchange_interaction",

            "message":
                f"Interaction with known exchange: {exchange_name}",

            "severity": "medium",

            "points": 10

        })

    # =========================
    # 6. MULTI-HOP MOVEMENT
    # =========================

    multi_hop_detected = False

    for path in paths:

        if path.get("hop", 0) >= 2:

            multi_hop_detected = True

            break

    if multi_hop_detected:

        indicators.append({

            "type": "multi_hop",

            "message":
                "Funds moved through multiple intermediary wallets",

            "severity": "medium",

            "points": 10

        })

    return {

        "indicators": indicators,

        "count": len(indicators)

    }


# =========================
# RISK SCORE
# =========================

def calculate_risk_score(indicators):

    score = 0

    for indicator in indicators:

        score += indicator.get(
            "points",
            0
        )

    score = min(
        score,
        100
    )

    if score >= 60:

        level = "HIGH"

    elif score >= 30:

        level = "MEDIUM"

    else:

        level = "LOW"

    return {

        "score": score,

        "level": level

    }


# =========================
# INVESTIGATOR RECOMMENDATIONS
# =========================

def generate_investigator_recommendations(
    indicators
):

    recommendations = []

    indicator_types = {
        indicator.get("type")
        for indicator in indicators
    }

    # =========================
    # RAPID MOVEMENT
    # =========================

    if "rapid_movement" in indicator_types:

        recommendations.append(
            "Review transaction timestamps to investigate rapid movement of funds."
        )

    # =========================
    # FUND SPLITTING
    # =========================

    if "fund_splitting" in indicator_types:

        recommendations.append(
            "Examine the wallets receiving the split funds and trace their subsequent movement."
        )

    # =========================
    # FUND CONSOLIDATION
    # =========================

    if "fund_consolidation" in indicator_types:

        recommendations.append(
            "Review the wallets that contributed funds to identify common transaction patterns."
        )

    # =========================
    # EXCHANGE INTERACTION
    # =========================

    if "exchange_interaction" in indicator_types:

        recommendations.append(
            "Verify the interaction with the identified cryptocurrency exchange."
        )

    # =========================
    # MULTI-HOP
    # =========================

    if "multi_hop" in indicator_types:

        recommendations.append(
            "Examine intermediary wallets involved in the multi-hop fund movement."
        )

    # =========================
    # HIGH ACTIVITY
    # =========================

    if "high_activity" in indicator_types:

        recommendations.append(
            "Review the high-volume transaction activity for unusual patterns."
        )

    # =========================
    # DEFAULT
    # =========================

    if not recommendations:

        recommendations.append(
            "Continue monitoring the wallet and review transaction history for unusual activity."
        )

    return recommendations


# =========================
# BUILD GRAPH
# =========================

def build_wallet_graph(trace_result):

    graph = nx.DiGraph()

    start_wallet = trace_result[
        "start_wallet"
    ]

    graph.add_node(

        start_wallet,

        type="suspect",

        label="Suspect Wallet"

    )

    for path in trace_result["paths"]:

        from_wallet = path["from"]

        to_wallet = path["to"]

        exchange = identify_exchange(
            to_wallet
        )

        if exchange:

            node_type = "exchange"

            label = exchange

        else:

            node_type = "wallet"

            label = "Wallet"

        graph.add_node(

            from_wallet,

            type=(
                "suspect"
                if from_wallet.lower()
                == start_wallet.lower()
                else "wallet"
            ),

            label=(
                "Suspect Wallet"
                if from_wallet.lower()
                == start_wallet.lower()
                else "Wallet"
            )

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

            timestamp=path.get(
                "timestamp"
            ),

            hash=path["hash"],

            hop=path["hop"],

            type=path.get(
                "type",
                "normal"
            )

        )

    # =========================
    # NODES
    # =========================

    nodes = []

    for wallet, data in graph.nodes(
        data=True
    ):

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

    # =========================
    # EDGES
    # =========================

    edges = []

    for source, target, data in graph.edges(
        data=True
    ):

        if data.get(
            "amount",
            0
        ) <= 0:

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


# =========================
# ROUTES
# =========================

@app.route("/")
def home():

    return render_template(
        "x.html"
    )


@app.route("/graph")
def graph():

    return render_template(
        "graph.html"
    )


@app.route(
    "/trace",
    methods=["POST"]
)
def trace():

    data = request.get_json()

    wallet_address = data.get(
        "wallet",
        ""
    ).strip()

    # =========================
    # VALIDATION
    # =========================

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

    # =========================
    # TRACE
    # =========================

    result = trace_wallet(

        wallet_address,

        max_hops=2,

        max_wallets=8

    )

    # =========================
    # GRAPH
    # =========================

    graph = build_wallet_graph(
        result
    )

    # =========================
    # FRAUD INTELLIGENCE
    # =========================

    suspicious_activity = \
        detect_suspicious_activity(

            result["transactions"],

            result["paths"]

        )

    # =========================
    # RISK SCORE
    # =========================

    risk = calculate_risk_score(

        suspicious_activity[
            "indicators"
        ]

    )

    # =========================
    # INVESTIGATOR RECOMMENDATIONS
    # =========================

    recommendations = \
        generate_investigator_recommendations(

            suspicious_activity[
                "indicators"
            ]

        )

    # =========================
    # ADD RESULTS
    # =========================

    result["graph"] = graph

    result["suspicious_activity"] = \
        suspicious_activity

    result["risk"] = risk

    result["investigator_recommendations"] = \
        recommendations

    return jsonify(result)


# =========================
# RUN
# =========================

if __name__ == "__main__":

    app.run(

        debug=True,

        port=5001

    )