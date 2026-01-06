FROM eclipse-temurin:21-jdk-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    unzip \
    zip \
    bash \
 && rm -rf /var/lib/apt/lists/*

# Maven (via apt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    maven \
 && rm -rf /var/lib/apt/lists/*

# Gradle (official apt can be old; use sdkman is heavy; use apt for simplicity)
# If you need newer Gradle, switch to a Gradle base image or install from gradle.org.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gradle \
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

# Keep caches in workspace to avoid writing into root-owned locations
ENV GRADLE_USER_HOME=/workspace/.gradle \
    MAVEN_OPTS="-Dmaven.repo.local=/workspace/.m2/repository"
