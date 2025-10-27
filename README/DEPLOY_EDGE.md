# Edge Proxy Configuration for `/api/suds/record`

This document describes how to allow POST + OPTIONS traffic for the SUDS recording endpoint before the request reaches the FastAPI app. These steps assume you manage either Envoy or Nginx directly (Cloudflare rules must be handled separately).

## 1. Preparation
1. SSH into the edge host.
2. Back up your current proxy configuration.
   - Envoy: `sudo cp /etc/envoy/envoy.yaml /etc/envoy/envoy.yaml.bak.$(date +%Y%m%d%H%M)`
   - Nginx: `sudo cp /etc/nginx/conf.d/moodtalk.conf /etc/nginx/conf.d/moodtalk.conf.bak.$(date +%Y%m%d%H%M)`
3. Download this repository (or copy the example files) so you can reference `deploy/envoy.example.yaml` or `deploy/nginx.example.conf`.

## 2. Apply the configuration
### Envoy
1. Open `/etc/envoy/envoy.yaml` in an editor.
2. Merge the snippets from `deploy/envoy.example.yaml`:
   - Ensure the route matching `/api/suds/record` keeps the prefix intact and targets the FastAPI cluster.
   - Add a CORS policy (allowing `https://www.moodtalk.app`, methods `GET,POST,OPTIONS`, and forwarding credentials).
   - If you use RBAC filters, make sure POST/OPTIONS are explicitly allowed.
3. Save the file.

### Nginx
1. Edit `/etc/nginx/conf.d/moodtalk.conf` (or the equivalent server block).
2. Ensure `proxy_pass` retains the incoming request URI: `proxy_pass http://127.0.0.1:8000$request_uri;`.
3. Allow `GET`, `POST`, and `OPTIONS` methods only; deny everything else.
4. Return a 204 response with the required CORS headers for OPTIONS preflight requests.
5. Disable caching for `/api/` routes so POST results are not cached.

## 3. Reload the proxy
- Envoy: `sudo systemctl restart envoy` (or `sudo systemctl reload envoy` if supported).
- Nginx: `sudo nginx -t && sudo systemctl reload nginx`.

Always check the service status after reloading:
```
sudo systemctl status envoy
# or
sudo systemctl status nginx
```
If the reload fails, restore the backup file and restart again.

## 4. Verification
1. Run `scripts/verify_suds_api.sh` from the repository root (requires `curl` and `jq`).
2. Confirm that all three checks pass:
   - OPTIONS preflight returns 200/204 and exposes the expected CORS headers.
   - POST `/api/suds/record` returns HTTP 200 with a `start_eftar` action.
   - `/openapi.json` is reachable.
3. From the browser, submit a SUDS score via the banner and confirm navigation to `/eftar`.

## 5. Rollback
If anything fails:
1. Restore the backed-up configuration.
   - Envoy: `sudo mv /etc/envoy/envoy.yaml.bak.<timestamp> /etc/envoy/envoy.yaml`
   - Nginx: `sudo mv /etc/nginx/conf.d/moodtalk.conf.bak.<timestamp> /etc/nginx/conf.d/moodtalk.conf`
2. Reload the proxy again.
3. Re-run `scripts/verify_suds_api.sh` to confirm the old behavior.

## 6. Notes
- FastAPI already enables CORS with `allow_origins=["https://www.moodtalk.app"]`, `allow_methods=["GET","POST","OPTIONS"]`, and credential support. No additional API-side changes are required.
- Cloudflare rules must allow POST and OPTIONS to reach the origin. Use Cloudflare’s dashboard to bypass caching and disable WAF rules for `/api/suds/record` if necessary.
- Keep the verification script handy for future regressions and consider adding it to release checklists.
