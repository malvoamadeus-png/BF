import requests
import time
from collections import Counter
from typing import List, Dict, Optional
import os


class BundleFinder:
    def __init__(self, supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        self.base_url = "https://web3.okx.com/priapi/v1/dx/market/v2"
        self.headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key

    def get_target_tokens_paginated(self, wallet_address: str, chain_id: str, desired_count: int) -> List[Dict]:
        url = f"{self.base_url}/pnl/token-list"
        page_size = 50
        collected: List[Dict] = []
        offset = 0
        while len(collected) < desired_count:
            params = {
                "walletAddress": wallet_address,
                "chainId": chain_id,
                "isAsc": "false",
                "sortType": "1",
                "offset": str(offset),
                "limit": str(page_size),
                "filterRisk": "true",
                "filterSmallBalance": "false",
                "t": int(time.time() * 1000),
            }
            try:
                r = requests.get(url, params=params, headers=self.headers, timeout=20)
                data = r.json()
                if data.get("code") != 0:
                    break
                page = data.get("data", {}).get("tokenList", []) or []
                if not page:
                    break
                collected.extend(page)
                offset += page_size
                time.sleep(0.25)
            except Exception:
                break
        return collected[:desired_count]

    def get_first_buy_transaction(self, wallet_address: str, token_address: str, chain_id: str) -> Optional[str]:
        url = f"{self.base_url}/trading-history/filter-list"
        payload = {
            "desc": False,
            "orderBy": "timestamp",
            "limit": 50,
            "tradingHistoryFilter": {
                "chainId": chain_id,
                "tokenContractAddress": token_address,
                "type": "0",
                "userAddressList": [wallet_address],
            },
        }
        try:
            r = requests.post(url, json=payload, headers=self.headers, timeout=20)
            data = r.json()
            if data.get("code") != 0:
                return None
            tx_list = data.get("data", {}).get("list", []) or []
            for tx in tx_list:
                if str(tx.get("isBuy")) == "1":
                    return tx.get("id")
            return None
        except Exception:
            return None

    def get_preceding_transactions(self, token_address: str, chain_id: str, anchor_id: str, limit: int) -> List[str]:
        url = f"{self.base_url}/trading-history/filter-list"
        payload = {
            "desc": True,
            "orderBy": "timestamp",
            "limit": limit,
            "dataId": anchor_id,
            "tradingHistoryFilter": {
                "chainId": chain_id,
                "tokenContractAddress": token_address,
                "type": "0",
            },
        }
        found: List[str] = []
        try:
            r = requests.post(url, json=payload, headers=self.headers, timeout=20)
            data = r.json()
            if data.get("code") != 0:
                return []
            tx_list = data.get("data", {}).get("list", []) or []
            for tx in tx_list:
                if str(tx.get("isBuy")) == "1":
                    addr = tx.get("userAddress")
                    if addr:
                        found.append(addr)
            return found
        except Exception:
            return []

    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)

    def supabase_headers(self) -> Dict[str, str]:
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }

    def supabase_check_exists(self, chain_id: str, suspect_address: str) -> bool:
        if not self.supabase_enabled():
            return False
        try:
            url = f"{self.supabase_url}/rest/v1/bundles"
            params = {
                "select": "id",
                "chain_id": f"eq.{chain_id}",
                "suspect_address": f"eq.{suspect_address}",
            }
            r = requests.get(url, headers=self.supabase_headers(), params=params, timeout=20)
            if r.status_code != 200:
                return False
            rows = r.json()
            return len(rows) > 0
        except Exception:
            return False

    def supabase_upsert(self, record: Dict) -> bool:
        if not self.supabase_enabled():
            return False
        try:
            url = f"{self.supabase_url}/rest/v1/bundles"
            params = {"on_conflict": "chain_id,suspect_address"}
            r = requests.post(url, headers=self.supabase_headers(), params=params, json=record, timeout=20)
            return r.status_code in (200, 201)
        except Exception:
            return False

    def run(self, address: str, chain_id: str, token_target_count: int, history_limit: int) -> Dict:
        steps: List[Dict] = []
        steps.append({"name": "Checking database", "status": "running", "message": "", "ts": int(time.time())})
        if self.supabase_enabled():
            steps[-1]["status"] = "ok"
            steps[-1]["message"] = "Supabase ready"
        else:
            steps[-1]["status"] = "disabled"
            steps[-1]["message"] = "Supabase not configured"

        steps.append({"name": "Fetch token history", "status": "running", "message": "", "ts": int(time.time())})
        tokens = self.get_target_tokens_paginated(address, chain_id, token_target_count)
        steps[-1]["status"] = "ok" if tokens else "empty"
        steps[-1]["message"] = f"Fetched {len(tokens)} tokens"

        steps.append({"name": "Fetch trading history", "status": "running", "message": "", "ts": int(time.time())})
        suspect_counts = Counter()
        valid_tokens_count = 0
        for token in tokens:
            contract = token.get("tokenContractAddress")
            if not contract:
                continue
            first_buy_id = self.get_first_buy_transaction(address, contract, chain_id)
            if not first_buy_id:
                continue
            valid_tokens_count += 1
            early = self.get_preceding_transactions(contract, chain_id, first_buy_id, limit=history_limit)
            unique_early = set([a for a in early if a and a != address])
            suspect_counts.update(unique_early)
            time.sleep(0.25)
        steps[-1]["status"] = "ok"
        steps[-1]["message"] = f"Processed {valid_tokens_count} tokens with buy history"

        steps.append({"name": "Analyze data", "status": "running", "message": "", "ts": int(time.time())})
        suspects: List[Dict] = []
        for suspect, count in suspect_counts.items():
            score = count / valid_tokens_count if valid_tokens_count else 0.0
            suspects.append(
                {
                    "address": suspect,
                    "score": score,
                    "count": count,
                    "totalAnalyzed": valid_tokens_count,
                }
            )
        suspects.sort(key=lambda x: x["score"], reverse=True)
        has_bundle = any(s["score"] >= 0.2 for s in suspects)
        if has_bundle and self.supabase_enabled():
            for s in suspects:
                if s["score"] >= 0.2:
                    exists = self.supabase_check_exists(chain_id, s["address"])
                    if not exists:
                        record = {
                            "chain_id": chain_id,
                            "suspect_address": s["address"],
                            "score": s["score"],
                            "count": s["count"],
                            "total_analyzed": s["totalAnalyzed"],
                            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        }
                        self.supabase_upsert(record)
        steps[-1]["status"] = "ok"
        steps[-1]["message"] = "Analysis completed"

        return {"steps": steps, "suspects": suspects, "hasBundle": has_bundle}

