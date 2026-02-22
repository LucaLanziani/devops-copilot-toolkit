FROM mcr.microsoft.com/devcontainers/base:bookworm

# Install additional OS packages
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    python3-pip \
    python3-venv \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Switch to 'vscode' user to install user-scoped tools
USER vscode

# Install Terraform docs 
# (Optional, but good for "top of security" workspace standardisation)
ARG TFDOCS_VERSION="0.16.0"
RUN curl -Lo /tmp/terraform-docs.tar.gz https://github.com/terraform-docs/terraform-docs/releases/download/v${TFDOCS_VERSION}/terraform-docs-v${TFDOCS_VERSION}-$(uname -s)-$(uname -m | sed 's/x86_64/amd64/').tar.gz \
    && tar -xzf /tmp/terraform-docs.tar.gz -C /tmp \
    && mkdir -p /home/vscode/.local/bin \
    && mv /tmp/terraform-docs /home/vscode/.local/bin/terraform-docs \
    && rm /tmp/terraform-docs.tar.gz

# Ensure .local/bin is in PATH (it usually is for pipx, but ensuring for manual moves)
ENV PATH="/home/vscode/.local/bin:${PATH}"
