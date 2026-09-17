import os
import json
import requests
import networkx as nx

from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv


# --- Setup ---

# Load environment variables (like the Etherscan API key) from .env file,
# so the key never has to be typed directly into the source code.
load_dotenv()

app = Flask(__name__)

API_KEY = os.getenv("ETHERSCAN_API_KEY")

# Base URL for Etherscan's V2 unified API (works across multiple chains via chainid)
BASE_URL = "https://api.etherscan.io/v2/api"

# chainid = 1 means "Ethereum mainnet" specifically
CHAIN_ID = 1


# --- Load known exchange addresses ---

# This JSON file (built by Person 2) contains a list of {"exchange": ..., "address": ...}
# entries for known exchange wallets (Binance, Coinbase, Kraken, etc.)
EXCHANGE_DATASET = "data/exchange_addresses.json"

with open(EXCHANGE_DATASET, "r") as file:
    exchange_data = json.load(file)

# Convert the flat list into a dict of {exchange_name: set_of_addresses}
# for fast lookups later (checking set membership is much faster than
# scanning a list every time).
EXCHANGE_ADDRESSES = {}

for item in exchange_data:
    exchange = item["exchange"]
    address = item["address"].lower()

    if exchange not in EXCHANGE_ADDRESSES:
        EXCHANGE_ADDRESSES[exchange] = set()

    EXCHANGE_ADDRESSES[exchange].add(address)


def identify_exchange(address):
    """
    Given a wallet address, return the exchange name if it matches
    a known exchange-associated address, otherwise return None.
    """
    if not address:
        return None

    address = address.lower()

    for exchange, addresses in EXCHANGE_ADDRESSES.items():
        if address in addresses:
            return exchange

    return None


def format_timestamp(timestamp):
    """
    Convert a raw Unix timestamp (as returned by Etherscan) into a
    human-readable UTC date/time string.
    """
    return datetime.fromtimestamp(
        int(timestamp),
        timezone.utc
    ).strftime("%Y-%m-%d %H:%M:%S UTC")


