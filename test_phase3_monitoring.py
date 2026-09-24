import unittest

import wallettracer


class TestPhase3Monitoring(unittest.TestCase):
    def test_start_monitoring_valid_wallet(self):
        monitor = wallettracer.start_monitoring(
            "0x1234567890123456789012345678901234567890",
            blockchain="ethereum"
        )
        self.assertEqual(monitor["status"], "monitoring")
        self.assertEqual(monitor["wallet_address"], "0x1234567890123456789012345678901234567890")

    def test_invalid_wallet_is_rejected(self):
        with self.assertRaises(ValueError):
            wallettracer.start_monitoring("bad-wallet", blockchain="ethereum")

    def test_unsupported_blockchain_is_rejected(self):
        with self.assertRaises(ValueError):
            wallettracer.start_monitoring("0x1234567890123456789012345678901234567890", blockchain="solana")

    def test_monitor_status_and_stop(self):
        wallet = "0x1234567890123456789012345678901234567890"
        wallettracer.start_monitoring(wallet, blockchain="ethereum")
        status = wallettracer.get_monitoring_status(wallet, blockchain="ethereum")
        self.assertEqual(status["status"], "monitoring")
        stopped = wallettracer.stop_monitoring(wallet, blockchain="ethereum")
        self.assertEqual(stopped["status"], "stopped")

    def test_new_transaction_detection_ignores_duplicates(self):
        prior = [
            {"blockchain": "ethereum", "transaction_hash": "0xaaa", "asset_type": "native"},
            {"blockchain": "ethereum", "transaction_hash": "0xbbb", "asset_type": "token", "token_symbol": "USDT"},
        ]
        new = [
            {"blockchain": "ethereum", "transaction_hash": "0xbbb", "asset_type": "token", "token_symbol": "USDT"},
            {"blockchain": "ethereum", "transaction_hash": "0xccc", "asset_type": "native"},
        ]
        detected = wallettracer.filter_new_transactions(prior, new)
        self.assertEqual([tx["transaction_hash"] for tx in detected], ["0xccc"])

    def test_token_monitors_erc20_normalization(self):
        provider = wallettracer.get_blockchain_provider("ethereum")
        tx = provider.normalize_token_transfer(
            {
                "hash": "0xerc20",
                "blockNumber": "123",
                "timeStamp": "1700000000",
                "from": "0x1111111111111111111111111111111111111111",
                "to": "0x2222222222222222222222222222222222222222",
                "value": "1000000000",
                "tokenSymbol": "USDT",
                "tokenName": "Tether USD",
                "tokenDecimal": "6",
                "contractAddress": "0x3333333333333333333333333333333333333333",
                "isError": "0"
            },
            "0x1111111111111111111111111111111111111111"
        )
        self.assertEqual(tx["asset_type"], "token")
        self.assertEqual(tx["token_symbol"], "USDT")
        self.assertEqual(tx["display_amount"], 1000)

    def test_alert_is_created_for_suspicious_transaction(self):
        tx = {
            "blockchain": "ethereum",
            "transaction_hash": "0xalerttx",
            "timestamp": "2026-09-24 00:00:00 UTC",
            "sender": "0x1111111111111111111111111111111111111111",
            "receiver": "0x2222222222222222222222222222222222222222",
            "amount": 1000,
            "asset": "USDT",
            "asset_type": "token",
            "token_symbol": "USDT",
            "token_contract": "0x3333333333333333333333333333333333333333",
            "token_decimals": 6,
            "transaction_type": "ERC20_TRANSFER",
            "status": "success",
            "type": "ERC20_TRANSFER",
            "direction": "IN",
            "counterparty": "0x1111111111111111111111111111111111111111",
            "wallet": "0x2222222222222222222222222222222222222222"
        }
        alert = wallettracer.create_monitor_alert(
            wallet_address="0x2222222222222222222222222222222222222222",
            transaction=tx,
            alert_type="rapid_movement",
            severity="HIGH",
            title="Rapid movement of funds",
            description="Funds moved quickly after receipt"
        )
        self.assertEqual(alert["severity"], "HIGH")
        self.assertEqual(alert["status"], "NEW")

    def test_duplicate_alert_prevented(self):
        tx = {
            "blockchain": "ethereum",
            "transaction_hash": "0xdup-alert",
            "timestamp": "2026-09-24 00:00:00 UTC",
            "sender": "0x1111111111111111111111111111111111111111",
            "receiver": "0x2222222222222222222222222222222222222222",
            "amount": 1000,
            "asset": "USDT",
            "asset_type": "token",
            "token_symbol": "USDT",
            "token_contract": "0x3333333333333333333333333333333333333333",
            "token_decimals": 6,
            "transaction_type": "ERC20_TRANSFER",
            "status": "success",
            "type": "ERC20_TRANSFER",
            "direction": "IN",
            "counterparty": "0x1111111111111111111111111111111111111111",
            "wallet": "0x2222222222222222222222222222222222222222"
        }
        wallettracer.create_monitor_alert(
            wallet_address="0x2222222222222222222222222222222222222222",
            transaction=tx,
            alert_type="rapid_movement",
            severity="HIGH",
            title="Rapid movement of funds",
            description="Funds moved quickly after receipt"
        )
        self.assertIsNone(
            wallettracer.create_monitor_alert(
                wallet_address="0x2222222222222222222222222222222222222222",
                transaction=tx,
                alert_type="rapid_movement",
                severity="HIGH",
                title="Rapid movement of funds",
                description="Funds moved quickly after receipt"
            )
        )


if __name__ == "__main__":
    unittest.main()
