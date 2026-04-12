#!/bin/bash
TOKEN="Tx4LEBXQzIORQEIOQfmCFghvtEQ1QeQO7szlCErx_y8.XQX53nLZc3wpglcPNSld3zKdH-_43Cc5X7LWYKLP2bw"
ACCOUNT="fac7207421271dd5183fcab70164cad1"

echo "=== 1. Delete Pages custom domain (remove Worker/Pages conflict) ==="
curl -s -X DELETE \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/neowow-studio-dashboard/domains/app.neowow.studio" \
  -H "Authorization: Bearer ${TOKEN}"
echo ""

echo "=== 2. Get Zone ID ==="
ZONE=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=neowow.studio" \
  -H "Authorization: Bearer ${TOKEN}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else 'FAIL')")
echo "zone=${ZONE}"

echo "=== 3. List DNS records for app.neowow.studio ==="
RECORDS=$(curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records?name=app.neowow.studio" \
  -H "Authorization: Bearer ${TOKEN}")
echo "$RECORDS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
recs=d.get('result',[])
for r in recs:
    print('  id='+r['id']+' type='+r['type']+' content='+r['content']+' proxied='+str(r['proxied']))
if not recs:
    print('  NO_RECORDS')
"

echo "=== 4. Ensure CNAME app -> pages.dev (proxied=true) ==="
COUNT=$(echo "$RECORDS" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('result',[])))")
if [ "$COUNT" = "0" ]; then
  echo "Creating CNAME..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"type":"CNAME","name":"app","content":"neowow-studio-dashboard.pages.dev","proxied":true,"ttl":1}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('Created OK' if d.get('success') else str(d))"
else
  REC_ID=$(echo "$RECORDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")
  echo "Patching existing record id=${REC_ID} to proxied=true..."
  curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records/${REC_ID}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"proxied":true,"content":"neowow-studio-dashboard.pages.dev"}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('Patched OK' if d.get('success') else str(d))"
fi

echo "=== 5. Universal SSL cert status ==="
curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE}/ssl/certificate_packs" \
  -H "Authorization: Bearer ${TOKEN}" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
for p in d.get('result',[]):
    print('  type='+str(p.get('type'))+' status='+str(p.get('status'))+' hosts='+str(p.get('hosts',[])))
"
