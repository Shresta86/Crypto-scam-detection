import os
import json
import csv
import sqlite3
import re
import threading
import time
from contextlib import contextmanager
import requests
import networkx as nx

from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, send_file
from dotenv import load_dotenv
from io import BytesIO
from flask import Response

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    LongTable
)


# =========================
# SETUP
# =========================

load_dotenv()

app = Flask(__name__)

API_KEY = os.getenv("ETHERSCAN_API_KEY")

BASE_URL = "https://api.etherscan.io/v2/api"
CHAIN_ID = 1
DEFAULT_BLOCKCHAIN = (os.getenv("DEFAULT_BLOCKCHAIN", "ethereum") or "ethereum").strip().lower()
if DEFAULT_BLOCKCHAIN not in {"ethereum"}:
    DEFAULT_BLOCKCHAIN = "ethereum"
DATABASE = os.path.join(os.path.dirname(__file__), "tracex.db")
SUPPORTED_BLOCKCHAINS = {
    "ethereum": {
        "label": "Ethereum",
        "address_pattern": r"0x[a-fA-F0-9]{40}",
        "chain_id": 1,
        "api_key": "ETHERSCAN_API_KEY"
    }
}

MONITORING_POLL_SECONDS = 15
MONITORING_LOCK = threading.Lock()
MONITORING_THREAD = None
MONITORING_STOP_EVENT = threading.Event()
MONITORING_CACHE = {}


def get_blockchain_name(blockchain):
    if blockchain is None:
        return DEFAULT_BLOCKCHAIN

    value = str(blockchain).strip().lower()
    if not value:
        return DEFAULT_BLOCKCHAIN
    return value if value in SUPPORTED_BLOCKCHAINS else value


def get_blockchain_provider(blockchain):
    blockchain_name = get_blockchain_name(blockchain)
    if blockchain_name == "ethereum":
        return EthereumProvider(blockchain_name)
    raise ValueError(f"Unsupported blockchain: {blockchain_name}")


class BlockchainProvider:
    blockchain_name = DEFAULT_BLOCKCHAIN
    label = "Blockchain"
    api_key_name = None
    chain_id = 1

    def __init__(self, blockchain_name=None):
        if blockchain_name:
            self.blockchain_name = blockchain_name

    def validate_address(self, address):
        raise NotImplementedError

    def fetch_normal_transactions(self, wallet_address, limit=100):
        raise NotImplementedError

    def fetch_internal_transactions(self, wallet_address, limit=100):
        return []

    def fetch_transactions(self, wallet_address, limit=100):
        transactions = self.fetch_normal_transactions(wallet_address, limit=limit)
        transactions.extend(self.fetch_internal_transactions(wallet_address, limit=limit))
        return transactions

    def normalize_transaction(self, tx, wallet_address, transaction_type):
        raise NotImplementedError


