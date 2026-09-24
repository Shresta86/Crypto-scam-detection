import unittest

import wallettracer


class TestBlockchainArchitecture(unittest.TestCase):
    def test_supported_ethereum_blockchain(self):
        self.assertIn("ethereum", wallettracer.SUPPORTED_BLOCKCHAINS)
        self.assertEqual(wallettracer.get_blockchain_name("Ethereum"), "ethereum")
        self.assertEqual(wallettracer.get_blockchain_name("ethereum"), "ethereum")

    def test_provider_calculates_validation_and_normalization(self):
        provider = wallettracer.get_blockchain_provider("ethereum")
        self.assertIsInstance(provider, wallettracer.EthereumProvider)
        self.assertTrue(provider.validate_address("0x1234567890123456789012345678901234567890"))
        self.assertFalse(provider.validate_address("not-a-wallet"))

        tx = provider.normalize_transaction(
            {
                "hash": "0xabc",
                "from": "0x1234567890123456789012345678901234567890",
                "to": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
                "value": "1000000000000000000",
                "timeStamp": "1700000000",
                "isError": "0"
            },
            "0x1234567890123456789012345678901234567890",
            "normal",
        )

        self.assertEqual(tx["blockchain"], "ethereum")
        self.assertEqual(tx["asset"], "ETH")
        self.assertEqual(tx["transaction_hash"], "0xabc")
        self.assertEqual(tx["direction"], "OUT")

    def test_unsupported_blockchain_raises(self):
        with self.assertRaises(ValueError):
            wallettracer.get_blockchain_provider("solana")

    def test_legacy_wallet_address_field_is_accepted(self):
        client = wallettracer.app.test_client()
        response = client.post("/trace", json={"wallet_address": "0x0000000000000000000000000000000000000000"})
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
