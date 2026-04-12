import urllib.request, urllib.error, json, sys

TOKEN   = "Tx4LEBXQzIORQEIOQfmCFghvtEQ1QeQO7szlCErx_y8.XQX53nLZc3wpglcPNSld3zKdH-_43Cc5X7LWYKLP2bw"
ACCOUNT = "fac7207421271dd5183fcab70164cad1"
BASE    = "https://api.cloudflare.com/client/v4"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def api(method, path, data=None):
    url  = BASE + path
    body = json.dumps(data).encode() if data else None
    req  = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

# 1. Delete Pages custom domain
print("=== 1. Deleting Pages custom domain (remove Worker/Pages SSL conflict) ===")
r = api("DELETE", f"/accounts/{ACCOUNT}/pages/projects/neowow-studio-dashboard/domains/app.neowow.studio")
print(" success:", r.get("success"), r.get("errors", ""))

# 2. Get Zone ID
print("\n=== 2. Getting Zone ID ===")
r = api("GET", "/zones?name=neowow.studio")
if not r.get("result"):
    print("FAIL: zone not found"); sys.exit(1)
zone = r["result"][0]["id"]
print(f" zone={zone}")

# 3. List DNS records
print("\n=== 3. DNS records for app.neowow.studio ===")
r = api("GET", f"/zones/{zone}/dns_records?name=app.neowow.studio")
recs = r.get("result", [])
for rec in recs:
    print(f"  id={rec['id']} type={rec['type']} content={rec['content']} proxied={rec['proxied']}")
if not recs:
    print("  NO_RECORDS")

# 4. Ensure CNAME exists and is proxied
print("\n=== 4. Ensuring CNAME app -> pages.dev (proxied=true) ===")
if not recs:
    r = api("POST", f"/zones/{zone}/dns_records", {
        "type": "CNAME", "name": "app",
        "content": "neowow-studio-dashboard.pages.dev",
        "proxied": True, "ttl": 1
    })
    print(" Created:", "OK" if r.get("success") else r)
else:
    rec_id = recs[0]["id"]
    r = api("PATCH", f"/zones/{zone}/dns_records/{rec_id}", {
        "proxied": True,
        "content": "neowow-studio-dashboard.pages.dev"
    })
    print(f" Patched id={rec_id}:", "OK" if r.get("success") else r)

# 5. SSL cert status
print("\n=== 5. Universal SSL cert status ===")
r = api("GET", f"/zones/{zone}/ssl/certificate_packs")
for p in r.get("result", []):
    print(f"  type={p.get('type')} status={p.get('status')} hosts={p.get('hosts', [])}")
