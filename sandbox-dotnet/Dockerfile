FROM mcr.microsoft.com/dotnet/sdk:8.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    zip \
    bash \
 && rm -rf /var/lib/apt/lists/*

# Create/ensure non-root "sandbox" user (UID-safe)
RUN set -eux; \
    existing="$(getent passwd 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing" ] && [ "$existing" != "sandbox" ]; then \
      usermod -l sandbox "$existing"; \
      usermod -d /home/sandbox -m sandbox; \
    elif ! id sandbox >/dev/null 2>&1; then \
      useradd -m -u 1000 sandbox; \
    fi; \
    mkdir -p /workspace; \
    chown -R sandbox:sandbox /workspace

WORKDIR /workspace
USER sandbox

# Keep NuGet cache in workspace
ENV NUGET_PACKAGES=/workspace/.nuget/packages
