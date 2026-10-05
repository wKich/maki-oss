# Isolation verification

Run these checks after [`docs/setup-guide.md`](setup-guide.md) sections 5–6,
with a sandbox created as shown there. The examples assume the sandbox is named
`maki` and the provider is `maki-anthropic`; for OpenRouter, substitute
`OPENROUTER_API_KEY` and `maki-openrouter`. Every `exec` command uses
`--no-login-shell` so sandbox login files cannot change the result.

The recorded run for this repository is in
[`docs/verification-log.md`](verification-log.md).

## 1. Denied egress

```sh
openshell sandbox exec -n maki --no-login-shell -- \
  /usr/bin/curl -sS --max-time 15 https://example.com
```

**Expected:** the request fails at the connection layer, for example
`curl: (7) Failed to connect to example.com port 443 ...` with exit code 7.
`example.com` is in no policy and no provider profile, so the proxy refuses it.
The refusal also appears in the sandbox log (check 6).

## 2. Placeholder-only credential

```sh
openshell sandbox exec -n maki --no-login-shell -- printenv ANTHROPIC_API_KEY
```

**Expected:** output starts with `openshell:resolve:env:` — for example
`openshell:resolve:env:v3789022262450335270_ANTHROPIC_API_KEY`. It must never
start with `sk-ant-` or otherwise contain the real key. An empty value means
the provider was attached after the process started; `sandbox exec` starts a
new process, so verify the attachment with check 5 first.

## 3. Host paths invisible

```sh
openshell sandbox exec -n maki --no-login-shell -- ls /Users
```

**Expected:** `ls: cannot access '/Users': No such file or directory`, exit
code 2. Host directories do not exist in the sandbox.

```sh
openshell sandbox exec -n maki --no-login-shell -- touch /usr/probe
```

**Expected:** `touch: cannot touch '/usr/probe': Permission denied`, exit code
1. System paths are read-only; `/sandbox` and `/tmp` accept writes.

## 4. Effective policy review

```sh
openshell policy get maki --base
openshell policy get maki --full
```

**Expected:** `--full` contains a provider-composed rule:

```yaml
network_policies:
  _provider_maki_anthropic:
    name: _provider_maki_anthropic
    endpoints:
      - host: api.anthropic.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: read-write
    binaries:
      - path: /usr/local/bin/maki
```

`--base` shows only the policy you passed at creation
(`examples/policies/maki-minimal.yaml`). If the provider rule is missing, the
provider is not attached or its profile was not imported.

## 5. Attached provider list

```sh
openshell sandbox provider list maki
```

**Expected:** `maki-anthropic` with type `maki-anthropic` and one credential
key. Credential key names are listed; values are never printed.

## 6. Denial logs

```sh
openshell logs maki --since 5m --source sandbox
```

**Expected:** an OCSF denial for the request from check 1, resembling:

```text
[1791199570.521] [sandbox] [OCSF ] [ocsf] NET:REFUSE [MED] DENIED example.com [reason:policy_dns_ineligible]
[1791199570.522] [sandbox] [OCSF ] [ocsf] NET:OPEN [MED] DENIED /usr/bin/curl(0) -> example.com:443 [reason:transparent_tcp_policy_denied]
```

Do not add `--level warn`: policy events are info-level and would be filtered
out. The logged binary path is how OpenShell identifies the caller; use it to
fix a rule that lists the wrong path.

## Beyond this checklist

These checks prove the boundary, not the model round-trip. A successful
`maki -p "..."` request additionally exercises endpoint binding and proxy
credential substitution against the upstream provider. Non-root identity
(`id -u` returns `1500`) and the writable workspace are also worth a glance.
