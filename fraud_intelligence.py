"""Explainable fraud-intelligence primitives for traced blockchain activity.

The exchange dataset and scoring rules are intentionally isolated here so they
can be replaced by a verified dataset or a more complete model later.
"""

from collections import Counter


EXCHANGE_ADDRESSES = {
    "Binance": set(),
    "Coinbase": set(),
    "Kraken": set()
}


def _normalize_address(address):
    if not isinstance(address, str):
        return ""
    return address.strip().lower()


def identify_exchange(address):
    """Return a verified exchange name for an address, otherwise ``None``."""
    normalized_address = _normalize_address(address)
    if not normalized_address:
        return None

    for exchange, addresses in EXCHANGE_ADDRESSES.items():
        normalized_addresses = {
            _normalize_address(item)
            for item in addresses
        }
        if normalized_address in normalized_addresses:
            return exchange

    return None


def _transaction_pair(transaction):
    from_address = _normalize_address(transaction.get("from"))
    to_address = _normalize_address(transaction.get("to"))
    return from_address, to_address


def analyze_suspicious_indicators(transactions, paths):
    """Return factual, explainable signals found in the supplied trace data.

    These signals describe observable activity and do not establish fraud:
    high volume is reported above 100 transactions, repeated transfers count
    duplicate directed pairs, and exchange interaction requires a verified
    address in ``EXCHANGE_ADDRESSES``.
    """
    transactions = [
        transaction
        for transaction in (transactions or [])
        if isinstance(transaction, dict)
    ]
    paths = [
        path
        for path in (paths or [])
        if isinstance(path, dict)
    ]
    indicators = []

    if len(transactions) > 100:
        indicators.append({
            "name": "High transaction activity",
            "description": "The trace contains more than 100 transaction records.",
            "count": len(transactions)
        })

    pair_counts = Counter(
        pair
        for pair in (_transaction_pair(transaction) for transaction in transactions)
        if all(pair)
    )
    repeated_transfer_count = sum(
        count - 1
        for count in pair_counts.values()
        if count > 1
    )
    if repeated_transfer_count:
        indicators.append({
            "name": "Repeated connected-wallet transfers",
            "description": "The trace contains repeated directed transfers between the same wallet pairs.",
            "count": repeated_transfer_count
        })

    exchange_addresses = {
        _normalize_address(transaction.get("counterparty"))
        for transaction in transactions
        if identify_exchange(transaction.get("counterparty"))
    }
    if exchange_addresses:
        indicators.append({
            "name": "Known exchange interaction",
            "description": "The trace contains transfers involving verified exchange addresses.",
            "count": len(exchange_addresses)
        })

    if paths:
        path_pairs = Counter(
            (
                _normalize_address(path.get("from")),
                _normalize_address(path.get("to"))
            )
            for path in paths
        )
        repeated_path_count = sum(
            count - 1
            for pair, count in path_pairs.items()
            if all(pair) and count > 1
        )
        if repeated_path_count:
            indicators.append({
                "name": "Repeated traced paths",
                "description": "The graph contains repeated directed paths between the same wallets.",
                "count": repeated_path_count
            })

    return indicators


def calculate_risk_score(transactions, paths, indicators):
    """Calculate the bounded baseline score from detected observable signals.

    High activity contributes 10 points, repeated transfers contribute up to
    15 points, verified exchange interaction contributes 5 points, and
    repeated traced paths contribute up to 15 points. The result is a signal
    summary, not proof that any wallet is fraudulent. This baseline is
    intended to be replaced or refined when Person 2 provides verified data
    and scoring logic.
    """
    score = 0

    for indicator in indicators:
        name = indicator["name"]
        count = indicator.get("count", 0)
        if name == "High transaction activity":
            score += 10
        elif name == "Repeated connected-wallet transfers":
            score += min(15, count)
        elif name == "Known exchange interaction":
            score += 5
        elif name == "Repeated traced paths":
            score += min(15, count)

    return min(100, score)


def get_risk_level(score):
    """Map a score to the documented low-to-very-high display bands."""
    try:
        numeric_score = float(score)
    except (TypeError, ValueError):
        numeric_score = 0

    if numeric_score < 25:
        return "Low"
    if numeric_score < 50:
        return "Moderate"
    if numeric_score < 75:
        return "High"
    return "Very High"


def analyze_transactions(transactions):
    """Return JSON-serializable fraud-intelligence data for transactions."""
    transactions = transactions or []
    indicators = analyze_suspicious_indicators(transactions, [])
    risk_score = calculate_risk_score(transactions, [], indicators)
    exchange_names = {
        transaction.get("exchange")
        for transaction in transactions
        if isinstance(transaction, dict) and transaction.get("exchange")
    }
    exchange_addresses = sorted({
        _normalize_address(transaction.get("counterparty"))
        for transaction in transactions
        if isinstance(transaction, dict)
        and identify_exchange(transaction.get("counterparty"))
    })

    return {
        "risk_score": risk_score,
        "risk_level": get_risk_level(risk_score),
        "indicators": indicators,
        "exchange_addresses": exchange_addresses,
        "exchange_count": len(exchange_names)
    }