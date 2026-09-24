from wallettracer import app

client = app.test_client()
print("HOME", client.get("/").status_code)
invalid = client.post("/trace", json={"wallet": "bad", "blockchain": "ethereum"})
print("INVALID", invalid.status_code, invalid.get_json())
unsupported = client.post(
    "/trace",
    json={"wallet": "0x0000000000000000000000000000000000000000", "blockchain": "solana"},
)
print("UNSUPPORTED", unsupported.status_code, unsupported.get_json())
valid = client.post(
    "/trace",
    json={"wallet": "0x0000000000000000000000000000000000000000", "blockchain": "ethereum"},
)
print("VALID", valid.status_code, valid.get_json().get("error"), valid.get_json().get("start_wallet"))