class EthereumProvider(BlockchainProvider):
    blockchain_name = "ethereum"
    label = "Ethereum"
    api_key_name = "ETHERSCAN_API_KEY"
    chain_id = CHAIN_ID

    def validate_address(self, address):
        if not address:
            return False
        return bool(re.fullmatch(r"0x[a-fA-F0-9]{40}", address.strip()))

    def normalize_transaction(self, tx, wallet_address, transaction_type):
        if not tx:
            return None

        tx_hash = tx.get("hash") or tx.get("transactionHash") or tx.get("txHash")
        from_address = tx.get("from", "")
        to_address = tx.get("to", "")
        if not tx_hash or not from_address or not to_address:
            return None

        wallet_lower = wallet_address.lower()

        if from_address.lower() == wallet_lower:
            direction = "OUT"
            counterparty = to_address
        else:
            direction = "IN"
            counterparty = from_address

        value_wei = tx.get("value")
        try:
            value_eth = int(value_wei or 0) / 10**18
        except (TypeError, ValueError):
            value_eth = 0

        timestamp = tx.get("timeStamp") or tx.get("timestamp")
        if timestamp is not None:
            ts_value = format_timestamp(str(timestamp))
        else:
            ts_value = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        amount = round(value_eth, 6)
        return {
            "blockchain": self.blockchain_name,
            "transaction_hash": tx_hash,
            "block_number": tx.get("blockNumber") or tx.get("block_number"),
            "timestamp": ts_value,
            "sender": from_address,
            "receiver": to_address,
            "amount": amount,
            "raw_amount": int(value_wei or 0),
            "display_amount": amount,
            "asset": "ETH",
            "asset_type": "native",
            "token_contract": None,
            "token_symbol": "ETH",
            "token_decimals": 18,
            "transaction_type": transaction_type,
            "status": "failed" if str(tx.get("isError", "0")) == "1" else "success",
            "hash": tx_hash,
            "from": from_address,
            "to": to_address,
            "direction": direction,
            "counterparty": counterparty,
            "exchange": identify_exchange(counterparty),
            "type": transaction_type,
            "wallet": wallet_address,
            "value": amount,
            "display_value": amount,
            "asset_name": "Ethereum"
        }

    def normalize_token_transfer(self, tx, wallet_address):
        if not tx:
            return None

        tx_hash = tx.get("hash") or tx.get("transactionHash") or tx.get("txHash")
        from_address = tx.get("from", "")
        to_address = tx.get("to", "")
        if not tx_hash or not from_address or not to_address:
            return None

        wallet_lower = wallet_address.lower()
        if from_address.lower() == wallet_lower:
            direction = "OUT"
            counterparty = to_address
        else:
            direction = "IN"
            counterparty = from_address

        decimal_places = tx.get("tokenDecimal") or tx.get("decimals") or 0
        try:
            token_decimals = int(decimal_places)
        except (TypeError, ValueError):
            token_decimals = 0

        raw_amount = int(tx.get("value") or 0)
        if token_decimals > 0:
            display_amount = raw_amount / (10 ** token_decimals)
        else:
            display_amount = raw_amount

        symbol = tx.get("tokenSymbol") or tx.get("symbol") or "UNKNOWN"
        contract = tx.get("contractAddress") or tx.get("tokenContract") or tx.get("contract_address") or None
        timestamp = tx.get("timeStamp") or tx.get("timestamp")
        if timestamp is not None:
            ts_value = format_timestamp(str(timestamp))
        else:
            ts_value = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        amount = round(float(display_amount), 8)
        status = "failed" if str(tx.get("isError", "0")) == "1" else "success"

        return {
            "blockchain": self.blockchain_name,
            "transaction_hash": tx_hash,
            "block_number": tx.get("blockNumber") or tx.get("block_number"),
            "timestamp": ts_value,
            "sender": from_address,
            "receiver": to_address,
            "amount": amount,
            "raw_amount": raw_amount,
            "display_amount": amount,
            "asset": symbol,
            "asset_type": "token",
            "token_contract": contract,
            "token_symbol": symbol,
            "token_decimals": token_decimals,
            "transaction_type": "ERC20_TRANSFER",
            "status": status,
            "hash": tx_hash,
            "from": from_address,
            "to": to_address,
            "direction": direction,
            "counterparty": counterparty,
            "exchange": identify_exchange(counterparty),
            "type": "ERC20_TRANSFER",
            "wallet": wallet_address,
            "value": amount,
            "display_value": amount,
            "asset_name": tx.get("tokenName") or tx.get("name") or symbol,
            "token_name": tx.get("tokenName") or tx.get("name") or symbol
        }

    def fetch_erc20_transactions(self, wallet_address, limit=100):
        params = {
            "chainid": self.chain_id,
            "module": "account",
            "action": "tokentx",
            "address": wallet_address,
            "startblock": 0,
            "endblock": 999999999,
            "page": 1,
            "offset": limit,
            "sort": "desc",
            "apikey": os.getenv(self.api_key_name)
        }

        try:
            response = requests.get(BASE_URL, params=params, timeout=20)
            data = response.json()
        except Exception:
            return []

        if data.get("status") != "1":
            return []

        transactions = []
        for tx in data.get("result", []):
            normalized = self.normalize_token_transfer(tx, wallet_address)
            if normalized:
                transactions.append(normalized)
        return transactions

    def fetch_normal_transactions(self, wallet_address, limit=100):
        params = {
            "chainid": self.chain_id,
            "module": "account",
            "action": "txlist",
            "address": wallet_address,
            "startblock": 0,
            "endblock": 999999999,
            "page": 1,
            "offset": limit,
            "sort": "desc",
            "apikey": os.getenv(self.api_key_name)
        }

        try:
            response = requests.get(BASE_URL, params=params, timeout=20)
            data = response.json()
        except Exception:
            return []

        if data.get("status") != "1":
            return []

        transactions = []
        for tx in data.get("result", []):
            normalized = self.normalize_transaction(tx, wallet_address, "normal")
            if normalized:
                transactions.append(normalized)
        return transactions

    def fetch_internal_transactions(self, wallet_address, limit=100):
        params = {
            "chainid": self.chain_id,
            "module": "account",
            "action": "txlistinternal",
            "address": wallet_address,
            "startblock": 0,
            "endblock": 999999999,
            "page": 1,
            "offset": limit,
            "sort": "desc",
            "apikey": os.getenv(self.api_key_name)
        }

        try:
            response = requests.get(BASE_URL, params=params, timeout=20)
            data = response.json()
        except Exception:
            return []

        if data.get("status") != "1":
            return []

        transactions = []
        for tx in data.get("result", []):
            if str(tx.get("isError", "0")) == "1":
                continue
            normalized = self.normalize_transaction(tx, wallet_address, "internal")
            if normalized:
                transactions.append(normalized)
        return transactions


