import os
import json
import requests

def main():
    supabase_url = os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("sb_publishable_j8Uu945wFXckst7fOLPpeA_UJWt68XZ")
    
    # We'll use the service role key if we can't find a user session, 
    # but for now let's just try to list cases with 'pendente' status via direct REST API
    # since we have the project ref: bbyhpwocwamgwcuqqnck
    
    url = f"{supabase_url}/rest/v1/cases?status=eq.pendente&select=id,status,cadista_id,requested_by,patient_id"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}"
    }
    
    try:
        response = requests.get(url, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Cases: {response.text}")
        
        # Check profiles
        url_profiles = f"{supabase_url}/rest/v1/profiles?select=id,email,role"
        response_profiles = requests.get(url_profiles, headers=headers)
        print(f"Profiles: {response_profiles.text}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
