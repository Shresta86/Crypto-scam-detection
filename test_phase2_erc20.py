import base64
import re
import unittest
import zlib

import wallettracer


class TestPhase2ERC20(unittest.TestCase):
    def test_token_transfer_normalization(self):
        provider = wallettracer.get_blockchain_provider("ethereum")
        tx = provider.normalize_token_transfer(
            {
                "hash": "0xabc",
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
            "0x1111111111111111111111111111111111111111",
        )

        self.assertEqual(tx["blockchain"], "ethereum")
        self.assertEqual(tx["asset"], "USDT")
        self.assertEqual(tx["asset_type"], "token")
        self.assertEqual(tx["token_contract"], "0x3333333333333333333333333333333333333333")
        self.assertEqual(tx["token_decimals"], 6)
        self.assertEqual(tx["transaction_type"], "ERC20_TRANSFER")
        self.assertEqual(tx["display_amount"], 1000)

    def test_erc20_fetcher_is_provided(self):
        provider = wallettracer.get_blockchain_provider("ethereum")
        self.assertTrue(hasattr(provider, "fetch_erc20_transactions"))

    def test_pdf_report_includes_erc20_metadata(self):
        pdf_stream = wallettracer.generate_pdf_report({
            "start_wallet": "0x1111111111111111111111111111111111111111",
            "wallets_traced": 1,
            "max_hops": 2,
            "paths": [{
                "from": "0x1111111111111111111111111111111111111111",
                "to": "0x2222222222222222222222222222222222222222",
                "amount": 1000,
                "asset": "USDT",
                "hash": "0xabc123",
                "hop": 1,
                "type": "ERC20_TRANSFER",
                "timestamp": "2026-09-23 17:24:47 UTC"
            }],
            "transactions": [{
                "direction": "IN",
                "sender": "0x2222222222222222222222222222222222222222",
                "receiver": "0x1111111111111111111111111111111111111111",
                "amount": 1000,
                "raw_amount": 1000000000,
                "display_amount": 1000,
                "asset": "USDT",
                "asset_type": "token",
                "token_contract": "0x3333333333333333333333333333333333333333",
                "token_symbol": "USDT",
                "token_decimals": 6,
                "timestamp": "2026-09-23 17:24:47 UTC",
                "transaction_hash": "0xabc123",
                "type": "ERC20_TRANSFER",
                "exchange": None,
                "counterparty": "0x2222222222222222222222222222222222222222"
            }],
            "risk": {"score": 10, "level": "LOW"},
            "suspicious_activity": {"indicators": []},
            "investigator_recommendations": [],
            "exchange_attributions": []
        })
        pdf_bytes = pdf_stream.getvalue()
        stream_match = re.search(rb"/Filter \[ /ASCII85Decode /FlateDecode \] /Length .*?>>\s*stream\s*(.*?)\s*endstream", pdf_bytes, re.S)
        self.assertIsNotNone(stream_match, "PDF content stream not found")
        ascii85 = stream_match.group(1).strip()
        if ascii85.startswith(b"<~"):
            ascii85 = ascii85[2:]
        pdf_text = zlib.decompress(base64.a85decode(ascii85, adobe=True)).decode("latin-1", errors="ignore")
        for fragment in [
            "USDT",
            "0x2222222222222222222222222222222222222222",
            "0x1111111111111111111111111111111111111111",
            "2026-09-23 17:24:47 UTC",
            "0xabc123",
            "0x3333333333333333333333333333333333333333"
        ]:
            self.assertIn(fragment, pdf_text)


if __name__ == "__main__":
    unittest.main()