def db_connect():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def db_session():
    connection = db_connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_database_schema():
    with db_session() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS investigations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet_address TEXT NOT NULL,
                blockchain TEXT NOT NULL DEFAULT 'ethereum',
                timestamp TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                transaction_count INTEGER NOT NULL,
                wallet_count INTEGER NOT NULL,
                max_hops INTEGER NOT NULL,
                result_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS indicators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
                indicator TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
                blockchain TEXT NOT NULL DEFAULT 'ethereum',
                tx_hash TEXT, sender TEXT, receiver TEXT, amount REAL,
                raw_amount REAL, display_amount REAL, asset TEXT, asset_type TEXT,
                token_contract TEXT, token_symbol TEXT, token_decimals INTEGER,
                timestamp TEXT, direction TEXT, exchange TEXT, type TEXT
            );
            CREATE TABLE IF NOT EXISTS recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
                recommendation TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS monitored_wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investigation_id INTEGER,
                wallet_address TEXT NOT NULL,
                blockchain TEXT NOT NULL DEFAULT 'ethereum',
                status TEXT NOT NULL DEFAULT 'monitoring',
                last_checked_at TEXT,
                last_transaction_timestamp TEXT,
                last_transaction_hash TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                max_hops INTEGER DEFAULT 2,
                max_wallets INTEGER DEFAULT 8
            );
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                investigation_id INTEGER,
                wallet_address TEXT NOT NULL,
                blockchain TEXT NOT NULL DEFAULT 'ethereum',
                transaction_hash TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                risk_contribution INTEGER,
                timestamp TEXT,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'NEW',
                evidence TEXT
            );
        """)

        investigation_columns = {row[1] for row in db.execute("PRAGMA table_info(investigations)").fetchall()}
        if "blockchain" not in investigation_columns:
            db.execute("ALTER TABLE investigations ADD COLUMN blockchain TEXT NOT NULL DEFAULT 'ethereum'")

        transaction_columns = {row[1] for row in db.execute("PRAGMA table_info(transactions)").fetchall()}
        for column_name, default_sql in {
            "blockchain": "TEXT NOT NULL DEFAULT 'ethereum'",
            "raw_amount": "REAL",
            "display_amount": "REAL",
            "asset": "TEXT",
            "asset_type": "TEXT",
            "token_contract": "TEXT",
            "token_symbol": "TEXT",
            "token_decimals": "INTEGER"
        }.items():
            if column_name not in transaction_columns:
                db.execute(f"ALTER TABLE transactions ADD COLUMN {column_name} {default_sql}")


def initialize_database():
    ensure_database_schema()


initialize_database()


def save_investigation(result):
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    blockchain = get_blockchain_name(result.get("blockchain", DEFAULT_BLOCKCHAIN))
    result["blockchain"] = blockchain
    result["timestamp"] = timestamp
    with db_session() as db:
        cursor = db.execute("""INSERT INTO investigations
            (wallet_address,blockchain,timestamp,risk_score,risk_level,transaction_count,wallet_count,max_hops,result_json)
            VALUES (?,?,?,?,?,?,?,?,?)""", (
            result["start_wallet"], blockchain, timestamp, result["risk"]["score"], result["risk"]["level"],
            len(result["transactions"]), result["wallets_traced"], result["max_hops"],
            json.dumps(result)))
        investigation_id = cursor.lastrowid
        db.executemany("INSERT INTO indicators(investigation_id,indicator) VALUES (?,?)", [
            (investigation_id, item["message"]) for item in result["suspicious_activity"]["indicators"]])
        db.executemany("""INSERT INTO transactions
            (investigation_id,blockchain,tx_hash,sender,receiver,amount,raw_amount,display_amount,asset,asset_type,
             token_contract,token_symbol,token_decimals,timestamp,direction,exchange,type)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", [
            (
                investigation_id,
                blockchain,
                tx.get("transaction_hash") or tx.get("hash"),
                tx.get("from"),
                tx.get("to"),
                tx.get("amount"),
                float(tx.get("raw_amount")) if tx.get("raw_amount") is not None else None,
                float(tx.get("display_amount")) if tx.get("display_amount") is not None else None,
                tx.get("asset") or tx.get("token_symbol") or "ETH",
                tx.get("asset_type") or "native",
                tx.get("token_contract"),
                tx.get("token_symbol") or tx.get("asset") or "ETH",
                tx.get("token_decimals"),
                tx.get("timestamp"),
                tx.get("direction"),
                tx.get("exchange"),
                tx.get("type")
            )
            for tx in result["transactions"]])
        db.executemany("INSERT INTO recommendations(investigation_id,recommendation) VALUES (?,?)", [
            (investigation_id, item) for item in result["investigator_recommendations"]])
        result["investigation_id"] = investigation_id
        db.execute("UPDATE investigations SET result_json=? WHERE id=?",
                   (json.dumps(result), investigation_id))
    return result


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

def get_wallet_transactions(wallet_address, limit=100, blockchain=DEFAULT_BLOCKCHAIN):
    provider = get_blockchain_provider(blockchain)
    if not provider.validate_address(wallet_address):
        return []
    return provider.fetch_normal_transactions(wallet_address, limit=limit)


# =========================
# INTERNAL TRANSACTIONS
# =========================

def get_internal_transactions(wallet_address, limit=100, blockchain=DEFAULT_BLOCKCHAIN):
    provider = get_blockchain_provider(blockchain)
    if not provider.validate_address(wallet_address):
        return []
    return provider.fetch_internal_transactions(wallet_address, limit=limit)


def get_erc20_transactions(wallet_address, limit=100, blockchain=DEFAULT_BLOCKCHAIN):
    provider = get_blockchain_provider(blockchain)
    if not provider.validate_address(wallet_address):
        return []
    if hasattr(provider, "fetch_erc20_transactions"):
        return provider.fetch_erc20_transactions(wallet_address, limit=limit)
    return []


def _monitor_identity(transaction):
    if not transaction:
        return None
    tx_hash = str(transaction.get("transaction_hash") or transaction.get("hash") or "").strip().lower()
    blockchain = str(transaction.get("blockchain") or DEFAULT_BLOCKCHAIN).strip().lower()
    if not tx_hash:
        return None
    return (blockchain, tx_hash)


def filter_new_transactions(previous_transactions, new_transactions):
    previous_ids = set()
    for tx in previous_transactions or []:
        key = _monitor_identity(tx)
        if key:
            previous_ids.add(key)

    filtered = []
    for tx in new_transactions or []:
        key = _monitor_identity(tx)
        if key and key in previous_ids:
            continue
        filtered.append(tx)
    return filtered


