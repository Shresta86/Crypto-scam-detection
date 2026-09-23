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


if __name__ == "__main__":
    unittest.main()
