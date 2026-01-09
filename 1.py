import requests
import time
import json
from collections import Counter
from typing import List, Dict, Optional
import pandas as pd

# --- CONFIGURATION ---
# The "Smart Addresses" you want to analyze (The "Big Accounts")
# You can add multiple addresses to this list
TARGET_ADDRESSES = [
    "0x8d73a36d78e2ae4a437053c9ce3be70d483ab74d"
]

# Chain ID: 501 = Solana, 56 = BNB Chain, 1 = Ethereum, etc.
CHAIN_ID = "56"

# How many tokens to analyze from the target's PnL list
TOKEN_LIMIT = 50

# How many preceding transactions to fetch
HISTORY_LIMIT = 100


class OKXSockPuppetFinder:
    def __init__(self):
        self.base_url = "https://web3.okx.com/priapi/v1/dx/market/v2"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

    def get_target_tokens(self, wallet_address: str, chain_id: str, limit: int = 50) -> List[Dict]:
        """
        Step 1: Get the PnL token list for the target address.
        """
        print(f"[*] Step 1: Fetching token list for {wallet_address}...")

        url = f"{self.base_url}/pnl/token-list"
        params = {
            "walletAddress": wallet_address,
            "chainId": chain_id,
            "isAsc": "false",
            "sortType": "1",  # Likely sorting by time or PnL
            "offset": "0",
            "limit": str(limit),
            "filterRisk": "true",
            "filterSmallBalance": "false",
            "t": int(time.time() * 1000)
        }

        try:
            response = requests.get(url, params=params, headers=self.headers)
            data = response.json()

            if data.get("code") == 0:
                token_list = data.get("data", {}).get("tokenList", [])
                print(f"    -> Found {len(token_list)} tokens.")
                return token_list
            else:
                print(f"    [!] API Error: {data.get('msg')}")
                return []
        except Exception as e:
            print(f"    [!] Request Failed: {e}")
            return []

    def get_first_buy_transaction(self, wallet_address: str, token_address: str, chain_id: str) -> Optional[str]:
        """
        Step 2: Find the earliest BUY transaction of the target address on a specific token.
        """
        url = f"{self.base_url}/trading-history/filter-list"

        payload = {
            "desc": False,
            "orderBy": "timestamp",
            "limit": 50,
            "tradingHistoryFilter": {
                "chainId": chain_id,
                "tokenContractAddress": token_address,
                "type": "0",
                "userAddressList": [wallet_address]
            }
        }

        try:
            response = requests.post(url, json=payload, headers=self.headers)
            data = response.json()

            if data.get("code") == 0:
                tx_list = data.get("data", {}).get("list", [])
                for tx in tx_list:
                    if str(tx.get("isBuy")) == "1":
                        return tx.get("id")
                return None
            return None
        except Exception as e:
            print(f"    [!] Failed to get history for {token_address}: {e}")
            return None

    def get_preceding_transactions(self, token_address: str, chain_id: str, anchor_id: str, limit: int = 100) -> List[
        str]:
        """
        Step 3: Get transactions that happened BEFORE the anchor_id.
        """
        url = f"{self.base_url}/trading-history/filter-list"

        payload = {
            "desc": True,
            "orderBy": "timestamp",
            "limit": limit,
            "dataId": anchor_id,
            "tradingHistoryFilter": {
                "chainId": chain_id,
                "tokenContractAddress": token_address,
                "type": "0"
            }
        }

        found_addresses = []
        try:
            response = requests.post(url, json=payload, headers=self.headers)
            data = response.json()

            if data.get("code") == 0:
                tx_list = data.get("data", {}).get("list", [])

                for tx in tx_list:
                    if str(tx.get("isBuy")) == "1":
                        addr = tx.get("userAddress")
                        # Exclude the target addresses from the findings
                        if addr and addr not in TARGET_ADDRESSES:
                            found_addresses.append(addr)

            return found_addresses
        except Exception:
            return []

    def run_analysis(self):
        all_results_for_excel = []

        print(f"🚀 Starting analysis for {len(TARGET_ADDRESSES)} target(s)...")

        for target_idx, target_addr in enumerate(TARGET_ADDRESSES):
            print(f"\n[{target_idx + 1}/{len(TARGET_ADDRESSES)}] Analyzing Target: {target_addr}")
            print("=" * 60)

            # 1. Get tokens
            tokens = self.get_target_tokens(target_addr, CHAIN_ID, limit=TOKEN_LIMIT)

            suspect_counts = Counter()
            valid_tokens_count = 0  # Denominator for score calculation

            print(f"[*] Step 2 & 3: Scanning tokens for front-running patterns...")

            for i, token in enumerate(tokens):
                symbol = token.get("tokenSymbol", "Unknown")
                contract = token.get("tokenContractAddress")

                print(f"    [{i + 1}/{len(tokens)}] {symbol}...", end="\r")

                # 2. Get first buy ID
                first_buy_id = self.get_first_buy_transaction(target_addr, contract, CHAIN_ID)

                if not first_buy_id:
                    continue

                valid_tokens_count += 1

                # 3. Get preceding transactions
                early_birds = self.get_preceding_transactions(contract, CHAIN_ID, first_buy_id, limit=HISTORY_LIMIT)

                # 4. Record suspects (unique per token)
                unique_early_birds = set(early_birds)
                suspect_counts.update(unique_early_birds)

                time.sleep(0.3)  # Mild rate limiting

            print(f"\n    -> Scanned {valid_tokens_count} valid tokens with buy history.")

            if valid_tokens_count == 0:
                print("    [!] No valid buy history found for this target.")
                continue

            # Calculate Scores and Collect Data
            # List to store local results for sorting
            target_suspects = []

            for suspect, count in suspect_counts.items():
                score = count / valid_tokens_count
                target_suspects.append({
                    "Target Address": target_addr,
                    "Suspect Address": suspect,
                    "Count": count,
                    "Total Analyzed": valid_tokens_count,
                    "Score": score
                })

            # Sort by Score Descending
            target_suspects.sort(key=lambda x: x["Score"], reverse=True)

            # Add to global list for Excel
            all_results_for_excel.extend(target_suspects)

            # Print Top 10 to Console
            print("\n🏆 TOP 10 SUSPECTS for this target:")
            print(f"{'Score':<8} | {'Count':<6} | {'Suspect Address':<45}")
            print("-" * 65)

            for item in target_suspects[:10]:
                print(f"{item['Score']:.2f}     | {item['Count']:<6} | {item['Suspect Address']:<45}")

        # --- Generate Excel Report ---
        print("\n" + "=" * 60)
        if all_results_for_excel:
            print("[*] Generating Excel Report...")
            try:
                df = pd.DataFrame(all_results_for_excel)
                # Reorder columns for clarity
                df = df[["Target Address", "Suspect Address", "Score", "Count", "Total Analyzed"]]

                filename = "sock_puppet_report.xlsx"
                df.to_excel(filename, index=False)
                print(f"✅ Success! Report saved to: {filename}")
            except Exception as e:
                print(f"❌ Failed to save Excel file: {e}")
                print("Tip: Make sure you have 'pandas' and 'openpyxl' installed (pip install pandas openpyxl)")
        else:
            print("[!] No data found to report.")


if __name__ == "__main__":
    if "YOUR_TARGET_ADDRESS_1" in TARGET_ADDRESSES:
        print("⚠️  PLEASE EDIT THE FILE AND SET 'TARGET_ADDRESSES' FIRST!")
    else:
        finder = OKXSockPuppetFinder()
        finder.run_analysis()