def fetch_monitor_transactions(wallet_address, limit=100, blockchain=DEFAULT_BLOCKCHAIN):
    provider = get_blockchain_provider(blockchain)
    if not provider.validate_address(wallet_address):
        return []

    transactions = []
    transactions.extend(get_wallet_transactions(wallet_address, limit=limit, blockchain=blockchain))
    transactions.extend(get_internal_transactions(wallet_address, limit=limit, blockchain=blockchain))
    transactions.extend(get_erc20_transactions(wallet_address, limit=limit, blockchain=blockchain))
    return transactions


def _normalize_monitor_timestamp(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(int(value), timezone.utc)
        except (TypeError, ValueError, OSError):
            return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            return datetime.fromtimestamp(int(float(value)), timezone.utc)
        except (TypeError, ValueError):
            pass
        try:
            return datetime.strptime(value, "%Y-%m-%d %H:%M:%S UTC").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def _monitor_alert_severity(alert_type):
    if alert_type in {"rapid_movement", "fund_consolidation", "multi_hop"}:
        return "HIGH"
    if alert_type in {"high_activity", "fund_splitting", "erc20_activity"}:
        return "MEDIUM"
    return "LOW"


def start_monitoring(wallet_address, blockchain=DEFAULT_BLOCKCHAIN, investigation_id=None, max_hops=2, max_wallets=8):
    provider = get_blockchain_provider(blockchain)
    if not provider.validate_address(wallet_address):
        raise ValueError(f"Invalid {provider.label} wallet address")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    with db_session() as db:
        existing = db.execute(
            "SELECT id, status FROM monitored_wallets WHERE wallet_address=? AND blockchain=? ORDER BY id DESC LIMIT 1",
            (wallet_address.strip(), get_blockchain_name(blockchain))
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE monitored_wallets SET status=?, updated_at=?, investigation_id=?, max_hops=?, max_wallets=? WHERE id=?",
                ("monitoring", now, investigation_id, max_hops, max_wallets, existing["id"])
            )
            monitor_id = existing["id"]
        else:
            cursor = db.execute(
                "INSERT INTO monitored_wallets (investigation_id, wallet_address, blockchain, status, last_checked_at, created_at, updated_at, max_hops, max_wallets) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (investigation_id, wallet_address.strip(), get_blockchain_name(blockchain), "monitoring", now, now, now, max_hops, max_wallets)
            )
            monitor_id = cursor.lastrowid

    ensure_monitoring_worker()
    return {
        "id": monitor_id,
        "wallet_address": wallet_address.strip(),
        "blockchain": get_blockchain_name(blockchain),
        "status": "monitoring",
        "last_checked_at": now,
        "created_at": now,
        "updated_at": now,
        "max_hops": max_hops,
        "max_wallets": max_wallets,
    }


def stop_monitoring(wallet_address, blockchain=DEFAULT_BLOCKCHAIN):
    target_wallet = wallet_address.strip()
    target_blockchain = get_blockchain_name(blockchain)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    with db_session() as db:
        row = db.execute(
            "SELECT * FROM monitored_wallets WHERE wallet_address=? AND blockchain=? ORDER BY id DESC LIMIT 1",
            (target_wallet, target_blockchain)
        ).fetchone()
        if row is None:
            return {"wallet_address": target_wallet, "blockchain": target_blockchain, "status": "stopped"}
        db.execute(
            "UPDATE monitored_wallets SET status=?, updated_at=? WHERE id=?",
            ("stopped", now, row["id"])
        )
    return {"wallet_address": target_wallet, "blockchain": target_blockchain, "status": "stopped", "updated_at": now}


def get_monitoring_status(wallet_address=None, blockchain=DEFAULT_BLOCKCHAIN):
    target_blockchain = get_blockchain_name(blockchain)
    with db_session() as db:
        if wallet_address is None:
            rows = db.execute(
                "SELECT * FROM monitored_wallets WHERE blockchain=? ORDER BY updated_at DESC",
                (target_blockchain,)
            ).fetchall()
            return {"wallets": [dict(row) for row in rows]}
        row = db.execute(
            "SELECT * FROM monitored_wallets WHERE wallet_address=? AND blockchain=? ORDER BY id DESC LIMIT 1",
            (wallet_address.strip(), target_blockchain)
        ).fetchone()
        if row is None:
            return {"wallet_address": wallet_address.strip(), "blockchain": target_blockchain, "status": "not_monitoring"}
        return dict(row)


def ensure_monitoring_worker():
    global MONITORING_THREAD
    with MONITORING_LOCK:
        if MONITORING_THREAD is not None and MONITORING_THREAD.is_alive():
            return
        MONITORING_STOP_EVENT.clear()
        MONITORING_THREAD = threading.Thread(target=_monitoring_loop, name="tracex-monitor-worker", daemon=True)
        MONITORING_THREAD.start()


def _monitoring_loop():
    while not MONITORING_STOP_EVENT.is_set():
        try:
            _poll_all_monitored_wallets()
        except Exception:
            pass
        MONITORING_STOP_EVENT.wait(MONITORING_POLL_SECONDS)


def _poll_all_monitored_wallets():
    with db_session() as db:
        rows = db.execute(
            "SELECT * FROM monitored_wallets WHERE status='monitoring' ORDER BY updated_at DESC"
        ).fetchall()
    for row in rows:
        poll_wallet_monitor(dict(row))


def poll_wallet_monitor(monitor_row):
    wallet_address = monitor_row.get("wallet_address")
    blockchain = monitor_row.get("blockchain") or DEFAULT_BLOCKCHAIN
    if not wallet_address:
        return

    try:
        current_transactions = fetch_monitor_transactions(wallet_address, limit=100, blockchain=blockchain)
    except Exception:
        return

    if not current_transactions:
        return

    seen_key = (blockchain.lower(), wallet_address.lower())
    previous_seen = MONITORING_CACHE.get(seen_key, set())
    new_transactions = []
    for tx in current_transactions:
        tx_key = _monitor_identity(tx)
        if tx_key and tx_key not in previous_seen:
            new_transactions.append(tx)
    MONITORING_CACHE[seen_key] = set(_monitor_identity(tx) for tx in current_transactions if _monitor_identity(tx) is not None)

    if not new_transactions:
        return

    new_transactions = sorted(new_transactions, key=lambda tx: _normalize_monitor_timestamp(tx.get("timestamp") or tx.get("timeStamp")) or datetime.min.replace(tzinfo=timezone.utc))

    for tx in new_transactions:
        _evaluate_monitor_transaction(wallet_address, tx, blockchain)

    latest = max(current_transactions, key=lambda tx: _normalize_monitor_timestamp(tx.get("timestamp") or tx.get("timeStamp")) or datetime.min.replace(tzinfo=timezone.utc))
    last_hash = latest.get("transaction_hash") or latest.get("hash")
    last_timestamp = latest.get("timestamp") or latest.get("timeStamp")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    with db_session() as db:
        db.execute(
            "UPDATE monitored_wallets SET last_checked_at=?, last_transaction_timestamp=?, last_transaction_hash=?, updated_at=? WHERE id=?",
            (now, str(last_timestamp), str(last_hash), now, monitor_row["id"])
        )


def _evaluate_monitor_transaction(wallet_address, transaction, blockchain):
    tx_hash = transaction.get("transaction_hash") or transaction.get("hash")
    if not tx_hash:
        return None

    alerts = []
    tx_time = _normalize_monitor_timestamp(transaction.get("timestamp") or transaction.get("timeStamp"))
    if tx_time is None:
        tx_time = datetime.now(timezone.utc)

    recent_transactions = fetch_monitor_transactions(wallet_address, limit=50, blockchain=blockchain)
    recent_transactions = [tx for tx in recent_transactions if (tx.get("transaction_hash") or tx.get("hash")) != tx_hash]
    for prior in recent_transactions:
        prior_time = _normalize_monitor_timestamp(prior.get("timestamp") or prior.get("timeStamp"))
        if prior_time is None:
            continue
        delta = (tx_time - prior_time).total_seconds()
        if 0 <= delta <= 600 and prior.get("direction") == "OUT" and transaction.get("direction") == "IN":
            alerts.append(("rapid_movement", "Rapid movement of funds", "Funds moved quickly after receipt"))
            break

    if len(recent_transactions) >= 20:
        alerts.append(("high_activity", "High transaction activity", "High transaction activity detected within the monitored wallet"))

    if transaction.get("asset_type") == "token":
        alerts.append(("erc20_activity", "Token activity detected", f"{transaction.get('asset') or transaction.get('token_symbol') or 'Token'} movement observed"))

    created = []
    for alert_type, title, description in alerts:
        alert = create_monitor_alert(
            wallet_address=wallet_address,
            transaction=transaction,
            alert_type=alert_type,
            severity=_monitor_alert_severity(alert_type),
            title=title,
            description=description,
            investigation_id=None,
            blockchain=blockchain,
            evidence={"source": "monitoring_poll", "asset": transaction.get("asset") or transaction.get("token_symbol") or "ETH"}
        )
        if alert is not None:
            created.append(alert)
    return created


def create_monitor_alert(wallet_address, transaction, alert_type, severity, title, description, investigation_id=None, blockchain=None, risk_contribution=None, evidence=None):
    if not wallet_address or not transaction:
        return None
    blockchain_name = get_blockchain_name(blockchain or transaction.get("blockchain") or DEFAULT_BLOCKCHAIN)
    tx_hash = str(transaction.get("transaction_hash") or transaction.get("hash") or "").strip()
    if not tx_hash:
        return None

    with db_session() as db:
        existing = db.execute(
            "SELECT id FROM alerts WHERE wallet_address=? AND blockchain=? AND transaction_hash=? AND alert_type=? AND status IN ('NEW','ACKNOWLEDGED','RESOLVED')",
            (wallet_address.strip(), blockchain_name, tx_hash, alert_type)
        ).fetchone()
        if existing:
            return None

        created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        timestamp = transaction.get("timestamp") or created_at
        payload = {
            "wallet_address": wallet_address.strip(),
            "blockchain": blockchain_name,
            "transaction_hash": tx_hash,
            "alert_type": alert_type,
            "severity": severity,
            "title": title,
            "description": description,
            "risk_contribution": risk_contribution,
            "timestamp": timestamp,
            "created_at": created_at,
            "status": "NEW",
            "evidence": json.dumps(evidence or {})
        }
        cursor = db.execute(
            "INSERT INTO alerts (investigation_id, wallet_address, blockchain, transaction_hash, alert_type, severity, title, description, risk_contribution, timestamp, created_at, status, evidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                investigation_id,
                payload["wallet_address"],
                payload["blockchain"],
                payload["transaction_hash"],
                payload["alert_type"],
                payload["severity"],
                payload["title"],
                payload["description"],
                payload["risk_contribution"],
                payload["timestamp"],
                payload["created_at"],
                payload["status"],
                payload["evidence"],
            )
        )
        alert_id = cursor.lastrowid
    return {"id": alert_id, **payload}