def get_wallet_transactions(wallet_address, limit=100):
    """
    Fetch NORMAL (regular ETH transfer) transactions for a wallet from Etherscan.
    Returns a list of standardized transaction dicts, or [] on failure.
    """
    params = {
        "chainid": CHAIN_ID,
        "module": "account",
        "action": "txlist",       # txlist = normal transactions
        "address": wallet_address,
        "startblock": 0,
        "endblock": 999999999,
        "page": 1,
        "offset": limit,
        "sort": "desc",
        "apikey": API_KEY
    }

    try:
        response = requests.get(BASE_URL, params=params, timeout=20)
        data = response.json()
    except Exception:
        # Network error, timeout, bad JSON, etc. -- fail safe with empty list
        # rather than crashing the whole trace.
        return []

    # Etherscan returns status "1" for success; anything else means no
    # results or an API-level error (e.g. invalid address, rate limit).
    if data.get("status") != "1":
        return []

    transactions = []
    wallet_lower = wallet_address.lower()

    for tx in data["result"]:
        from_address = tx.get("from", "")
        to_address = tx.get("to", "")

        # Skip malformed records missing a sender or receiver
        if not from_address or not to_address:
            continue

        # Determine direction relative to the wallet we're currently tracing
        if from_address.lower() == wallet_lower:
            direction = "OUT"
            counterparty = to_address
        else:
            direction = "IN"
            counterparty = from_address

        # Etherscan returns value in Wei (smallest ETH unit) -- convert to ETH
        value_eth = int(tx.get("value", 0)) / 10**18

        timestamp = format_timestamp(tx["timeStamp"])

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
    """
    Fetch INTERNAL transactions (ETH moved via smart contract calls, not
    direct wallet-to-wallet transfers) for a wallet from Etherscan.
    Returns a list of standardized transaction dicts, or [] on failure.
    """
    params = {
        "chainid": CHAIN_ID,
        "module": "account",
        "action": "txlistinternal",   # txlistinternal = internal transactions
        "address": wallet_address,
        "startblock": 0,
        "endblock": 999999999,
        "page": 1,
        "offset": limit,
        "sort": "desc",
        "apikey": API_KEY
    }

    try:
        response = requests.get(BASE_URL, params=params, timeout=20)
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

        # Skip internal transactions that failed on-chain (isError == "1")
        # -- these represent attempted but reverted transfers, not real fund movement.
        if str(tx.get("isError", "0")) == "1":
            continue

        if from_address.lower() == wallet_lower:
            direction = "OUT"
            counterparty = to_address
        else:
            direction = "IN"
            counterparty = from_address

        value_eth = int(tx.get("value", 0)) / 10**18

        timestamp = format_timestamp(tx["timeStamp"])

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
    """
    Breadth-first trace starting from `start_wallet`, following outgoing
    transactions to connected wallets up to `max_hops` hops, or until
    `max_wallets` distinct wallets have been visited.

    Returns a dict with the full transaction list and summarized
    wallet-to-wallet paths, used later to build the graph.
    """

    # visited: wallets already fetched -- prevents re-processing / infinite loops
    visited = set()

    # queue: wallets still waiting to be traced, each paired with its hop number.
    # Starts with just the suspect wallet at hop 0.
    queue = [(start_wallet, 0)]

    # all_transactions: every individual transaction found, across all wallets
    # (kept as raw evidence for the report / evidence table)
    all_transactions = []

    # wallet_paths: summarized wallet-to-wallet connections, used to draw graph edges
    wallet_paths = []

    # Keep going until there's nothing left to trace, or we hit the wallet limit
    while queue and len(visited) < max_wallets:

        # Pop from the FRONT of the queue -- this makes it breadth-first
        # (traces all hop-1 wallets before moving to hop-2, etc.)
        current_wallet, hop = queue.pop(0)
        current_lower = current_wallet.lower()

        # Skip if this wallet has already been processed
        if current_lower in visited:
            continue

        visited.add(current_lower)

        # Pull both transaction types for this wallet
        normal_transactions = get_wallet_transactions(current_wallet, limit=100)
        internal_transactions = get_internal_transactions(current_wallet, limit=100)
        transactions = normal_transactions + internal_transactions

        # --- Deduplicate ---
        # normal + internal results can sometimes overlap; keep only unique
        # transactions based on hash + from + to + amount.
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

        # --- Build outgoing connections from this wallet ---
        # connection_map groups multiple outgoing transactions to the SAME
        # destination wallet into one summarized edge (total amount + count),
        # so the graph shows one line per wallet pair instead of one per transaction.
        #
        # NOTE: this must be created ONCE PER WALLET (here, at the top of each
        # while-loop iteration) -- not inside the transaction loop below,
        # otherwise it gets wiped on every single transaction.
        connection_map = {}

        for tx in unique_transactions:
            # Tag each transaction with the wallet/hop it was found at,
            # then store it as raw evidence
            tx["wallet"] = current_wallet
            tx["hop"] = hop
            all_transactions.append(tx)

            # We only follow OUTGOING transfers -- that's "where the money went next".
            # Incoming transfers tell us who sent money TO this wallet, which is
            # already captured when we traced that sender as its own node.
            if (
                tx["direction"] == "OUT"
                and tx["amount"] > 0
                and tx["counterparty"]
                and tx["counterparty"].lower() != current_lower
            ):
                next_wallet = tx["counterparty"]
                next_key = next_wallet.lower()

                # First time seeing a transfer to this destination? Start a new edge.
                if next_key not in connection_map:
                    connection_map[next_key] = {
                        "from": current_wallet,
                        "to": next_wallet,
                        "amount": 0,
                        "count": 0,
                        "hash": tx["hash"],        # representative tx hash for this edge
                        "timestamp": tx["timestamp"],
                        "hop": hop + 1,
                        "type": tx["type"],
                    }

                # Add this transaction's amount into the running total for
                # this wallet-to-wallet edge
                connection_map[next_key]["amount"] += tx["amount"]
                connection_map[next_key]["count"] += 1

                # --- Decide whether to keep tracing from next_wallet ---
                # Conditions to add it to the queue:
                #  1. It's NOT a known exchange (money usually "ends" at an exchange
                #     for cash-out, so there's no value in tracing past it)
                #  2. We haven't exceeded max_hops
                #  3. It hasn't already been visited
                #  4. It isn't already sitting in the queue waiting to be processed
                if (
                    not identify_exchange(next_wallet)
                    and hop < max_hops
                    and next_key not in visited
                    and not any(item[0].lower() == next_key for item in queue)
                ):
                    queue.append((next_wallet, hop + 1))

        # Once all transactions for this wallet are processed, flatten
        # connection_map into the final wallet_paths list, rounding the
        # accumulated amounts for clean display.
        for connection in connection_map.values():
            connection["amount"] = round(connection["amount"], 6)
            wallet_paths.append(connection)

    # --- IMPORTANT ---
    # This return sits OUTSIDE the while loop, at the same indent level as
    # `visited = set()` above. This guarantees the function ALWAYS returns
    # a valid dictionary once tracing finishes -- even if some wallet along
    # the way had zero transactions. This is the fix for the bug where the
    # function could silently return None and crash build_wallet_graph().
    return {
        "start_wallet": start_wallet,
        "wallets_traced": len(visited),
        "max_hops": max_hops,
        "transactions": all_transactions,
        "paths": wallet_paths
    }


