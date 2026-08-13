import os
import json
import requests

def main():
    supabase_url = os.environ.get("VITE_SUPABASE_URL")
    supabase_key = "sb_publishable_j8Uu945wFXckst7fOLPpeA_UJWt68XZ"
    
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}"
    }
    
    # Let's see some cases regardless of status
    url = f"{supabase_url}/rest/v1/cases?select=id,status,cadista_id,requested_by&limit=5"
    response = requests.get(url, headers=headers)
    print(f"Recent cases status: {response.status_code}")
    print(f"Recent cases: {response.text}")
    
    # Check what statuses exist
    url_stats = f"{supabase_url}/rest/v1/cases?select=status"
    response_stats = requests.get(url_stats, headers=headers)
    if response_stats.status_code == 200:
        statuses = [r['status'] for r in response_stats.json()]
        from collections import Counter
        print(f"Status counts: {Counter(statuses)}")

if __name__ == "__main__":
    main()