def list_alerts(wallet_address=None, blockchain=DEFAULT_BLOCKCHAIN):
    target_blockchain = get_blockchain_name(blockchain)
    with db_session() as db:
        if wallet_address:
            rows = db.execute(
                "SELECT * FROM alerts WHERE wallet_address=? AND blockchain=? ORDER BY created_at DESC",
                (wallet_address.strip(), target_blockchain)
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM alerts WHERE blockchain=? ORDER BY created_at DESC",
                (target_blockchain,)
            ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            item["evidence"] = json.loads(item.get("evidence") or "{}")
            items.append(item)
        return items


def acknowledge_alert(alert_id):
    with db_session() as db:
        row = db.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
        if row is None:
            return None
        db.execute("UPDATE alerts SET status='ACKNOWLEDGED' WHERE id=?", (alert_id,))
    return {"id": alert_id, "status": "ACKNOWLEDGED"}


def resolve_alert(alert_id):
    with db_session() as db:
        row = db.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
        if row is None:
            return None
        db.execute("UPDATE alerts SET status='RESOLVED' WHERE id=?", (alert_id,))
    return {"id": alert_id, "status": "RESOLVED"}


# =========================
# TRACE WALLET
# =========================

def trace_wallet(
    start_wallet,
    max_hops=5,
    max_wallets=50,
    blockchain=DEFAULT_BLOCKCHAIN
):
    provider = get_blockchain_provider(blockchain)
    if not provider.validate_address(start_wallet):
        raise ValueError(f"Invalid {provider.label} wallet address")

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
            limit=100,
            blockchain=blockchain
        )

        internal_transactions = get_internal_transactions(
            current_wallet,
            limit=100,
            blockchain=blockchain
        )

        token_transactions = get_erc20_transactions(
            current_wallet,
            limit=100,
            blockchain=blockchain
        )

        transactions = (
            normal_transactions +
            internal_transactions +
            token_transactions
        )

        # =========================
        # REMOVE DUPLICATES
        # =========================

        unique_transactions = []

        seen = set()

        for tx in transactions:

            dedup_key = (
                str(tx.get("transaction_hash") or tx.get("hash", "")).lower(),
                str(tx.get("from", "")).lower(),
                str(tx.get("to", "")).lower(),
                str(tx.get("token_contract") or ""),
                tx.get("amount")
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

                        "asset": tx.get("asset") or "ETH",

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
                f"Known exchange interaction: {exchange_name} (not evidence of fraud)",

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
            ),

            asset=path.get("asset") or "ETH",

            label=f"{path['amount']} {path.get('asset') or 'ETH'}"

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
            ),

            "asset": data.get("asset") or "ETH",

            "label": data.get("label") or f"{data.get('amount', 0)} {data.get('asset') or 'ETH'}"

        })

    return {

        "nodes": nodes,

        "edges": edges

    }

