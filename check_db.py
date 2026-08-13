import os
import json
import requests

def main():
    supabase_url = os.environ.get("VITE_SUPABASE_URL")
    # Using the provided sb_publishable key
    supabase_key = "sb_publishable_j8Uu945wFXckst7fOLPpeA_UJWt68XZ"
    
    url = f"{supabase_url}/rest/v1/cases?status=eq.pendente&select=id,status,cadista_id,requested_by,patient_id"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}"
    }
    
    try:
        response = requests.get(url, headers=headers)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print(f"Cases: {response.text}")
        else:
            print(f"Error: {response.text}")
            
        url_profiles = f"{supabase_url}/rest/v1/profiles?select=id,email,role"
        response_profiles = requests.get(url_profiles, headers=headers)
        print(f"Profiles Status: {response_profiles.status_code}")
        if response_profiles.status_code == 200:
            print(f"Profiles: {response_profiles.text}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
