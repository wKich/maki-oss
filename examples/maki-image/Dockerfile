# Maki coding-agent image for OpenShell sandboxes.
#
# Build from the repository root:
#   docker build --build-arg MAKI_VERSION=0.6.4 -t maki-agent:local examples/maki-image
#
# The image contains no credentials. OpenShell injects provider placeholders at
# sandbox runtime; never bake secrets into this image.

FROM ubuntu:24.04

# Pinned Maki release. Keep in sync with the "verified against" header in
# docs/setup-guide.md and docs/ai/references.md.
ARG MAKI_VERSION=0.6.4

# Pinned bun runtime for the stdio MCP servers declared in config/mcp.toml.
# Bumping it is an image rebuild; no helper code keys on the version.
ARG BUN_VERSION=1.4.3

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        iproute2 \
        unzip \
 && rm -rf /var/lib/apt/lists/*

# Install the pinned static musl build to /usr/local/bin/maki. The release
# archive contains the single static `maki` binary, so it runs on any Linux
# image without matching the image's glibc.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) maki_arch=x86_64 ;; \
        arm64) maki_arch=aarch64 ;; \
        *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/maki.tar.gz \
        "https://github.com/tontinton/maki/releases/download/v${MAKI_VERSION}/maki-v${MAKI_VERSION}-${maki_arch}-unknown-linux-musl.tar.gz"; \
    tar -xzf /tmp/maki.tar.gz -C /usr/local/bin maki; \
    rm -f /tmp/maki.tar.gz; \
    chmod 0755 /usr/local/bin/maki; \
    /usr/local/bin/maki --version

# Pinned bun binary for stdio MCP servers. Bun's Linux releases are zip
# archives, not tarballs (unlike maki's), so unpack with unzip and keep only
# the binary. Installed to /usr/local/bin: the runtime the readiness gate's
# `command -v` and Maki's spawned child resolve is the same file.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) bun_arch=x64 ;; \
        arm64) bun_arch=aarch64 ;; \
        *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/bun.zip \
        "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${bun_arch}.zip"; \
    unzip -q /tmp/bun.zip -d /tmp/bun; \
    install -m 0755 "/tmp/bun/bun-linux-${bun_arch}/bun" /usr/local/bin/bun; \
    rm -rf /tmp/bun.zip /tmp/bun; \
    bun --version

# Non-root sandbox identity. The sandbox policy pins the same uid/gid, so the
# image user and examples/policies/*.yaml must agree.
RUN groupadd --gid 1500 sandbox \
 && useradd --uid 1500 --gid 1500 --create-home --home-dir /sandbox \
        --shell /bin/bash --comment "OpenShell sandbox user" sandbox \
 && mkdir -p /sandbox/.config/maki \
 && chown -R sandbox:sandbox /sandbox

# Baked global Maki configuration: pre-answered folder trust and YOLO mode.
# Deny rules in permissions.toml still apply under YOLO. mcp.toml declares the
# sandbox's MCP servers (HTTP and pre-warmed stdio); headers and environment
# reference ${VAR} placeholders that the OpenShell provider profiles resolve —
# no credentials are baked in.
COPY --chown=sandbox:sandbox config/init.lua /sandbox/.config/maki/init.lua
COPY --chown=sandbox:sandbox config/permissions.toml /sandbox/.config/maki/permissions.toml
COPY --chown=sandbox:sandbox config/mcp.toml /sandbox/.config/maki/mcp.toml

ENV HOME=/sandbox
# `bun add -g` links executables into the sandbox user's global bin dir, which
# is not on PATH by default. One ENV PATH makes the baked config's command, the
# readiness gate's `command -v`, and Maki's spawned child resolve the same name.
ENV PATH=/sandbox/.bun/bin:$PATH
WORKDIR /sandbox
USER sandbox

# Pre-warm the declared stdio MCP server's package as uid 1500, so its cache
# and global install live under /sandbox. A session then resolves the installed
# binary only: no package fetch at session time, so egress stays
# deny-by-default with no npm/registry endpoint in any policy.
RUN bun add -g synthetic-search-mcp@0.2.2 \
 && command -v synthetic-search-mcp

CMD ["/bin/bash"]