def generate_pdf_report(report_data):
    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontSize=20,
        spaceAfter=15
    )

    heading_style = ParagraphStyle(
        "ReportHeading",
        parent=styles["Heading2"],
        fontSize=13,
        spaceBefore=12,
        spaceAfter=8
    )

    normal_style = styles["BodyText"]

    story = []

    # Title
    story.append(Paragraph("TraceX Investigation Report", title_style))
    story.append(Spacer(1, 10))

    wallet = report_data.get("start_wallet", "Unknown")

    story.append(Paragraph(
        f"<b>Investigation ID:</b> {report_data.get('investigation_id', 'N/A')}<br/>"
        f"<b>Reported Wallet:</b> {wallet}",
        normal_style
    ))

    story.append(Paragraph(
        f"<b>Report Generated:</b> {datetime.now().strftime('%d-%m-%Y %H:%M:%S')}",
        normal_style
    ))

    story.append(Spacer(1, 15))

    # Risk Assessment
    story.append(Paragraph("Risk Assessment", heading_style))

    risk = report_data.get("risk", {})

    risk_score = risk.get("score", 0)
    risk_level = risk.get("level", "UNKNOWN")

    risk_table = Table([
        ["Risk Score", "Risk Level"],
        [str(risk_score), str(risk_level)]
    ], colWidths=[200, 200])

    risk_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("PADDING", (0, 0), (-1, -1), 7)
    ]))

    story.append(risk_table)

    # Trace Summary
    story.append(Paragraph("Trace Summary", heading_style))

    wallets = report_data.get("wallets", [])
    paths = report_data.get("paths", [])
    transactions = report_data.get("transactions", [])

    summary_table = Table([
        ["Metric", "Value"],
        ["Wallets Traced", str(report_data.get("wallets_traced", len(wallets)))],
        ["Maximum Hops", str(report_data.get("max_hops", "N/A"))],
        ["Transactions Found", str(len(transactions))],
        ["Paths Found", str(len(paths))]
    ], colWidths=[200, 200])

    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("PADDING", (0, 0), (-1, -1), 6)
    ]))

    story.append(summary_table)

    # Suspicious Indicators
    story.append(Paragraph("Suspicious Activity Indicators", heading_style))

    suspicious = report_data.get("suspicious_activity", {})
    indicators = suspicious.get("indicators", [])

    if indicators:
        for indicator in indicators:
            indicator_text = indicator.get("message", "") if isinstance(indicator, dict) else str(indicator)
            story.append(
                Paragraph(f"• {indicator_text}", normal_style)
            )
            story.append(Spacer(1, 4))
    else:
        story.append(
            Paragraph("No suspicious indicators detected.", normal_style)
        )

    # Investigator Recommendations
    story.append(Paragraph("Investigator Recommendations", heading_style))

    recommendations = report_data.get(
        "investigator_recommendations",
        []
    )

    if recommendations:
        for recommendation in recommendations:
            story.append(
                Paragraph(f"• {recommendation}", normal_style)
            )
            story.append(Spacer(1, 4))
    else:
        story.append(
            Paragraph("No specific recommendations generated.", normal_style)
        )

    # Exchange Attribution
    story.append(Paragraph("Exchange Attribution", heading_style))

    exchanges = report_data.get("exchange_attributions", [])

    if exchanges:
        for exchange in exchanges:
            if isinstance(exchange, dict):
                exchange_text = (f"{exchange.get('exchange')} — {exchange.get('address')} "
                                 f"({exchange.get('interactions', 0)} interactions; "
                                 f"{exchange.get('confidence', 'dataset match')})")
            else:
                exchange_text = str(exchange)
            story.append(
                Paragraph(f"• {exchange_text}", normal_style)
            )
    else:
        story.append(
            Paragraph(
                "Exchange attribution is not available in the current MVP "
                "and is under development.",
                normal_style
            )
        )

    # Transactions
    story.append(Paragraph("Transaction Analysis", heading_style))

    if transactions:
        transaction_data = [
            [
                "Direction",
                "Sender",
                "Receiver",
                "Asset",
                "Amount",
                "Timestamp",
                "Tx Hash",
                "Token Contract",
                "Type"
            ]
        ]

        for tx in transactions[:200]:
            asset_name = tx.get("asset") or tx.get("token_symbol") or "ETH"
            sender = tx.get("sender") or tx.get("from") or tx.get("counterparty") or ""
            receiver = tx.get("receiver") or tx.get("to") or ""
            tx_hash = tx.get("transaction_hash") or tx.get("hash") or ""
            token_contract = tx.get("token_contract") or tx.get("contractAddress") or tx.get("contract_address") or ""
            transaction_data.append([
                str(tx.get("direction", "")),
                str(sender),
                str(receiver),
                str(asset_name),
                str(tx.get("amount", "")),
                str(tx.get("timestamp", "")),
                str(tx_hash),
                str(token_contract),
                str(tx.get("type", ""))
            ])

        transaction_table = LongTable(
            transaction_data,
            colWidths=[55, 110, 110, 55, 60, 88, 110, 110, 55],
            repeatRows=1
        )

        transaction_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("PADDING", (0, 0), (-1, -1), 4)
        ]))

        story.append(transaction_table)

        if len(transactions) > 200:
            story.append(Spacer(1, 8))
            story.append(
                Paragraph(
                    "Showing the first 200 transactions in this report.",
                    normal_style
                )
            )
    else:
        story.append(
            Paragraph("No transactions available.", normal_style)
        )

    # Disclaimer
    story.append(Spacer(1, 20))
    story.append(Paragraph("Disclaimer", heading_style))

    story.append(
        Paragraph(
            "This report is an automated investigative aid. "
            "Risk scores and suspicious activity indicators are "
            "rule-based and do not by themselves establish fraud "
            "or criminal activity. Findings should be independently "
            "verified by investigators.",
            normal_style
        )
    )

    doc.build(story)

    buffer.seek(0)

    return buffer