def build_wallet_graph(trace_result):
    """
    Convert the trace_wallet() output into a NetworkX graph, then export
    it as a simple {nodes, edges} dict for the frontend (Vis Network) to render.
    """
    graph = nx.DiGraph()

    start_wallet = trace_result["start_wallet"]

    # Always add the original suspect wallet as a node, even if it had
    # no outgoing paths (e.g. a wallet with only incoming transactions)
    graph.add_node(
        start_wallet,
        type="suspect",
        label="Suspect Wallet"
    )

    # Add every wallet-to-wallet connection as a graph edge
    for path in trace_result["paths"]:
        from_wallet = path["from"]
        to_wallet = path["to"]

        # Tag the destination wallet as an exchange if it matches our dataset
        exchange = identify_exchange(to_wallet)

        if exchange:
            node_type = "exchange"
            label = exchange
        else:
            node_type = "wallet"
            label = "Wallet"

        # Re-add the source wallet (safe to call repeatedly -- NetworkX
        # just updates node attributes rather than duplicating it)
        graph.add_node(
            from_wallet,
            type="suspect" if from_wallet.lower() == start_wallet.lower() else "wallet",
            label="Suspect Wallet" if from_wallet.lower() == start_wallet.lower() else "Wallet"
        )

        graph.add_node(
            to_wallet,
            type=node_type,
            label=label
        )

        # Skip zero-amount edges -- nothing meaningful to show
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

    # --- Convert NetworkX graph into plain JSON-friendly lists ---
    # (Vis Network on the frontend expects simple {id, label, type} nodes
    # and {source, target, ...} edges, not a NetworkX object)

    nodes = []
    for wallet, data in graph.nodes(data=True):
        nodes.append({
            "id": wallet,
            "label": data.get("label", "Wallet"),
            "type": data.get("type", "wallet")
        })

    edges = []
    for source, target, data in graph.edges(data=True):
        if data.get("amount", 0) <= 0:
            continue

        edges.append({
            "source": source,
            "target": target,
            "amount": data.get("amount", 0),
            "timestamp": data.get("timestamp"),
            "hash": data.get("hash"),
            "hop": data.get("hop"),
            "type": data.get("type", "normal")
        })

    return {
        "nodes": nodes,
        "edges": edges
    }


# --- Routes ---

@app.route("/")
def home():
    # Main dashboard page (wallet input form)
    return render_template("x.html")


@app.route("/graph")
def graph():
    # Separate page that renders the interactive wallet graph
    return render_template("graph.html")


@app.route("/trace", methods=["POST"])
def trace():
    """
    Main API endpoint: receives a wallet address from the frontend,
    validates it, runs the trace, builds the graph, and returns
    everything as JSON.
    """
    data = request.get_json()

    wallet_address = data.get("wallet", "").strip()

    # --- Input validation ---
    if not wallet_address:
        return jsonify({"error": "Wallet address is required"}), 400

    if not wallet_address.startswith("0x") or len(wallet_address) != 42:
        return jsonify({"error": "Invalid Ethereum wallet address"}), 400

    if not API_KEY:
        return jsonify({"error": "Etherscan API key is missing"}), 500

    # Run the trace (currently capped at 2 hops / 8 wallets for faster response times)
    result = trace_wallet(
        wallet_address,
        max_hops=2,
        max_wallets=8
    )

    # Build the graph structure from the trace result
    graph = build_wallet_graph(result)

    # Attach the graph data to the result before sending it back
    result["graph"] = graph

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5001)