# =========================
# MONITORING API
# =========================

@app.route("/monitor/start", methods=["POST"])
def monitor_start():
    data = request.get_json(silent=True) or {}
    wallet_address = (data.get("wallet_address") or data.get("wallet") or "").strip()
    blockchain = get_blockchain_name(data.get("blockchain", DEFAULT_BLOCKCHAIN))
    investigation_id = data.get("investigation_id")

    if not wallet_address:
        return jsonify({"error": "Wallet address is required"}), 400

    try:
        monitor = start_monitoring(wallet_address, blockchain=blockchain, investigation_id=investigation_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(monitor)


@app.route("/monitor/stop", methods=["POST"])
def monitor_stop():
    data = request.get_json(silent=True) or {}
    wallet_address = (data.get("wallet_address") or data.get("wallet") or "").strip()
    blockchain = get_blockchain_name(data.get("blockchain", DEFAULT_BLOCKCHAIN))
    if not wallet_address:
        return jsonify({"error": "Wallet address is required"}), 400
    return jsonify(stop_monitoring(wallet_address, blockchain=blockchain))


@app.route("/monitor/status")
def monitor_status():
    wallet_address = request.args.get("wallet") or request.args.get("wallet_address")
    blockchain = get_blockchain_name(request.args.get("blockchain") or DEFAULT_BLOCKCHAIN)
    if wallet_address:
        return jsonify(get_monitoring_status(wallet_address=wallet_address, blockchain=blockchain))
    return jsonify(get_monitoring_status(blockchain=blockchain))


@app.route("/alerts")
def alerts_list():
    wallet_address = request.args.get("wallet") or request.args.get("wallet_address")
    blockchain = get_blockchain_name(request.args.get("blockchain") or DEFAULT_BLOCKCHAIN)
    return jsonify(list_alerts(wallet_address=wallet_address, blockchain=blockchain))


@app.route("/alerts/<int:alert_id>/acknowledge", methods=["POST"])
def alert_acknowledge(alert_id):
    result = acknowledge_alert(alert_id)
    if result is None:
        return jsonify({"error": "Alert not found"}), 404
    return jsonify(result)


@app.route("/alerts/<int:alert_id>/resolve", methods=["POST"])
def alert_resolve(alert_id):
    result = resolve_alert(alert_id)
    if result is None:
        return jsonify({"error": "Alert not found"}), 404
    return jsonify(result)


# =========================
# ROUTES
# =========================

@app.route("/")
def home():

    return render_template(
        "x.html", api_configured=bool(API_KEY)
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

    data = request.get_json(silent=True) or {}

    wallet_address = (
        data.get("wallet_address")
        or data.get("wallet")
        or ""
    ).strip()
    blockchain = get_blockchain_name(data.get("blockchain", DEFAULT_BLOCKCHAIN))

    # =========================
    # VALIDATION
    # =========================

    if not wallet_address:

        return jsonify({

            "error":
                "Wallet address is required"

        }), 400

    try:
        provider = get_blockchain_provider(blockchain)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if not provider.validate_address(wallet_address):
        return jsonify({
            "error": f"Invalid {provider.label} wallet address"
        }), 400

    if blockchain == "ethereum" and not API_KEY:
        return jsonify({
            "error": "Etherscan API key is missing"
        }), 500

    # =========================
    # TRACE
    # =========================

    result = trace_wallet(

        wallet_address,

        max_hops=2,

        max_wallets=8,
        blockchain=blockchain

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

    result["blockchain"] = blockchain
    result["graph"] = graph

    result["suspicious_activity"] = \
        suspicious_activity

    result["risk"] = risk

    result["investigator_recommendations"] = \
        recommendations

    exchange_counts = {}
    for tx in result["transactions"]:
        if tx.get("exchange"):
            address = tx.get("counterparty", "")
            key = (tx["exchange"], address.lower())
            exchange_counts[key] = exchange_counts.get(key, 0) + 1
    result["exchange_attributions"] = [
        {"exchange": name, "address": address, "interactions": count,
         "transaction_count": count, "confidence": "Dataset match"}
        for (name, address), count in exchange_counts.items()]
    save_investigation(result)

    return jsonify(result)


def history_summary(row):
    item = dict(row)
    item.pop("result_json", None)
    return item


@app.route("/history", methods=["GET", "DELETE"])
def history():
    with db_session() as db:
        if request.method == "DELETE":
            db.execute("DELETE FROM investigations")
            return jsonify({"deleted": True})
        rows = db.execute("SELECT * FROM investigations ORDER BY id DESC").fetchall()
        results = []
        for row in rows:
            summary = history_summary(row)
            summary["indicators"] = [r[0] for r in db.execute(
                "SELECT indicator FROM indicators WHERE investigation_id=?", (row["id"],))]
            results.append(summary)
    return jsonify(results)


@app.route("/history/<int:investigation_id>", methods=["GET", "DELETE"])
def history_item(investigation_id):
    with db_session() as db:
        row = db.execute("SELECT * FROM investigations WHERE id=?", (investigation_id,)).fetchone()
        if request.method == "DELETE":
            if row is None:
                return jsonify({"error": "Investigation not found"}), 404
            db.execute("DELETE FROM investigations WHERE id=?", (investigation_id,))
            return jsonify({"deleted": True})
        if row is None:
            return jsonify({"error": "Investigation not found"}), 404
        result = json.loads(row["result_json"])
    return jsonify(result)


@app.route("/export/<int:investigation_id>.<fmt>")
def export_investigation(investigation_id, fmt):
    with db_session() as db:
        row = db.execute("SELECT result_json FROM investigations WHERE id=?", (investigation_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Investigation not found"}), 404
    result = json.loads(row["result_json"])
    if fmt == "json":
        return Response(json.dumps(result, indent=2), mimetype="application/json",
                        headers={"Content-Disposition": f"attachment; filename=TraceX_{investigation_id}.json"})
    if fmt == "csv":
        import io
        text_output = io.StringIO()
        writer = csv.DictWriter(text_output, fieldnames=["direction", "from", "to", "amount", "timestamp", "hash", "exchange", "type"])
        writer.writeheader()
        for tx in result.get("transactions", []):
            writer.writerow({key: tx.get(key, "") for key in writer.fieldnames})
        return Response(text_output.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": f"attachment; filename=TraceX_{investigation_id}.csv"})
    return jsonify({"error": "Format must be json or csv"}), 400

@app.route("/report", methods=["POST"])
def report():
    data = request.get_json() or {}

    if not data.get("start_wallet"):
        return jsonify({
            "error": "No wallet analysis data provided."
        }), 400

    try:
        pdf = generate_pdf_report(data)

        wallet = data.get("start_wallet", "wallet")

        return send_file(
            pdf,
            as_attachment=True,
            download_name=f"TraceX_Investigation_{wallet[:10]}.pdf",
            mimetype="application/pdf"
        )

    except Exception as e:
        return jsonify({
            "error": f"Report generation failed: {str(e)}"
        }), 500
# =========================
# RUN
# =========================

if __name__ == "__main__":

    app.run(

        debug=False,

        port=5001

    )
